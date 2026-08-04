-- ═══════════════════════════════════════════════════════════════════════════
-- RECONSTRUÇÃO (2/2) — as alterações avulsas aplicadas direto pelo painel
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ **NÃO SE APLICA AO BANCO ATUAL** — como a 0032, tudo aqui já existe. O
-- arquivo serve a um ambiente novo, que hoje nasceria sem estas colunas e o
-- código quebraria em runtime procurando campo que ninguém criou.
--
-- Gerado do catálogo de produção em 04/08/2026, não de memória.
--
-- Cobre as migrations aplicadas sem arquivo que sobraram e são reconstruíveis:
--   add_boleto_jsonb_to_movements · recurrences_add_itens_jsonb
--   0012_org_members_revoke_anon · 0010b_ledger_fn_search_path
--
-- O que NÃO entra aqui, e por quê:
--   · `maq_*` — é outro produto no mesmo projeto Supabase; a decisão pendente é
--     se ele sai daqui, e reconstruí-lo agora seria carimbar a convivência.
--   · os patches `0027b`/`0028b`/`0029b`/`0030b` — o conteúdo deles já está nos
--     arquivos-pai correspondentes; um arquivo próprio seria duplicata.
--   · `create_*` e `harden_rls_*` e `idx_pluggy_*` e `frente_b_*` — já
--     reconstruídos pela 0032, que trouxe as tabelas com as colunas, os índices
--     e as políticas dessas frentes.

/* ── boleto no lançamento ────────────────────────────────────────────────── */
-- Guarda a linha digitável, o código de barras e o que mais o emissor devolve.
alter table public.movements add column if not exists boleto jsonb;

/* ── itens do contrato recorrente ────────────────────────────────────────── */
-- Os itens que compõem a fatura de uma assinatura — é deles que sai o rateio do
-- MRR por produto.
alter table public.recurrences add column if not exists itens jsonb;

/* ── anon não lê o vínculo de membros ────────────────────────────────────── */
-- `organization_members` é a tabela que RESPONDE "quem pertence a qual
-- empresa". Com ela legível por `anon`, o mapa inteiro de clientes e usuários
-- sairia pela chave que viaja no navegador — sem precisar de nenhum vazamento
-- de dado financeiro.
--
-- ⚠️ NO BANCO ATUAL ISSO JÁ ESTÁ FECHADO: a ONDA 9 revogou toda concessão de
-- tabela de `anon`, e a verificação confirma zero concessões aqui. A linha fica
-- no arquivo porque um ambiente NOVO não herda aquela revogação em massa — e
-- porque o `0012_org_members_revoke_anon` original, que esta linha reconstrói,
-- existia justamente para isto e nunca teve arquivo.
revoke all on table public.organization_members from anon;

/* ── search_path fixo nas funções do razão ───────────────────────────────── */
-- ⚠️ Função sem `search_path` fixo pode ser sequestrada por um esquema plantado
-- à frente de `public` no caminho de busca — a forma clássica de escalar
-- privilégio numa função `SECURITY DEFINER`. As duas do razão já foram
-- corrigidas no banco; aqui fica o registro para um ambiente novo nascer certo.
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'check_entry_balanced') then
    execute 'alter function public.check_entry_balanced() set search_path = public';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'check_period_open') then
    execute 'alter function public.check_period_open() set search_path = public';
  end if;
end $$;
