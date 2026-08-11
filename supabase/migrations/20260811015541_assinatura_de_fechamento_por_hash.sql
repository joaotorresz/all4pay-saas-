-- ═══════════════════════════════════════════════════════════════════════════
-- ONDA 3 · ASSINATURA DE FECHAMENTO — e a invalidação visível
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ POR QUE PRECISOU DE TABELA. Os fechamentos moram numa CHAVE de
-- `org_state` — 41 kB de JSON com todos eles dentro, uma versão só, um carimbo
-- de autor só. Dá para calcular um hash sobre esse bloco, mas ele invalidaria
-- a assinatura de TODOS os fechamentos quando QUALQUER um mudasse. Isso é
-- ruído, não controle: um aviso que aparece sempre é um aviso que ninguém lê.
-- Assinar exige identidade por competência, e identidade por competência é uma
-- linha por fechamento.
--
-- ⚠️ E SÃO DOIS HASHES, não um. O do CONTEÚDO prova que o relatório assinado
-- não foi reescrito. O do PERÍODO prova que os lançamentos que o produziram não
-- mudaram depois. Só o primeiro deixaria alguém alterar um lançamento de maio
-- com o relatório de maio intacto — e é exatamente esse o caso que o contador
-- procura. Só o segundo deixaria reescrever o texto do relatório sem que nada
-- acusasse.
--
-- ⚠️ A ordenação do digest é `order by m.id`, e isso não é detalhe: sem ordem
-- determinística o mesmo período produziria hashes diferentes a cada consulta,
-- e toda assinatura nasceria inválida. Um controle que acusa sempre é
-- indistinguível de um controle desligado.

create table if not exists public.fechamentos (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null default public.auth_org_id() references public.organizations(id),
  competencia    date not null,
  conteudo       jsonb not null,
  hash_conteudo  text not null,
  hash_periodo   text not null,
  lancamentos    int  not null,
  assinado_por   uuid,
  assinado_em    timestamptz not null default now(),
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz,
  excluido_em    timestamptz,
  excluido_por   uuid,
  excluido_motivo text
);

-- ⚠️ SEM unicidade por competência, de propósito: reassinar não substitui, ele
-- ACRESCENTA. Um fechamento é uma fotografia assinada; sobrescrever a anterior
-- apagaria a prova de que o mês já tinha sido fechado com outros números — que
-- é justamente o que uma auditoria quer ver.
create index if not exists fechamentos_org_comp_idx
  on public.fechamentos (org_id, competencia, assinado_em desc);
create index if not exists fechamentos_lixeira_idx
  on public.fechamentos (org_id, excluido_em desc) where excluido_em is not null;

alter table public.fechamentos enable row level security;

drop policy if exists fechamentos_rw on public.fechamentos;
create policy fechamentos_rw on public.fechamentos
  for all to authenticated
  using (org_id = public.auth_org_id())
  with check (org_id = public.auth_org_id());

drop policy if exists fechamentos_esconde_excluido on public.fechamentos;
create policy fechamentos_esconde_excluido on public.fechamentos
  as restrictive for select to authenticated using (excluido_em is null);

-- ⚠️ Sem UPDATE e sem DELETE para o cliente. Uma assinatura que quem assinou
-- pode reescrever não prova nada — a invalidação tem de vir de FORA dela.
grant select, insert on table public.fechamentos to authenticated;
revoke update, delete, truncate, trigger, references on table public.fechamentos from anon, authenticated;
revoke all on table public.fechamentos from anon;

drop trigger if exists zz_auditar_fechamentos on public.fechamentos;
create trigger zz_auditar_fechamentos
  after insert or update or delete on public.fechamentos
  for each row execute function public.auditar_escrita();

