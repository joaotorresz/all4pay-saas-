-- ═══════════════════════════════════════════════════════════════════════════
-- GUARDA DE BANCO DO CAMP-B — a fechadura do mês fechado e o consolidado
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/campb-banco.sql
--
-- Duas travas que moram no BANCO e que nenhuma guarda pura alcança:
--
--  A. `movements_periodo_fechado` (20260930210000) recusa o UPDATE que tira um
--     título de um mês FECHADO — antes ela só olhava a data nova, e trocar o
--     vencimento de 20/08 (agosto fechado) para 05/09 passava. A edição em
--     massa recusa na tela; a fechadura é esta.
--  B. `org_movements` (20260930214500) devolve o título que VENCE no período
--     mesmo pago depois dele, e deixa de fora lixeira e amostra — a tela de
--     Consolidado soma por vencimento sobre esta função.
--
-- ⚠️ Cada caso em SAVEPOINT próprio, e o veredicto é julgado FORA do bloco
-- protegido (um `raise` dentro do handler seria engolido por ele).
-- ⚠️ E cada trava carrega o TESTE NEGATIVO: o defeito é REPLANTADO (a versão
-- antiga da função) e a guarda exige que a própria asserção acuse — guarda que
-- não reprova o defeito plantado é a aparência de uma.
-- ⚠️ Usuários entram por `auth.users` (o gatilho de signup cria a empresa).
-- Tudo termina em ROLLBACK.
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

begin;

-- A sessão do usuário: as duas formas da claim, para o `auth.uid()` do
-- Supabase hospedado e o do banco de prova local.
create or replace function pg_temp.entrar(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u::text, true);
end $$;

-- A asserção do caso A, isolada para poder rodar duas vezes (com a trava e com
-- o defeito replantado). Devolve NULL quando o UPDATE PASSOU (o defeito) ou a
-- mensagem da recusa.
create or replace function pg_temp.sair_do_fechado(t uuid) returns text language plpgsql as $$
declare msg text;
begin
  begin
    update public.movements set due_date = '2026-09-05' where id = t;
    msg := null;
  exception when others then msg := sqlerrm;
  end;
  return msg;
end $$;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000cb01', 'campb-a@guarda.local'),
  ('00000000-0000-0000-0000-00000000cb02', 'campb-b@guarda.local');

-- ───────────────────────── A. a trava olha a data de ORIGEM ────────────────
savepoint a;
do $a$
declare
  ua uuid := '00000000-0000-0000-0000-00000000cb01';
  o uuid; c uuid; t uuid; t2 uuid; msg text; est uuid;
begin
  select org_id into o from public.organization_members where user_id = ua limit 1;
  select id into c from public.financial_accounts where org_id = o limit 1;
  if o is null or c is null then raise exception 'GUARDA INVÁLIDA: o signup não criou empresa e conta.'; end if;

  insert into public.movements (org_id, account_id, type, amount, description, due_date, origem, situacao)
    values (o, c, 'saida', 100, 'campb agosto', '2026-08-20', 'manual', 'previsto') returning id into t;
  insert into public.movements (org_id, account_id, type, amount, description, due_date, origem, situacao)
    values (o, c, 'saida', 50, 'campb setembro', '2026-09-20', 'manual', 'previsto') returning id into t2;
  insert into public.accounting_periods (org_id, period, status) values (o, '2026-08-01', 'locked');

  -- O POSITIVO primeiro: sem ele, uma trava que recusa TUDO passaria.
  begin
    update public.movements set due_date = '2026-09-25' where id = t2;
    msg := null;
  exception when others then msg := sqlerrm; end;
  if msg is not null then
    raise exception 'CASO A FALHOU: mover um título entre meses ABERTOS foi recusado — a trava recusa demais (%).', msg;
  end if;

  msg := pg_temp.sair_do_fechado(t);
  if msg is null then
    raise exception 'CASO A FALHOU: o vencimento de um título de agosto (FECHADO) foi trocado para setembro — o título saiu do balancete entregue.';
  end if;
  if msg not like '%08/2026 está fechado%ESTORNO%' then
    raise exception 'VERMELHO PELO MOTIVO ERRADO (caso A): a recusa veio com "%", que não é a da trava do mês fechado.', msg;
  end if;

  -- O estorno continua sendo o caminho: ele entra no mês aberto e carimba o
  -- original sem mover a data dele.
  perform pg_temp.entrar(ua);
  set local role authenticated;
  est := public.estornar_lancamento(t, 'guarda campb: correção por estorno');
  reset role;
  if est is null or not exists (select 1 from public.movements where id = t and estornado_em is not null) then
    raise exception 'CASO A FALHOU: estornar_lancamento deixou de passar depois da trava nova.';
  end if;

