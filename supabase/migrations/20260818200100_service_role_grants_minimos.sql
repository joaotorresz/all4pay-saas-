-- ═══════════════════════════════════════════════════════════════════════════
-- A4P-076 (item 4) — GRANTS MÍNIMOS DE service_role, POR CONSUMIDOR CONHECIDO
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `service_role` é a chave que passa POR FORA do RLS. Ela vive só no servidor
-- (secrets das Edge Functions + env da Vercel), nunca no navegador — mas quanto
-- menor a superfície, menor o estrago se a chave vazar. Hoje ela tem grant em
-- 77 tabelas; a maioria nenhum código de servidor toca com ela.
--
-- ⚠️ **NÃO É REVOGAÇÃO ÀS CEGAS.** Todo caminho que usa a service key foi lido:
--   · 2 rotas Next (as ÚNICAS que importam `lib/supabase/admin.ts`):
--       /api/admin/impersonate      → admin_audit · organization_members · auth.admin
--       /api/recorrencias/run       → audit_log · financial_accounts · movements · recurrences
--   · 8 Edge Functions (todas as que existem no projeto):
--       pluggy-connect-token        → organization_members
--       pluggy-sync-item · webhook  → bank_accounts · bank_transactions · financial_accounts · movements · pluggy_items
--       own-webhook · own-sync      → own_transacoes · own_liquidacoes · own_parcelas · own_antecipacoes ·
--                                     own_lojistas · own_webhook_eventos · own_sync_execucoes  (token via RPC DEFINER)
--       get-rate                    → maq_cnpj_cache · maq_settings · maq_cnae_mcc · maq_mcc_category ·
--                                     maq_customer_rate · maq_installment · maq_online_spread
--       submit-cadastro             → maq_cnpj_cache · maq_leads · maq_whatsapp_log
--       send-lead-email             → (nenhuma tabela; só Resend)
--
-- ⚠️ **RPC ≠ grant de tabela.** As chamadas `.rpc()` rodam como o DONO da função
-- (SECURITY DEFINER), não como service_role — então uma tabela alcançada só por
-- RPC (org_state via org_state_set, plans/subscriptions via admin_*, o cache de
-- token via own_token_pegar) NÃO precisa de grant de service_role. Por isso elas
-- entram na revogação.
--
-- ⚠️ **O QUE FICA, e por quê (a coluna "NÃO SEI" que o joão pediu).** Quatro
-- tabelas do subsistema de adquirência não têm consumidor de service_role que eu
-- consiga apontar — só a AUSÊNCIA de um. Como o CREATE delas mora nas Edge
-- Functions (fora do repositório) e uma delas guarda CREDENCIAL, eu NÃO revogo
-- às cegas: mantenho e declaro. Preferir errar mantendo a errar revogando —
-- revogar e quebrar um caminho que não vejo é pior que uma tabela a mais na
-- superfície.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Revogação — tabelas SEM consumidor de service_role (evidência positiva:
--    só o cliente `authenticated` (RLS) ou RPC DEFINER as tocam)
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  t text;
  -- Cadastros e negócio: toda escrita passa pelo cliente do navegador, sob RLS.
  revogar text[] := array[
    'categories','products','services','parties','cost_centers','projects',
    'brands','units','salespeople','budgets','dimensions','entities','schedules',
    'sale_items','sales_docs',
    -- Ledger e contabilidade: cliente authenticated + RPCs DEFINER.
    'journal_entries','journal_lines','ledger_accounts','accounting_periods',
    'fechamentos','close_tasks','movement_splits','movement_tags','nfse',
    'revenue_contracts','revenue_schedule','reembolsos','approvals',
    'financial_rules','rule_executions','pos_rates','company_profiles',
    'ai_actions','ai_learning','org_state','raw_events',
    -- Plataforma: alcançadas só pelas RPCs admin_* (DEFINER), nunca por .from().
    'plans','subscriptions','platform_admins','platform_admin_permitidos',
    'admin_acessos','mrr_snapshots','role_permissions','user_active_org',
    'organizations','rota_alias_acessos','ddl_log',
    -- own_token_cache: alcançada SÓ via own_token_pegar/gravar/bloquear (DEFINER).
    'own_token_cache','maq_cost_rate'
  ];
begin
  foreach t in array revogar loop
    -- to_regclass evita quebrar se uma tabela não existir neste banco.
    if to_regclass('public.' || t) is not null then
      execute format('revoke all on public.%I from service_role', t);
    end if;
  end loop;
end $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. O que FICA como NÃO SEI — mantido de propósito, declarado
-- ───────────────────────────────────────────────────────────────────────────
-- own_erp_credenciais  — guarda credencial de ERP do lojista. Nenhum consumidor
--                        de service_role encontrado, mas o CREATE mora nas Edge
--                        Functions e pode haver caminho que não vejo. Manter é
--                        mais seguro que revogar e quebrar a captura.
-- own_terminais        — cadastro de terminais POS. Idem: sem consumidor visto,
--                        origem fora do repositório.
-- own_extrato_lojista  — a view do ERP (security_invoker). Sem consumidor de
--                        service_role visto.
-- Nada a fazer com elas aqui — a ausência de comando É a decisão de manter.

-- ───────────────────────────────────────────────────────────────────────────
-- 3. P0 — own_token_pegar NÃO pode ter EXECUTE a PUBLIC
-- ───────────────────────────────────────────────────────────────────────────
-- ⚠️ Medido em produção (18/08): own_token_pegar/gravar/bloquear têm `-:EXECUTE`
-- no ACL, ou seja, EXECUTE a PUBLIC — o default do Postgres que ninguém revogou.
-- Consequência: QUALQUER usuário autenticado pode chamar
-- `select own_token_pegar('producao')` e receber o token OAuth vivo da OWN, que
-- é SECURITY DEFINER e lê a tabela sem RLS. É uma credencial de terceiro
-- entregue pela porta do cliente.
--
-- Quem legitimamente chama é a Edge Function (com a service key). O papel do
-- navegador não tem o que fazer com o token da adquirência.
revoke all on function public.own_token_pegar(text, integer) from public, anon, authenticated;
revoke all on function public.own_token_gravar(text, text, integer) from public, anon, authenticated;
revoke all on function public.own_token_bloquear(text, integer, text) from public, anon, authenticated;
-- own_saude é healthcheck sem segredo; authenticated pode ver que o job roda,
-- mas anon não.
revoke all on function public.own_saude() from public, anon;
grant execute on function public.own_saude() to authenticated;
