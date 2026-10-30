-- ═══════════════════════════════════════════════════════════════════════════
-- GUARDA: A QUATTRO AI NO WHATSAPP SÓ LÊ A EMPRESA DE QUEM PERGUNTA
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/whatsapp-ia.sql
--
-- O que ela prova contra o Postgres de verdade (migration 20261031130000):
--   a. número só PENDENTE (sem código conferido) não é ninguém;
--   b. caminho feliz: o número confirmado lista a empresa dele, a pergunta
--      passa e vai para a TRILHA da empresa;
--   c. `authenticated` NÃO executa nenhuma das três (descobriria de quem é
--      cada número);
--   d. empresa de OUTRA pessoa: nem escolhe, nem pergunta;
--   e. o papel é lido NA HORA: tirada da empresa, a pessoa deixa de ler;
--   f. o teto: a 21ª pergunta na hora é recusada e NÃO vai à trilha;
--   g. quem pediu SAIR não conversa até mandar VOLTAR;
--   h. duas empresas: escolher por mensagem; a escolhida some quando o
--      acesso some;
--   i. vínculo sem a permissão de ler não alcança a empresa.
--
-- ⚠️ Cada caso roda num SUBBLOCO que termina levantando uma sentinela (um
-- savepoint desfeito). Todos usam o MESMO telefone.
--
-- Tudo em transação que termina em ROLLBACK. Falha com EXCEÇÃO (ON_ERROR_STOP).
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

begin;

do $guarda$
declare
  ana uuid := gen_random_uuid();
  bia uuid := gen_random_uuid();
  org_ana uuid; org_bia uuid;
  tel constant text := '5511999997777';   -- como a Twilio entrega (com o 55)
  r jsonb;
  ok boolean;
  i int;
  n int;
  sentinela constant text := 'GUARDA_DESFAZ_CASO';
  falhas text[] := '{}';
  casos int := 0;
