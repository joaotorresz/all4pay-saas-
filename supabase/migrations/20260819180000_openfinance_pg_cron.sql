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
-- ⚠️ O BANCO EFÊMERO DO CI NÃO TEM pg_cron — e isso NÃO é defeito
-- ───────────────────────────────────────────────────────────────────────────
-- `pg_cron`, `pg_net` e `vault` são extensões do Supabase hospedado; o Postgres
-- de contêiner que a guarda de isolamento sobe não as tem. Medido: a primeira
-- versão desta migration derrubou o CI com
-- `ERROR: schema "cron" does not exist (SQLSTATE 3F000)`.
--
-- ⚠️ **Pular NÃO pode virar silêncio.** Um `if not exists then return` mudo faria
-- a migration "passar" em produção caso a extensão sumisse — e o agendamento
-- desapareceria sem ninguém saber. Por isso o caminho de pulo AVISA
-- (`raise notice`), e a guarda do CI continua cobrando os dois horários no
-- ARQUIVO: o texto do agendamento é verificado mesmo onde ele não pode rodar.
--
-- ⚠️ Tudo abaixo vai por `execute`, de propósito: o plpgsql resolve SQL de
-- dentro de `execute` só na hora de rodar, então um ramo não tomado nunca tenta
-- resolver `cron.` nem `vault.` — que é o que torna o pulo possível.
do $agendar$
begin
  if to_regnamespace('cron') is null or to_regnamespace('vault') is null then
    raise notice 'pg_cron/vault ausentes (banco efêmero): agendamento do Open Finance PULADO. Em produção estas extensões existem — se este aviso aparecer lá, o agendamento NÃO foi criado.';
    return;
  end if;

  -- 1. O SEGREDO — ⚠️ O DONO PRECISA COLAR O VALOR (ver o aviso no topo do lote)
  --
  -- Tem de ser **o mesmo valor** do `CRON_SECRET` da Vercel: a rota compara
  -- `Authorization: Bearer <CRON_SECRET>` e devolve 401 quando não bate. Com o
  -- valor errado o cron roda, toma 401 e **não sincroniza nada** — em silêncio,
  -- a mesma família que deixou o extrato dois meses parado.
  --
  -- Se o segredo já existir com este nome, nada é sobrescrito.
  if not exists (select 1 from vault.secrets where name = 'cron_secret') then
    execute $sql$
      select vault.create_secret(
        'COLE_AQUI_O_MESMO_VALOR_DO_CRON_SECRET_DA_VERCEL',
        'cron_secret',
        'Bearer usado pelo pg_cron ao chamar /api/openfinance/sync')
    $sql$;
  end if;

  -- 2. OS DOIS HORÁRIOS — 09:00 e 21:00 UTC
  --
  -- ⚠️ `unschedule` antes de agendar: sem isso, reaplicar criaria um segundo job
  -- com o mesmo propósito — inofensivo pela idempotência do ETL, mas ilegível
  -- para quem for auditar o agendador. Em bloco porque `cron.unschedule` LANÇA
  -- quando o job não existe.
  begin execute $sql$ select cron.unschedule('openfinance-sync-manha') $sql$; exception when others then null; end;
  begin execute $sql$ select cron.unschedule('openfinance-sync-noite') $sql$; exception when others then null; end;

  execute $sql$
    select cron.schedule('openfinance-sync-manha', '0 9 * * *', $cron$
      select net.http_get(
        url := 'https://all4pay-saas.vercel.app/api/openfinance/sync',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
          'User-Agent', 'All4Pay-Cron/1.0'),
        timeout_milliseconds := 55000);
    $cron$)
  $sql$;

  execute $sql$
    select cron.schedule('openfinance-sync-noite', '0 21 * * *', $cron$
      select net.http_get(
        url := 'https://all4pay-saas.vercel.app/api/openfinance/sync',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
          'User-Agent', 'All4Pay-Cron/1.0'),
        timeout_milliseconds := 55000);
    $cron$)
  $sql$;

  raise notice 'Open Finance agendado: 09:00 e 21:00 UTC.';
end $agendar$;
