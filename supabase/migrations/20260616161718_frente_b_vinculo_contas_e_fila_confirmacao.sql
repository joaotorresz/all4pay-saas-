-- FRENTE B — suporte de banco para: 1C (dois saldos), 2A (vínculo anti-duplicata),
-- 3C (fila de confirmação que cria contatos).

-- 2A + 1C: vínculo entre conta OF e conta manual (mesma conta real) + qual saldo vale.
alter table public.bank_accounts
  add column if not exists linked_financial_account_id uuid
    references public.financial_accounts(id) on delete set null;

-- 1C: quando há vínculo, qual saldo conta como oficial na posição consolidada.
-- 'open_finance' (padrão, mais confiável) | 'manual' | 'both_visible' (mostra os dois).
alter table public.bank_accounts
  add column if not exists balance_source text not null default 'open_finance';

-- 3C: estado de revisão do lançamento na fila de confirmação.
-- 'confirmado' = já revisado/não precisa revisar (padrão p/ não inundar com histórico).
-- O ETL do Open Finance e o import marcarão os novos como 'pendente'.
alter table public.movements
  add column if not exists review_status text not null default 'confirmado';

-- índice para a fila (buscar pendentes da org rapidamente)
create index if not exists movements_review_pendente_idx
  on public.movements (org_id) where review_status = 'pendente';

-- índice para o vínculo (resolver duplicatas por conta manual)
create index if not exists bank_accounts_linked_fin_idx
  on public.bank_accounts (linked_financial_account_id);