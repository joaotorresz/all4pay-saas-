-- ═══════════════════════════════════════════════════════════════════════════
-- GUARDA DA CAIXA DE ENTRADA POR E-MAIL — a fechadura que só existe no banco
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/caixa-email.sql
--
-- A guarda pura (`engine-audit`, bloco CAIXA-EMAIL) prova a DECISÃO: qual
-- destinatário vira token, que anexo entra, que a rota fecha antes de tocar no
-- banco e que o e-mail nunca escreve conta. Esta prova a FECHADURA:
--
--   1. gerar o endereço é de quem ADMINISTRA (o leitor é recusado, lendo a msg);
--   2. o titular gera, e a geração fica na TRILHA;
--   3. a chave de serviço registra a mensagem com token válido — e o caminho do
--      anexo nasce na pasta da empresa, sem barra vinda de fora;
--   4. o MESMO Message-ID duas vezes: a segunda é `duplicada` e não cria linha;
--   5. token desconhecido é recusado, sem dizer por quê;
--   6. o membro da empresa B não lê a mensagem da empresa A (e o titular de A lê);
--   7. a sessão do cliente (authenticated) não executa o registro nem insere direto;
--   8. trocar o endereço mata o token antigo.
--
-- ⚠️ SAVEPOINT POR CASO, desfeito no fim de cada um — e o MESMO Message-ID
-- (`<guarda@caixa-email>`) usado de propósito em todos: se um `rollback to
-- savepoint` deixar de acontecer, o caso seguinte vira "duplicada" na hora em
-- vez de passar por acidente de ordem.
--
-- ⚠️ Os usuários entram por `auth.users` (o gatilho de signup provisiona) — o
-- arreio é o de `automacoes.sql`, copiado, não escrito do zero. Tudo termina
-- em ROLLBACK. NADA de `raise` dentro de bloco protegido: marca-se e julga-se
-- FORA.
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

begin;

------------------------------------------------------------------ montagem ---
do $montagem$
declare
  ua uuid := gen_random_uuid();   -- titular da empresa A
  ul uuid := gen_random_uuid();   -- leitor da empresa A
  ub uuid := gen_random_uuid();   -- titular da empresa B
  oa uuid; ob uuid;
begin
  -- (id, email) só: as demais colunas de auth.users têm padrão no Supabase, e o
  -- banco de prova local (stub) não as tem.
  insert into auth.users (id, email) values
    (ua, 'cx-a@guarda.local'),
    (ul, 'cx-leitor@guarda.local'),
    (ub, 'cx-b@guarda.local');
  select om.org_id into oa from public.organization_members om where om.user_id = ua limit 1;
  select om.org_id into ob from public.organization_members om where om.user_id = ub limit 1;
  if oa is null or ob is null or oa = ob then
    raise exception 'GUARDA INVÁLIDA: o provisionamento não criou duas empresas. Nada abaixo prova coisa alguma.';
  end if;
  insert into public.organization_members (org_id, user_id, role) values (oa, ul, 'leitor')
    on conflict (org_id, user_id) do update set role = 'leitor';
  insert into public.user_active_org (user_id, org_id) values (ul, oa)
    on conflict (user_id) do update set org_id = excluded.org_id;
  -- Os ids viajam por configuração da TRANSAÇÃO: legíveis por qualquer papel,
  -- e desfeitos junto com ela.
  perform set_config('guarda.ua', ua::text, true);
  perform set_config('guarda.ul', ul::text, true);
  perform set_config('guarda.ub', ub::text, true);
  perform set_config('guarda.oa', oa::text, true);
  perform set_config('guarda.ob', ob::text, true);
  -- Um endereço para cada empresa, gerado pelo caminho de verdade (a RPC,
  -- como titular). Os casos abaixo partem dele.
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', ua::text, true);
  set local role authenticated;
  perform set_config('guarda.token_a', public.gerar_endereco_caixa_email(), true);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', ub::text, true);
  set local role authenticated;
  perform set_config('guarda.token_b', public.gerar_endereco_caixa_email(), true);
  reset role;
  if current_setting('guarda.token_a') !~ '^[a-z0-9_-]{16,}$' then
    raise exception 'GUARDA INVÁLIDA: o token gerado não tem a forma esperada: %', current_setting('guarda.token_a');
  end if;
end
$montagem$;

------------------------------------- 1. o LEITOR não gera (lendo a msg) ---
savepoint caso;
do $c1$
declare ul uuid := current_setting('guarda.ul')::uuid; msg text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', ul, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', ul::text, true);
  set local role authenticated;
  begin
    perform public.gerar_endereco_caixa_email();
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  reset role;
  if msg is null then
    raise exception 'CASO 1 FALHOU: o LEITOR gerou o endereço da caixa — quem não administra trocou a porta por onde as contas entram.';
  end if;
  if msg not like '%só quem administra%' then
    raise exception 'VERMELHO PELO MOTIVO ERRADO (caso 1): esperado a recusa por papel, veio "%"', msg;
  end if;
