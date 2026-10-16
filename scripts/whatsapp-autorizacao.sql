-- ═══════════════════════════════════════════════════════════════════════════
-- GUARDA DA AUTORIZAÇÃO DE WHATSAPP — quem autoriza, quem sai, quem enxerga
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/whatsapp-autorizacao.sql
--
-- A guarda pura (`npm run fluxos`, bloco "whatsapp") prova a DECISÃO do
-- núcleo: sem autorização vai e-mail, quem saiu não recebe nada. Esta prova o
-- que só existe no banco:
--
--   1. quem lança autoriza contato DA PRÓPRIA empresa, com evidência; o
--      contexto da régua passa a dizer `autorizado`;
--   2. o leitor não autoriza; evidência curta é recusada; contato de outra
--      empresa não entra; a sessão não escreve na tabela por fora da RPC;
--   3. a SAÍDA (o webhook) vence a autorização, alcança o telefone em
--      qualquer grafia, impede autorizar de novo, e VOLTAR devolve;
--   4. as portas do webhook e dos executores são SÓ da chave de serviço;
--   5. revogar tira a autorização; a empresa B não enxerga contato da A.
--
-- ⚠️ O arreio é o de `automacao-fluxos.sql`, copiado. Tudo termina em ROLLBACK.
-- ⚠️ NADA de `raise` dentro de bloco protegido: marca-se e julga-se FORA.
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

begin;

do $guarda$
declare
  ua uuid := gen_random_uuid();   -- titular da empresa A
  un uuid := gen_random_uuid();   -- lançador da empresa A
  ul uuid := gen_random_uuid();   -- leitor da empresa A
  ub uuid := gen_random_uuid();   -- titular da empresa B
  oa uuid; ob uuid; pa uuid; pb uuid; psem uuid;
  msg text; v jsonb; r jsonb; sit text; n int; arr text[];
