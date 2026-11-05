-- ═══════════════════════════════════════════════════════════════════════════
-- ESTOQUE › ENTRADA PELA NF-e DE COMPRA (05/11/2026, etapa 2 do plano de estoque)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A pessoa sobe o XML da nota do fornecedor, confere item a item e cada item
-- escolhido vira uma ENTRADA em `estoque_movimentos` (a mesma tabela, a mesma
-- conta do saldo: nada muda na view `estoque_saldos`).
--
-- ⚠️ A MESMA NOTA NÃO ENTRA DUAS VEZES. A entrada guarda a chave de acesso
-- (44 dígitos) e o número do item; o índice único recusa a mesma chave + item
-- enquanto o movimento estiver vivo. Mandar a entrada para a lixeira libera o
-- item para entrar de novo (é a correção de quem escolheu o produto errado).
--
-- ⚠️ A ORIGEM DIZ DE ONDE VEIO, e o banco amarra: origem 'nfe' exige chave e
-- item, e chave e item só existem com origem 'nfe'. Uma entrada da nota é
-- sempre entrada (a nota de compra não tira do estoque).
--
-- `estoque_vinculos_fornecedor` lembra "este código, deste fornecedor, é este
-- produto, nesta proporção" (a caixa de 12). É uma preferência da conferência,
-- não um fato de estoque: o saldo nunca a lê.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. A entrada da nota ────────────────────────────────────────────────────
alter table public.estoque_movimentos
  add column if not exists nfe_chave text,
  add column if not exists nfe_item integer,
  add column if not exists fornecedor_cnpj text;

alter table public.estoque_movimentos drop constraint if exists estoque_movimentos_origem_valida;
alter table public.estoque_movimentos
  add constraint estoque_movimentos_origem_valida check (origem in ('manual', 'nfe'));

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'estoque_movimentos_nfe_completa') then
    alter table public.estoque_movimentos
      add constraint estoque_movimentos_nfe_completa check (
        (origem = 'nfe') = (nfe_chave is not null and nfe_item is not null)
        and (nfe_chave is null or nfe_chave ~ '^[0-9]{44}$')
        and (nfe_item is null or nfe_item > 0)
        and (origem <> 'nfe' or tipo = 'entrada')
        and (fornecedor_cnpj is null or fornecedor_cnpj ~ '^([0-9]{11}|[0-9]{14})$')
      );
  end if;
end $$;

create unique index if not exists estoque_movimentos_nfe_unica
  on public.estoque_movimentos (org_id, nfe_chave, nfe_item)
  where nfe_chave is not null and excluido_em is null;

comment on column public.estoque_movimentos.nfe_chave is
  'Chave de acesso da NF-e de compra que deu esta entrada (origem nfe). Com nfe_item, única enquanto o movimento estiver vivo.';
comment on table public.estoque_movimentos is
  'Entradas e saídas de estoque: as manuais (compra, ajuste, perda, devolução) e as da NF-e de compra (origem nfe). A venda não grava aqui: o saldo lê a quantidade vendida direto de sale_items (ver a view estoque_saldos).';

-- ── 2. O vínculo código do fornecedor → produto ─────────────────────────────
create table if not exists public.estoque_vinculos_fornecedor (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.auth_org_id()
    references public.organizations(id) on delete cascade,
  fornecedor_cnpj text not null,
  codigo text not null,
  product_id uuid not null references public.products(id) on delete cascade,
  fator numeric(14,3) not null default 1,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid(),
  constraint estoque_vinculos_cnpj_valido check (fornecedor_cnpj ~ '^([0-9]{11}|[0-9]{14})$'),
  constraint estoque_vinculos_codigo_preenchido check (btrim(codigo) <> ''),
  constraint estoque_vinculos_fator_positivo check (fator > 0),
  constraint estoque_vinculos_unico unique (org_id, fornecedor_cnpj, codigo)
);

comment on table public.estoque_vinculos_fornecedor is
  'O produto (e o fator de unidade) que a pessoa escolheu para o código de um fornecedor na conferência da NF-e. Só sugere na próxima nota; o saldo não lê esta tabela.';

-- O produto tem de ser desta empresa (a chave estrangeira sozinha aceitaria o
-- de outra). Mesma conferência do movimento, com o motivo certo.
create or replace function public.estoque_vinculo_confere_produto()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_org uuid;
begin
  select org_id into v_org from public.products where id = new.product_id;
  if v_org is null or v_org <> new.org_id then
    raise exception 'estoque_produto_da_empresa: o produto não é desta empresa.'
      using errcode = 'foreign_key_violation';
  end if;
  new.atualizado_em := now();
  new.atualizado_por := auth.uid();
  return new;
end;
$$;

revoke all on function public.estoque_vinculo_confere_produto() from public, anon, authenticated;

drop trigger if exists estoque_vinculo_confere_produto on public.estoque_vinculos_fornecedor;
create trigger estoque_vinculo_confere_produto
  before insert or update on public.estoque_vinculos_fornecedor
  for each row execute function public.estoque_vinculo_confere_produto();

drop trigger if exists zz_auditar_estoque_vinculos_fornecedor on public.estoque_vinculos_fornecedor;
create trigger zz_auditar_estoque_vinculos_fornecedor
  after insert or update or delete on public.estoque_vinculos_fornecedor
  for each row execute function public.auditar_escrita();

alter table public.estoque_vinculos_fornecedor enable row level security;

-- Insert e update (o upsert da confirmação). Sem DELETE: um vínculo errado é
-- corrigido escolhendo outro produto na próxima nota.
revoke all on table public.estoque_vinculos_fornecedor from public, anon, authenticated;
grant select, insert, update on table public.estoque_vinculos_fornecedor to authenticated;

drop policy if exists estoque_vinculos_org on public.estoque_vinculos_fornecedor;
create policy estoque_vinculos_org on public.estoque_vinculos_fornecedor
  for all to authenticated
  using (org_id = public.auth_org_id())
  with check (org_id = public.auth_org_id());

drop policy if exists estoque_vinculos_escrita_exige_papel on public.estoque_vinculos_fornecedor;
create policy estoque_vinculos_escrita_exige_papel on public.estoque_vinculos_fornecedor
  as restrictive for all to authenticated
  using (true)
  with check (public.tem_permissao('lancar'));