end
$c1$;
rollback to savepoint caso;

------------------------------- 2. o TITULAR gera, e a geração fica na trilha ---
savepoint caso;
do $c2$
declare oa uuid := current_setting('guarda.oa')::uuid; ua uuid := current_setting('guarda.ua')::uuid; n bigint; t text;
begin
  select count(*) into n from public.caixa_email_enderecos where org_id = oa and token = current_setting('guarda.token_a');
  if n <> 1 then raise exception 'CASO 2 FALHOU: a RPC devolveu um token que não está gravado para a empresa A (% linha(s))', n; end if;
  select count(*) into n from public.audit_log
   where org_id = oa and entidade = 'caixa_email_enderecos' and acao = 'caixa_email_enderecos.criar' and usuario = ua::text;
  if n <> 1 then raise exception 'CASO 2 FALHOU: a geração do endereço não deixou evento na trilha com o autor (% evento(s))', n; end if;
  -- E o titular LÊ o próprio endereço (sem isto a tela não teria o que mostrar).
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', ua::text, true);
  set local role authenticated;
  select token into t from public.caixa_email_enderecos;
  reset role;
  if t is distinct from current_setting('guarda.token_a') then
    raise exception 'CASO 2 FALHOU: o titular não lê o endereço da própria empresa (leu %)', coalesce(t, 'nada');
  end if;
end
$c2$;
rollback to savepoint caso;

------------------- 3. a chave de serviço registra; o anexo nasce na pasta da empresa ---
savepoint caso;
do $c3$
declare oa uuid := current_setting('guarda.oa')::uuid; v jsonb; n bigint; cam text;
begin
  set local role service_role;
  v := public.registrar_email_caixa(
    upper(current_setting('guarda.token_a')),  -- caixa trocada no caminho: tem de casar
    'Fornecedor <cobranca@fornecedor.com>', 'Boleto setembro', 'Segue o boleto.',
    '[{"nome":"../../outra-empresa/boleto.pdf","tipo":"application/pdf","tamanho":1234}]'::jsonb,
    '<guarda@caixa-email>');
  reset role;
  select count(*) into n from public.caixa_email_mensagens where org_id = oa and mensagem_id = '<guarda@caixa-email>';
  if n <> 1 or (v ->> 'duplicada')::boolean then
    raise exception 'CASO 3 FALHOU: registro com token válido gravou % linha(s), resposta %', n, v;
  end if;
  cam := v -> 'anexos' -> 0 ->> 'caminho';
  if cam is distinct from oa::text || '/' || (v ->> 'id') || '/' || '.._.._outra-empresa_boleto.pdf' then
    raise exception 'CASO 3 FALHOU: o caminho do anexo não ficou preso à pasta da empresa: %', cam;
  end if;
end
$c3$;
rollback to savepoint caso;

-------------------------- 4. o MESMO Message-ID duas vezes: zero linhas novas ---
savepoint caso;
do $c4$
declare oa uuid := current_setting('guarda.oa')::uuid; v1 jsonb; v2 jsonb; n bigint;
begin
  set local role service_role;
  v1 := public.registrar_email_caixa(current_setting('guarda.token_a'), 'f@x.com', 'NF 123', 'corpo', '[]'::jsonb, '<guarda@caixa-email>');
  v2 := public.registrar_email_caixa(current_setting('guarda.token_a'), 'f@x.com', 'NF 123', 'corpo', '[]'::jsonb, '<guarda@caixa-email>');
  reset role;
  select count(*) into n from public.caixa_email_mensagens where org_id = oa;
  if (v1 ->> 'duplicada')::boolean then
    raise exception 'CASO 4 INVÁLIDO: a PRIMEIRA chamada já veio duplicada — algum caso anterior não foi desfeito (o savepoint falhou).';
  end if;
  if n <> 1 or not (v2 ->> 'duplicada')::boolean or (v2 ->> 'id') <> (v1 ->> 'id') then
    raise exception 'CASO 4 FALHOU: o reenvio do webhook DUPLICOU a mensagem (% linha(s); segunda resposta %)', n, v2;
  end if;
end
$c4$;
rollback to savepoint caso;

------------------------------------------ 5. token desconhecido é recusado ---
savepoint caso;
do $c5$
declare msg text; n bigint;
begin
  set local role service_role;
  begin
    perform public.registrar_email_caixa('tokenquenaoexiste0000', 'f@x.com', 'x', 'x', '[]'::jsonb, '<guarda@caixa-email>');
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  reset role;
  select count(*) into n from public.caixa_email_mensagens;
  if msg is null or n <> 0 then
    raise exception 'CASO 5 FALHOU: um token desconhecido gravou mensagem (% linha(s)) — qualquer um escolheria a empresa de destino.', n;
  end if;
  if msg not like '%destinatário não reconhecido%' then
    raise exception 'VERMELHO PELO MOTIVO ERRADO (caso 5): "%"', msg;
  end if;
