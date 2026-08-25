-- ═══════════════════════════════════════════════════════════════════════════
-- A CENTRAL AUTORIZA — seis casos, cada um em savepoint próprio
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ **Os usuários entram por `auth.users`** e as orgs nascem do gatilho de
-- signup — montar tudo à mão testaria um caminho que nenhum cliente percorre.
--
-- ⚠️ **CADA CASO EM SAVEPOINT PRÓPRIO, desfeito no fim**, e todos reusando os
-- MESMOS valores únicos de propósito: reusar é o que torna o isolamento
-- auto-verificável — se um `rollback to savepoint` deixar de acontecer, o caso
-- seguinte colide na hora em vez de passar por acidente de ordem.
--
-- ⚠️ **O caso 6 tem GABARITO DE PRODUÇÃO.** Em 25/08 a org
-- c20873ac… registrou, com um único membro:
--     previsto→confirmado  autoaprovacao=true
--       motivo='org com um único membro habilitado a aprovar'
--     confirmado→baixado   autoaprovacao=false
-- A asserção cobra o CARIMBO, não só o sucesso: aceitar sem carimbar é a
-- falha, e ela tem de ficar vermelha.
begin;

-- ─────────────────────────── caso 1: R1 com outro aprovador na org ──────────
savepoint c1;
do $c1$
declare
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
  o uuid; c uuid; t uuid; msg text;
begin
  insert into auth.users (id, email, aud, role) values
    (ua, 'central-a@guarda.local', 'authenticated', 'authenticated'),
    (ub, 'central-b@guarda.local', 'authenticated', 'authenticated');
  select om.org_id into o from public.organization_members om where om.user_id = ua limit 1;
  -- ⚠️ Sem o SEGUNDO membro habilitado a aprovar, o caso 1 não mede nada: a
  -- autoaprovação seria PERMITIDA e o teste passaria pelo motivo errado.
  insert into public.organization_members (org_id, user_id, role) values (o, ub, 'aprovador')
    on conflict (org_id, user_id) do update set role = 'aprovador';
  insert into public.user_active_org (user_id, org_id) values (ub, o)
    on conflict (user_id) do update set org_id = excluded.org_id;
  insert into public.central_alcada (org_id, papel, teto_valor) values (o, 'aprovador', 10000)
    on conflict (org_id, papel) do update set teto_valor = 10000;
  select id into c from public.financial_accounts where org_id = o limit 1;

  insert into public.movements (org_id, account_id, type, amount, description,
                                due_date, origem, situacao, lancado_por)
  values (o, c, 'saida', 500, 'caso 1', current_date, 'manual', 'previsto', ua)
  returning id into t;

  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role','authenticated')::text, true);
  /* ⚠️ NADA de `raise` dentro do bloco protegido: o próprio handler o engoliria
     e a guarda reportaria "vermelho pelo motivo errado" sobre a sua própria
     asserção. Marca-se o resultado e julga-se FORA. */
  begin
    update public.movements set situacao = 'confirmado' where id = t;
    msg := null;                       -- passou: é o defeito
  exception when others then msg := SQLERRM;
  end;
  if msg is null then
    raise exception 'CASO 1 FALHOU (R1): quem lançou CONFIRMOU o próprio título existindo outro aprovador na org — a segregação não recusou.';
  end if;
  if msg not like '%A4P-CENTRAL-SEGREGACAO%' then
    raise exception 'CASO 1 — VERMELHO PELO MOTIVO ERRADO: esperava A4P-CENTRAL-SEGREGACAO, veio "%"', msg;
  end if;
  raise notice 'caso 1 OK — R1 recusa a autoaprovação quando HÁ outro aprovador';
end $c1$;
rollback to savepoint c1;

-- ────────────────────── caso 2: aprovador confirma ABAIXO do teto ───────────
savepoint c2;
do $c2$
declare
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
  o uuid; c uuid; t uuid; sit text;
