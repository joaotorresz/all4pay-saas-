-- ═══════════════════════════════════════════════════════════════════════════
-- GUARDA DO VÍNCULO CRONOGRAMA → COMPRA (migration 20261104100000)
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/cronograma-compra.sql
--
-- O cronograma aponta a compra que ele deprecia; o razão leva essa compra ao
-- ativo. Esta guarda prova, no banco construído do zero pelas migrations, que
-- o banco recusa o que dobraria a despesa de outro jeito:
--
--   1. ligar o cronograma a uma saída da própria empresa passa;
--   2. a MESMA compra em dois cronogramas vivos é recusada (índice nomeado);
--   3. depois que o primeiro vai para a lixeira, a compra pode ser religada;
--   4. ligar a uma ENTRADA é recusado;
--   5. ligar a um lançamento de OUTRA empresa é recusado.
--
-- Cada recusa tem de NOMEAR o motivo; recusa por outro motivo reprova.
-- Termina em ROLLBACK.
-- ═══════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('c4000000-0000-0000-0000-000000000001', 'cron-a@guarda.test', '{"company":"Guarda Cronograma A"}'),
  ('c4000000-0000-0000-0000-000000000002', 'cron-b@guarda.test', '{"company":"Guarda Cronograma B"}');

create or replace function pg_temp.recusa(sql text, motivo text, caso text) returns void language plpgsql as $$
declare v_msg text;
begin
  begin
    execute sql;
  exception when others then
    v_msg := sqlerrm;
  end;
  if v_msg is null then
    raise exception 'CASO % FALHOU: a gravação PASSOU.', caso;
  end if;
  if v_msg not like '%' || motivo || '%' then
    raise exception 'VERMELHO PELO MOTIVO ERRADO no caso %: "%" não cita "%".', caso, v_msg, motivo;
  end if;
end $$;

do $$
declare
  o uuid; ob uuid; c uuid; cb uuid;
  compra uuid; entrada uuid; compra_b uuid; s1 uuid;
begin
  select org_id into o from public.organization_members where user_id = 'c4000000-0000-0000-0000-000000000001' limit 1;
  select org_id into ob from public.organization_members where user_id = 'c4000000-0000-0000-0000-000000000002' limit 1;
  if o is null or ob is null or o = ob then
    raise exception 'GUARDA INVÁLIDA: o provisionamento não criou duas empresas. Nada abaixo prova coisa alguma.';
  end if;
  select id into c from public.financial_accounts where org_id = o limit 1;
  select id into cb from public.financial_accounts where org_id = ob limit 1;

  insert into public.movements (org_id, account_id, type, amount, description, due_date, origem, situacao)
  values (o, c, 'saida', 18000, 'Notebooks (guarda)', current_date, 'manual', 'previsto') returning id into compra;
  insert into public.movements (org_id, account_id, type, amount, description, due_date, origem, situacao)
  values (o, c, 'entrada', 500, 'Venda (guarda)', current_date, 'manual', 'previsto') returning id into entrada;
  insert into public.movements (org_id, account_id, type, amount, description, due_date, origem, situacao)
  values (ob, cb, 'saida', 900, 'Compra da outra empresa (guarda)', current_date, 'manual', 'previsto') returning id into compra_b;

  -- 1. o caminho feliz
  insert into public.schedules (org_id, kind, description, total, residual, start_period, periods, movement_id)
  values (o, 'fixed_asset', 'Notebooks', 18000, 0, date_trunc('month', current_date)::date, 36, compra) returning id into s1;
  if (select movement_id from public.schedules where id = s1) is distinct from compra then
    raise exception 'CASO 1 FALHOU: o vínculo com a compra não foi gravado.';
  end if;

  -- 2. a mesma compra em dois cronogramas vivos
  perform pg_temp.recusa(format($q$insert into public.schedules (org_id, kind, description, total, residual, start_period, periods, movement_id)
    values (%L, 'fixed_asset', 'Notebooks de novo', 18000, 0, current_date, 36, %L)$q$, o, compra),
    'schedules_uma_compra_por_cronograma', '2 compra em dois cronogramas');

  -- 3. com o primeiro na lixeira, religar passa
  update public.schedules set excluido_em = now() where id = s1;
  insert into public.schedules (org_id, kind, description, total, residual, start_period, periods, movement_id)
  values (o, 'fixed_asset', 'Notebooks (refeito)', 18000, 0, current_date, 36, compra);

  -- 4. uma entrada não é compra
  perform pg_temp.recusa(format($q$insert into public.schedules (org_id, kind, description, total, residual, start_period, periods, movement_id)
    values (%L, 'prepaid', 'Errado', 500, 0, current_date, 12, %L)$q$, o, entrada),
    'lançamento de saída', '4 vínculo com entrada');

  -- 5. o lançamento de outra empresa
  perform pg_temp.recusa(format($q$insert into public.schedules (org_id, kind, description, total, residual, start_period, periods, movement_id)
    values (%L, 'prepaid', 'Errado', 900, 0, current_date, 12, %L)$q$, o, compra_b),
    'não é desta empresa', '5 vínculo com outra empresa');

  raise notice '✓ cronograma-compra: 5 casos (vínculo grava; compra dupla, entrada e outra empresa recusadas; lixeira libera)';
end $$;

rollback;