end
$c5$;
rollback to savepoint caso;

----------------------- 6. a empresa B não lê a mensagem de A (e A lê) ---
savepoint caso;
do $c6$
declare ua uuid := current_setting('guarda.ua')::uuid; ub uuid := current_setting('guarda.ub')::uuid; na bigint; nb bigint; nbe bigint;
begin
  set local role service_role;
  perform public.registrar_email_caixa(current_setting('guarda.token_a'), 'f@x.com', 'Só da A', 'x', '[]'::jsonb, '<guarda@caixa-email>');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', ua::text, true);
  set local role authenticated;
  select count(*) into na from public.caixa_email_mensagens;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', ub::text, true);
  set local role authenticated;
  select count(*) into nb from public.caixa_email_mensagens;
  select count(*) into nbe from public.caixa_email_enderecos where token = current_setting('guarda.token_a');
  reset role;
  if na <> 1 then raise exception 'CASO 6 INVÁLIDO: o titular de A não lê a mensagem da própria empresa (% linha(s)) — a política bloqueia todo mundo?', na; end if;
  if nb <> 0 then raise exception 'CASO 6 FALHOU: o titular da empresa B leu % mensagem(ns) da empresa A.', nb; end if;
  if nbe <> 0 then raise exception 'CASO 6 FALHOU: o titular da empresa B leu o endereço da empresa A.'; end if;
end
$c6$;
rollback to savepoint caso;

------------------ 7. a sessão do cliente não registra nem insere direto ---
savepoint caso;
do $c7$
declare ua uuid := current_setting('guarda.ua')::uuid; oa uuid := current_setting('guarda.oa')::uuid; m1 text; m2 text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', ua::text, true);
  set local role authenticated;
  begin
    perform public.registrar_email_caixa(current_setting('guarda.token_a'), 'f@x.com', 'x', 'x', '[]'::jsonb, '<guarda@caixa-email>');
    m1 := null;
  exception when others then m1 := SQLERRM;
  end;
  begin
    insert into public.caixa_email_mensagens (org_id, assunto, mensagem_id) values (oa, 'direto', '<guarda@caixa-email>');
    m2 := null;
  exception when others then m2 := SQLERRM;
  end;
  reset role;
  if m1 is null then raise exception 'CASO 7 FALHOU: authenticated executou registrar_email_caixa — a sessão poria e-mail em qualquer empresa cujo token conhecesse.'; end if;
  if m1 not like '%permission denied%registrar_email_caixa%' then
    raise exception 'VERMELHO PELO MOTIVO ERRADO (caso 7, rpc): "%"', m1;
  end if;
  if m2 is null then raise exception 'CASO 7 FALHOU: authenticated inseriu mensagem direto na tabela.'; end if;
  if m2 not like '%permission denied%caixa_email_mensagens%' then
    raise exception 'VERMELHO PELO MOTIVO ERRADO (caso 7, insert): "%"', m2;
  end if;
end
$c7$;
rollback to savepoint caso;

------------------------------------- 8. trocar o endereço mata o antigo ---
savepoint caso;
do $c8$
declare ua uuid := current_setting('guarda.ua')::uuid; oa uuid := current_setting('guarda.oa')::uuid; novo text; msg text; n bigint;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', ua::text, true);
  set local role authenticated;
  novo := public.gerar_endereco_caixa_email();
  reset role;
  if novo = current_setting('guarda.token_a') then raise exception 'CASO 8 FALHOU: trocar o endereço devolveu o MESMO token.'; end if;
  select count(*) into n from public.audit_log
   where org_id = oa and acao = 'caixa_email_enderecos.alterar' and usuario = ua::text;
  if n <> 1 then raise exception 'CASO 8 FALHOU: a troca do endereço não ficou na trilha (% evento(s))', n; end if;
  set local role service_role;
  begin
    perform public.registrar_email_caixa(current_setting('guarda.token_a'), 'f@x.com', 'x', 'x', '[]'::jsonb, '<guarda@caixa-email>');
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  reset role;
  if msg is null then raise exception 'CASO 8 FALHOU: o token ANTIGO continuou entregando e-mail depois da troca — o endereço vazado não foi revogado.'; end if;
  if msg not like '%destinatário não reconhecido%' then
    raise exception 'VERMELHO PELO MOTIVO ERRADO (caso 8): "%"', msg;
  end if;
end
$c8$;
rollback to savepoint caso;

do $fim$ begin
  raise notice 'caixa-email: 8 casos verdes — gerar é de quem administra (com trilha), registro só pela chave de serviço, reenvio não duplica, token desconhecido e antigo recusados, empresa B não lê A';
end $fim$;

rollback;
