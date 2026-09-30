-- ═══════════════════════════════════════════════════════════════════════════
-- A INTEGRAÇÃO COM A OWN SAI DO PRODUTO (contrato rescindido, 30/09/2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Decisão do dono: a Quattro rescindiu com a OWN (adquirente da maquininha).
-- Sai tudo o que existia só para falar com ela: as tabelas de adquirência
-- (`own_*`), o cache de token OAuth, as funções de token e de saúde, a view do
-- extrato do lojista e o gatilho de `atualizado_em`. As Edge Functions
-- `own-sync` e `own-webhook` saíram do repositório no mesmo commit.
--
-- ⚠️ ESTA MIGRATION APAGA DADO, e por isso ela SE RECUSA quando há dado.
-- Medido na auditoria de 17/08: as onze tabelas `own_*` estavam vazias. Se
-- alguma tiver linha no dia em que isto for aplicado, a transação inteira é
-- desfeita e a mensagem diz qual tabela e quantas linhas — exportar antes, e
-- decidir, é trabalho de gente, não de migration. Apagar em silêncio o extrato
-- de um lojista seria a pior forma de descobrir que ele existia.
--
-- ⚠️ SEM `cascade`. Cada objeto sai pelo nome, filho antes de pai. Se algo que
-- não é da OWN depender de um destes objetos, o `drop` falha e NOMEIA a
-- dependência — `cascade` a levaria junto, calado.
--
-- Idempotente: `if exists` em tudo. No banco efêmero do CI os objetos nascem
-- das migrations anteriores e morrem aqui; em produção, idem.

do $recusa$
declare
  t text;
  n bigint;
  com_dado text[] := '{}';
begin
  foreach t in array array[
    'own_antecipacoes','own_parcelas','own_liquidacoes','own_transacoes',
    'own_terminais','own_erp_credenciais','own_webhook_eventos',
    'own_sync_execucoes','own_lojistas','own_token_cache'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('select count(*) from public.%I', t) into n;
      -- O cache de token não é dado de cliente: é o token vivo da OWN, que
      -- perdeu o sentido com a rescisão. Ele sai mesmo com linha.
      if n > 0 and t <> 'own_token_cache' then
        com_dado := com_dado || format('%s (%s linhas)', t, n);
      end if;
    end if;
  end loop;

  if array_length(com_dado, 1) > 0 then
    raise exception 'REMOÇÃO DA OWN RECUSADA: há dado em %. Exporte e decida antes de aplicar — esta migration não apaga dado de lojista em silêncio.',
      array_to_string(com_dado, ', ');
  end if;
end
$recusa$;

-- O agendamento do `own-sync` no pg_cron nasceu à mão em produção (a migration
-- do Open Finance o cita como "o job existente"). Sem a função do outro lado,
-- ele dispararia todo dia contra uma porta que não existe mais — o caminho
-- "funciona" e não faz efeito. Sai pelo COMANDO, não por um nome suposto.
-- ⚠️ Onde o pg_cron não existe (o Postgres do CI) o passo PULA COM AVISO: em
-- produção ele existe, e encontrar este aviso lá significa que o job não saiu.
do $cron$
declare
  j record;
  n int := 0;
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron ausente: nenhum agendamento do own-sync removido aqui. Em PRODUÇÃO este aviso não deveria aparecer — confira cron.job.';
    return;
  end if;
  for j in
    execute $q$select jobid from cron.job
                where command ilike '%own-sync%' or command ilike '%own-webhook%'
                   or jobname ilike 'own%'$q$
  loop
    perform cron.unschedule(j.jobid);
    n := n + 1;
  end loop;
  raise notice 'agendamentos da OWN removidos do pg_cron: %', n;
end
$cron$;

-- A view primeiro: ela lê das tabelas.
drop view if exists public.own_extrato_lojista;

-- Funções de token e de saúde (leem `own_token_cache` e `own_sync_execucoes`).
drop function if exists public.own_saude();
drop function if exists public.own_token_pegar(text, integer);
drop function if exists public.own_token_gravar(text, text, integer);
drop function if exists public.own_token_bloquear(text, integer, text);

-- Tabelas, filho antes de pai (as chaves estrangeiras apontam para cima).
drop table if exists public.own_antecipacoes;
drop table if exists public.own_parcelas;
drop table if exists public.own_liquidacoes;
drop table if exists public.own_transacoes;
drop table if exists public.own_terminais;
drop table if exists public.own_erp_credenciais;
drop table if exists public.own_webhook_eventos;
drop table if exists public.own_sync_execucoes;
drop table if exists public.own_lojistas;
drop table if exists public.own_token_cache;

-- O gatilho de `atualizado_em` só servia às tabelas acima; com elas fora, ele
-- não tem mais consumidor.
drop function if exists public.own_touch();
