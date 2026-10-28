-- ═══════════════════════════════════════════════════════════════════════════
-- OS LEMBRETES DE QUEM PAROU NO CADASTRO (28/10/2026, etapa 5 do plano
-- "documentos e funil do cadastro no admin")
--
-- Decisão do dono: WhatsApp depois de 24 h parado, e-mail depois de 3 dias, no
-- máximo DOIS por jornada. Quem decide o que está vencido é o núcleo puro
-- (`core/cadastro/lembretes`); quem GARANTE o "no máximo" é este arquivo.
--
-- ⚠️ **RESERVA ANTES DO ENVIO.** O executor (`lib/cadastro-lembretes`) grava a
-- linha `reservado` ANTES de chamar o provedor e só depois a conclui. O índice
-- único (jornada, canal) é o que impede duas execuções — ou um cron repetido —
-- de mandar o mesmo lembrete duas vezes. O lembrete que falhou também ocupa a
-- vaga: tentar de novo sem saber se o provedor aceitou pode mandar em dobro.
--
-- ⚠️ **SEM CREDENCIAL, NADA É RESERVADO.** O executor só reserva o canal que
-- tem provedor (e, no WhatsApp, o template aprovado). Um lembrete "simulado"
-- não ocupa a vaga, então ele sai de verdade no dia em que a chave chegar.
--
-- ⚠️ **QUEM JÁ TEM CONTA NÃO RECEBE.** A candidata sai da lista quando o mesmo
-- WhatsApp ou e-mail tem outra jornada concluída, ou o e-mail já é de um
-- usuário: a pessoa que desistiu numa aba e terminou noutra não pode ouvir que
-- "não terminou".
--
-- Só a chave de serviço chama (o executor, no cron diário). A plataforma vê os
-- lembretes pelo funil, que passa a devolvê-los.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.cadastro_lembretes (
  id uuid primary key default gen_random_uuid(),
  jornada_id uuid not null references public.cadastro_jornadas(id) on delete cascade,
  canal text not null check (canal in ('whatsapp', 'email')),
  situacao text not null default 'reservado' check (situacao in ('reservado', 'enviado', 'falhou')),
  id_provedor text check (id_provedor is null or char_length(id_provedor) <= 200),
  erro text check (erro is null or char_length(erro) <= 500),
  criado_em timestamptz not null default now(),
  concluido_em timestamptz,
  constraint cadastro_lembretes_um_por_canal unique (jornada_id, canal)
);

alter table public.cadastro_lembretes enable row level security;
revoke all on public.cadastro_lembretes from anon, authenticated;

-- ── as candidatas: paradas há mais de 24 h, há menos de 30 dias, com contato ─
create or replace function public.cadastro_lembretes_candidatas(p_limite integer default 200)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', j.id, 'etapa', j.etapa, 'nome', j.contato_nome,
           'whatsapp', j.contato_whatsapp, 'email', j.contato_email,
           'atualizada_em', j.atualizada_em,
           'ja_lembrados', coalesce((select jsonb_agg(l.canal) from public.cadastro_lembretes l where l.jornada_id = j.id), '[]'::jsonb),
           'contato_ja_tem_conta', (
             exists (select 1 from public.cadastro_jornadas c
                      where c.id <> j.id and c.concluida_em is not null
                        and ((j.contato_whatsapp is not null and c.contato_whatsapp = j.contato_whatsapp)
                          or (j.contato_email is not null and c.contato_email = j.contato_email)))
             or (j.contato_email is not null and exists (select 1 from auth.users u where lower(u.email) = j.contato_email))
           )
         ) order by j.atualizada_em), '[]'::jsonb)
    from (select * from public.cadastro_jornadas
           where concluida_em is null
             and (contato_whatsapp is not null or contato_email is not null)
             and atualizada_em < now() - interval '24 hours'
             and atualizada_em > now() - interval '30 days'
           order by atualizada_em
           limit least(greatest(coalesce(p_limite, 200), 1), 500)) j;
$$;

-- ── reservar: devolve o id, ou NULL se o canal já teve lembrete ─────────────
create or replace function public.cadastro_lembrete_reservar(p_jornada uuid, p_canal text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  novo uuid;
begin
  if p_canal not in ('whatsapp', 'email') then
    return null;
  end if;
  -- ⚠️ Conferido AQUI, não só na lista: entre ler as candidatas e reservar a
  -- pessoa pode ter terminado a conta.
  if not exists (select 1 from public.cadastro_jornadas where id = p_jornada and concluida_em is null) then
    return null;
  end if;
  if (select count(*) from public.cadastro_lembretes where jornada_id = p_jornada) >= 2 then
    return null;
  end if;
  insert into public.cadastro_lembretes (jornada_id, canal)
  values (p_jornada, p_canal)
  on conflict on constraint cadastro_lembretes_um_por_canal do nothing
  returning id into novo;
  return novo;
end;
$$;

-- ── concluir: só a reserva ainda aberta, uma vez ────────────────────────────
create or replace function public.cadastro_lembrete_concluir(p_id uuid, p_situacao text, p_id_provedor text default null, p_erro text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  if p_situacao not in ('enviado', 'falhou') then
    return false;
  end if;
  update public.cadastro_lembretes
     set situacao = p_situacao, id_provedor = left(p_id_provedor, 200), erro = left(p_erro, 500), concluido_em = now()
   where id = p_id and situacao = 'reservado';
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

revoke all on function public.cadastro_lembretes_candidatas(integer) from public, anon, authenticated;
grant execute on function public.cadastro_lembretes_candidatas(integer) to service_role;
revoke all on function public.cadastro_lembrete_reservar(uuid, text) from public, anon, authenticated;
grant execute on function public.cadastro_lembrete_reservar(uuid, text) to service_role;
revoke all on function public.cadastro_lembrete_concluir(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.cadastro_lembrete_concluir(uuid, text, text, text) to service_role;

-- ── o funil do admin passa a dizer quem já foi lembrado ─────────────────────
create or replace function public.admin_cadastro_funil(p_dias integer default 90)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  dias integer := least(greatest(coalesce(p_dias, 90), 1), 365);
begin
  perform public.admin_exigir_acesso('admin_cadastro_funil', dias::text);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', j.id, 'tipo', j.tipo, 'etapa', j.etapa, 'etapas', j.etapas,
             'nome', j.contato_nome, 'whatsapp', j.contato_whatsapp, 'email', j.contato_email,
             'org_id', j.org_id, 'empresa', o.name,
             'iniciada_em', j.iniciada_em, 'atualizada_em', j.atualizada_em, 'concluida_em', j.concluida_em,
             'documentos', case when j.org_id is null then 0
                           else (select count(*) from public.cadastro_documentos d where d.org_id = j.org_id) end,
             'lembretes', coalesce((select jsonb_agg(jsonb_build_object('canal', l.canal, 'situacao', l.situacao, 'em', l.criado_em) order by l.criado_em)
                                      from public.cadastro_lembretes l where l.jornada_id = j.id), '[]'::jsonb)
           ) order by j.atualizada_em desc)
      from (select * from public.cadastro_jornadas
             where iniciada_em > now() - make_interval(days => dias)
             order by atualizada_em desc limit 1000) j
      left join public.organizations o on o.id = j.org_id
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.admin_cadastro_funil(integer) from public, anon, authenticated, service_role;
grant execute on function public.admin_cadastro_funil(integer) to authenticated;
