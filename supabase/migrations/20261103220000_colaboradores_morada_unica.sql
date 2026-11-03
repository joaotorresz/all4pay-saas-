-- ═══════════════════════════════════════════════════════════════════════════
-- O COLABORADOR DA FOLHA GANHA TABELA PRÓPRIA — `colaboradores` (03/11/2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A equipe da folha morava em `org_state` (chave `a4p_colaboradores`), uma
-- linha com a lista inteira: quem cadastrava um colaborador num computador e
-- quem registrava uma rescisão em outro regravavam a lista toda, e a última
-- gravação vencia. Uma rescisão perdida assim volta a gerar salário, FGTS e
-- DARF de quem já saiu. Agora cada colaborador é uma linha. Mesmo desenho de
-- `compras` e `contratos` (Fase 3 do plano).
--
-- ⚠️ UM ESCRITOR SÓ: o documento é `dados` (o tipo `Colaborador` de
-- core/folha). `vinculo` e `valor` são colunas GERADAS dele; o banco recusa
-- vínculo fora da lista e id da linha diferente do id do documento.
--
-- ⚠️ QUEM PODE LER E ESCREVER NÃO MUDA: a leitura é da empresa aberta e a
-- escrita exige `tem_permissao('lancar')`, como em `org_state` (0028).
-- Exclusão LÓGICA (lixeira), sem DELETE para o cliente.
--
-- ⚠️ O dado de `org_state` é COPIADO, não movido, e reaplicar não duplica.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.colaboradores (
  org_id uuid not null default public.auth_org_id()
    references public.organizations(id) on delete cascade,
  id text not null,
  dados jsonb not null,
  vinculo text generated always as (dados ->> 'vinculo') stored,
  valor numeric(14,2) generated always as ((nullif(dados ->> 'valor', ''))::numeric(14,2)) stored,
  -- O que a lixeira mostra no lugar do identificador (`lixeira_listar`).
  description text generated always as (
    'Colaborador · ' || coalesce(nullif(dados ->> 'nome', ''), 'sem nome')) stored,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid(),
  excluido_em timestamptz,
  excluido_por uuid,
  excluido_motivo text,
  primary key (org_id, id),
  constraint colaboradores_documento_objeto check (jsonb_typeof(dados) = 'object'),
  constraint colaboradores_id_do_documento check (id <> '' and id = dados ->> 'id'),
  constraint colaboradores_vinculo_valido check (vinculo in ('clt', 'pj'))
);

comment on table public.colaboradores is
  'A equipe da folha, um colaborador por linha. O documento é `dados` (o tipo Colaborador de core/folha); vinculo e valor são gerados a partir dele.';

create index if not exists colaboradores_vinculo_idx on public.colaboradores (org_id, vinculo);
create index if not exists colaboradores_lixeira_idx
  on public.colaboradores (org_id, excluido_em desc) where excluido_em is not null;

create or replace function public.colaboradores_carimbo()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  new.atualizado_em := now();
  new.atualizado_por := coalesce(auth.uid(), new.atualizado_por);
  return new;
end;
$$;

drop trigger if exists colaboradores_carimbo on public.colaboradores;
create trigger colaboradores_carimbo
  before update on public.colaboradores
  for each row execute function public.colaboradores_carimbo();

drop trigger if exists zz_auditar_colaboradores on public.colaboradores;
create trigger zz_auditar_colaboradores
  after insert or update or delete on public.colaboradores
  for each row execute function public.auditar_escrita();

-- ── Acesso ──────────────────────────────────────────────────────────────────
alter table public.colaboradores enable row level security;

revoke all on table public.colaboradores from public, anon, authenticated;
grant select, insert, update on table public.colaboradores to authenticated;

drop policy if exists colaboradores_org on public.colaboradores;
create policy colaboradores_org on public.colaboradores
  for all to authenticated
  using (org_id = public.auth_org_id())
  with check (org_id = public.auth_org_id());

drop policy if exists colaboradores_escrita_exige_papel on public.colaboradores;
create policy colaboradores_escrita_exige_papel on public.colaboradores
  as restrictive for all to authenticated
  using (true)
  with check (public.tem_permissao('lancar'));

drop policy if exists colaboradores_esconde_excluido on public.colaboradores;
create policy colaboradores_esconde_excluido on public.colaboradores
  as restrictive for select to authenticated
  using (excluido_em is null);

-- ── O que já estava em org_state vem junto ──────────────────────────────────
-- Só entra o item que a tabela aceita. Um item antigo sem id ganha um id
-- estável aqui (o mesmo a cada reaplicação), em vez de ficar para trás.
do $copia$
declare
  v_total int;
  v_copiados int;
begin
  select count(*) into v_total
    from public.org_state s
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(s.valor) = 'array' then s.valor else '[]'::jsonb end) e
   where s.chave = 'a4p_colaboradores';

  insert into public.colaboradores (org_id, id, dados, atualizado_em)
  select s.org_id, x.id, x.doc || jsonb_build_object('id', x.id), coalesce(s.atualizado_em, now())
    from public.org_state s
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(s.valor) = 'array' then s.valor else '[]'::jsonb end) e
    cross join lateral (
      select e as doc,
             coalesce(nullif(e ->> 'id', ''), 'col_' || substr(md5(s.org_id::text || e::text), 1, 16)) as id
    ) x
   where s.chave = 'a4p_colaboradores'
     and jsonb_typeof(e) = 'object'
     and e ->> 'vinculo' in ('clt', 'pj')
     and coalesce(e ->> 'valor', '0') ~ '^-?[0-9]+(\.[0-9]+)?$'
  on conflict do nothing;
  get diagnostics v_copiados = row_count;

  if v_copiados < v_total then
    raise warning 'colaboradores: % de % colaboradores de org_state não foram copiados agora (já estavam na tabela ou formato inválido); todos continuam na chave a4p_colaboradores', v_total - v_copiados, v_total;
  else
    raise notice 'colaboradores: % colaboradores copiados de org_state', v_copiados;
  end if;
end
$copia$;