begin
  ---------------------------------------------------------------- montagem ---
  insert into auth.users (id, email, raw_user_meta_data) values
    (ana, 'wia-ana@guarda.local', '{"company":"Guarda WIA A"}'),
    (bia, 'wia-bia@guarda.local', '{"company":"Guarda WIA B"}');
  select org_id into org_ana from public.organization_members where user_id = ana limit 1;
  select org_id into org_bia from public.organization_members where user_id = bia limit 1;
  if org_ana is null or org_bia is null then
    raise exception 'GUARDA INVÁLIDA: provisionamento não criou empresa';
  end if;

  ---------------------------------------------- a. SÓ PENDENTE NÃO É NINGUÉM --
  begin
    casos := casos + 1;
    insert into public.whatsapp_numeros_usuario (user_id, pendente_telefone, codigo_hash, codigo_expira_em)
    values (ana, '11999997777', 'x', now() + interval '5 minutes');
    set local role service_role;
    r := public.whatsapp_ia_quem(tel);
    reset role;
    if r is not null then
      falhas := array_append(falhas, format('(a) número só pendente foi reconhecido: %s', r));
    end if;
    raise exception '%', sentinela;
  exception when others then
    reset role;
    if sqlerrm <> sentinela then falhas := array_append(falhas, format('(a) estourou: %s', sqlerrm)); end if;
  end;

  -- Daqui em diante, o número de Ana está CONFIRMADO em cada caso.
  ---------------------------------------------- b. CAMINHO FELIZ --------------
  begin
    casos := casos + 1;
    insert into public.whatsapp_numeros_usuario (user_id, telefone, confirmado_em) values (ana, '11999997777', now());
    set local role service_role;
    r := public.whatsapp_ia_quem(tel);
    reset role;
    if r is null or jsonb_array_length(r -> 'orgs') <> 1 or (r -> 'orgs' -> 0 ->> 'id')::uuid <> org_ana then
      falhas := array_append(falhas, format('(b) o número não listou só a empresa da Ana: %s', r));
    end if;
    set local role service_role;
    r := public.whatsapp_ia_reservar(tel, org_ana, 'quanto tenho a pagar essa semana?');
    reset role;
    if not coalesce((r ->> 'ok')::boolean, false) then
      falhas := array_append(falhas, format('(b) a pergunta legítima foi recusada: %s', r));
    end if;
    if not exists (select 1 from public.audit_log
                    where org_id = org_ana and acao = 'whatsapp_ia.pergunta' and usuario = ana::text
                      and depois ->> 'pergunta' = 'quanto tenho a pagar essa semana?') then
      falhas := array_append(falhas, '(b) a pergunta não foi para a trilha da empresa');
    end if;
    if exists (select 1 from public.audit_log where acao = 'whatsapp_ia.pergunta' and depois::text like '%99999-7777%') then
      falhas := array_append(falhas, '(b) o número inteiro foi para a trilha');
    end if;
    raise exception '%', sentinela;
  exception when others then
    reset role;
    if sqlerrm <> sentinela then falhas := array_append(falhas, format('(b) estourou: %s', sqlerrm)); end if;
  end;

  ------------------------------------ c. AUTHENTICATED NÃO EXECUTA NADA -------
  begin
    casos := casos + 1;
    perform set_config('request.jwt.claim.sub', ana::text, true);
    set local role authenticated;
    begin
      r := public.whatsapp_ia_quem(tel);
      reset role;
      falhas := array_append(falhas, '(c) a SESSÃO executou whatsapp_ia_quem — descobriria de quem é cada número');
    exception when insufficient_privilege then reset role;
    end;
    set local role authenticated;
    begin
      ok := public.whatsapp_ia_escolher(tel, org_ana);
      reset role;
      falhas := array_append(falhas, '(c) a SESSÃO executou whatsapp_ia_escolher');
    exception when insufficient_privilege then reset role;
    end;
    set local role authenticated;
    begin
      r := public.whatsapp_ia_reservar(tel, org_ana, 'x');
      reset role;
      falhas := array_append(falhas, '(c) a SESSÃO executou whatsapp_ia_reservar');
    exception when insufficient_privilege then reset role;
    end;
    set local role authenticated;
    begin
      perform 1 from public.whatsapp_ia_perguntas limit 1;
      reset role;
      falhas := array_append(falhas, '(c) authenticated LÊ whatsapp_ia_perguntas direto');
    exception when insufficient_privilege then reset role;
    end;
    raise exception '%', sentinela;
  exception when others then
    reset role;
    if sqlerrm <> sentinela then falhas := array_append(falhas, format('(c) estourou: %s', sqlerrm)); end if;
  end;

  ------------------------------------ d. EMPRESA DE OUTRA PESSOA --------------
  begin
    casos := casos + 1;
    insert into public.whatsapp_numeros_usuario (user_id, telefone, confirmado_em) values (ana, '11999997777', now());
    set local role service_role;
    ok := public.whatsapp_ia_escolher(tel, org_bia);
    r := public.whatsapp_ia_reservar(tel, org_bia, 'qual o saldo?');
    reset role;
    if ok then
      falhas := array_append(falhas, '(d) Ana escolheu a empresa da Bia');
    end if;
    if coalesce((r ->> 'ok')::boolean, false) or r ->> 'codigo' <> 'sem_acesso' then
      falhas := array_append(falhas, format('(d) Ana perguntou sobre a empresa da Bia: %s', r));
    end if;
    if exists (select 1 from public.audit_log where org_id = org_bia and acao like 'whatsapp_ia.%') then
      falhas := array_append(falhas, '(d) a tentativa entrou na trilha da Bia');
    end if;
    raise exception '%', sentinela;
  exception when others then
    reset role;
    if sqlerrm <> sentinela then falhas := array_append(falhas, format('(d) estourou: %s', sqlerrm)); end if;
  end;

  ------------------------------------ e. O PAPEL É LIDO NA HORA ---------------
  begin
    casos := casos + 1;
    insert into public.whatsapp_numeros_usuario (user_id, telefone, confirmado_em) values (ana, '11999997777', now());
    delete from public.organization_members where user_id = ana and org_id = org_ana;
    set local role service_role;
    r := public.whatsapp_ia_quem(tel);
    reset role;
    if jsonb_array_length(r -> 'orgs') <> 0 then
      falhas := array_append(falhas, format('(e) fora da empresa, o número ainda a lista: %s', r));
    end if;
    set local role service_role;
    r := public.whatsapp_ia_reservar(tel, org_ana, 'qual o saldo?');
    reset role;
    if r ->> 'codigo' is distinct from 'sem_acesso' then
      falhas := array_append(falhas, format('(e) fora da empresa, a pergunta passou: %s', r));
    end if;
    raise exception '%', sentinela;
  exception when others then
    reset role;
    if sqlerrm <> sentinela then falhas := array_append(falhas, format('(e) estourou: %s', sqlerrm)); end if;
  end;

  ------------------------------------ f. O TETO POR HORA ----------------------
  begin
    casos := casos + 1;
    insert into public.whatsapp_numeros_usuario (user_id, telefone, confirmado_em) values (ana, '11999997777', now());
    set local role service_role;
    for i in 1..20 loop
      r := public.whatsapp_ia_reservar(tel, org_ana, 'pergunta ' || i);
      if not coalesce((r ->> 'ok')::boolean, false) then
        reset role;
        falhas := array_append(falhas, format('(f) a pergunta %s (dentro do teto) foi recusada: %s', i, r));
        set local role service_role;
      end if;
    end loop;
    r := public.whatsapp_ia_reservar(tel, org_ana, 'pergunta 21');
    reset role;
    if r ->> 'codigo' is distinct from 'limite' then
      falhas := array_append(falhas, format('(f) a 21ª pergunta da hora passou: %s', r));
    end if;
    select count(*) into n from public.audit_log where org_id = org_ana and acao = 'whatsapp_ia.pergunta';
    if n <> 20 then
      falhas := array_append(falhas, format('(f) a trilha tem %s perguntas, esperado 20 (a recusada não entra)', n));
    end if;
    raise exception '%', sentinela;
  exception when others then
    reset role;
    if sqlerrm <> sentinela then falhas := array_append(falhas, format('(f) estourou: %s', sqlerrm)); end if;
  end;

  ------------------------------------ g. QUEM PEDIU SAIR ----------------------
  begin
    casos := casos + 1;
    insert into public.whatsapp_numeros_usuario (user_id, telefone, confirmado_em) values (ana, '11999997777', now());
    insert into public.whatsapp_saidas (telefone) values ('11999997777');
    set local role service_role;
    r := public.whatsapp_ia_quem(tel);
    reset role;
    if not coalesce((r ->> 'saiu')::boolean, false) then
      falhas := array_append(falhas, format('(g) o SAIR não aparece para o webhook: %s', r));
    end if;
    set local role service_role;
    r := public.whatsapp_ia_reservar(tel, org_ana, 'qual o saldo?');
    reset role;
    if r ->> 'codigo' is distinct from 'saiu' then
      falhas := array_append(falhas, format('(g) quem pediu SAIR conversou: %s', r));
    end if;
    raise exception '%', sentinela;
  exception when others then
    reset role;
    if sqlerrm <> sentinela then falhas := array_append(falhas, format('(g) estourou: %s', sqlerrm)); end if;
  end;

  ------------------------------------ h. DUAS EMPRESAS ------------------------
  begin
    casos := casos + 1;
    insert into public.whatsapp_numeros_usuario (user_id, telefone, confirmado_em) values (ana, '11999997777', now());
    insert into public.organization_members (org_id, user_id, role) values (org_bia, ana, 'leitor');
    set local role service_role;
    r := public.whatsapp_ia_quem(tel);
    reset role;
    if jsonb_array_length(r -> 'orgs') <> 2 or r ->> 'escolhida' is not null then
      falhas := array_append(falhas, format('(h) com duas empresas, esperava as duas e nenhuma escolhida: %s', r));
    end if;
    set local role service_role;
    ok := public.whatsapp_ia_escolher(tel, org_bia);
    r := public.whatsapp_ia_quem(tel);
    reset role;
    if not ok or (r ->> 'escolhida')::uuid is distinct from org_bia then
      falhas := array_append(falhas, format('(h) a escolha por mensagem não ficou: %s', r));
    end if;
    delete from public.organization_members where user_id = ana and org_id = org_bia;
    set local role service_role;
    r := public.whatsapp_ia_quem(tel);
    reset role;
    if r ->> 'escolhida' is not null then
      falhas := array_append(falhas, format('(h) a escolhida continua depois de o acesso sair: %s', r));
    end if;
    raise exception '%', sentinela;
  exception when others then
    reset role;
    if sqlerrm <> sentinela then falhas := array_append(falhas, format('(h) estourou: %s', sqlerrm)); end if;
  end;

  ------------------------------------ i. SEM A PERMISSÃO DE LER --------------
  -- Membro da empresa com um papel que não lê (aqui: a matriz tirou o `ler`
  -- do leitor) não alcança a empresa — vínculo não é permissão.
  begin
    casos := casos + 1;
    insert into public.whatsapp_numeros_usuario (user_id, telefone, confirmado_em) values (ana, '11999997777', now());
    insert into public.organization_members (org_id, user_id, role) values (org_bia, ana, 'leitor');
    delete from public.role_permissions where papel = 'leitor' and acao = 'ler';
    set local role service_role;
    r := public.whatsapp_ia_quem(tel);
    ok := public.whatsapp_ia_escolher(tel, org_bia);
    reset role;
    if exists (select 1 from jsonb_array_elements(r -> 'orgs') e where (e ->> 'id')::uuid = org_bia) or ok then
      falhas := array_append(falhas, format('(i) papel sem "ler" alcançou a empresa: %s', r));
    end if;
    raise exception '%', sentinela;
  exception when others then
    reset role;
    if sqlerrm <> sentinela then falhas := array_append(falhas, format('(i) estourou: %s', sqlerrm)); end if;
  end;

  if array_length(falhas, 1) > 0 then
    raise exception E'whatsapp-ia: % falha(s):\n  %', array_length(falhas, 1), array_to_string(falhas, E'\n  ');
  end if;
  raise notice 'whatsapp-ia: % casos (a–i) verdes', casos;
end
$guarda$;

rollback;
