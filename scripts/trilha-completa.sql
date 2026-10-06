-- ═══════════════════════════════════════════════════════════════════════════
-- GUARDA: NENHUMA OPERAÇÃO DE NEGÓCIO SEM EVENTO DE AUDITORIA
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/trilha-completa.sql
--
-- ⚠️ Ela roda no MESMO job da guarda de isolamento, contra um banco construído
-- do zero pelas migrations — e é aí que está o valor. A varredura que instala
-- os gatilhos roda uma vez, na migration; nada impede alguém de criar a tabela
-- seguinte e esquecer. Esta guarda pergunta ao banco, a cada build, se ainda é
-- verdade.
--
-- ⚠️ As exclusões vivem AQUI e na migration, e as duas listas têm de bater —
-- é o mesmo desenho do espelho de tokens do design system. Uma exclusão que só
-- existe num dos lados é uma tabela que perdeu a trilha sem ninguém decidir.
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

do $guarda$
declare
  -- ⚠️ `own_webhook_eventos` e `own_sync_execucoes` saíram desta lista junto
  -- com a integração da OWN (contrato rescindido, 30/09/2026): as tabelas não
  -- existem mais depois de `20260930120000`.
  fora text[] := array[
    'audit_log','org_state','admin_acessos','admin_audit',
    'rota_alias_acessos','ddl_log','raw_events',
    -- central_transicoes é ela mesma uma trilha (quem/quando/de/para de cada
    -- transição da máquina de estados) — o papel de raw_events.
    'central_transicoes',
    -- pinbank_eventos é a caixa de entrada BRUTA do webhook da maquininha
    -- (o papel de raw_events), e o evento sem vínculo não tem empresa — a
    -- trilha exige uma. O que mexe em dinheiro (vínculo, transação, venda,
    -- títulos) segue com gatilho. Declarado em 20261005120000.
    'pinbank_eventos'
  ];
  faltando text[];
  n_ok int;
begin
  select coalesce(array_agg(c.relname order by c.relname), '{}')
    into faltando
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'org_id' and not a.attisdropped
   where n.nspname = 'public' and c.relkind = 'r'
     and c.relname <> all (fora)
     and not exists (
       select 1 from pg_trigger t
        where t.tgrelid = c.oid and not t.tgisinternal and t.tgname like 'zz_auditar_%'
     );

  if array_length(faltando, 1) > 0 then
    raise exception E'TABELA DE NEGÓCIO SEM TRILHA — %:\n  %',
      array_length(faltando, 1), array_to_string(faltando, ', ');
  end if;

  select count(*) into n_ok
    from pg_trigger t
   where not t.tgisinternal and t.tgname like 'zz_auditar_%';

  -- ⚠️ Piso, e não só a ausência de faltantes: se alguém apagar as tabelas de
  -- negócio inteiras, a lista de faltantes fica vazia e a guarda passaria
  -- dizendo que está tudo auditado. Zero de zero não é cobertura.
  if n_ok < 30 then
    raise exception 'Só % gatilho(s) de auditoria instalado(s). Esperado dezenas — o banco parece incompleto, e "nada faltando" aqui não significa nada.', n_ok;
  end if;

  raise notice 'trilha: % tabelas de negócio com gatilho de auditoria · 0 sem', n_ok;
end;
$guarda$;
