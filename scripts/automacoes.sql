-- ═══════════════════════════════════════════════════════════════════════════
-- GUARDA DAS AUTOMAÇÕES — a trava, o padrão desligado e quem escreve o quê
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/automacoes.sql
--
-- A guarda pura (`engine-audit`, bloco AUT) prova a DECISÃO: grava antes de
-- enviar, simulado não é avisado, a régua não sai sem opt-in. Esta prova a
-- FECHADURA, que só existe no banco:
--
--   · toda empresa NOVA nasce com as seis automações, TODAS desligadas
--     (o gatilho — o seed cobre só as que existiam no dia da migration);
--   · o índice único recusa o segundo envio com a mesma chave, e a mensagem
--     NOMEIA o índice (vermelho pelo motivo certo);
--   · ligar automação é de quem ADMINISTRA; registrar contato é de quem lança;
--     o leitor lê e não escreve — e nenhum dos dois alcança outra empresa;
--   · ninguém APAGA um registro de envio (é a prova de contato);
--   · o contexto do runner é só da chave de serviço, recortado por empresa e
--     sem amostra.
--
-- ⚠️ Os usuários entram por `auth.users` (o gatilho de signup provisiona) — o
-- arreio é o de `assinatura-bloqueio.sql` e `central-autorizacao.sql`, copiado,
-- não escrito do zero. Tudo termina em ROLLBACK. Falha com EXCEÇÃO.
-- ⚠️ NADA de `raise` dentro de bloco protegido: o handler engoliria a própria
-- asserção. Marca-se o resultado e julga-se FORA.
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

begin;

do $guarda$
declare
  ua uuid := gen_random_uuid();   -- titular da empresa A
  ul uuid := gen_random_uuid();   -- leitor da empresa A
  un uuid := gen_random_uuid();   -- lançador da empresa A
  ub uuid := gen_random_uuid();   -- titular da empresa B
  oa uuid; ob uuid; ca uuid; cb uuid;
  n bigint; msg text; v jsonb;
  claims text;