begin
  ---------------------------------------------------------------- montagem ---
  insert into auth.users (id, email, aud, role) values
    (ua, 'wa-a@guarda.local', 'authenticated', 'authenticated'),
    (un, 'wa-lancador@guarda.local', 'authenticated', 'authenticated'),
    (ul, 'wa-leitor@guarda.local', 'authenticated', 'authenticated'),
    (ub, 'wa-b@guarda.local', 'authenticated', 'authenticated');
  select om.org_id into oa from public.organization_members om where om.user_id = ua limit 1;
  select om.org_id into ob from public.organization_members om where om.user_id = ub limit 1;
  if oa is null or ob is null or oa = ob then
    raise exception 'GUARDA INVÁLIDA: o provisionamento não criou duas empresas. Nada abaixo prova coisa alguma.';
  end if;
  insert into public.organization_members (org_id, user_id, role) values (oa, un, 'lancador'), (oa, ul, 'leitor')
    on conflict (org_id, user_id) do update set role = excluded.role;
  insert into public.user_active_org (user_id, org_id) values (un, oa), (ul, oa)
    on conflict (user_id) do update set org_id = excluded.org_id;

  insert into public.parties (org_id, type, name, phone) values (oa, 'pj', 'Cliente A', '(11) 98888-7777') returning id into pa;
  insert into public.parties (org_id, type, name, phone) values (oa, 'pj', 'Sem telefone', null) returning id into psem;
  insert into public.parties (org_id, type, name, phone) values (ob, 'pj', 'Cliente B', '21977776666') returning id into pb;

  ------------------------------------------- 1. O lançador autoriza ---
  perform set_config('request.jwt.claims', json_build_object('sub', un, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', un::text, true);
  set local role authenticated;
  r := public.whatsapp_autorizar(array[pa, psem, pb], 'Assinou o contrato com a cláusula de WhatsApp em 10/10/2026');
  reset role;
  if (r ->> 'autorizados')::int <> 1 or (r ->> 'semTelefone')::int <> 1 or (r ->> 'foraDaEmpresa')::int <> 1 then
    raise exception 'CASO 1 FALHOU: esperado 1 autorizado, 1 sem telefone, 1 fora da empresa; veio %', r;
  end if;
  if exists (select 1 from public.whatsapp_autorizacoes where org_id in (oa, ob) and party_id = pb) then
    raise exception 'CASO 1 FALHOU: o lançador da A autorizou o contato da empresa B.';
  end if;
  set local role service_role;
  v := public.automacao_contexto(oa);
  reset role;
  select p ->> 'whatsapp' into sit from jsonb_array_elements(v -> 'partes') p where p ->> 'id' = pa::text;
  if sit is distinct from 'autorizado' then
    raise exception 'CASO 1 FALHOU: o contexto da régua não vê a autorização (veio %).', sit;
  end if;
  select p ->> 'whatsapp' into sit from jsonb_array_elements(v -> 'partes') p where p ->> 'id' = psem::text;
  if sit is distinct from 'sem_autorizacao' then
    raise exception 'CASO 1 FALHOU: contato sem telefone devia ser sem_autorizacao, veio %.', sit;
  end if;

  ------------------------------------------- 2. Quem NÃO autoriza ---
  perform set_config('request.jwt.claims', json_build_object('sub', ul, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', ul::text, true);
  set local role authenticated;
  begin
    perform public.whatsapp_autorizar(array[pa], 'Leitor tentando autorizar o cliente');
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  reset role;
  if msg is null then raise exception 'CASO 2 FALHOU: o LEITOR registrou autorização de WhatsApp.'; end if;
  if msg not like '%não registra autorização%' then
    raise exception 'VERMELHO PELO MOTIVO ERRADO (caso 2): "%"', msg;
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', un, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', un::text, true);
  set local role authenticated;
  begin
    perform public.whatsapp_autorizar(array[pa], 'sim');
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  reset role;
  if msg is null then raise exception 'CASO 2 FALHOU: autorização sem evidência entrou.'; end if;
  if msg not like '%como o cliente autorizou%' then
    raise exception 'VERMELHO PELO MOTIVO ERRADO (caso 2b): "%"', msg;
  end if;

  set local role authenticated;
  begin
    insert into public.whatsapp_autorizacoes (org_id, telefone, forma, evidencia)
    values (oa, '11911112222', 'declarada', 'por fora da porta, sem cadastro');
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  reset role;
  if msg is null then raise exception 'CASO 2 FALHOU: a sessão gravou autorização direto na tabela, sem contato cadastrado.'; end if;
  if msg not like '%permission denied%whatsapp_autorizacoes%' then
    raise exception 'VERMELHO PELO MOTIVO ERRADO (caso 2c): "%"', msg;
  end if;

  ------------------------------------------- 3. A saída vence ---
  set local role service_role;
  r := public.whatsapp_registrar_saida('+55 11 98888-7777', 'sair', 'SAIR');
  v := public.automacao_contexto(oa);
  arr := public.whatsapp_saidas_entre(array['5511988887777', '21977776666']);
  reset role;
  if (r ->> 'mudou')::boolean is distinct from true then raise exception 'CASO 3 FALHOU: a saída não foi registrada: %', r; end if;
  select p ->> 'whatsapp' into sit from jsonb_array_elements(v -> 'partes') p where p ->> 'id' = pa::text;
  if sit is distinct from 'saiu' then
    raise exception 'CASO 3 FALHOU: quem respondeu SAIR (com +55) continua %, e a régua mandaria WhatsApp.', sit;
  end if;
  if arr is distinct from array['11988887777'] then
    raise exception 'CASO 3 FALHOU: as saídas entre os telefones vieram %', arr;
  end if;
  set local role service_role;
  r := public.whatsapp_registrar_saida('11988887777', 'sair', 'PARAR');
  reset role;
  if (r ->> 'mudou')::boolean then raise exception 'CASO 3 FALHOU: a segunda saída abriu outra linha viva.'; end if;

  set local role authenticated;
  n := public.whatsapp_revogar(array[pa]);
  r := public.whatsapp_autorizar(array[pa], 'Cliente ligou e pediu as mensagens de volta');
  reset role;
  if (r ->> 'pediramSaida')::int <> 1 or (r ->> 'autorizados')::int <> 0 then
    raise exception 'CASO 3 FALHOU: a empresa reautorizou quem pediu para sair; só a própria pessoa volta. Veio %', r;
  end if;

  set local role service_role;
  r := public.whatsapp_registrar_saida('11988887777', 'voltar', 'VOLTAR');
  v := public.automacao_contexto(oa);
  reset role;
  select p ->> 'whatsapp' into sit from jsonb_array_elements(v -> 'partes') p where p ->> 'id' = pa::text;
  if sit is distinct from 'sem_autorizacao' then
    raise exception 'CASO 3 FALHOU: depois de VOLTAR, com a autorização revogada, o contato devia ser sem_autorizacao; veio %', sit;
  end if;

  ------------------------------------------- 4. Portas da chave de serviço ---
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', ua::text, true);
  set local role authenticated;
  begin
    perform public.whatsapp_registrar_saida('21977776666', 'sair');
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  reset role;
  if msg is null then raise exception 'CASO 4 FALHOU: a sessão registrou a SAÍDA de um telefone alheio — qualquer empresa calaria o cliente da outra.'; end if;
  if msg not like '%permission denied%whatsapp_registrar_saida%' then
    raise exception 'VERMELHO PELO MOTIVO ERRADO (caso 4): "%"', msg;
  end if;
  set local role authenticated;
  begin
    perform public.whatsapp_saidas_entre(array['21977776666']);
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  reset role;
  if msg is null then raise exception 'CASO 4 FALHOU: a sessão consulta quem saiu do número inteiro da plataforma.'; end if;
  if msg not like '%permission denied%whatsapp_saidas_entre%' then
    raise exception 'VERMELHO PELO MOTIVO ERRADO (caso 4b): "%"', msg;
  end if;

  ------------------------------------------- 5. Revogar e o recorte ---
  perform set_config('request.jwt.claims', json_build_object('sub', un, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', un::text, true);
  set local role authenticated;
  r := public.whatsapp_autorizar(array[pa], 'Cliente respondeu ao e-mail autorizando em 15/10');
  select count(*) into n from public.whatsapp_situacao_contatos() s where s.party_id = pa and s.autorizado and not s.saiu;
  reset role;
  if n <> 1 then raise exception 'CASO 5 FALHOU: depois de voltar e ser autorizado, a situação não mostra o contato autorizado (% linha).', n; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', ub::text, true);
  set local role authenticated;
  select (select count(*) from public.whatsapp_situacao_contatos() s where s.party_id = pa)
       + (select count(*) from public.whatsapp_autorizacoes where org_id = oa) into n;
  reset role;
  if n <> 0 then raise exception 'CASO 5 FALHOU: a empresa B enxerga contato ou autorização da A (% linha(s)).', n; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', un, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', un::text, true);
  set local role authenticated;
  n := public.whatsapp_revogar(array[pa]);
  reset role;
  set local role service_role;
  v := public.automacao_contexto(oa);
  reset role;
  select p ->> 'whatsapp' into sit from jsonb_array_elements(v -> 'partes') p where p ->> 'id' = pa::text;
  if n <> 1 or sit is distinct from 'sem_autorizacao' then
    raise exception 'CASO 5 FALHOU: revogar não tirou a autorização (revogadas %, contexto %).', n, sit;
  end if;

  raise notice 'Guarda da autorização de WhatsApp: 5 casos, todos verdes.';
end $guarda$;

rollback;
