-- ═══════════════════════════════════════════════════════════════════════════
-- GUARDA: OS AGENTES SÓ FAZEM O QUE A EMPRESA DEIXOU, E A PESSOA DECIDE
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/agentes.sql
--
-- O que ela prova contra o Postgres de verdade (migration 20261104120000):
--   a. empresa nova nasce com os 5 agentes DESLIGADOS no nível 1 (gatilho);
--   b. contas a pagar, caixa e fechamento não passam do nível 1 (restrição);
--   c. quem não administra não muda a configuração (fica como estava);
--   d. a sessão NÃO cria proposta (só o servidor cria);
--   e. o agente que roda duas vezes não propõe duas vezes (índice único);
--   f. proposta não nasce decidida;
--   g. caminho feliz: quem aprova decide, e a decisão leva o nome dele;
--   h. leitor não decide; empresa de outra pessoa não decide nem lê;
--   i. estado terminal não ressuscita, e o que foi proposto não muda;
--   j. aprovada só segue para executada ou falhou.
--   (migration 20261104150000 — aprovar pelo WhatsApp)
--   k. o pedido vai só para quem aprova E tem o número confirmado;
--   l. "SIM <código>" do telefone certo aprova em nome do aprovador, uma vez;
--      o telefone errado não acha o código; o segundo uso também não;
--   m. o pedido de quem não pode aprovar não decide (a regra é a mesma da tela);
--   n. a sessão não responde nem decide pela porta interna.
--   (migration 20261104160000 — o agente de conciliação)
--   o. a proposta APROVADA concilia pela mesma regra da tela: o previsto vira
--      cancelado com o par, o extrato ganha o par, a proposta vira executada;
--   p. sozinho só com o agente no nível 2+ E confiança 85+; o que o banco
--      recusa vira "falhou" com o motivo, sem conciliar nada;
--   q. a linha do extrato de OUTRA empresa (ou não paga) é recusada e o
--      previsto continua previsto (o defeito que cancelava sem par);
--   r. a sessão não concilia pela porta do agente nem pela interna.
--
-- ⚠️ Cada caso roda num SUBBLOCO que termina levantando uma sentinela (um
-- savepoint desfeito). Tudo em transação que termina em ROLLBACK. Falha com
-- EXCEÇÃO (ON_ERROR_STOP).
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

begin;

do $guarda$
declare
  ana uuid := gen_random_uuid();   -- titular da empresa A
  bia uuid := gen_random_uuid();   -- titular da empresa B
  leo uuid := gen_random_uuid();   -- leitor na empresa A
  org_ana uuid; org_bia uuid;
  p uuid;
  r text;
  j jsonb;
  cod text;
  n int;
  conta_a uuid; conta_b uuid; prev uuid; ext uuid; ext_b uuid;
  sentinela constant text := 'GUARDA_DESFAZ_CASO';
  falhas text[] := '{}';
  casos int := 0;
