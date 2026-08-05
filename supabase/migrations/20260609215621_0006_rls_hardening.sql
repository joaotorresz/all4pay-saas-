-- ============================================================
--  all4pay — Endurecimento do multi-tenant (0005)
--  Restringe quem pode executar as funções SECURITY DEFINER:
--   • handle_new_user / seed_org rodam só internamente (trigger e
--     chamadas server-side) — ninguém precisa chamá-las via API.
--   • auth_org_id é usada nas policies e no DEFAULT de org_id, então
--     o papel `authenticated` PRECISA executá-la; só o `anon` perde.
--
--  Obs.: os avisos "Anonymous Access Policies" do linter são
--  esperados — login de convidado (anonymous) está habilitado e o
--  convidado opera na própria organização, isolado por RLS.
-- ============================================================

revoke all on function public.handle_new_user()  from public, anon, authenticated;
revoke all on function public.seed_org(uuid)      from public, anon, authenticated;
revoke execute on function public.auth_org_id()   from anon;