end $a$;
rollback to savepoint a;

-- O NEGATIVO do caso A: replanta a versão antiga (só a data nova) e exige que
-- a asserção ACUSE. Se continuar recusando, o caso não discrimina nada.
savepoint a_neg;
do $aneg$
declare
  ua uuid := '00000000-0000-0000-0000-00000000cb01';
  o uuid; c uuid; t uuid; msg text;
begin
  select org_id into o from public.organization_members where user_id = ua limit 1;
  select id into c from public.financial_accounts where org_id = o limit 1;
  insert into public.movements (org_id, account_id, type, amount, description, due_date, origem, situacao)
    values (o, c, 'saida', 100, 'campb agosto', '2026-08-20', 'manual', 'previsto') returning id into t;
  insert into public.accounting_periods (org_id, period, status) values (o, '2026-08-01', 'locked');
  execute $old$
    create or replace function public.movements_periodo_fechado() returns trigger
    language plpgsql security definer set search_path = public as $f$
    declare v_data date; v_org uuid;
    begin
      if (tg_op = 'DELETE') then v_data := old.due_date; v_org := old.org_id;
      else v_data := new.due_date; v_org := new.org_id; end if;
      if v_data is null then return coalesce(new, old); end if;
      if not public.periodo_fechado(v_data, v_org) then return coalesce(new, old); end if;
      if (tg_op <> 'DELETE') and new.estorno_de is not null then return new; end if;
      raise exception 'O mês % está fechado.', to_char(v_data, 'MM/YYYY') using errcode = 'check_violation';
    end $f$
  $old$;
  msg := pg_temp.sair_do_fechado(t);
  if msg is not null then
    raise exception 'TESTE NEGATIVO INVÁLIDO (caso A): com a trava ANTIGA replantada o título continuou preso (%) — o caso não discrimina o defeito.', msg;
  end if;
end $aneg$;
rollback to savepoint a_neg;

-- ──────────────────── B. org_movements lê o período inteiro ────────────────
savepoint b;
do $b$
declare
  ua uuid := '00000000-0000-0000-0000-00000000cb01';
  ub uuid := '00000000-0000-0000-0000-00000000cb02';
  oa uuid; ob uuid; c uuid; cb uuid;
  t_venc uuid; t_pago uuid; t_lix uuid; t_amo uuid; t_b uuid;
  ids uuid[]; n_cons numeric; n_mov numeric;
