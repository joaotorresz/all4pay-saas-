-- Hardening: restringe as políticas das tabelas Open Finance à role `authenticated`,
-- em vez de `public` (que inclui anon). Defense-in-depth para dados bancários.
-- A sync-item/webhook usam service-role (bypassa RLS), então o ETL não é afetado.
-- O front lê com JWT de usuário autenticado, então continua funcionando.

-- pluggy_items
drop policy if exists "org rw pluggy_items" on public.pluggy_items;
create policy "org rw pluggy_items" on public.pluggy_items
  as permissive for all to authenticated
  using (org_id = auth_org_id()) with check (org_id = auth_org_id());

-- bank_accounts
drop policy if exists "org rw bank_accounts" on public.bank_accounts;
create policy "org rw bank_accounts" on public.bank_accounts
  as permissive for all to authenticated
  using (org_id = auth_org_id()) with check (org_id = auth_org_id());

-- bank_transactions
drop policy if exists "org rw bank_transactions" on public.bank_transactions;
create policy "org rw bank_transactions" on public.bank_transactions
  as permissive for all to authenticated
  using (org_id = auth_org_id()) with check (org_id = auth_org_id());