-- ───────────────────────────────────────────────────────────────────────────
-- O DIGEST DO PERÍODO
-- ───────────────────────────────────────────────────────────────────────────
--
-- Resume os lançamentos da competência nos campos que MUDAM o resultado:
-- valor, sentido, situação e data. Mudar a descrição de um lançamento não
-- invalida o fechamento — e não deve: o número continua o mesmo, e um controle
-- que dispara com a correção de um nome ensina a ignorá-lo. (Medido: a troca de
-- descrição mantém a assinatura válida.)
create or replace function public.digest_do_periodo(p_org uuid, p_competencia date)
returns table(hash text, lancamentos int)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    encode(sha256(convert_to(coalesce(string_agg(
      m.id::text || ':' || m.amount::text || ':' || m.type::text || ':' ||
      m.status::text || ':' || m.due_date::text, '|' order by m.id), ''), 'UTF8')), 'hex'),
    count(*)::int
  from public.movements m
  where m.org_id = p_org
    and m.excluido_em is null
    and date_trunc('month', m.due_date) = date_trunc('month', p_competencia);
$$;

create or replace function public.assinar_fechamento(
  p_competencia date, p_conteudo jsonb
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_org uuid := public.auth_org_id(); v_h text; v_n int; v_id uuid;
begin
  if not public.tem_permissao('fechar') then
    raise exception 'Seu papel nesta empresa não fecha o período.' using errcode = 'insufficient_privilege';
  end if;
  if p_conteudo is null or p_conteudo = '{}'::jsonb then
    raise exception 'Não há conteúdo para assinar.' using errcode = 'check_violation';
  end if;

  select d.hash, d.lancamentos into v_h, v_n
    from public.digest_do_periodo(v_org, p_competencia) d;

  insert into public.fechamentos
    (org_id, competencia, conteudo, hash_conteudo, hash_periodo, lancamentos, assinado_por)
  values
    (v_org, date_trunc('month', p_competencia)::date, p_conteudo,
     encode(sha256(convert_to(p_conteudo::text, 'UTF8')), 'hex'),
     v_h, v_n, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

-- ⚠️ Ela devolve o PORQUÊ, não só um booleano. "Assinatura inválida" sem dizer
-- o que mudou obriga quem lê a conferir o mês inteiro à mão — e a resposta
-- prática vira reassinar sem entender, que é o oposto do controle.
create or replace function public.verificar_fechamento(p_competencia date default null)
returns table(
  id uuid, competencia date, assinado_em timestamptz,
  assinado_por uuid, assinado_por_email text,
  valido boolean, motivo text,
  lancamentos_na_assinatura int, lancamentos_agora int
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare v_org uuid := public.auth_org_id();
begin
  if v_org is null then return; end if;
  return query
    select f.id, f.competencia, f.assinado_em, f.assinado_por, u.email::text,
           (f.hash_periodo = d.hash and f.hash_conteudo = encode(sha256(convert_to(f.conteudo::text,'UTF8')),'hex')),
           case
             when f.hash_conteudo <> encode(sha256(convert_to(f.conteudo::text,'UTF8')),'hex')
               then 'O relatório assinado foi alterado depois da assinatura.'
             when f.hash_periodo <> d.hash and d.lancamentos > f.lancamentos
               then format('Entraram %s lançamento(s) na competência depois da assinatura.', d.lancamentos - f.lancamentos)
             when f.hash_periodo <> d.hash and d.lancamentos < f.lancamentos
               then format('Saíram %s lançamento(s) da competência depois da assinatura.', f.lancamentos - d.lancamentos)
             when f.hash_periodo <> d.hash
               then 'Um lançamento da competência mudou de valor, sentido, situação ou data depois da assinatura.'
             else null
           end,
           f.lancamentos, d.lancamentos
      from public.fechamentos f
      left join auth.users u on u.id = f.assinado_por
      cross join lateral public.digest_do_periodo(f.org_id, f.competencia) d
     where f.org_id = v_org
       and f.excluido_em is null
       and (p_competencia is null
            or date_trunc('month', f.competencia) = date_trunc('month', p_competencia))
     order by f.competencia desc, f.assinado_em desc;
end;
$$;

revoke all on function public.digest_do_periodo(uuid, date) from public;
grant execute on function public.digest_do_periodo(uuid, date) to authenticated;
revoke all on function public.assinar_fechamento(date, jsonb) from public;
grant execute on function public.assinar_fechamento(date, jsonb) to authenticated;
revoke all on function public.verificar_fechamento(date) from public;
grant execute on function public.verificar_fechamento(date) to authenticated;