begin
  insert into auth.users (id, email, aud, role) values
    (ua, 'central-a@guarda.local', 'authenticated', 'authenticated'),
    (ub, 'central-b@guarda.local', 'authenticated', 'authenticated');
  select om.org_id into o from public.organization_members om where om.user_id = ua limit 1;
  insert into public.organization_members (org_id, user_id, role) values (o, ub, 'aprovador')
    on conflict (org_id, user_id) do update set role = 'aprovador';
  insert into public.user_active_org (user_id, org_id) values (ub, o)
    on conflict (user_id) do update set org_id = excluded.org_id;
  insert into public.central_alcada (org_id, papel, teto_valor) values (o, 'aprovador', 10000)
    on conflict (org_id, papel) do update set teto_valor = 10000;
  select id into c from public.financial_accounts where org_id = o limit 1;
  insert into public.movements (org_id, account_id, type, amount, description,
                                due_date, origem, situacao, lancado_por)
  values (o, c, 'saida', 500, 'caso 2', current_date, 'manual', 'previsto', ua)
  returning id into t;

  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role','authenticated')::text, true);
  /* ⚠️ Sem este `begin`, uma recusa indevida escapava CRUA e o vermelho era a
     mensagem da máquina em vez da asserção — o leitor não saberia qual caso
     falhou. */
  begin
    update public.movements set situacao = 'confirmado' where id = t;
  exception when others then
    raise exception 'CASO 2 FALHOU: o aprovador NÃO confirmou R$500 estando abaixo do teto de R$10.000 — recusa indevida: "%"', SQLERRM;
  end;
  select situacao into sit from public.movements where id = t;
  if sit <> 'confirmado' then
    raise exception 'CASO 2 FALHOU: aprovador não confirmou abaixo do teto (situacao=%)', sit;
  end if;
  raise notice 'caso 2 OK — aprovador confirma R$500 com teto de R$10.000';
end $c2$;
rollback to savepoint c2;

-- ───────────────────────── caso 3: ACIMA do teto do papel ───────────────────
savepoint c3;
do $c3$
declare
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
  o uuid; c uuid; t uuid; msg text;
begin
  insert into auth.users (id, email, aud, role) values
    (ua, 'central-a@guarda.local', 'authenticated', 'authenticated'),
    (ub, 'central-b@guarda.local', 'authenticated', 'authenticated');
  select om.org_id into o from public.organization_members om where om.user_id = ua limit 1;
  insert into public.organization_members (org_id, user_id, role) values (o, ub, 'aprovador')
    on conflict (org_id, user_id) do update set role = 'aprovador';
  insert into public.user_active_org (user_id, org_id) values (ub, o)
    on conflict (user_id) do update set org_id = excluded.org_id;
  insert into public.central_alcada (org_id, papel, teto_valor) values (o, 'aprovador', 10000)
    on conflict (org_id, papel) do update set teto_valor = 10000;
  select id into c from public.financial_accounts where org_id = o limit 1;
  insert into public.movements (org_id, account_id, type, amount, description,
                                due_date, origem, situacao, lancado_por)
  values (o, c, 'saida', 50000, 'caso 3', current_date, 'manual', 'previsto', ua)
  returning id into t;

  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role','authenticated')::text, true);
  /* ⚠️ Mesmo padrão do caso 1: nada de `raise` dentro do bloco protegido. */
  begin
    update public.movements set situacao = 'confirmado' where id = t;
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  if msg is null then
    raise exception 'CASO 3 FALHOU (alçada): CONFIRMOU R$50.000 com teto de R$10.000 — a alçada não barrou.';
  end if;
  if msg not like '%A4P-CENTRAL-ALCADA%' then
    raise exception 'CASO 3 — VERMELHO PELO MOTIVO ERRADO: esperava A4P-CENTRAL-ALCADA, veio "%"', msg;
  end if;
  raise notice 'caso 3 OK — acima do teto recusa com a mensagem da ALÇADA';
end $c3$;
rollback to savepoint c3;

-- ──────────────────────── caso 4: transição ilegal (baixa direta) ───────────
savepoint c4;
do $c4$
declare
  ua uuid := gen_random_uuid(); o uuid; c uuid; t uuid; msg text;
begin
  insert into auth.users (id, email, aud, role) values
    (ua, 'central-a@guarda.local', 'authenticated', 'authenticated');
  select om.org_id into o from public.organization_members om where om.user_id = ua limit 1;
  select id into c from public.financial_accounts where org_id = o limit 1;
  insert into public.movements (org_id, account_id, type, amount, description,
                                due_date, origem, situacao, lancado_por)
  values (o, c, 'saida', 100, 'caso 4', current_date, 'manual', 'previsto', ua)
  returning id into t;

  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role','authenticated')::text, true);
  /* ⚠️ Mesmo padrão do caso 1. */
  begin
    update public.movements set situacao = 'conciliado' where id = t;
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  if msg is null then
    raise exception 'CASO 4 FALHOU (máquina): previsto foi DIRETO a conciliado — a transição ilegal passou.';
  end if;
  if msg not like '%A4P-CENTRAL:%' then
    raise exception 'CASO 4 — VERMELHO PELO MOTIVO ERRADO: esperava A4P-CENTRAL (transição), veio "%"', msg;
  end if;
  raise notice 'caso 4 OK — previsto → conciliado é recusado pela máquina';