begin
  select org_id into oa from public.organization_members where user_id = ua limit 1;
  select org_id into ob from public.organization_members where user_id = ub limit 1;
  select id into c from public.financial_accounts where org_id = oa limit 1;
  select id into cb from public.financial_accounts where org_id = ob limit 1;

  -- vence em setembro, pago em outubro: É de setembro por competência.
  insert into public.movements (org_id, account_id, type, amount, description, due_date, paid_date, origem, situacao)
    values (oa, c, 'entrada', 1000, 'campb vence set pago out', '2026-09-10', '2026-10-02', 'manual', 'baixado') returning id into t_venc;
  -- pago em setembro, vencia em agosto: o DFC de setembro precisa dele.
  insert into public.movements (org_id, account_id, type, amount, description, due_date, paid_date, origem, situacao)
    values (oa, c, 'entrada', 300, 'campb vence ago pago set', '2026-08-28', '2026-09-03', 'manual', 'baixado') returning id into t_pago;
  insert into public.movements (org_id, account_id, type, amount, description, due_date, origem, situacao, excluido_em)
    values (oa, c, 'entrada', 777, 'campb na lixeira', '2026-09-12', 'manual', 'previsto', now()) returning id into t_lix;
  insert into public.movements (org_id, account_id, type, amount, description, due_date, origem, situacao, is_sample, sample_reason)
    values (oa, c, 'entrada', 555, 'campb amostra', '2026-09-13', 'manual', 'previsto', true, 'onboarding_demo') returning id into t_amo;
  insert into public.movements (org_id, account_id, type, amount, description, due_date, origem, situacao)
    values (ob, cb, 'entrada', 999, 'campb outra empresa', '2026-09-14', 'manual', 'previsto') returning id into t_b;

  perform pg_temp.entrar(ua);
  set local role authenticated;
  select array_agg(m.id) into ids from public.org_movements('2026-09-01', '2026-09-30') m;
  select coalesce(sum(receita), 0) into n_cons from public.org_consolidado('2026-09-01', '2026-09-30') where org_id = oa;
  -- ⚠️ REVISÃO CAMP-B (edição em massa): um UPDATE em linha de OUTRA empresa
  -- não levanta erro — a política FILTRA e devolve zero linhas. É por isso que
  -- o escritor confere o retorno. Medido aqui, não suposto.
  update public.movements set description = 'invadido' where id = t_b;
  get diagnostics n_mov = row_count;
  reset role;

  if not (t_venc = any(ids)) then
    raise exception 'CASO B FALHOU: o título que VENCE em setembro e foi pago em outubro não veio — o consolidado de setembro sai menor que a soma das empresas.';
  end if;
  if not (t_pago = any(ids)) then
    raise exception 'CASO B FALHOU: o título PAGO em setembro (vencia em agosto) não veio — o DFC consolidado perderia o caixa do mês.';
  end if;
  if t_lix = any(ids) then raise exception 'CASO B FALHOU: título na LIXEIRA veio no consolidado.'; end if;
  if t_amo = any(ids) then raise exception 'CASO B FALHOU: dado de AMOSTRA veio no consolidado.'; end if;
  if t_b = any(ids) then raise exception 'CASO B FALHOU: lançamento de OUTRA empresa veio — o escopo da função DEFINER vazou.'; end if;
  -- org_consolidado: a soma por vencimento sem lixeira e sem amostra (1000 do
  -- título de setembro; o de agosto, a lixeira e a amostra ficam fora).
  if n_cons <> 1000 then
    raise exception 'CASO B FALHOU: org_consolidado somou % em setembro, esperado 1000 (sem lixeira, sem amostra, por vencimento).', n_cons;
  end if;
  if n_mov <> 0 then
    raise exception 'CASO B FALHOU: o UPDATE de um título de outra empresa alterou % linha(s) — o isolamento de escrita vazou.', n_mov;
  end if;
  if (select description from public.movements where id = t_b) <> 'campb outra empresa' then
    raise exception 'CASO B FALHOU: o título da outra empresa mudou.';
  end if;
end $b$;
rollback to savepoint b;

-- O NEGATIVO do caso B: replanta o recorte antigo (só `coalesce(paid, due)`)
-- e exige que a asserção principal ACUSE o título de setembro pago em outubro.
savepoint b_neg;
do $bneg$
declare
  ua uuid := '00000000-0000-0000-0000-00000000cb01';
  oa uuid; c uuid; t_venc uuid; ids uuid[];
begin
  select org_id into oa from public.organization_members where user_id = ua limit 1;
  select id into c from public.financial_accounts where org_id = oa limit 1;
  insert into public.movements (org_id, account_id, type, amount, description, due_date, paid_date, origem, situacao)
    values (oa, c, 'entrada', 1000, 'campb vence set pago out', '2026-09-10', '2026-10-02', 'manual', 'baixado') returning id into t_venc;
  execute $old$
    create or replace function public.org_movements(p_de date, p_ate date)
    returns table (org_id uuid, org_nome text, id uuid, account_id uuid, type text, status text, amount numeric,
                   due_date date, paid_date date, party_id uuid, party_nome text, categoria text, centro text, projeto text)
    language sql security definer stable set search_path = public as $f$
      select m.org_id, o.name, m.id, m.account_id, m.type::text, m.status::text, m.amount, m.due_date, m.paid_date,
             m.party_id, null::text, m.category, null::text, null::text
        from public.movements m join public.organizations o on o.id = m.org_id
       where m.org_id in (select om.org_id from public.organization_members om where om.user_id = auth.uid())
         and coalesce(m.paid_date, m.due_date) between p_de and p_ate
    $f$
  $old$;
  perform pg_temp.entrar(ua);
  set local role authenticated;
  select array_agg(m.id) into ids from public.org_movements('2026-09-01', '2026-09-30') m;
  reset role;
  if t_venc = any(coalesce(ids, '{}')) then
    raise exception 'TESTE NEGATIVO INVÁLIDO (caso B): com o recorte ANTIGO replantado o título de setembro pago em outubro continuou vindo — o caso não discrimina o defeito.';
  end if;
end $bneg$;
rollback to savepoint b_neg;

rollback;

\echo '✓ campb-banco: a trava do mês fechado olha a origem · o consolidado lê o período inteiro, sem lixeira nem amostra · os dois negativos acusam o defeito replantado'
