-- ═══════════════════════════════════════════════════════════════════════════
-- O CONTRATO GANHA TABELA PRÓPRIA — `contratos` (03/11/2026, Fase 3 do plano)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- O contrato morava em `org_state` (chave `a4p_contratos`), uma linha com a
-- lista inteira: duas pessoas salvando contratos diferentes em computadores
-- diferentes regravavam a lista toda, e a última gravação vencia. Agora cada
-- contrato é uma linha. É o mesmo desenho de `compras` (20261103200000).
--
-- ⚠️ UM ESCRITOR SÓ: o documento é `dados` (o tipo `Contrato` de
-- core/registros). `lado` e `valor` são colunas GERADAS dele; o banco recusa
-- lado fora da lista e id da linha diferente do id do documento.
--
-- ⚠️ QUEM PODE ESCREVER NÃO MUDA: `tem_permissao('lancar')`, como em
-- `org_state` (0028). A leitura é da empresa aberta. Exclusão LÓGICA (lixeira),
-- sem DELETE para o cliente.
--
-- ⚠️ O dado de `org_state` é COPIADO, não movido, e reaplicar não duplica.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.contratos (
  org_id uuid not null default public.auth_org_id()
    references public.organizations(id) on delete cascade,
  id text not null,
  dados jsonb not null,
  lado text generated always as (dados ->> 'lado') stored,
  valor numeric(14,2) generated always as ((nullif(dados ->> 'valor', ''))::numeric(14,2)) stored,
  -- O que a lixeira mostra no lugar do identificador (`lixeira_listar`).
  description text generated always as (
    'Contrato · ' || coalesce(nullif(dados ->> 'objeto', ''), 'sem objeto')
    || coalesce(' · ' || nullif(dados ->> 'parteNome', ''), '')) stored,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid(),
  excluido_em timestamptz,
  excluido_por uuid,
  excluido_motivo text,
  primary key (org_id, id),
  constraint contratos_documento_objeto check (jsonb_typeof(dados) = 'object'),
  constraint contratos_id_do_documento check (id <> '' and id = dados ->> 'id'),
  constraint contratos_lado_valido check (lado in ('fornecedor', 'cliente'))
);

comment on table public.contratos is
  'Contratos com clientes e fornecedores, um por linha. O documento é `dados` (o tipo Contrato de core/registros); lado e valor são gerados a partir dele.';

create index if not exists contratos_lado_idx on public.contratos (org_id, lado);
create index if not exists contratos_lixeira_idx
  on public.contratos (org_id, excluido_em desc) where excluido_em is not null;

create or replace function public.contratos_carimbo()
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

drop trigger if exists contratos_carimbo on public.contratos;
create trigger contratos_carimbo
  before update on public.contratos
  for each row execute function public.contratos_carimbo();

drop trigger if exists zz_auditar_contratos on public.contratos;
create trigger zz_auditar_contratos
  after insert or update or delete on public.contratos
  for each row execute function public.auditar_escrita();

-- ── Acesso ──────────────────────────────────────────────────────────────────
alter table public.contratos enable row level security;

revoke all on table public.contratos from public, anon, authenticated;
grant select, insert, update on table public.contratos to authenticated;

drop policy if exists contratos_org on public.contratos;
create policy contratos_org on public.contratos
  for all to authenticated
  using (org_id = public.auth_org_id())
  with check (org_id = public.auth_org_id());

drop policy if exists contratos_escrita_exige_papel on public.contratos;
create policy contratos_escrita_exige_papel on public.contratos
  as restrictive for all to authenticated
  using (true)
  with check (public.tem_permissao('lancar'));

drop policy if exists contratos_esconde_excluido on public.contratos;
create policy contratos_esconde_excluido on public.contratos
  as restrictive for select to authenticated
  using (excluido_em is null);

-- ── O que já estava em org_state vem junto ──────────────────────────────────
-- Só entra o item que a tabela aceita. ⚠️ O contrato salvo antes podia ter id
-- vazio (o formulário de criação não o preenchia antes de gravar): esse ganha
-- um id novo aqui, em vez de ficar para trás.
do $copia$
declare
  v_total int;
  v_copiados int;
begin
  select count(*) into v_total
    from public.org_state s
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(s.valor) = 'array' then s.valor else '[]'::jsonb end) e
   where s.chave = 'a4p_contratos';

  insert into public.contratos (org_id, id, dados, atualizado_em)
  select s.org_id, x.id, x.doc || jsonb_build_object('id', x.id), coalesce(s.atualizado_em, now())
    from public.org_state s
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(s.valor) = 'array' then s.valor else '[]'::jsonb end) e
    cross join lateral (
      select e as doc,
             coalesce(nullif(e ->> 'id', ''), 'ctr_' || substr(md5(s.org_id::text || e::text), 1, 16)) as id
    ) x
   where s.chave = 'a4p_contratos'
     and jsonb_typeof(e) = 'object'
     and e ->> 'lado' in ('fornecedor', 'cliente')
     and coalesce(e ->> 'valor', '0') ~ '^-?[0-9]+(\.[0-9]+)?$'
  on conflict do nothing;
  get diagnostics v_copiados = row_count;

  if v_copiados < v_total then
    raise warning 'contratos: % de % contratos de org_state não foram copiados agora (já estavam na tabela ou formato inválido); todos continuam na chave a4p_contratos', v_total - v_copiados, v_total;
  else
    raise notice 'contratos: % contratos copiados de org_state', v_copiados;
  end if;
end
$copia$;
