-- ============================================================
--  all4pay — auth_org_id como SECURITY INVOKER
--  Não há recursão: a policy de organization_members usa só
--  auth.uid(). Logo a função pode rodar com os privilégios de quem
--  chama (a própria RLS de organization_members já restringe a
--  linha do usuário). Remove os avisos de "SECURITY DEFINER
--  executável" do linter, mantendo o isolamento por organização.
-- ============================================================

create or replace function public.auth_org_id()
returns uuid
language sql
stable
security invoker
set search_path = public
as $$
  select org_id
  from public.organization_members
  where user_id = auth.uid()
  order by created_at
  limit 1;
$$;