begin
  ---------------------------------------------------------------- montagem ---
  insert into auth.users (id, email, aud, role) values
    (ua, 'aut-a@guarda.local', 'authenticated', 'authenticated'),
    (ul, 'aut-leitor@guarda.local', 'authenticated', 'authenticated'),
    (un, 'aut-lancador@guarda.local', 'authenticated', 'authenticated'),
    (ub, 'aut-b@guarda.local', 'authenticated', 'authenticated');
  select om.org_id into oa from public.organization_members om where om.user_id = ua limit 1;
  select om.org_id into ob from public.organization_members om where om.user_id = ub limit 1;
  if oa is null or ob is null or oa = ob then
    raise exception 'GUARDA INVÁLIDA: o provisionamento não criou duas empresas. Nada abaixo prova coisa alguma.';
  end if;
  insert into public.organization_members (org_id, user_id, role) values (oa, ul, 'leitor')
    on conflict (org_id, user_id) do update set role = 'leitor';
  insert into public.organization_members (org_id, user_id, role) values (oa, un, 'lancador')
    on conflict (org_id, user_id) do update set role = 'lancador';
  insert into public.user_active_org (user_id, org_id) values (ul, oa), (un, oa)
    on conflict (user_id) do update set org_id = excluded.org_id;
  select id into ca from public.financial_accounts where org_id = oa limit 1;
  select id into cb from public.financial_accounts where org_id = ob limit 1;
  if ca is null or cb is null then raise exception 'GUARDA INVÁLIDA: o seed não criou conta bancária.'; end if;

  -------------------------------------- 1. EMPRESA NOVA: seis, desligadas ---
  select count(*) into n from public.automacoes where org_id in (oa, ob) and not ativo;
  if n <> 12 then
    raise exception 'CASO 1 FALHOU (gatilho): as duas empresas novas têm % automação(ões) desligada(s), esperado 12 — o default nasceu só por seed?', n;
  end if;
  select count(*) into n from public.automacoes where org_id in (oa, ob) and ativo;
  if n <> 0 then raise exception 'CASO 1 FALHOU: % automação(ões) nasceram LIGADAS — ligar é ato de alguém', n; end if;

  -- Um envio da empresa B, para o caso 4 ter o que NÃO enxergar.
  insert into public.automacao_envios (org_id, tipo, chave, canal, status)
  values (ob, 'resumo_diario', 'dia:guarda:b', 'email', 'enviado');

  ---------------------------------------- 2. O TITULAR liga (o positivo) ---
  -- ⚠️ Sem este caso, a guarda aprovaria uma política que bloqueia TODO MUNDO.
  claims := json_build_object('sub', ua, 'role', 'authenticated')::text;
  perform set_config('request.jwt.claims', claims, true);
  perform set_config('request.jwt.claim.sub', ua::text, true);
  set local role authenticated;
  begin
    update public.automacoes set ativo = true where tipo = 'resumo_diario';
    get diagnostics n = row_count;
    msg := null;
  exception when others then msg := SQLERRM; n := -1;
  end;
  reset role;
  if msg is not null or n <> 1 then
    raise exception 'CASO 2 FALHOU: o TITULAR não conseguiu ligar a automação da própria empresa (% linha(s), erro: %)', n, coalesce(msg, '—');
  end if;

  --------------------------------------- 3. O LEITOR não liga (lendo a msg) ---
  perform set_config('request.jwt.claims', json_build_object('sub', ul, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', ul::text, true);
  set local role authenticated;
  select count(*) into n from public.automacoes;             -- lê a empresa inteira
  begin
    update public.automacoes set ativo = true where tipo = 'regua_cobranca';
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  reset role;
  if n <> 6 then raise exception 'CASO 3 FALHOU: o leitor enxerga % automação(ões), esperado as 6 da própria empresa', n; end if;
  if msg is null then
    raise exception 'CASO 3 FALHOU: o LEITOR ligou a régua de cobrança — mensagem ao cliente em nome da empresa sem ser administrador.';
  end if;
  if msg not like '%row-level security%automacoes%' then
    raise exception 'VERMELHO PELO MOTIVO ERRADO (caso 3): esperado a política de linha de automacoes, veio "%"', msg;
  end if;

  -------------------------- 4. O LANÇADOR registra contato; o leitor não ---
  perform set_config('request.jwt.claims', json_build_object('sub', un, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', un::text, true);
  set local role authenticated;
  begin
    insert into public.automacao_envios (tipo, chave, canal, status)
    values ('regua_cobranca', 'titulo:guarda:d+3', 'whatsapp', 'manual');
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  reset role;
  if msg is not null then
    raise exception 'CASO 4 FALHOU: o LANÇADOR não conseguiu registrar um contato ("marcar como avisado"): %', msg;
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', ul, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', ul::text, true);
  set local role authenticated;
  begin
    insert into public.automacao_envios (tipo, chave, canal, status)
    values ('regua_cobranca', 'titulo:guarda:d+10', 'whatsapp', 'manual');
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  reset role;
  if msg is null then raise exception 'CASO 4 FALHOU: o LEITOR registrou contato de cobrança.'; end if;
  if msg not like '%row-level security%automacao_envios%' then
    raise exception 'VERMELHO PELO MOTIVO ERRADO (caso 4): "%"', msg;
  end if;

  --------------------------- 5. O TITULAR não alcança a OUTRA empresa ---
  perform set_config('request.jwt.claims', claims, true);
  perform set_config('request.jwt.claim.sub', ua::text, true);
  set local role authenticated;
  select count(*) into n from public.automacao_envios where org_id = ob;
  begin
    insert into public.automacao_envios (org_id, tipo, chave, canal, status)
    values (ob, 'resumo_diario', 'dia:guarda:intruso', 'email', 'enviado');
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  reset role;
  if n <> 0 then raise exception 'CASO 5 FALHOU: a empresa A enxerga % envio(s) da empresa B', n; end if;
  if msg is null then raise exception 'CASO 5 FALHOU: a empresa A gravou envio na empresa B.'; end if;
  if msg not like '%row-level security%automacao_envios%' then
    raise exception 'VERMELHO PELO MOTIVO ERRADO (caso 5): "%"', msg;
  end if;

  ------------------------------- 6. A TRAVA: a mesma chave não entra duas vezes ---
  -- ⚠️ Mesmo valor único de propósito: se a primeira não entrar, a segunda
  -- não prova nada; se o índice sumir, a segunda entra e a guarda reprova.
  perform set_config('request.jwt.claims', claims, true);
  perform set_config('request.jwt.claim.sub', ua::text, true);
  set local role authenticated;
  insert into public.automacao_envios (tipo, chave, canal, status)
  values ('resumo_diario', 'dia:guarda:trava', 'email', 'pendente');
  begin
    insert into public.automacao_envios (tipo, chave, canal, status)
    values ('resumo_diario', 'dia:guarda:trava', 'email', 'pendente');
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  -- O WhatsApp do MESMO resumo é outro envio: o canal é parte da chave.
  insert into public.automacao_envios (tipo, chave, canal, status)
  values ('resumo_diario', 'dia:guarda:trava', 'whatsapp', 'pendente');
  reset role;
  if msg is null then raise exception 'CASO 6 FALHOU: a mesma (empresa, tipo, chave, canal) entrou duas vezes — reexecutar o runner reenviaria.'; end if;
  if msg not like '%automacao_envios_unico%' then
    raise exception 'VERMELHO PELO MOTIVO ERRADO (caso 6): esperado o índice automacao_envios_unico, veio "%"', msg;
  end if;

  ------------------------------------------- 7. NINGUÉM apaga a prova de contato ---
  perform set_config('request.jwt.claims', claims, true);
  perform set_config('request.jwt.claim.sub', ua::text, true);
  set local role authenticated;
  begin
    delete from public.automacao_envios where chave = 'dia:guarda:trava';
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  reset role;
  if msg is null then raise exception 'CASO 7 FALHOU: o titular APAGOU um registro de envio.'; end if;
  if msg not like '%permission denied%automacao_envios%' then
    raise exception 'VERMELHO PELO MOTIVO ERRADO (caso 7): "%"', msg;
  end if;

  --------------------------------------------------- 8. STATUS fora da lista ---
  begin
    insert into public.automacao_envios (org_id, tipo, chave, canal, status)
    values (oa, 'resumo_diario', 'dia:guarda:status', 'email', 'avisado');
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  if msg is null then raise exception 'CASO 8 FALHOU: o status "avisado" entrou — só enviado e manual contam como aviso, e o nome não existe.'; end if;
  if msg not like '%automacao_envios_status_check%' then
    raise exception 'VERMELHO PELO MOTIVO ERRADO (caso 8): "%"', msg;
  end if;

  ------------------------ 9. O CONTEXTO do runner: só a chave de serviço ---
  insert into public.movements (org_id, account_id, type, amount, description, situacao, due_date, origem)
  values (oa, ca, 'saida', 111.11, 'conta real A', 'previsto', current_date, 'manual');
  insert into public.movements (org_id, account_id, type, amount, description, situacao, due_date, origem, is_sample, sample_reason)
  values (oa, ca, 'saida', 999.99, 'amostra A', 'previsto', current_date, 'manual', true, 'onboarding_demo');
  insert into public.movements (org_id, account_id, type, amount, description, situacao, due_date, origem)
  values (ob, cb, 'saida', 222.22, 'conta real B', 'previsto', current_date, 'manual');

  perform set_config('request.jwt.claims', claims, true);
  perform set_config('request.jwt.claim.sub', ua::text, true);
  set local role authenticated;
  begin
    perform public.automacao_contexto(oa);
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  reset role;
  if msg is null then raise exception 'CASO 9 FALHOU: authenticated executou automacao_contexto — a sessão leria qualquer empresa pelo id.'; end if;
  if msg not like '%permission denied%automacao_contexto%' then
    raise exception 'VERMELHO PELO MOTIVO ERRADO (caso 9): "%"', msg;
  end if;

  set local role service_role;
  v := public.automacao_contexto(oa);
  reset role;
  select count(*) into n from jsonb_array_elements(v -> 'movimentos') e where (e ->> 'amount')::numeric = 111.11;
  if n <> 1 then raise exception 'CASO 9 FALHOU: o contexto da empresa A não trouxe o lançamento real dela (recebeu valor?)'; end if;
  select count(*) into n from jsonb_array_elements(v -> 'movimentos') e where (e ->> 'amount')::numeric in (999.99, 222.22);
  if n <> 0 then raise exception 'CASO 9 FALHOU: o contexto da empresa A trouxe % linha(s) de AMOSTRA ou da OUTRA empresa', n; end if;
  select count(*) into n from jsonb_array_elements(v -> 'membros') e where e ->> 'email' = 'aut-a@guarda.local';
  if n <> 1 then raise exception 'CASO 9 FALHOU: o titular (com e-mail) não veio em membros: %', v -> 'membros'; end if;
  select count(*) into n from jsonb_array_elements(v -> 'membros') e where e ->> 'email' in ('aut-leitor@guarda.local', 'aut-lancador@guarda.local');
  if n <> 0 then raise exception 'CASO 9 FALHOU: quem NÃO é titular nem administrador veio como destinatário possível: %', v -> 'membros'; end if;

  raise notice 'automacoes: 9 casos verdes — padrão desligado por gatilho, trava nomeada, escrita por papel, sem apagar, contexto só da chave de serviço';
end $guarda$;

rollback;
