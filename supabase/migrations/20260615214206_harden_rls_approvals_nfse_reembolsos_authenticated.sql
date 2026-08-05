-- Hardening: as 3 tabelas restantes em PUBLIC → authenticated.
-- Mesmo padrão das demais (org_id = auth_org_id()). ETL usa service-role (bypassa RLS).

drop policy if exists "org rw approvals" on public.approvals;
create policy "org rw approvals" on public.approvals
  as permissive for all to authenticated
  using (org_id = auth_org_id()) with check (org_id = auth_org_id());

drop policy if exists "org rw nfse" on public.nfse;
create policy "org rw nfse" on public.nfse
  as permissive for all to authenticated
  using (org_id = auth_org_id()) with check (org_id = auth_org_id());

drop policy if exists "org rw reembolsos" on public.reembolsos;
create policy "org rw reembolsos" on public.reembolsos
  as permissive for all to authenticated
  using (org_id = auth_org_id()) with check (org_id = auth_org_id());