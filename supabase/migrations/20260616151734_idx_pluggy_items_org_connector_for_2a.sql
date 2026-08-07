-- Suporte à estratégia 2A ("última conexão vence"): a lógica busca items do
-- mesmo connector na mesma org para apagar antes de gravar o novo. Índice
-- acelera essa busca (e a cascata cuida de bank_accounts/bank_transactions;
-- movements ficam por causa do ON DELETE SET NULL em movement_id).
create index if not exists pluggy_items_org_connector_idx
  on public.pluggy_items (org_id, connector_id);