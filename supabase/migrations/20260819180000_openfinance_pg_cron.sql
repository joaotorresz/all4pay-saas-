-- ═══════════════════════════════════════════════════════════════════════════
-- O SYNC DO OPEN FINANCE SAI DO VERCEL CRON E VAI PARA O pg_cron
-- ═══════════════════════════════════════════════════════════════════════════
--
-- **Decisão do dono, 19/08/2026.** O Vercel Hobby recusou o agendamento duas
-- vezes ao dia — *"Hobby accounts are limited to daily cron jobs"* — e a
-- cadência não é capricho: um ERP financeiro que mostra o extrato de ontem é um
-- ERP que o cliente confere no banco antes de confiar, e aí ele deixou de ser a
-- fonte e virou a segunda opinião.
--
-- `pg_cron` existe no plano Free e não tem esse teto. Medido em 19/08:
-- **pg_cron 1.6.4, pg_net 0.20.3 e supabase_vault 0.3.1 já instalados**, e já
-- há um job (`own-sync`) usando exatamente este desenho — então isto SEGUE o
-- padrão da casa em vez de inventar um segundo.
--
-- ⚠️ **UMA DIFERENÇA DELIBERADA em relação ao job existente:** o `own-sync`
-- manda o segredo na QUERY STRING (`?secret=…`). É o mesmo defeito que o
-- A4P-077 acabou de fechar no webhook — query string entra em log de acesso, em
-- proxy e em `Referer`. Aqui o segredo vai no CABEÇALHO `Authorization`, que é
-- o que a rota `/api/openfinance/sync` já lê. Não mexo no `own-sync` porque a
-- adquirência está arquivada por decisão de fase; fica anotado para quando ela
-- reabrir.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. O SEGREDO — ⚠️ O DONO PRECISA COLAR O VALOR NA LINHA ABAIXO
-- ───────────────────────────────────────────────────────────────────────────
-- ⚠️ Tem de ser **o mesmo valor** do `CRON_SECRET` configurado na Vercel: a
-- rota compara `Authorization: Bearer <CRON_SECRET>` e devolve 401 quando não
-- bate. Com o valor errado o cron roda, toma 401 e **não sincroniza nada** —
-- em silêncio, que é exatamente a família de defeito que custou dois meses de
-- extrato parado.
--
-- Se o segredo já existir com este nome, a linha é ignorada (não sobrescreve).
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'cron_secret') then
    perform vault.create_secret(
      'COLE_AQUI_O_MESMO_VALOR_DO_CRON_SECRET_DA_VERCEL',
      'cron_secret',
      'Bearer usado pelo pg_cron ao chamar /api/openfinance/sync'
    );
  end if;
end $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. OS DOIS HORÁRIOS — 09:00 e 21:00 UTC
-- ───────────────────────────────────────────────────────────────────────────
-- ⚠️ `unschedule` antes de agendar: sem isso, reaplicar a migration criaria um
-- segundo job com o mesmo propósito, e o extrato seria puxado em duplicidade —
-- inofensivo pela idempotência, mas ilegível para quem for auditar o agendador.
-- Envolvido em bloco porque `cron.unschedule` LANÇA quando o job não existe.
do $$
begin
  perform cron.unschedule('openfinance-sync-manha');
exception when others then null;
end $$;
do $$
begin
  perform cron.unschedule('openfinance-sync-noite');
exception when others then null;
end $$;

select cron.schedule(
  'openfinance-sync-manha', '0 9 * * *',
  $cron$
  select net.http_get(
    url := 'https://all4pay-saas.vercel.app/api/openfinance/sync',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
      'User-Agent', 'All4Pay-Cron/1.0'),
    timeout_milliseconds := 55000);
  $cron$
);

select cron.schedule(
  'openfinance-sync-noite', '0 21 * * *',
  $cron$
  select net.http_get(
    url := 'https://all4pay-saas.vercel.app/api/openfinance/sync',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
      'User-Agent', 'All4Pay-Cron/1.0'),
    timeout_milliseconds := 55000);
  $cron$
);

comment on extension pg_cron is
  'Agenda o sync do Open Finance duas vezes ao dia (09:00 e 21:00 UTC). O Vercel Hobby só permite uma execução diária; o pg_cron não tem esse teto e fica do lado do banco, junto do dado.';
