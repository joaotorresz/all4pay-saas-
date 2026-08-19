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

  -- ⚠️ **O SEGREDO NÃO ENTRA NESTE ARQUIVO — ele é PRÉ-REQUISITO.**
  --
  -- A versão anterior trazia um placeholder para o dono substituir à mão. Duas
  -- coisas estavam erradas nisso, e a segunda é a que importa:
  --   1. exigia lembrar de uma edição, e esquecer era o estado natural — o lote
  --      foi colado duas vezes sem a troca;
  --   2. fazia um segredo REAL trafegar por um arquivo de texto, colado num
  --      editor de SQL. Segredo não anda em arquivo.
  --
  -- Agora ele é criado UMA vez pelo painel (Dashboard → Project Settings →
  -- Vault → New secret), com o nome exato `cron_secret`, e esta migration
  -- apenas EXIGE que exista. Sem ele, para aqui com instrução — não agenda nada
  -- pela metade.
  if not exists (select 1 from vault.secrets where name = 'cron_secret') then
    raise exception using
      errcode = 'A4P19',
      message = 'O segredo cron_secret nao existe no cofre.',
      hint = 'Crie antes de colar o lote: Supabase Dashboard > Project Settings > Vault > New secret, com o NOME exato cron_secret e, como valor, o mesmo CRON_SECRET configurado na Vercel. Sem ele o agendamento nao e criado. Nada foi gravado: a transacao inteira foi desfeita.';
  end if;

  -- ⚠️ `unschedule` antes de agendar: sem isso, reaplicar criaria um segundo job
  -- com o mesmo propósito — inofensivo pela idempotência do ETL, mas ilegível
  -- para quem auditar o agendador. Em bloco porque `cron.unschedule` LANÇA
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
