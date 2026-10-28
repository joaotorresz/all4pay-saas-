-- ═══════════════════════════════════════════════════════════════════════════
-- O FUNIL DO CADASTRO NO ADMIN (28/10/2026, etapa 3 do plano "documentos e
-- funil do cadastro no admin")
--
-- As etapas 1 e 2 só ESCREVEM: a jornada (`cadastro_jornadas`) e o cofre
-- (`cadastro_documentos` + o bucket privado). Esta é a primeira LEITURA, e só a
-- plataforma lê — pelas funções `admin_*`, atrás de `admin_exigir_acesso`, que
-- aplica o veredito de sempre e REGISTRA a tentativa em `admin_acessos`.
--
-- ⚠️ **O DOCUMENTO EXIGE O SEGUNDO FATOR, sempre** (decisão do dono, 27/10/2026:
-- "só o dono da plataforma, com 2FA, vê documento"). O veredito administrativo
-- só exige `aal2` de quem tem `exige_mfa` ligado; aqui a exigência é da
-- FUNÇÃO, não do cadastro do administrador — um administrador com o fator
-- desligado lê o funil, mas não abre a foto do rosto de ninguém.
--
-- ⚠️ **O CAMINHO DO ARQUIVO NÃO SAI NA LISTA.** `admin_cadastro_documentos`
-- devolve o tipo, o tamanho e a data; o caminho só sai de
-- `admin_cadastro_documento_abrir`, documento a documento, e cada abertura vira
-- linha em `admin_audit` (quem viu, qual, de que empresa). Numa investigação a
-- pergunta é "quem VIU", não só "quem alterou". O link assinado é gerado pela
-- rota do servidor (o bucket não tem política de leitura) e vence em 60 s.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── o funil: as jornadas da janela, com a empresa e quantos documentos ──────
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
                           else (select count(*) from public.cadastro_documentos d where d.org_id = j.org_id) end
           ) order by j.atualizada_em desc)
      from (select * from public.cadastro_jornadas
             where iniciada_em > now() - make_interval(days => dias)
             order by atualizada_em desc limit 1000) j
      left join public.organizations o on o.id = j.org_id
  ), '[]'::jsonb);
end;
$$;

-- ── a exigência do segundo fator (uma função só, para as duas leituras) ─────
create or replace function public.admin_cadastro_exigir_segundo_fator()
returns void
language plpgsql
stable
set search_path to 'public'
as $$
begin
  if coalesce(auth.jwt() ->> 'aal', 'aal1') is distinct from 'aal2' then
    raise exception 'A4P-COFRE: ver documento do cadastro exige o segundo fator. Entre com o código do aplicativo autenticador e tente de novo.'
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;

-- ── os documentos de uma empresa (sem o caminho) ────────────────────────────
create or replace function public.admin_cadastro_documentos(p_org uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
begin
  perform public.admin_exigir_acesso('admin_cadastro_documentos', p_org::text);
  perform public.admin_cadastro_exigir_segundo_fator();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', d.id, 'tipo', d.tipo, 'mime', d.mime, 'tamanho', d.tamanho,
             'enviado_em', d.enviado_em, 'guardar_ate', d.guardar_ate
           ) order by d.enviado_em desc)
      from public.cadastro_documentos d
     where d.org_id = p_org
  ), '[]'::jsonb);
end;
$$;

-- ── abrir UM documento: devolve o caminho e deixa o rastro ──────────────────
create or replace function public.admin_cadastro_documento_abrir(p_documento uuid)
returns text
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  d record;
begin
  perform public.admin_exigir_acesso('admin_cadastro_documento_abrir', p_documento::text);
  perform public.admin_cadastro_exigir_segundo_fator();
  select id, org_id, tipo, caminho into d from public.cadastro_documentos where id = p_documento;
  if d.id is null then
    raise exception 'A4P-COFRE: documento % não encontrado.', p_documento using errcode = 'no_data_found';
  end if;
  insert into public.admin_audit (admin_id, action, target, detail)
  values (auth.uid(), 'cadastro.documento_aberto', d.org_id::text,
          jsonb_build_object('documento', d.id, 'tipo', d.tipo));
  return d.caminho;
end;
$$;

revoke all on function public.admin_cadastro_funil(integer) from public, anon, authenticated, service_role;
grant execute on function public.admin_cadastro_funil(integer) to authenticated;
revoke all on function public.admin_cadastro_exigir_segundo_fator() from public, anon, authenticated, service_role;
revoke all on function public.admin_cadastro_documentos(uuid) from public, anon, authenticated, service_role;
grant execute on function public.admin_cadastro_documentos(uuid) to authenticated;
revoke all on function public.admin_cadastro_documento_abrir(uuid) from public, anon, authenticated, service_role;
grant execute on function public.admin_cadastro_documento_abrir(uuid) to authenticated;
