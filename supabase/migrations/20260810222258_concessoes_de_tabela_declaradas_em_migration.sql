-- ═══════════════════════════════════════════════════════════════════════════
-- AS CONCESSÕES DE TABELA SAEM DO AMBIENTE E ENTRAM NA MIGRATION
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ ACHADO DA PRIMEIRA EXECUÇÃO DA GUARDA DE ISOLAMENTO NO CI. Num banco
-- criado do ZERO pelas migrations deste repositório, o papel `authenticated`
-- não tem SELECT em `movements`:
--
--   psql:scripts/isolamento-par.sql: ERROR: permission denied for table movements
--   HINT: GRANT SELECT ON public.movements TO authenticated;
--
-- Em produção ele tem (`authenticated=arwdm/postgres`). A diferença não vem de
-- nenhuma migration: vem do ambiente. No projeto hospedado, as tabelas nascem
-- com as concessões que o Supabase configura por padrão; no stack local as
-- migrations rodam como `postgres` e as tabelas nascem sem elas.
--
-- Ou seja: **o repositório não reconstrói a produção**. Um ambiente novo — uma
-- homologação, uma recuperação de desastre, um segundo projeto — subiria com o
-- aplicativo sem conseguir ler o próprio dado, e o erro apareceria como "tela
-- vazia", não como "faltou uma concessão".
--
-- ⚠️ E o defeito é invisível para as guardas que existiam: `esquema` compara
-- NOMES de migration, não privilégios; a varredura de isolamento roda contra um
-- banco que já tem os privilégios certos. Só um banco construído do zero
-- responde a esta pergunta — que é exatamente o que o job novo faz.
--
-- Esta migration DECLARA o quadro que a produção já tem, medido tabela a
-- tabela. Aplicada nela, é neutra (conferido: 55 · 7 · 2 · 1, idêntico antes e
-- depois); aplicada num banco novo, é o que faz o produto funcionar.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. A BASE: as tabelas de negócio, protegidas por política de linha ──────
--
-- ⚠️ `select, insert, update, delete` e NÃO `all`. `all` traria de volta
-- TRUNCATE, TRIGGER e REFERENCES — os três que a 0027 removeu porque nenhuma
-- política de linha os filtra. Conceder tudo e revogar em seguida funciona, mas
-- deixa a intenção dependendo da ordem das linhas; nomear os quatro verbos diz
-- o que se quis.
grant select, insert, update, delete on all tables in schema public to authenticated;

-- E as tabelas do FUTURO, pelo mesmo motivo que a 0027 ajustou os padrões: sem
-- isto, a próxima tabela nasce inacessível e o defeito volta em silêncio.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

do $$
begin
  -- O papel que cria as tabelas varia por ambiente (hospedado × local). É essa
  -- variação que produziu o defeito, então os dois casos ficam cobertos.
  execute 'alter default privileges for role postgres in schema public grant select, insert, update, delete on tables to authenticated';
exception when others then
  raise notice 'privilégios padrão do papel postgres não ajustados: %', sqlerrm;
end $$;

-- ── 2. AS EXCEÇÕES, medidas na produção, tabela a tabela ───────────────────
--
-- ⚠️ Vêm DEPOIS do grant amplo de propósito: a ordem é a regra. Invertê-las
-- faria o grant apagar cada uma destas restrições, e o resultado seria um banco
-- onde qualquer usuário lê a lista de administradores da plataforma.

-- Alcançadas SÓ por função `SECURITY DEFINER`. Concessão nenhuma.
revoke all on table
  public.admin_acessos,
  public.admin_audit,
  public.plans,
  public.platform_admin_permitidos,
  public.platform_admins,
  public.rota_alias_acessos,
  public.subscriptions
from anon, authenticated;

-- A matriz papel×ação é a REGRA, não o dado: lê-se, não se reescreve.
revoke insert, update, delete on table public.role_permissions from anon, authenticated;

-- A empresa ativa se ESCOLHE por `trocar_organizacao()`, que valida o vínculo.
-- Escrita direta deixaria abrir uma empresa da qual não se é membro.
revoke insert, update, delete on table public.user_active_org from anon, authenticated;

-- Trilha append-only: entra e não sai. `with check` não cobre exclusão, e por
-- isso a concessão é a primeira linha de defesa, não a política.
revoke update, delete on table public.audit_log from anon, authenticated;

-- ── 3. O QUE NUNCA VOLTA ────────────────────────────────────────────────────
--
-- ⚠️ Repetido aqui, e não confiado à 0027: esta migration acabou de conceder em
-- massa, e uma concessão em massa é exatamente o que reabre o buraco. A ONDA 9
-- mediu que `anon` podia TRUNCATE em 57 de 59 tabelas — e TRUNCATE não passa
-- por política de linha nenhuma.
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;
revoke all on all tables in schema public from anon;

alter default privileges in schema public
  revoke truncate, trigger, references on tables from authenticated;
alter default privileges in schema public revoke all on tables from anon;

do $$
begin
  execute 'alter default privileges for role postgres in schema public revoke truncate, trigger, references on tables from authenticated';
  execute 'alter default privileges for role postgres in schema public revoke all on tables from anon';
exception when others then
  raise notice 'privilégios padrão do papel postgres não ajustados: %', sqlerrm;
end $$;
