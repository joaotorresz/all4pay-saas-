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
  n int;
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

  if array_length(falhas, 1) > 0 then
    raise exception E'agentes: % falha(s):\n  %', array_length(falhas, 1), array_to_string(falhas, E'\n  ');
  end if;
  raise notice 'agentes: % casos (a–j) verdes', casos;
end
$guarda$;

rollback;