end $c4$;
rollback to savepoint c4;

-- ─────────────────────────── caso 5: usuário de OUTRA org ───────────────────
savepoint c5;
do $c5$
declare
  ua uuid := gen_random_uuid(); ux uuid := gen_random_uuid();
  o uuid; c uuid; t uuid; tocou int;
begin
  insert into auth.users (id, email, aud, role) values
    (ua, 'central-a@guarda.local', 'authenticated', 'authenticated'),
    (ux, 'central-x@guarda.local', 'authenticated', 'authenticated');
  select om.org_id into o from public.organization_members om where om.user_id = ua limit 1;
  select id into c from public.financial_accounts where org_id = o limit 1;
  insert into public.movements (org_id, account_id, type, amount, description,
                                due_date, origem, situacao, lancado_por)
  values (o, c, 'saida', 300, 'caso 5', current_date, 'manual', 'previsto', ua)
  returning id into t;

  -- `ux` tem org PRÓPRIA (o gatilho de signup a criou) e nenhum vínculo com `o`.
  perform set_config('request.jwt.claims', json_build_object('sub', ux, 'role','authenticated')::text, true);
  set local role authenticated;
  /* ⚠️ Se a RLS deixar de isolar, o UPDATE ALCANÇA a linha e a recusa passa a
     vir da máquina (permissão/alçada) — mensagem crua que não nomeia o
     isolamento. Capturada aqui para o vermelho dizer o que realmente falhou. */
  begin
    update public.movements set situacao = 'confirmado' where id = t;
    get diagnostics tocou = row_count;
  exception when others then
    reset role;
    raise exception 'CASO 5 FALHOU (isolamento): o usuário de OUTRA org ALCANÇOU o título alheio — a recusa veio da máquina, não da RLS: "%"', SQLERRM;
  end;
  reset role;

  -- ⚠️ A RLS não levanta exceção ao FILTRAR: ela devolve zero linhas. Esperar
  -- uma recusa aqui faria a guarda passar sobre o vazio.
  if tocou <> 0 then
    raise exception 'CASO 5 FALHOU: usuário de outra org tocou % linha(s) do título alheio.', tocou;
  end if;
  if (select situacao from public.movements where id = t) <> 'previsto' then
    raise exception 'CASO 5 FALHOU: a situação do título alheio mudou.';
  end if;
  raise notice 'caso 5 OK — usuário de outra org não alcança o título (0 linhas)';
end $c5$;
rollback to savepoint c5;

-- ───────────── caso 6: org de UM membro autoaprova e CARIMBA (gabarito) ─────
savepoint c6;
do $c6$
declare
  ua uuid := gen_random_uuid(); o uuid; c uuid; t uuid; r record;
begin
  insert into auth.users (id, email, aud, role) values
    (ua, 'central-a@guarda.local', 'authenticated', 'authenticated');
  select om.org_id into o from public.organization_members om where om.user_id = ua limit 1;
  select id into c from public.financial_accounts where org_id = o limit 1;
  insert into public.movements (org_id, account_id, type, amount, description,
                                due_date, origem, situacao, lancado_por)
  values (o, c, 'saida', 2000, 'caso 6', current_date, 'manual', 'previsto', ua)
  returning id into t;

  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role','authenticated')::text, true);
  update public.movements set situacao = 'confirmado' where id = t;

  select autoaprovacao, motivo into r
    from public.central_transicoes where movement_id = t and para = 'confirmado';

  -- ⚠️ ACEITAR SEM CARIMBAR É A FALHA. Conferir só o sucesso deixaria passar
  -- justamente a autoaprovação silenciosa, que é pior que a recusa: o registro
  -- existiria e ninguém saberia procurá-lo.
  if r.autoaprovacao is not true then
    raise exception 'CASO 6 FALHOU: confirmou mas NÃO carimbou autoaprovacao (autoaprovacao=%)', r.autoaprovacao;
  end if;
  if coalesce(r.motivo,'') <> 'org com um único membro habilitado a aprovar' then
    raise exception 'CASO 6 FALHOU: motivo do carimbo divergente — recebido "%"', r.motivo;
  end if;
  raise notice 'caso 6 OK — org de um membro autoaprova e o carimbo diz por quê: %', r.motivo;
end $c6$;
rollback to savepoint c6;

rollback;
