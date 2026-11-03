-- ═══════════════════════════════════════════════════════════════════════════
-- A COMPRA GANHA TABELA PRÓPRIA — `compras` (03/11/2026, Fase 3 do plano)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- O pedido de compra morava em `org_state` (chave `a4p_compras`): UMA linha
-- com a lista inteira em jsonb. Quem pede e quem aprova em máquinas diferentes
-- regravavam a lista toda, e a última gravação vencia: uma aprovação feita
-- num computador podia sumir quando o outro salvava um pedido novo. Agora cada
-- compra é uma linha, e duas pessoas mexendo em compras diferentes não se
-- sobrescrevem.
--
-- ⚠️ UM ESCRITOR SÓ PARA CADA FATO: o documento é `dados` (o mesmo objeto
-- `Compra` de `core/compras`). `numero`, `status` e `valor` são colunas
-- GERADAS a partir dele: o banco recusa uma compra sem número, com status fora
-- da lista ou com valor que não é número, e ninguém consegue gravar a coluna
-- discordando do documento.
--
-- ⚠️ QUEM PODE ESCREVER NÃO MUDA: em `org_state` a escrita exigia
-- `tem_permissao('lancar')` (0028); aqui também. A leitura é da empresa aberta
-- (`auth_org_id()`), como lá.
--
-- ⚠️ O dado antigo de `org_state` é COPIADO, não movido: a chave fica onde está
-- (congelada em `store-org`) e reaplicar esta migration não duplica nada.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.compras (
  org_id uuid not null default public.auth_org_id()
    references public.organizations(id) on delete cascade,
  id text not null,
  dados jsonb not null,
  numero text generated always as (dados ->> 'numero') stored,
  status text generated always as (dados ->> 'status') stored,
  valor numeric(14,2) generated always as ((dados ->> 'valor')::numeric(14,2)) stored,
  -- O que a lixeira mostra no lugar do identificador (`lixeira_listar` lê
  -- `description`).
  description text generated always as (
    'Compra ' || coalesce(dados ->> 'numero', '') || coalesce(' · ' || nullif(dados ->> 'fornecedor', ''), '')) stored,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid(),
  -- A exclusão é LÓGICA, como em toda tabela de negócio (lixeira, ONDA 3):
  -- `excluir_logico('compras', id)` carimba e `restaurar_logico` devolve.
  excluido_em timestamptz,
  excluido_por uuid,
  excluido_motivo text,
  primary key (org_id, id),
  constraint compras_documento_objeto check (jsonb_typeof(dados) = 'object'),
  constraint compras_id_do_documento check (id <> '' and id = dados ->> 'id'),
  constraint compras_numero_preenchido check (coalesce(btrim(numero), '') <> ''),
  constraint compras_status_valido check (status in ('aguardando', 'aprovada', 'reprovada', 'cancelada'))
);

comment on table public.compras is
  'Pedidos de compra, um por linha. O documento é `dados` (o tipo Compra de core/compras); numero, status e valor são gerados a partir dele.';

-- O número aparece na lista, no título do caixa e na conversa com o
-- fornecedor: único por empresa entre as compras vivas. Dois computadores
-- criando ao mesmo tempo recebem a recusa do banco, nunca dois pedidos com o
-- mesmo número.
create unique index if not exists compras_numero_unico
  on public.compras (org_id, numero) where excluido_em is null;
create index if not exists compras_status_idx on public.compras (org_id, status);
create index if not exists compras_lixeira_idx
  on public.compras (org_id, excluido_em desc) where excluido_em is not null;

-- Quem mexeu por último, carimbado pelo banco (a trilha guarda o resto).
create or replace function public.compras_carimbo()
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

drop trigger if exists compras_carimbo on public.compras;
create trigger compras_carimbo
  before update on public.compras
  for each row execute function public.compras_carimbo();

drop trigger if exists zz_auditar_compras on public.compras;
create trigger zz_auditar_compras
  after insert or update or delete on public.compras
  for each row execute function public.auditar_escrita();

-- ── Acesso ──────────────────────────────────────────────────────────────────
alter table public.compras enable row level security;

-- Sem DELETE para o cliente: excluir é `excluir_logico` (a lixeira).
revoke all on table public.compras from public, anon, authenticated;
grant select, insert, update on table public.compras to authenticated;

drop policy if exists compras_org on public.compras;
create policy compras_org on public.compras
  for all to authenticated
  using (org_id = public.auth_org_id())
  with check (org_id = public.auth_org_id());

-- A mesma exigência de `org_state_escrita_exige_papel` (0028): o leitor lê e
-- não grava.
drop policy if exists compras_escrita_exige_papel on public.compras;
create policy compras_escrita_exige_papel on public.compras
  as restrictive for all to authenticated
  using (true)
  with check (public.tem_permissao('lancar'));

-- A compra na lixeira some da leitura (o mesmo `_esconde_excluido` da ONDA 3).
drop policy if exists compras_esconde_excluido on public.compras;
create policy compras_esconde_excluido on public.compras
  as restrictive for select to authenticated
  using (excluido_em is null);

-- ── O que já estava em org_state vem junto ──────────────────────────────────
-- Só entra o item que a tabela aceita (id, número e status válidos). O que não
-- entra fica em org_state, contado no aviso, e nunca derruba a migration.
-- `on conflict do nothing`: reaplicar não duplica, e um número repetido entre
-- dois computadores fica com o primeiro (o outro continua na chave antiga).
do $copia$
declare
  v_total int;
  v_copiadas int;
begin
  select count(*) into v_total
    from public.org_state s
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(s.valor) = 'array' then s.valor else '[]'::jsonb end) e
   where s.chave = 'a4p_compras';

  insert into public.compras (org_id, id, dados, atualizado_em)
  select s.org_id, e ->> 'id', e, coalesce(s.atualizado_em, now())
    from public.org_state s
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(s.valor) = 'array' then s.valor else '[]'::jsonb end) e
   where s.chave = 'a4p_compras'
     and jsonb_typeof(e) = 'object'
     and coalesce(e ->> 'id', '') <> ''
     and coalesce(btrim(e ->> 'numero'), '') <> ''
     and e ->> 'status' in ('aguardando', 'aprovada', 'reprovada', 'cancelada')
     and coalesce(e ->> 'valor', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
  on conflict do nothing;
  get diagnostics v_copiadas = row_count;

  if v_copiadas < v_total then
    raise warning 'compras: % de % pedidos de org_state não foram copiados agora (já estavam na tabela, formato inválido ou número repetido); todos continuam na chave a4p_compras', v_total - v_copiadas, v_total;
  else
    raise notice 'compras: % pedidos copiados de org_state', v_copiadas;
  end if;
end
$copia$;