begin
  ---------------------------------------------------------------- montagem ---
  insert into auth.users (id, email, raw_user_meta_data) values
    (ana, 'agt-ana@guarda.local', '{"company":"Guarda AGT A"}'),
    (bia, 'agt-bia@guarda.local', '{"company":"Guarda AGT B"}'),
    (leo, 'agt-leo@guarda.local', '{"company":"Guarda AGT L"}');
  select org_id into org_ana from public.organization_members where user_id = ana limit 1;
  select org_id into org_bia from public.organization_members where user_id = bia limit 1;
  if org_ana is null or org_bia is null then
    raise exception 'GUARDA INVÁLIDA: provisionamento não criou empresa';
  end if;
  insert into public.organization_members (org_id, user_id, role) values (org_ana, leo, 'leitor');
  insert into public.user_active_org (user_id, org_id) values (leo, org_ana)
    on conflict (user_id) do update set org_id = excluded.org_id;

  ---------------------------------------------- a. NASCE DESLIGADO ----------
  casos := casos + 1;
  select count(*) into n from public.agentes where org_id = org_ana and not ativo and nivel = 1;
  if n <> 5 then
    falhas := array_append(falhas, format('(a) empresa nova nasceu com %s agentes desligados no nível 1 (esperado 5)', n));
  end if;
  if exists (select 1 from public.agentes where org_id = org_ana and (ativo or limite_valor <> 0 or limite_dia <> 0)) then
    falhas := array_append(falhas, '(a) empresa nova nasceu com agente ligado ou com limite');
  end if;

  ---------------------------------------------- b. TETO DO NÍVEL ------------
  begin
    casos := casos + 1;
    begin
      update public.agentes set nivel = 2 where org_id = org_ana and agente = 'contas_pagar';
      falhas := array_append(falhas, '(b) contas a pagar aceitou o nível 2 — pagaria sozinho');
    exception when check_violation then null;
    end;
    begin
      update public.agentes set nivel = 3 where org_id = org_ana and agente = 'fechamento';
      falhas := array_append(falhas, '(b) fechamento aceitou o nível 3');
    exception when check_violation then null;
    end;
    update public.agentes set nivel = 3 where org_id = org_ana and agente = 'cobranca';
    raise exception '%', sentinela;
  exception when others then
    if sqlerrm <> sentinela then falhas := array_append(falhas, format('(b) estourou: %s', sqlerrm)); end if;
  end;

  ---------------------------------------------- c. SÓ QUEM ADMINISTRA -------
  begin
    casos := casos + 1;
    perform set_config('request.jwt.claim.sub', leo::text, true);
    set local role authenticated;
    begin
      update public.agentes set ativo = true, nivel = 3 where agente = 'cobranca';
    exception when others then null;   -- recusar com erro também vale
    end;
    reset role;
    if exists (select 1 from public.agentes where org_id = org_ana and agente = 'cobranca' and (ativo or nivel <> 1)) then
      falhas := array_append(falhas, '(c) o LEITOR ligou o agente de cobrança no nível 3');
    end if;
    -- E o titular consegue.
    perform set_config('request.jwt.claim.sub', ana::text, true);
    set local role authenticated;
    update public.agentes set ativo = true, nivel = 2, limite_valor = 500, limite_dia = 10 where agente = 'cobranca';
    reset role;
    if not exists (select 1 from public.agentes where org_id = org_ana and agente = 'cobranca' and ativo and nivel = 2) then
      falhas := array_append(falhas, '(c) o TITULAR não conseguiu configurar o próprio agente');
    end if;
    if exists (select 1 from public.agentes where org_id = org_bia and (ativo or nivel <> 1)) then
      falhas := array_append(falhas, '(c) a configuração da Ana mudou a empresa da Bia');
    end if;
    raise exception '%', sentinela;
  exception when others then
    reset role;
    if sqlerrm <> sentinela then falhas := array_append(falhas, format('(c) estourou: %s', sqlerrm)); end if;
  end;

  ---------------------------------------------- d. A SESSÃO NÃO PROPÕE ------
  begin
    casos := casos + 1;
    perform set_config('request.jwt.claim.sub', ana::text, true);
    set local role authenticated;
    begin
      insert into public.agente_propostas (org_id, agente, chave, titulo, porque)
      values (org_ana, 'cobranca', 'x', 'Cobrar', 'teste');
      reset role;
      falhas := array_append(falhas, '(d) a SESSÃO criou proposta — a pessoa aprovaria o que ela mesma pediu');
    exception when insufficient_privilege then reset role;
    end;
    raise exception '%', sentinela;
  exception when others then
    reset role;
    if sqlerrm <> sentinela then falhas := array_append(falhas, format('(d) estourou: %s', sqlerrm)); end if;
  end;

  ---------------------------------------------- e. NÃO PROPÕE DUAS VEZES ----
  begin
    casos := casos + 1;
    set local role service_role;
    insert into public.agente_propostas (org_id, agente, chave, titulo, porque, valor)
    values (org_ana, 'cobranca', 'titulo:1:d5', 'Cobrar Padaria', 'Venceu há 5 dias', 1200);
    begin
      insert into public.agente_propostas (org_id, agente, chave, titulo, porque, valor)
      values (org_ana, 'cobranca', 'titulo:1:d5', 'Cobrar Padaria', 'Venceu há 5 dias', 1200);
      reset role;
      falhas := array_append(falhas, '(e) a mesma chave entrou duas vezes — o cliente seria cobrado em dobro');
    exception when unique_violation then reset role;
    end;
    raise exception '%', sentinela;
  exception when others then
    reset role;
    if sqlerrm <> sentinela then falhas := array_append(falhas, format('(e) estourou: %s', sqlerrm)); end if;
  end;

  ---------------------------------------------- f. NASCE PENDENTE -----------
  begin
    casos := casos + 1;
    set local role service_role;
    begin
      insert into public.agente_propostas (org_id, agente, chave, titulo, porque, estado)
      values (org_ana, 'cobranca', 'f', 'Cobrar', 'teste', 'executada');
      reset role;
      falhas := array_append(falhas, '(f) proposta nasceu executada, sem passar pela fila');
    exception when raise_exception then reset role;
    end;
    raise exception '%', sentinela;
  exception when others then
    reset role;
    if sqlerrm <> sentinela then falhas := array_append(falhas, format('(f) estourou: %s', sqlerrm)); end if;
  end;

  ---------------------------------------------- g. CAMINHO FELIZ ------------
  begin
    casos := casos + 1;
    insert into public.agente_propostas (org_id, agente, chave, titulo, porque, valor)
    values (org_ana, 'cobranca', 'g', 'Cobrar Padaria', 'Venceu há 5 dias', 1200) returning id into p;
    perform set_config('request.jwt.claim.sub', ana::text, true);
    set local role authenticated;
    r := public.agente_decidir(p, true, null);
    select count(*) into n from public.agente_propostas where id = p;   -- a sessão LÊ a própria fila
    reset role;
    if r <> 'aprovada' or n <> 1 then
      falhas := array_append(falhas, format('(g) a titular não aprovou ou não leu (r=%s, leu=%s)', r, n));
    end if;
    if not exists (select 1 from public.agente_propostas where id = p and estado = 'aprovada'
                    and decidida_por = ana and decidida_em is not null) then
      falhas := array_append(falhas, '(g) a decisão não levou o nome de quem decidiu');
    end if;
    raise exception '%', sentinela;
  exception when others then
    reset role;
    if sqlerrm <> sentinela then falhas := array_append(falhas, format('(g) estourou: %s', sqlerrm)); end if;
  end;

  ------------------------------- h. LEITOR E OUTRA EMPRESA NÃO DECIDEM -------
  begin
    casos := casos + 1;
    insert into public.agente_propostas (org_id, agente, chave, titulo, porque)
    values (org_ana, 'cobranca', 'h', 'Cobrar Padaria', 'Venceu') returning id into p;
    perform set_config('request.jwt.claim.sub', leo::text, true);
    set local role authenticated;
    begin
      r := public.agente_decidir(p, true, null);
      reset role;
      falhas := array_append(falhas, '(h) o LEITOR aprovou o que o agente propôs');
    exception when raise_exception then reset role;
    end;
    perform set_config('request.jwt.claim.sub', bia::text, true);
    set local role authenticated;
    select count(*) into n from public.agente_propostas where id = p;
    begin
      r := public.agente_decidir(p, false, null);
      reset role;
      falhas := array_append(falhas, '(h) a Bia decidiu a fila da empresa da Ana');
    exception when raise_exception then reset role;
    end;
    if n <> 0 then
      falhas := array_append(falhas, '(h) a Bia LEU a fila da empresa da Ana');
    end if;
    if not exists (select 1 from public.agente_propostas where id = p and estado = 'pendente') then
      falhas := array_append(falhas, '(h) a proposta saiu de pendente sem decisão válida');
    end if;
    raise exception '%', sentinela;
  exception when others then
    reset role;
    if sqlerrm <> sentinela then falhas := array_append(falhas, format('(h) estourou: %s', sqlerrm)); end if;
  end;

  ------------------------------- i. TERMINAL NÃO RESSUSCITA ------------------
  begin
    casos := casos + 1;
    insert into public.agente_propostas (org_id, agente, chave, titulo, porque, valor)
    values (org_ana, 'cobranca', 'i', 'Cobrar Padaria', 'Venceu', 100) returning id into p;
    update public.agente_propostas set estado = 'recusada' where id = p;
    begin
      update public.agente_propostas set estado = 'aprovada' where id = p;
      falhas := array_append(falhas, '(i) a proposta recusada voltou a ser aprovada');
    exception when raise_exception then null;
    end;
    insert into public.agente_propostas (org_id, agente, chave, titulo, porque, valor)
    values (org_ana, 'cobranca', 'i2', 'Cobrar Padaria', 'Venceu', 100) returning id into p;
    begin
      update public.agente_propostas set valor = 9999 where id = p;
      falhas := array_append(falhas, '(i) o valor proposto mudou depois de criado — aprovaria um e faria outro');
    exception when raise_exception then null;
    end;
    raise exception '%', sentinela;
  exception when others then
    if sqlerrm <> sentinela then falhas := array_append(falhas, format('(i) estourou: %s', sqlerrm)); end if;
  end;

  ------------------------------- j. APROVADA SÓ SEGUE PARA O FIM -------------
  begin
    casos := casos + 1;
    insert into public.agente_propostas (org_id, agente, chave, titulo, porque)
    values (org_ana, 'cobranca', 'j', 'Cobrar', 'Venceu') returning id into p;
    update public.agente_propostas set estado = 'aprovada' where id = p;
    begin
      update public.agente_propostas set estado = 'pendente' where id = p;
      falhas := array_append(falhas, '(j) a aprovada voltou para pendente');
    exception when raise_exception then null;
    end;
    update public.agente_propostas set estado = 'executada', executada_em = now() where id = p;
    raise exception '%', sentinela;
  exception when others then
    if sqlerrm <> sentinela then falhas := array_append(falhas, format('(j) estourou: %s', sqlerrm)); end if;
  end;

  ------------------------------- k. O PEDIDO VAI A QUEM APROVA, CONFIRMADO ---
  insert into public.whatsapp_numeros_usuario (user_id, telefone, confirmado_em) values
    (ana, '11988887777', now()), (leo, '11966665555', now());
  begin
    casos := casos + 1;
    insert into public.agente_propostas (org_id, agente, chave, titulo, porque, valor)
    values (org_ana, 'cobranca', 'k', 'Cobrar Padaria', 'Venceu', 100) returning id into p;
    set local role service_role;
    select count(*), max(fone) into n, r from public.agente_pedir_whatsapp(p);
    reset role;
    if n <> 1 or r <> '5511988887777' then
      falhas := array_append(falhas, format('(k) o pedido foi a %s telefone(s) (%s): só a titular confirmada recebe, o leitor não', n, r));
    end if;
    if exists (select 1 from public.agente_pedidos_whatsapp where proposta_id = p and codigo_hash !~ '^[0-9a-f]{64}$') then
      falhas := array_append(falhas, '(k) o código foi gravado em texto');
    end if;
    raise exception '%', sentinela;
  exception when others then
    reset role;
    if sqlerrm <> sentinela then falhas := array_append(falhas, format('(k) estourou: %s', sqlerrm)); end if;
  end;

  ------------------------------- l. SIM <código> APROVA, UMA VEZ ------------
  begin
    casos := casos + 1;
    insert into public.agente_propostas (org_id, agente, chave, titulo, porque, valor)
    values (org_ana, 'cobranca', 'l', 'Cobrar Padaria', 'Venceu', 100) returning id into p;
    set local role service_role;
    select codigo into cod from public.agente_pedir_whatsapp(p) limit 1;
    j := public.agente_responder_whatsapp('5511900000000', cod, 'sim');
    if (j->>'encontrado')::boolean then
      falhas := array_append(falhas, '(l) o código respondeu de outro telefone');
    end if;
    j := public.agente_responder_whatsapp('5511988887777', lower(cod), 'sim');
    reset role;
    if not coalesce((j->>'ok')::boolean, false) or j->>'estado' <> 'aprovada' then
      falhas := array_append(falhas, format('(l) o SIM da titular não aprovou: %s', j));
    end if;
    if not exists (select 1 from public.agente_propostas where id = p and estado = 'aprovada' and decidida_por = ana) then
      falhas := array_append(falhas, '(l) a aprovação pelo WhatsApp não levou o nome da titular');
    end if;
    set local role service_role;
    j := public.agente_responder_whatsapp('5511988887777', cod, 'nao');
    reset role;
    if (j->>'encontrado')::boolean then
      falhas := array_append(falhas, '(l) o mesmo código valeu duas vezes');
    end if;
    raise exception '%', sentinela;
  exception when others then
    reset role;
    if sqlerrm <> sentinela then falhas := array_append(falhas, format('(l) estourou: %s', sqlerrm)); end if;
  end;

  ------------------------------- m. QUEM NÃO APROVA NÃO DECIDE PELO WHATSAPP -
  begin
    casos := casos + 1;
    insert into public.agente_propostas (org_id, agente, chave, titulo, porque, valor)
    values (org_ana, 'cobranca', 'm', 'Cobrar Padaria', 'Venceu', 100) returning id into p;
    -- um pedido plantado para o LEITOR (o pedir nunca o criaria)
    insert into public.agente_pedidos_whatsapp (org_id, proposta_id, aprovador_id, telefone, codigo_hash, expira_em)
    values (org_ana, p, leo, '5511966665555', encode(sha256(convert_to('ABCDEF', 'UTF8')), 'hex'), now() + interval '1 hour');
    set local role service_role;
    j := public.agente_responder_whatsapp('5511966665555', 'ABCDEF', 'sim');
    reset role;
    if coalesce((j->>'ok')::boolean, false) then
      falhas := array_append(falhas, '(m) o LEITOR aprovou pelo WhatsApp');
    end if;
    if not exists (select 1 from public.agente_propostas where id = p and estado = 'pendente') then
      falhas := array_append(falhas, '(m) a proposta saiu de pendente pela resposta do leitor');
    end if;
    if not exists (select 1 from public.agente_pedidos_whatsapp where proposta_id = p and respondido_em is not null) then
      falhas := array_append(falhas, '(m) o código recusado continuou valendo');
    end if;
    raise exception '%', sentinela;
  exception when others then
    reset role;
    if sqlerrm <> sentinela then falhas := array_append(falhas, format('(m) estourou: %s', sqlerrm)); end if;
  end;

  ------------------------------- n. A SESSÃO NÃO USA AS PORTAS DO SERVIDOR ---
  begin
    casos := casos + 1;
    insert into public.agente_propostas (org_id, agente, chave, titulo, porque)
    values (org_ana, 'cobranca', 'n', 'Cobrar', 'Venceu') returning id into p;
    perform set_config('request.jwt.claim.sub', ana::text, true);
    set local role authenticated;
    begin
      j := public.agente_responder_whatsapp('5511988887777', 'ABCDEF', 'sim');
      reset role;
      falhas := array_append(falhas, '(n) a sessão chamou a resposta do WhatsApp');
    exception when insufficient_privilege then reset role;
    end;
    set local role authenticated;
    begin
      r := public.agente_decidir_na_empresa(p, true, null, org_ana);
      reset role;
      falhas := array_append(falhas, '(n) a sessão decidiu pela porta interna, escolhendo a empresa');
    exception when insufficient_privilege then reset role;
    end;
    set local role authenticated;
    begin
      perform public.agente_pedir_whatsapp(p);
      reset role;
      falhas := array_append(falhas, '(n) a sessão gerou código de aprovação');
    exception when insufficient_privilege then reset role;
    end;
    raise exception '%', sentinela;
  exception when others then
    reset role;
    if sqlerrm <> sentinela then falhas := array_append(falhas, format('(n) estourou: %s', sqlerrm)); end if;
  end;

  ------------------------------- montagem da conciliação (o–r) -------------
  select id into conta_a from public.financial_accounts where org_id = org_ana limit 1;
  select id into conta_b from public.financial_accounts where org_id = org_bia limit 1;
  if conta_a is null or conta_b is null then
    raise exception 'GUARDA INVÁLIDA: a empresa nasceu sem conta';
  end if;

  ------------------------------- o. APROVADA CONCILIA PELA MESMA REGRA ------
  begin
    casos := casos + 1;
    insert into public.movements (org_id, account_id, type, amount, description, situacao, paid_date, due_date, origem)
    values (org_ana, conta_a, 'entrada', 480, 'NF 1042', 'previsto', null, current_date, 'manual') returning id into prev;
    insert into public.movements (org_id, account_id, type, amount, description, situacao, paid_date, due_date, origem)
    values (org_ana, conta_a, 'entrada', 480, 'PIX recebido', 'baixado', current_date, current_date, 'manual') returning id into ext;
    insert into public.agente_propostas (org_id, agente, chave, titulo, porque, valor, dados)
    values (org_ana, 'conciliacao', 'par:o', 'Conciliar NF 1042', 'Mesmo valor', 480,
            jsonb_build_object('previsto', prev, 'extrato', ext, 'confianca', 70)) returning id into p;
    perform set_config('request.jwt.claim.sub', ana::text, true);
    set local role authenticated;
    r := public.agente_decidir(p, true, null);
    reset role;
    perform set_config('request.jwt.claim.sub', '', true);
    set local role service_role;
    j := public.agente_conciliar(p, false);
    reset role;
    if not coalesce((j->>'ok')::boolean, false) then
      falhas := array_append(falhas, format('(o) a aprovada não conciliou: %s', j));
    end if;
    if not exists (select 1 from public.movements where id = prev and situacao = 'cancelado' and conciliado_com = ext)
       or not exists (select 1 from public.movements where id = ext and conciliado_com = prev) then
      falhas := array_append(falhas, '(o) o par não ficou gravado dos dois lados');
    end if;
    if not exists (select 1 from public.agente_propostas where id = p and estado = 'executada' and executada_em is not null) then
      falhas := array_append(falhas, '(o) a proposta não terminou executada');
    end if;
    if not exists (select 1 from public.central_transicoes where movement_id = prev and para = 'cancelado' and por = ana) then
      falhas := array_append(falhas, '(o) a baixa não ficou em nome de quem aprovou');
    end if;
    set local role service_role;
    j := public.agente_conciliar(p, false);
    reset role;
    if coalesce((j->>'ok')::boolean, false) then
      falhas := array_append(falhas, '(o) a mesma proposta conciliou duas vezes');
    end if;
    raise exception '%', sentinela;
  exception when others then
    reset role;
    if sqlerrm <> sentinela then falhas := array_append(falhas, format('(o) estourou: %s', sqlerrm)); end if;
  end;

  ------------------------------- p. SOZINHO SÓ NO NÍVEL E NA CONFIANÇA ------
  begin
    casos := casos + 1;
    insert into public.movements (org_id, account_id, type, amount, description, situacao, paid_date, due_date, origem)
    values (org_ana, conta_a, 'saida', 99, 'Boleto', 'previsto', null, current_date, 'manual') returning id into prev;
    insert into public.movements (org_id, account_id, type, amount, description, situacao, paid_date, due_date, origem)
    values (org_ana, conta_a, 'saida', 99, 'Pagamento', 'baixado', current_date, current_date, 'manual') returning id into ext;
    insert into public.agente_propostas (org_id, agente, chave, titulo, porque, valor, dados)
    values (org_ana, 'conciliacao', 'par:p', 'Conciliar Boleto', 'Mesmo valor', 99,
            jsonb_build_object('previsto', prev, 'extrato', ext, 'confianca', 95)) returning id into p;
    -- nível 1 (o padrão): sozinho é recusado
    set local role service_role;
    begin
      j := public.agente_conciliar(p, true);
      reset role;
      falhas := array_append(falhas, '(p) conciliou sozinho com o agente no nível 1');
    exception when others then reset role;
    end;
    -- a titular liga o nível 2 pela sessão: o gatilho carimba quem mudou
    perform set_config('request.jwt.claim.sub', ana::text, true);
    update public.agentes set ativo = true, nivel = 2, limite_valor = 500, limite_dia = 10
     where org_id = org_ana and agente = 'conciliacao';
    perform set_config('request.jwt.claim.sub', '', true);
    if not exists (select 1 from public.agentes where org_id = org_ana and agente = 'conciliacao' and atualizado_por = ana) then
      falhas := array_append(falhas, '(p) a mudança de nível não carimbou quem mudou');
    end if;
    -- confiança média: recusado mesmo no nível 2
    insert into public.agente_propostas (org_id, agente, chave, titulo, porque, valor, dados)
    values (org_ana, 'conciliacao', 'par:p2', 'Conciliar Boleto', 'Mesmo valor', 99,
            jsonb_build_object('previsto', prev, 'extrato', ext, 'confianca', 72)) returning id into ext_b;
    set local role service_role;
    begin
      j := public.agente_conciliar(ext_b, true);
      reset role;
      falhas := array_append(falhas, '(p) conciliou sozinho um par de confiança média');
    exception when others then reset role;
    end;
    if exists (select 1 from public.movements where id = prev and conciliado_com is not null) then
      falhas := array_append(falhas, '(p) a recusa conciliou mesmo assim');
    end if;
    -- nível 2 e confiança alta: concilia, e a proposta leva a marca do limite
    set local role service_role;
    j := public.agente_conciliar(p, true);
    reset role;
    if not exists (select 1 from public.agente_propostas where id = p and estado = 'executada'
                    and decidida_por is null and decidida_em is not null and motivo is not null) then
      falhas := array_append(falhas, format('(p) sozinho dentro do nível não executou: %s', j));
    end if;
    raise exception '%', sentinela;
  exception when others then
    reset role;
    if sqlerrm <> sentinela then falhas := array_append(falhas, format('(p) estourou: %s', sqlerrm)); end if;
  end;

  ------------------------------- q. EXTRATO DE OUTRA EMPRESA NÃO CANCELA ----
  begin
    casos := casos + 1;
    insert into public.movements (org_id, account_id, type, amount, description, situacao, paid_date, due_date, origem)
    values (org_ana, conta_a, 'entrada', 300, 'NF 7', 'previsto', null, current_date, 'manual') returning id into prev;
    insert into public.movements (org_id, account_id, type, amount, description, situacao, paid_date, due_date, origem)
    values (org_bia, conta_b, 'entrada', 300, 'PIX da outra empresa', 'baixado', current_date, current_date, 'manual') returning id into ext_b;
    insert into public.movements (org_id, account_id, type, amount, description, situacao, paid_date, due_date, origem)
    values (org_ana, conta_a, 'entrada', 300, 'PIX ainda previsto', 'previsto', null, current_date, 'manual') returning id into ext;
    perform set_config('request.jwt.claim.sub', ana::text, true);
    set local role authenticated;
    begin
      perform public.conciliar_movimentos(prev, ext_b);
      reset role;
      falhas := array_append(falhas, '(q) conciliou com a linha de outra empresa');
    exception when others then reset role;
    end;
    set local role authenticated;
    begin
      perform public.conciliar_movimentos(prev, ext);
      reset role;
      falhas := array_append(falhas, '(q) conciliou com uma linha que ainda não foi paga');
    exception when others then reset role;
    end;
    if not exists (select 1 from public.movements where id = prev and situacao = 'previsto' and conciliado_com is null) then
      falhas := array_append(falhas, '(q) o previsto foi cancelado sem par');
    end if;
    raise exception '%', sentinela;
  exception when others then
    reset role;
    if sqlerrm <> sentinela then falhas := array_append(falhas, format('(q) estourou: %s', sqlerrm)); end if;
  end;

  ------------------------------- r. A SESSÃO NÃO CONCILIA PELO AGENTE --------
  begin
    casos := casos + 1;
    insert into public.agente_propostas (org_id, agente, chave, titulo, porque)
    values (org_ana, 'conciliacao', 'par:r', 'Conciliar', 'Mesmo valor') returning id into p;
    perform set_config('request.jwt.claim.sub', ana::text, true);
    set local role authenticated;
    begin
      j := public.agente_conciliar(p, false);
      reset role;
      falhas := array_append(falhas, '(r) a sessão chamou a porta do agente');
    exception when insufficient_privilege then reset role;
    end;
    set local role authenticated;
    begin
      perform public.conciliar_na_empresa(gen_random_uuid(), gen_random_uuid(), org_bia, 'x');
      reset role;
      falhas := array_append(falhas, '(r) a sessão conciliou pela porta interna, escolhendo a empresa');
    exception when insufficient_privilege then reset role;
    end;
    raise exception '%', sentinela;
  exception when others then
    reset role;
    if sqlerrm <> sentinela then falhas := array_append(falhas, format('(r) estourou: %s', sqlerrm)); end if;
  end;

  if array_length(falhas, 1) > 0 then
    raise exception E'agentes: % falha(s):\n  %', array_length(falhas, 1), array_to_string(falhas, E'\n  ');
  end if;
  raise notice 'agentes: % casos (a–r) verdes', casos;
end
$guarda$;

rollback;
