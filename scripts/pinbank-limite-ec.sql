-- ═══════════════════════════════════════════════════════════════════════════
-- GUARDA DO LIMITE DA CONFERÊNCIA (D4) E DO EC AUDITADO E ÚNICO (D10)
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/pinbank-limite-ec.sql
--
-- As guardas puras (`npm run pinbank-conferencia` e o bloco
-- `conferencia-pinbank:` do `engine-audit`) provam a ROTA: que ela pede a
-- reserva ao banco no ponto certo e falha fechada sem ele. Esta prova a
-- FECHADURA, que só existe no banco:
--
--  L1. a empresa reserva — e a reserva deixa quem, quando e a maquininha (e trilha);
--  L2. antes de 60 s: recusa com o que falta, SEM carimbar (quem insiste não empurra o prazo);
--  L2b. o carimbo À FRENTE do relógio da transação (a sessão que abriu ANTES da que
--       carimbou e pediu depois — medido com duas sessões): a recusa diz no máximo
--       60 s, nunca mais que a regra;
--  L2c. OUTRO administrador da MESMA empresa também espera — a espera é por empresa,
--       não por pessoa (e o carimbo continua de quem chamou);
--  L3. passado o prazo, passa — exatamente 60 s passa, 59,999 s não; e a reserva
--      REPETIDA também vira evento na trilha (com quem e quando; a maquininha só
--      quando muda — a trilha guarda o que mudou);
--  L4. a empresa B não espera pela A;
--  L5. o LEITOR (sem 'administrar') não reserva, nem cria a linha;
--  L6. o titular de OUTRA empresa não reserva com a maquininha de A;
--  L7. a maquininha desvinculada não reserva;
--  L7b. a maquininha INATIVA e a SEM o código do extrato (EC) não reservam — as
--       mesmas pré-condições da rota, de novo no banco;
--  L8. sem sessão não reserva; anon e a chave de serviço nem executam a função;
--  L9. ninguém do cliente lê nem escreve a tabela direto;
--  E1. o painel da plataforma mostra o EC de cada vínculo;
--  E2. o rastro da plataforma (admin_audit) guarda o EC ao vincular e ao desvincular
--      (e a plataforma desvincula — pela marca que só a função dela liga);
--  E3. o EC vivo de A em OUTRA empresa: a RPC é recusada, com a frase nomeada;
--  E4. … e direto no banco (INSERT e UPDATE como dono da tabela), e reativando o excluído;
--  E4b. o vínculo desvinculado NÃO volta — nem à mão, nem pela lixeira do lançador;
--  E5. a MESMA empresa com duas maquininhas no mesmo EC continua permitida;
--  E6. desvinculado na outra empresa, o EC pode ir para a nova;
--  E7. EC zero ou negativo é recusado;
--  E8. o gatilho nas colunas que decidem; a trava pela CHAVE do EC e ANTES de
--      conferir (no texto E de fato, em pg_locks); e a RESTRIÇÃO DE EXCLUSÃO, que
--      trava sozinha (com o gatilho desligado, o EC de A não entra em B);
--  E9. a lixeira da empresa não alcança o vínculo: o lançador não o exclui, a
--      lixeira não o lista (e continua listando o resto), o titular não o apaga de
--      vez — e ele só sai junto com a empresa.
--
-- E os DEFEITOS PLANTADOS no fim — cada um reescreve a função, o gatilho ou a
-- restrição dentro de um savepoint e exige que a asserção que o nomeia
-- REPROVE, lendo a mensagem. Planta que não acha mais o texto a substituir
-- "envelheceu" — e isso também reprova.
--
-- ⚠️ SAVEPOINT POR CASO, desfeito no fim de cada um — e o MESMO EC e os MESMOS
-- estabelecimentos usados de propósito em todos: se um `rollback to savepoint`
-- deixar de acontecer, o caso seguinte colide (o EC fica vivo em duas empresas,
-- ou o estabelecimento repete) em vez de passar por acidente. O arreio é o de
-- `pinbank.sql`, copiado. Tudo termina em ROLLBACK.
--
-- ⚠️ Os passos do CAMINHO DE SUCESSO (vincular, desvincular, ativar) dentro de
-- um caso capturam o erro e levantam a frase DO CASO com ele: sem isso, o
-- defeito que faz o gatilho recusar uma gravação legítima reprovava com a frase
-- do próprio gatilho ("já está vinculado a outra empresa") — vermelho que
-- parece comportamento certo e não nomeia o caso.
--
-- ⚠️ `now()` é o instante da TRANSAÇÃO, o mesmo do começo ao fim: o "depois de
-- 60 s" se prova movendo `ultima_em` para trás, nunca esperando.
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

begin;

------------------------------------------------------------------ montagem ---
do $montagem$
declare
  ua uuid := gen_random_uuid();   -- titular da empresa A
  ul uuid := gen_random_uuid();   -- leitor da empresa A
  ud uuid := gen_random_uuid();   -- SEGUNDO administrador da empresa A
  un uuid := gen_random_uuid();   -- lançador da empresa A (a lixeira pede 'lancar')
  ub uuid := gen_random_uuid();   -- titular da empresa B
  up uuid := gen_random_uuid();   -- administrador da PLATAFORMA
  oa uuid; ob uuid; ca uuid; cb uuid; cc uuid;
begin
  insert into auth.users (id, email) values
    (ua, 'pbl-a@guarda.local'), (ul, 'pbl-leitor@guarda.local'), (ud, 'pbl-admin2@guarda.local'),
    (un, 'pbl-lancador@guarda.local'), (ub, 'pbl-b@guarda.local'), (up, 'pbl-plataforma@guarda.local');
  select om.org_id into oa from public.organization_members om where om.user_id = ua limit 1;
  select om.org_id into ob from public.organization_members om where om.user_id = ub limit 1;
  if oa is null or ob is null or oa = ob then
    raise exception 'GUARDA INVÁLIDA: o provisionamento não criou duas empresas.';
  end if;
  insert into public.organization_members (org_id, user_id, role) values
    (oa, ul, 'leitor'), (oa, ud, 'admin'), (oa, un, 'lancador')
    on conflict (org_id, user_id) do update set role = excluded.role;
  insert into public.user_active_org (user_id, org_id) values (ul, oa), (ud, oa), (un, oa)
    on conflict (user_id) do update set org_id = excluded.org_id;
  -- A plataforma só aceita administrador de endereço PERMITIDO (com motivo).
  insert into public.platform_admin_permitidos (email, motivo)
  values ('pbl-plataforma@guarda.local', 'guarda do limite da conferência e do EC (desfeita no fim)')
  on conflict do nothing;
  insert into public.platform_admins (user_id, exige_mfa) values (up, false)
    on conflict (user_id) do update set exige_mfa = false, expira_em = null;

  -- As contas do repasse (para ATIVAR as maquininhas) e um centro de custo de A (o controle da lixeira).
  select a.id into ca from public.financial_accounts a
   where a.org_id = oa and a.excluido_em is null and a.ativo order by a.created_at limit 1;
  select a.id into cb from public.financial_accounts a
   where a.org_id = ob and a.excluido_em is null and a.ativo order by a.created_at limit 1;
  select c.id into cc from public.cost_centers c
   where c.org_id = oa and c.excluido_em is null order by c.created_at limit 1;
  if ca is null or cb is null or cc is null then
    raise exception 'GUARDA INVÁLIDA: as empresas nasceram sem conta ativa ou sem centro de custo (o seed mudou?).';
  end if;

  perform set_config('guarda.ua', ua::text, true);
  perform set_config('guarda.ul', ul::text, true);
  perform set_config('guarda.ud', ud::text, true);
  perform set_config('guarda.un', un::text, true);
  perform set_config('guarda.ub', ub::text, true);
  perform set_config('guarda.up', up::text, true);
  perform set_config('guarda.oa', oa::text, true);
  perform set_config('guarda.ob', ob::text, true);
  perform set_config('guarda.ca', ca::text, true);
  perform set_config('guarda.cb', cb::text, true);
  perform set_config('guarda.cc', cc::text, true);
  -- ⚠️ EC e estabelecimentos que NÃO existem neste banco: um número fixo
  -- colidiria com um vínculo de verdade e a guarda reprovaria pelo motivo errado.
  perform set_config('guarda.ec',  (select coalesce(max(codigo_cliente), 0) + 1000 from public.pinbank_vinculos)::text, true);
  perform set_config('guarda.ec_b', (select coalesce(max(codigo_cliente), 0) + 1001 from public.pinbank_vinculos)::text, true);
  -- Um EC que só o caso E8 grava: a trava que ele procura em pg_locks não pode ser a de outro caso.
  perform set_config('guarda.ec_c', (select coalesce(max(codigo_cliente), 0) + 1002 from public.pinbank_vinculos)::text, true);
  perform set_config('guarda.estab', (select coalesce(max(estabelecimento_id), 0) + 1000 from public.pinbank_vinculos)::text, true);
end
$montagem$;

-- Os papéis, por função: a mesma troca de identidade em todo caso.
create or replace function pg_temp.como(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
end $$;
create or replace function pg_temp.sem_sessao() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

-- A plataforma vincula: empresa, estabelecimento (deslocado do da guarda) e EC.
create or replace function pg_temp.vincular(p_org uuid, p_desloc int, p_ec bigint) returns uuid language plpgsql as $$
declare v uuid;
begin
  perform pg_temp.como(current_setting('guarda.up')::uuid);
  set local role authenticated;
  v := public.admin_pinbank_vincular(p_org, current_setting('guarda.estab')::bigint + p_desloc, null, 'Loja da guarda', p_ec);
  reset role;
  return v;
end $$;
create or replace function pg_temp.desvincular(p_vinculo uuid) returns void language plpgsql as $$
begin
  perform pg_temp.como(current_setting('guarda.up')::uuid);
  set local role authenticated;
  perform public.admin_pinbank_desvincular(p_vinculo, 'troca de maquininha na guarda');
  reset role;
end $$;
-- O titular ATIVA (conta e taxas válidas) — a segunda chave, como em `pinbank.sql`.
create or replace function pg_temp.ativar(p_vinculo uuid, p_titular uuid, p_conta uuid) returns void language plpgsql as $$
begin
  perform pg_temp.como(p_titular);
  set local role authenticated;
  perform public.pinbank_configurar_vinculo(p_vinculo, p_conta,
    '{"debito":0.0199,"credito_vista":0.035}'::jsonb, '{}'::jsonb, false, true);
  reset role;
end $$;
-- A pessoa pede a reserva. Devolve a resposta, ou {erro, estado} quando a função recusa.
create or replace function pg_temp.reservar(p_user uuid, p_vinculo uuid) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform pg_temp.como(p_user);
  set local role authenticated;
  begin
    r := public.pinbank_conferencia_reservar(p_vinculo);
  exception when others then
    r := jsonb_build_object('erro', SQLERRM, 'estado', SQLSTATE);
  end;
  reset role;
  return r;
end $$;
create or replace function pg_temp.linha(p_org uuid) returns public.pinbank_conferencia_limite language sql as $$
  select l from public.pinbank_conferencia_limite l where l.org_id = p_org
$$;
create or replace function pg_temp.mover(p_org uuid, p_atras interval) returns void language sql as $$
  update public.pinbank_conferencia_limite set ultima_em = now() - p_atras where org_id = p_org
$$;
-- A restrição do EC trocada (defeito plantado) — ou tirada, com `p_def` nulo.
create or replace function pg_temp.restricao(p_def text) returns void language plpgsql as $$
begin
  alter table public.pinbank_vinculos drop constraint pinbank_vinculos_ec_uma_empresa_excl;
  if p_def is not null then
    execute 'alter table public.pinbank_vinculos add constraint pinbank_vinculos_ec_uma_empresa_excl ' || p_def;
  end if;
end $$;

grant execute on all functions in schema pg_temp to authenticated, service_role, anon;

-- Os vínculos de base, ATIVOS: A com o EC da guarda, B com outro.
do $base$
begin
  perform set_config('guarda.va', pg_temp.vincular(current_setting('guarda.oa')::uuid, 0, current_setting('guarda.ec')::bigint)::text, true);
  perform set_config('guarda.vb', pg_temp.vincular(current_setting('guarda.ob')::uuid, 1, current_setting('guarda.ec_b')::bigint)::text, true);
  perform pg_temp.ativar(current_setting('guarda.va')::uuid, current_setting('guarda.ua')::uuid, current_setting('guarda.ca')::uuid);
  perform pg_temp.ativar(current_setting('guarda.vb')::uuid, current_setting('guarda.ub')::uuid, current_setting('guarda.cb')::uuid);
end
$base$;

-- ───────────────────── as asserções que os defeitos plantados têm de derrubar ───
-- L2: a recusa NÃO carimba — e recusa mesmo.
create or replace function pg_temp.prova_recusa_nao_carimba() returns void language plpgsql as $$
declare r jsonb; oa uuid := current_setting('guarda.oa')::uuid; ua uuid := current_setting('guarda.ua')::uuid;
        va uuid := current_setting('guarda.va')::uuid; antes public.pinbank_conferencia_limite; depois public.pinbank_conferencia_limite;
begin
  r := pg_temp.reservar(ua, va);
  if r <> '{"ok": true}'::jsonb then raise exception 'CASO L2 FALHOU: a primeira reserva não passou: %', r; end if;
  perform pg_temp.mover(oa, interval '30 seconds');
  antes := pg_temp.linha(oa);
  r := pg_temp.reservar(ua, va);
  depois := pg_temp.linha(oa);
  if r ? 'erro' then raise exception 'CASO L2 FALHOU: a segunda reserva deu erro em vez de recusar: %', r; end if;
  if coalesce((r ->> 'ok')::boolean, true) then
    raise exception 'CASO L2 FALHOU: a segunda conferência passou antes de 60 s (%): a espera não recusa.', r;
  end if;
  if depois.ultima_em is distinct from antes.ultima_em or depois.por is distinct from antes.por then
    raise exception 'CASO L2 FALHOU: a recusa carimbou — a última conferência foi de % para %: quem insiste empurra o prazo e nunca passa.', antes.ultima_em, depois.ultima_em;
  end if;
  if (r ->> 'restante_ms')::bigint is distinct from 30000 then
    raise exception 'CASO L2 FALHOU: faltavam 30 s e a recusa disse % ms.', r ->> 'restante_ms';
  end if;
end $$;

-- L2b: a transação que abriu ANTES da que carimbou vê o carimbo À FRENTE do próprio relógio (`now()` é o
-- início da transação) — medido com duas sessões no Supabase local, abertas a 0,3 s uma da outra: sem o
-- teto a recusa dizia 60.293 ms; com ele, 60.000.
-- A recusa diz no máximo 60 s: nunca mais que a regra (o botão esperaria um prazo que o banco não tem).
create or replace function pg_temp.prova_teto_da_espera() returns void language plpgsql as $$
declare r jsonb; oa uuid := current_setting('guarda.oa')::uuid; ua uuid := current_setting('guarda.ua')::uuid;
        va uuid := current_setting('guarda.va')::uuid;
begin
  r := pg_temp.reservar(ua, va);
  if r <> '{"ok": true}'::jsonb then raise exception 'CASO L2b FALHOU: a primeira reserva não passou: %', r; end if;
  perform pg_temp.mover(oa, interval '-10 seconds');
  r := pg_temp.reservar(ua, va);
  if r ? 'erro' or coalesce((r ->> 'ok')::boolean, true) then
    raise exception 'CASO L2b FALHOU: com o carimbo 10 s à frente do relógio a reserva não recusou: %', r;
  end if;
  if (r ->> 'restante_ms')::bigint is distinct from 60000 then
    raise exception 'CASO L2b FALHOU: com o carimbo 10 s à frente do relógio a recusa disse % ms — a espera nunca passa de 60000 (nunca mais que a regra).', r ->> 'restante_ms';
  end if;
end $$;

-- L2c: OUTRO administrador da MESMA empresa, logo depois do titular, também espera — e o carimbo continua do titular.
create or replace function pg_temp.prova_outra_pessoa_espera() returns void language plpgsql as $$
declare r jsonb; oa uuid := current_setting('guarda.oa')::uuid; ua uuid := current_setting('guarda.ua')::uuid;
        ud uuid := current_setting('guarda.ud')::uuid; va uuid := current_setting('guarda.va')::uuid;
        antes public.pinbank_conferencia_limite; depois public.pinbank_conferencia_limite;
begin
  r := pg_temp.reservar(ua, va);
  if r <> '{"ok": true}'::jsonb then raise exception 'CASO L2c FALHOU: a primeira reserva (do titular de A) não passou: %', r; end if;
  antes := pg_temp.linha(oa);
  r := pg_temp.reservar(ud, va);
  depois := pg_temp.linha(oa);
  if r ? 'erro' then
    raise exception 'CASO L2c FALHOU: o segundo administrador de A recebeu erro em vez da espera (a premissa: ele administra A): %', r;
  end if;
  if coalesce((r ->> 'ok')::boolean, true) or (r ->> 'restante_ms')::bigint is distinct from 60000
     or depois.por is distinct from ua or depois.ultima_em is distinct from antes.ultima_em then
    raise exception 'CASO L2c FALHOU: outra pessoa da MESMA empresa não esperou (%; a última conferência ficou com %) — a espera é por EMPRESA, não por pessoa.', r, depois.por;
  end if;
end $$;

-- L5: o leitor não reserva, e a linha não nasce.
create or replace function pg_temp.prova_leitor_recusado() returns void language plpgsql as $$
declare r jsonb;
begin
  r := pg_temp.reservar(current_setting('guarda.ul')::uuid, current_setting('guarda.va')::uuid);
  if r ? 'ok' or (pg_temp.linha(current_setting('guarda.oa')::uuid)).org_id is not null then
    raise exception 'CASO L5 FALHOU: o LEITOR reservou a conferência (%): quem não administra gastaria a credencial da plataforma.', r;
  end if;
  if r ->> 'estado' <> '42501' or r ->> 'erro' not like '%só quem administra a empresa%' then
    raise exception 'VERMELHO PELO MOTIVO ERRADO (caso L5): esperado a recusa por papel, veio %', r;
  end if;
end $$;

-- L7: a maquininha desvinculada não reserva.
create or replace function pg_temp.prova_excluido_recusado() returns void language plpgsql as $$
declare r jsonb;
begin
  begin
    perform pg_temp.desvincular(current_setting('guarda.va')::uuid);
  exception when others then
    raise exception 'CASO L7 FALHOU: a plataforma não conseguiu desvincular a maquininha de A: %', SQLERRM;
  end;
  reset role;
  r := pg_temp.reservar(current_setting('guarda.ua')::uuid, current_setting('guarda.va')::uuid);
  if r ? 'ok' or (pg_temp.linha(current_setting('guarda.oa')::uuid)).org_id is not null then
    raise exception 'CASO L7 FALHOU: a maquininha DESVINCULADA reservou a conferência (%).', r;
  end if;
  if r ->> 'estado' <> '42501' then
    raise exception 'VERMELHO PELO MOTIVO ERRADO (caso L7): esperado a recusa, veio %', r;
  end if;
  -- O desvincular também desliga `ativo` — e a reserva não pode depender disso: com o `ativo` religado à
  -- mão, a maquininha desvinculada continua recusada (é o `excluido_em` que decide, não o interruptor).
  update public.pinbank_vinculos set ativo = true where id = current_setting('guarda.va')::uuid;
  r := pg_temp.reservar(current_setting('guarda.ua')::uuid, current_setting('guarda.va')::uuid);
  if r ? 'ok' or (pg_temp.linha(current_setting('guarda.oa')::uuid)).org_id is not null then
    raise exception 'CASO L7 FALHOU: a maquininha DESVINCULADA (com o ativo ligado) reservou a conferência (%).', r;
  end if;
  if r ->> 'estado' <> '42501' then
    raise exception 'VERMELHO PELO MOTIVO ERRADO (caso L7, ativo ligado): esperado a recusa, veio %', r;
  end if;
end $$;

-- L7b: as pré-condições da rota, de novo no banco — a maquininha INATIVA e a SEM o EC não reservam.
create or replace function pg_temp.prova_inativo_ou_sem_ec_recusado() returns void language plpgsql as $$
declare r jsonb; oa uuid := current_setting('guarda.oa')::uuid; ua uuid := current_setting('guarda.ua')::uuid;
        v_inativo uuid; v_sem_ec uuid;
begin
  -- Uma irmã de A (o mesmo EC, outra maquininha), vinculada e NÃO ativada.
  begin
    v_inativo := pg_temp.vincular(oa, 8, current_setting('guarda.ec')::bigint);
  exception when others then
    raise exception 'CASO L7b FALHOU: a plataforma não conseguiu vincular a segunda maquininha de A: %', SQLERRM;
  end;
  reset role;
  r := pg_temp.reservar(ua, v_inativo);
  if r ? 'ok' or (pg_temp.linha(oa)).org_id is not null then
    raise exception 'CASO L7b FALHOU: a maquininha INATIVA reservou a conferência (%): uma chamada direta gastaria a espera da empresa com quem nunca chega à Pinbank.', r;
  end if;
  if r ->> 'estado' <> '42501' then raise exception 'VERMELHO PELO MOTIVO ERRADO (caso L7b, inativa): %', r; end if;
  -- Outra maquininha de A, ATIVA e SEM o código do extrato.
  begin
    v_sem_ec := pg_temp.vincular(oa, 9, null);
    perform pg_temp.ativar(v_sem_ec, ua, current_setting('guarda.ca')::uuid);
  exception when others then
    raise exception 'CASO L7b FALHOU: a plataforma não conseguiu vincular (ou o titular ativar) a maquininha sem EC: %', SQLERRM;
  end;
  reset role;
  r := pg_temp.reservar(ua, v_sem_ec);
  if r ? 'ok' or (pg_temp.linha(oa)).org_id is not null then
    raise exception 'CASO L7b FALHOU: a maquininha SEM o código do extrato (EC) reservou a conferência (%).', r;
  end if;
  if r ->> 'estado' <> '42501' then raise exception 'VERMELHO PELO MOTIVO ERRADO (caso L7b, sem EC): %', r; end if;
end $$;

-- E2: o rastro da plataforma guarda o EC — e a plataforma desvincula (a marca que só a função dela liga).
create or replace function pg_temp.prova_rastro_do_ec() returns void language plpgsql as $$
declare d jsonb; va uuid := current_setting('guarda.va')::uuid; ec text := current_setting('guarda.ec');
begin
  select a.detail into d from public.admin_audit a
   where a.action = 'pinbank.vincular' and a.detail ->> 'vinculo' = va::text;
  if d is null or d ->> 'codigo_cliente' is distinct from ec then
    raise exception 'CASO E2 FALHOU: o rastro do vínculo não guarda o EC digitado: %', d;
  end if;
  begin
    perform pg_temp.desvincular(va);
  exception when others then
    raise exception 'CASO E2 FALHOU: a plataforma não conseguiu desvincular a maquininha: %', SQLERRM;
  end;
  reset role;
  select a.detail into d from public.admin_audit a
   where a.action = 'pinbank.desvincular' and a.detail ->> 'vinculo' = va::text;
  if d is null or d ->> 'codigo_cliente' is distinct from ec then
    raise exception 'CASO E2 FALHOU: o rastro do desvínculo não diz qual EC saiu: %', d;
  end if;
end $$;

-- E3: o EC vivo de A não vai para B pela RPC — e a frase nomeia o EC.
create or replace function pg_temp.prova_ec_outra_empresa_recusado() returns void language plpgsql as $$
declare msg text; est text; n bigint; ec bigint := current_setting('guarda.ec')::bigint;
begin
  -- A premissa: o EC está vivo na empresa A. Sem ela o caso "passaria" sem testar nada — e é
  -- exatamente o que um `rollback to savepoint` que faltou num caso anterior produziria.
  if not exists (select 1 from public.pinbank_vinculos
                  where id = current_setting('guarda.va')::uuid and codigo_cliente = ec and excluido_em is null) then
    raise exception 'GUARDA INVÁLIDA (caso E3): o vínculo de A com o EC % não está vivo — um caso anterior não foi desfeito (savepoint).', ec;
  end if;
  begin
    perform pg_temp.vincular(current_setting('guarda.ob')::uuid, 2, ec);
    msg := null;
  exception when others then msg := SQLERRM; est := SQLSTATE;
  end;
  reset role;
  select count(distinct org_id) into n from public.pinbank_vinculos where codigo_cliente = ec and excluido_em is null;
  if msg is null or n > 1 then
    raise exception 'CASO E3 FALHOU: o mesmo EC % ficou vivo em % empresas — uma leria o extrato da outra.', ec, n;
  end if;
  if est <> '23505' or msg not like 'A4P-PINBANK: o código do estabelecimento no extrato (EC) ' || ec || ' já está vinculado a outra empresa%' then
    raise exception 'CASO E3 FALHOU: a recusa do EC repetido não é a frase nomeada do banco (veio % "%") — a plataforma leria o erro cru da restrição em vez do motivo.', est, msg;
  end if;
end $$;

-- E4b: o vínculo desvinculado não volta — nem à mão (dono da tabela), nem pela lixeira do lançador.
create or replace function pg_temp.prova_reativacao_recusada() returns void language plpgsql as $$
declare msg text; est text; va uuid := current_setting('guarda.va')::uuid; un uuid := current_setting('guarda.un')::uuid;
begin
  begin
    perform pg_temp.desvincular(va);
  exception when others then
    raise exception 'CASO E4b FALHOU: a plataforma não conseguiu desvincular a maquininha de A: %', SQLERRM;
  end;
  reset role;
  -- À mão, como dono da tabela (o EC não está em outra empresa: a recusa é do CICLO, não do EC).
  begin
    update public.pinbank_vinculos set excluido_em = null, excluido_por = null, excluido_motivo = null where id = va;
    msg := null; est := null;
  exception when others then msg := SQLERRM; est := SQLSTATE;
  end;
  if msg is null or exists (select 1 from public.pinbank_vinculos where id = va and excluido_em is null) then
    raise exception 'CASO E4b FALHOU: o vínculo desvinculado pela plataforma voltou à vida (UPDATE direto) — com o EC dentro, sem o rastro da plataforma.';
  end if;
  if est <> '42501' or msg not like '%vínculo desvinculado não volta%' then
    raise exception 'VERMELHO PELO MOTIVO ERRADO (caso E4b, à mão): % "%"', est, msg;
  end if;
  -- Pela lixeira genérica, como o LANÇADOR de A (o "Restaurar" da tela).
  perform pg_temp.como(un);
  set local role authenticated;
  begin
    perform public.restaurar_logico('pinbank_vinculos', va::text);
    msg := null; est := null;
  exception when others then msg := SQLERRM; est := SQLSTATE;
  end;
  reset role;
  if msg is null or exists (select 1 from public.pinbank_vinculos where id = va and excluido_em is null) then
    raise exception 'CASO E4b FALHOU: o LANÇADOR de A restaurou pela lixeira o vínculo que a plataforma desvinculou.';
  end if;
  if est <> '42501' or msg not like '%vínculo desvinculado não volta%' then
    raise exception 'VERMELHO PELO MOTIVO ERRADO (caso E4b, lixeira): % "%"', est, msg;
  end if;
end $$;

-- E5: a MESMA empresa com duas maquininhas no mesmo EC — permitido.
create or replace function pg_temp.prova_irmas_permitidas() returns void language plpgsql as $$
declare n bigint; ec bigint := current_setting('guarda.ec')::bigint;
begin
  begin
    perform pg_temp.vincular(current_setting('guarda.oa')::uuid, 5, ec);
  exception when others then
    raise exception 'CASO E5 FALHOU: a segunda maquininha da MESMA loja foi recusada ("%") — as irmãs são legítimas.', SQLERRM;
  end;
  reset role;
  select count(*) into n from public.pinbank_vinculos
   where codigo_cliente = ec and excluido_em is null and org_id = current_setting('guarda.oa')::uuid;
  if n <> 2 then
    raise exception 'CASO E5 FALHOU: a segunda maquininha da MESMA loja não entrou (% vínculo(s) com o EC) — as irmãs são legítimas.', n;
  end if;
end $$;

-- E6: desvinculado na outra empresa, o EC vai para a nova.
create or replace function pg_temp.prova_ec_liberado() returns void language plpgsql as $$
declare v uuid; ec bigint := current_setting('guarda.ec')::bigint;
begin
  begin
    perform pg_temp.desvincular(current_setting('guarda.va')::uuid);
  exception when others then
    raise exception 'CASO E6 FALHOU: a plataforma não conseguiu desvincular a maquininha de A: %', SQLERRM;
  end;
  reset role;
  begin
    v := pg_temp.vincular(current_setting('guarda.ob')::uuid, 6, ec);
  exception when others then
    raise exception 'CASO E6 FALHOU: com o vínculo de A desvinculado, o EC não pôde ir para B ("%") — o excluído continua prendendo o EC.', SQLERRM;
  end;
  reset role;
  if not exists (select 1 from public.pinbank_vinculos where id = v and org_id = current_setting('guarda.ob')::uuid and codigo_cliente = ec) then
    raise exception 'CASO E6 FALHOU: com o vínculo de A desvinculado, o EC não pôde ir para B.';
  end if;
end $$;

-- E7: EC zero ou negativo é recusado.
create or replace function pg_temp.prova_ec_nao_positivo() returns void language plpgsql as $$
declare msg text; est text; ec bigint;
begin
  foreach ec in array array[0::bigint, -5::bigint] loop
    begin
      perform pg_temp.vincular(current_setting('guarda.oa')::uuid, 7, ec);
      msg := null;
    exception when others then msg := SQLERRM; est := SQLSTATE;
    end;
    reset role;
    if msg is null then raise exception 'CASO E7 FALHOU: o EC % foi aceito.', ec; end if;
    if est <> '23514' or msg not like '%(EC) ' || ec || ' não é válido%' then
      raise exception 'VERMELHO PELO MOTIVO ERRADO (caso E7): esperado o EC inválido (23514), veio % "%"', est, msg;
    end if;
  end loop;
end $$;

-- E8: o gatilho nas colunas que decidem; a trava pela CHAVE do EC, ANTES de conferir — no texto e de fato
-- (pg_locks); e a RESTRIÇÃO DE EXCLUSÃO, que trava sozinha (vale em qualquer nível de isolamento).
create or replace function pg_temp.prova_trava_do_ec() returns void language plpgsql as $$
declare def text; tg text; msg text; est text; n bigint; v uuid;
        trava constant text := 'perform pg_advisory_xact_lock(hashtext(''a4p.pinbank_vinculos.codigo_cliente''), hashint8(new.codigo_cliente));';
        ec_c bigint := current_setting('guarda.ec_c')::bigint;
begin
  select pg_get_triggerdef(t.oid) into tg from pg_trigger t
   where t.tgrelid = 'public.pinbank_vinculos'::regclass and t.tgname = 'pinbank_vinculos_ec_uma_empresa' and t.tgenabled <> 'D';
  if tg is null or tg not like '%BEFORE INSERT OR UPDATE OF codigo_cliente, org_id, excluido_em ON public.pinbank_vinculos FOR EACH ROW%' then
    raise exception 'CASO E8 FALHOU: o gatilho do EC não está (ligado) antes de gravar o EC, a empresa ou a exclusão: %', tg;
  end if;
  def := pg_get_functiondef('public.pinbank_vinculo_ec_uma_empresa()'::regprocedure);
  if def not like '%SECURITY DEFINER%' then
    raise exception 'CASO E8 FALHOU: o gatilho do EC não é SECURITY DEFINER: não enxergaria os vínculos das outras empresas.';
  end if;
  if strpos(def, trava) = 0 then
    raise exception 'CASO E8 FALHOU: a trava do gatilho não é pela chave do EC (%): duas gravações do mesmo EC não esperariam uma pela outra.', trava;
  end if;
  if def !~ 'perform pg_advisory_xact_lock\(hashtext\(''a4p\.pinbank_vinculos\.codigo_cliente''\), hashint8\(new\.codigo_cliente\)\);\s*if exists \(' then
    raise exception 'CASO E8 FALHOU: a trava do EC vem depois de conferir (o "if exists" tem de vir logo depois dela): a segunda gravação conferiria antes de esperar a primeira.';
  end if;
  -- De fato: gravar um EC novo segura a trava DESTA chave (e não a da linha, nem a da empresa).
  begin
    v := pg_temp.vincular(current_setting('guarda.oa')::uuid, 10, ec_c);
  exception when others then
    raise exception 'CASO E8 FALHOU: vincular o EC % em A (nenhum outro vínculo o tem) foi recusado: %', ec_c, SQLERRM;
  end;
  reset role;
  select count(*) into n from pg_locks l
   where l.locktype = 'advisory' and l.pid = pg_backend_pid() and l.objsubid = 2
     and l.classid = (hashtext('a4p.pinbank_vinculos.codigo_cliente')::bigint & 4294967295)::oid
     and l.objid = (hashint8(ec_c)::bigint & 4294967295)::oid;
  if n <> 1 then
    raise exception 'CASO E8 FALHOU: gravar o EC % não segurou a trava da chave do EC (% trava(s) dela em pg_locks): a trava é por outra chave.', ec_c, n;
  end if;
  -- A restrição trava SOZINHA: com o gatilho do EC desligado, o EC vivo de A não entra em B.
  if not exists (select 1 from pg_constraint c where c.conrelid = 'public.pinbank_vinculos'::regclass
                  and c.conname = 'pinbank_vinculos_ec_uma_empresa_excl' and c.contype = 'x') then
    raise exception 'CASO E8 FALHOU: sem a restrição de exclusão do EC — a trava depende só do gatilho, e em REPEATABLE READ duas empresas ficariam com o mesmo EC.';
  end if;
  begin
    alter table public.pinbank_vinculos disable trigger pinbank_vinculos_ec_uma_empresa;
    begin
      insert into public.pinbank_vinculos (org_id, estabelecimento_id, codigo_cliente)
      values (current_setting('guarda.ob')::uuid, current_setting('guarda.estab')::bigint + 11, current_setting('guarda.ec')::bigint);
      msg := null; est := null;
    exception when others then msg := SQLERRM; est := SQLSTATE;
    end;
    -- Desfaz o desligamento do gatilho (e a linha, se ela tiver entrado).
    raise exception using message = 'a4p-guarda-desfaz';
  exception when others then
    if SQLERRM <> 'a4p-guarda-desfaz' then raise; end if;
  end;
  if msg is null or est <> '23P01' or msg not like '%pinbank_vinculos_ec_uma_empresa_excl%' then
    raise exception 'CASO E8 FALHOU: com o gatilho desligado, o EC de A entrou em B (ou foi recusado por outro motivo: % "%") — a restrição de exclusão não trava sozinha.', est, msg;
  end if;
end $$;

-- E9: a lixeira da EMPRESA não alcança o vínculo da PLATAFORMA — e ele só sai junto com a empresa.
create or replace function pg_temp.prova_lixeira_nao_alcanca() returns void language plpgsql as $$
declare msg text; est text; n bigint; lista jsonb;
        va uuid := current_setting('guarda.va')::uuid; un uuid := current_setting('guarda.un')::uuid;
        ua uuid := current_setting('guarda.ua')::uuid; cc uuid := current_setting('guarda.cc')::uuid;
begin
  -- (a) o LANÇADOR de A não tira a maquininha pela lixeira (sem o motivo e o rastro da plataforma).
  perform pg_temp.como(un);
  set local role authenticated;
  begin
    perform public.excluir_logico('pinbank_vinculos', va::text, 'tirando a maquininha pela lixeira');
    msg := null; est := null;
  exception when others then msg := SQLERRM; est := SQLSTATE;
  end;
  reset role;
  if msg is null or exists (select 1 from public.pinbank_vinculos where id = va and excluido_em is not null) then
    raise exception 'CASO E9 FALHOU: o LANÇADOR de A excluiu a maquininha pela lixeira, sem o motivo e o rastro da plataforma.';
  end if;
  if est <> '42501' or msg not like '%só a plataforma desvincula%' then
    raise exception 'VERMELHO PELO MOTIVO ERRADO (caso E9, excluir): % "%"', est, msg;
  end if;
  -- (b) desvinculada pela plataforma, ela NÃO aparece na lixeira da empresa — e o que a empresa tirou, sim.
  begin
    perform pg_temp.desvincular(va);
  exception when others then
    raise exception 'CASO E9 FALHOU: a plataforma não conseguiu desvincular a maquininha de A: %', SQLERRM;
  end;
  reset role;
  perform pg_temp.como(un);
  set local role authenticated;
  begin
    perform public.excluir_logico('cost_centers', cc::text, 'controle da guarda da lixeira');
  exception when others then
    raise exception 'GUARDA INVÁLIDA (caso E9): o lançador não mandou o centro de custo de controle para a lixeira: %', SQLERRM;
  end;
  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into lista from public.lixeira_listar(90) x;
  reset role;
  if exists (select 1 from jsonb_array_elements(lista) e where e ->> 'entidade' = 'pinbank_vinculos') then
    raise exception 'CASO E9 FALHOU: a lixeira da empresa lista a maquininha desvinculada pela plataforma (com o e-mail e o motivo da plataforma, ao lado de um "Restaurar").';
  end if;
  if not exists (select 1 from jsonb_array_elements(lista) e where e ->> 'entidade' = 'cost_centers' and e ->> 'id' = cc::text) then
    raise exception 'CASO E9 FALHOU: a lixeira da empresa deixou de listar o que a EMPRESA tirou (o centro de custo de controle sumiu): %', lista;
  end if;
  -- (c) o TITULAR de A não apaga de vez o vínculo desvinculado (o registro da plataforma).
  perform pg_temp.como(ua);
  set local role authenticated;
  begin
    perform public.lixeira_expurgar('pinbank_vinculos', va::text, 'apagar de vez o registro da plataforma');
    msg := null; est := null;
  exception when others then msg := SQLERRM; est := SQLSTATE;
  end;
  reset role;
  if msg is null or not exists (select 1 from public.pinbank_vinculos where id = va) then
    raise exception 'CASO E9 FALHOU: o TITULAR de A apagou em definitivo o vínculo desvinculado pela plataforma.';
  end if;
  if est <> '42501' or msg not like '%não se apaga%' then
    raise exception 'VERMELHO PELO MOTIVO ERRADO (caso E9, expurgar): % "%"', est, msg;
  end if;
  -- (d) … mas sai JUNTO com a empresa: com a empresa já inexistente (o que a cascata de `organizations`
  -- encontra), o apagar passa. Simulado num subbloco desfeito: sem a chave estrangeira e sem a trilha
  -- (as duas recusariam uma empresa que não existe), o vínculo aponta para uma empresa que não existe.
  begin
    alter table public.pinbank_vinculos disable trigger zz_auditar_pinbank_vinculos;
    alter table public.pinbank_vinculos drop constraint pinbank_vinculos_org_id_fkey;
    update public.pinbank_vinculos set org_id = gen_random_uuid() where id = va;
    begin
      delete from public.pinbank_vinculos where id = va;
      msg := null;
    exception when others then msg := SQLERRM;
    end;
    select count(*) into n from public.pinbank_vinculos where id = va;
    raise exception using message = 'a4p-guarda-desfaz';
  exception when others then
    if SQLERRM <> 'a4p-guarda-desfaz' then raise; end if;
  end;
  if msg is not null or n <> 0 then
    raise exception 'CASO E9 FALHOU: o vínculo de uma empresa que já não existe não se apagou (%) — apagar a empresa ficaria preso na maquininha.', coalesce(msg, 'a linha ficou');
  end if;
end $$;

grant execute on all functions in schema pg_temp to authenticated, service_role, anon;

------------------------------- L1. a empresa reserva, e a reserva deixa rastro ---
savepoint caso;
do $l1$
declare r jsonb; l public.pinbank_conferencia_limite; n bigint;
        oa uuid := current_setting('guarda.oa')::uuid; ua uuid := current_setting('guarda.ua')::uuid; va uuid := current_setting('guarda.va')::uuid;
begin
  if (pg_temp.linha(oa)).org_id is not null then raise exception 'GUARDA INVÁLIDA: a empresa A já tinha reserva.'; end if;
  r := pg_temp.reservar(ua, va);
  if r <> '{"ok": true}'::jsonb then raise exception 'CASO L1 FALHOU: o titular de A não reservou: %', r; end if;
  l := pg_temp.linha(oa);
  if l.ultima_em is distinct from now() or l.por is distinct from ua or l.vinculo_id is distinct from va then
    raise exception 'CASO L1 FALHOU: a reserva não guardou quem, quando e a maquininha: %', to_jsonb(l);
  end if;
  select count(*) into n from public.audit_log
   where org_id = oa and acao = 'pinbank_conferencia_limite.criar' and usuario = ua::text
     and depois ->> 'vinculo_id' = va::text;
  if n <> 1 then raise exception 'CASO L1 FALHOU: a reserva não deixou evento na trilha (% evento(s)).', n; end if;
end
$l1$;
rollback to savepoint caso;

----------------------- L2. antes de 60 s: recusa com o que falta, sem carimbar ---
savepoint caso;
do $l2$
declare r jsonb; oa uuid := current_setting('guarda.oa')::uuid;
begin
  perform pg_temp.prova_recusa_nao_carimba();
  -- E logo depois da que passou: falta o prazo inteiro, nunca mais que ele.
  perform pg_temp.mover(oa, interval '0 seconds');
  r := pg_temp.reservar(current_setting('guarda.ua')::uuid, current_setting('guarda.va')::uuid);
  if (r ->> 'ok')::boolean or (r ->> 'restante_ms')::bigint not between 1 and 60000 or (r ->> 'restante_ms')::bigint <> 60000 then
    raise exception 'CASO L2 FALHOU: recém-conferida, a recusa devia dizer 60000 ms (entre 1 e 60000): %', r;
  end if;
end
$l2$;
rollback to savepoint caso;

------------- L2b. o carimbo à frente do relógio da transação: no máximo 60 s, nunca mais ---
savepoint caso;
do $l2b$ begin perform pg_temp.prova_teto_da_espera(); end $l2b$;
rollback to savepoint caso;

---------------- L2c. outro administrador da MESMA empresa também espera (por empresa) ---
savepoint caso;
do $l2c$ begin perform pg_temp.prova_outra_pessoa_espera(); end $l2c$;
rollback to savepoint caso;

--------------------------------- L3. passado o prazo, passa (60 s sim, 59,999 não) ---
savepoint caso;
do $l3$
declare r jsonb; n bigint; oa uuid := current_setting('guarda.oa')::uuid; ua uuid := current_setting('guarda.ua')::uuid; va uuid := current_setting('guarda.va')::uuid;
begin
  r := pg_temp.reservar(ua, va);
  perform pg_temp.mover(oa, interval '61 seconds');
  r := pg_temp.reservar(ua, va);
  if r <> '{"ok": true}'::jsonb or (pg_temp.linha(oa)).ultima_em <> now() then
    raise exception 'CASO L3 FALHOU: passados 61 s a conferência não passou (ou não carimbou): %', r;
  end if;
  perform pg_temp.mover(oa, interval '60 seconds');
  r := pg_temp.reservar(ua, va);
  if r <> '{"ok": true}'::jsonb then
    raise exception 'CASO L3 FALHOU: com exatamente 60 s a conferência foi recusada (a regra é a mesma do botão): %', r;
  end if;
  perform pg_temp.mover(oa, interval '59.999 seconds');
  r := pg_temp.reservar(ua, va);
  if (r ->> 'ok')::boolean or (r ->> 'restante_ms')::bigint <> 1 then
    raise exception 'CASO L3 FALHOU: com 59,999 s devia recusar com 1 ms: %', r;
  end if;
  -- E a trilha da reserva REPETIDA: as duas que passaram depois da primeira (61 s e 60 s) viraram evento,
  -- com quem e quando. A maquininha não mudou, então o evento traz só o novo `ultima_em` (a trilha guarda o
  -- que MUDOU). Os `mover` da guarda também viram evento, mas com o carimbo no passado — não contam aqui.
  select count(*) into n from public.audit_log
   where org_id = oa and acao = 'pinbank_conferencia_limite.alterar' and usuario = ua::text
     and (depois ->> 'ultima_em')::timestamptz = now();
  if n <> 2 then
    raise exception 'CASO L3 FALHOU: as reservas que passaram depois da primeira deixaram % evento(s) na trilha (esperado 2): a reserva repetida sumiria do rastro.', n;
  end if;
end
$l3$;
rollback to savepoint caso;

--------------------------------------------- L4. a empresa B não espera pela A ---
savepoint caso;
do $l4$
declare ra jsonb; rb jsonb; ra2 jsonb;
begin
  ra := pg_temp.reservar(current_setting('guarda.ua')::uuid, current_setting('guarda.va')::uuid);
  rb := pg_temp.reservar(current_setting('guarda.ub')::uuid, current_setting('guarda.vb')::uuid);
  ra2 := pg_temp.reservar(current_setting('guarda.ua')::uuid, current_setting('guarda.va')::uuid);
  if ra <> '{"ok": true}'::jsonb or rb <> '{"ok": true}'::jsonb then
    raise exception 'CASO L4 FALHOU: a empresa B esperou pela A (A: %, B: %) — a espera é por EMPRESA.', ra, rb;
  end if;
  if coalesce((ra2 ->> 'ok')::boolean, true) then
    raise exception 'CASO L4 FALHOU: a reserva de B liberou a A de novo: %', ra2;
  end if;
end
$l4$;
rollback to savepoint caso;

----------------------------------------- L5. o LEITOR não reserva (nem cria a linha) ---
savepoint caso;
do $l5$ begin perform pg_temp.prova_leitor_recusado(); end $l5$;
rollback to savepoint caso;

----------------------- L6. o titular de B não reserva com a maquininha de A ---
savepoint caso;
do $l6$
declare r jsonb;
begin
  r := pg_temp.reservar(current_setting('guarda.ub')::uuid, current_setting('guarda.va')::uuid);
  if r ? 'ok' or (pg_temp.linha(current_setting('guarda.oa')::uuid)).org_id is not null
     or (pg_temp.linha(current_setting('guarda.ob')::uuid)).org_id is not null then
    raise exception 'CASO L6 FALHOU: o titular de B reservou com a maquininha de A (%): gastaria a espera da empresa alheia.', r;
  end if;
  if r ->> 'estado' <> '42501' then raise exception 'VERMELHO PELO MOTIVO ERRADO (caso L6): %', r; end if;
end
$l6$;
rollback to savepoint caso;

--------------------------------------- L7. a maquininha desvinculada não reserva ---
savepoint caso;
do $l7$ begin perform pg_temp.prova_excluido_recusado(); end $l7$;
rollback to savepoint caso;

------------------- L7b. a maquininha INATIVA e a SEM o EC não reservam (no banco) ---
savepoint caso;
do $l7b$ begin perform pg_temp.prova_inativo_ou_sem_ec_recusado(); end $l7b$;
rollback to savepoint caso;

--------------- L8. sem sessão não reserva; anon e serviço nem executam a função ---
savepoint caso;
do $l8$
declare msg text; va uuid := current_setting('guarda.va')::uuid; papel text;
begin
  -- authenticated sem `sub`: auth.uid() nulo.
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', '', true);
  set local role authenticated;
  begin
    perform public.pinbank_conferencia_reservar(va);
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  reset role;
  if msg is null or msg not like '%só quem administra%' then
    raise exception 'CASO L8 FALHOU: sem sessão a reserva não foi recusada pela regra ("%").', msg;
  end if;
  foreach papel in array array['anon', 'service_role'] loop
    perform pg_temp.sem_sessao();
    execute format('set local role %I', papel);
    begin
      perform public.pinbank_conferencia_reservar(va);
      msg := null;
    exception when others then msg := SQLERRM;
    end;
    reset role;
    if msg is null or msg not like '%permission denied for function pinbank_conferencia_reservar%' then
      raise exception 'CASO L8 FALHOU: % executou a reserva (ou foi recusado por outro motivo: "%").', papel, msg;
    end if;
  end loop;
end
$l8$;
rollback to savepoint caso;

------------------------------ L9. ninguém do cliente lê nem escreve a tabela direto ---
savepoint caso;
do $l9$
declare msg text; papel text; cmd text;
begin
  foreach papel in array array['authenticated', 'anon', 'service_role'] loop
    foreach cmd in array array[
      'select count(*) from public.pinbank_conferencia_limite',
      format('insert into public.pinbank_conferencia_limite (org_id, ultima_em, por) values (%L, now() - interval ''1 day'', %L)', current_setting('guarda.oa'), current_setting('guarda.ua')),
      'update public.pinbank_conferencia_limite set ultima_em = now() - interval ''1 day''',
      'delete from public.pinbank_conferencia_limite'] loop
      perform pg_temp.como(current_setting('guarda.ua')::uuid);
      execute format('set local role %I', papel);
      begin
        execute cmd;
        msg := null;
      exception when others then msg := SQLERRM;
      end;
      reset role;
      if msg is null or msg not like '%permission denied for table pinbank_conferencia_limite%' then
        raise exception 'CASO L9 FALHOU: % fez "%" direto na tabela do limite (ou foi recusado por outro motivo: "%") — bastaria apagar a linha para furar a espera.', papel, cmd, msg;
      end if;
    end loop;
  end loop;
end
$l9$;
rollback to savepoint caso;

--------------------------------- E1. o painel da plataforma mostra o EC de cada vínculo ---
savepoint caso;
do $e1$
declare painel jsonb; v jsonb;
begin
  perform pg_temp.como(current_setting('guarda.up')::uuid);
  set local role authenticated;
  painel := public.admin_pinbank_painel();
  reset role;
  select x into v from jsonb_array_elements(painel -> 'vinculos') x where x ->> 'id' = current_setting('guarda.va');
  if v is null or not (v ? 'codigo_cliente') or (v ->> 'codigo_cliente')::bigint <> current_setting('guarda.ec')::bigint then
    raise exception 'CASO E1 FALHOU: o painel não mostra o EC do vínculo (ninguém veria um dígito trocado): %', v;
  end if;
end
$e1$;
rollback to savepoint caso;

----------------------- E2. o rastro da plataforma guarda o EC (vincular e desvincular) ---
savepoint caso;
do $e2$ begin perform pg_temp.prova_rastro_do_ec(); end $e2$;
rollback to savepoint caso;

------------------------------ E3. o EC vivo de A em OUTRA empresa: a RPC recusa ---
savepoint caso;
do $e3$ begin perform pg_temp.prova_ec_outra_empresa_recusado(); end $e3$;
rollback to savepoint caso;

------------- E4. … e direto no banco, como dono da tabela, e reativando o excluído ---
savepoint caso;
do $e4$
declare msg text; est text; ec bigint := current_setting('guarda.ec')::bigint; vb uuid := current_setting('guarda.vb')::uuid;
        va uuid := current_setting('guarda.va')::uuid; nova uuid; n bigint;
begin
  -- INSERT direto (o dono da tabela passa por cima da política, não do gatilho nem da restrição).
  begin
    insert into public.pinbank_vinculos (org_id, estabelecimento_id, codigo_cliente)
    values (current_setting('guarda.ob')::uuid, current_setting('guarda.estab')::bigint + 3, ec);
    msg := null;
  exception when others then msg := SQLERRM; est := SQLSTATE;
  end;
  if msg is null or est <> '23505' or msg not like '%(EC) ' || ec || ' já está vinculado a outra empresa%' then
    raise exception 'CASO E4 FALHOU: o INSERT direto pôs o EC de A em B (ou foi recusado por outro motivo: % "%").', est, msg;
  end if;
  -- UPDATE direto: B passa a dizer o EC de A. (`est` zerado no sucesso: senão o vermelho
  -- citaria o 23505 do INSERT acima como se fosse deste passo.)
  begin
    update public.pinbank_vinculos set codigo_cliente = ec where id = vb;
    msg := null; est := null;
  exception when others then msg := SQLERRM; est := SQLSTATE;
  end;
  if msg is null or est <> '23505' then
    raise exception 'CASO E4 FALHOU: o UPDATE direto trocou o EC de B para o de A (ou outro motivo: % "%").', est, msg;
  end if;
  -- Reativar o excluído: A desvincula, B recebe o EC, e o vínculo antigo de A não volta à vida.
  begin
    perform pg_temp.desvincular(va);
  exception when others then
    raise exception 'CASO E4 FALHOU: a plataforma não conseguiu desvincular a maquininha de A: %', SQLERRM;
  end;
  reset role;
  begin
    nova := pg_temp.vincular(current_setting('guarda.ob')::uuid, 4, ec);
  exception when others then
    raise exception 'CASO E4 FALHOU: com a maquininha de A desvinculada, o EC não pôde ir para B: %', SQLERRM;
  end;
  reset role;
  begin
    update public.pinbank_vinculos set excluido_em = null, excluido_por = null, excluido_motivo = null where id = va;
    msg := null; est := null;
  exception when others then msg := SQLERRM; est := SQLSTATE;
  end;
  select count(distinct org_id) into n from public.pinbank_vinculos where codigo_cliente = ec and excluido_em is null;
  if msg is null or n > 1 then
    raise exception 'CASO E4 FALHOU: reativar o vínculo excluído de A pôs o EC vivo em % empresas.', n;
  end if;
  if est <> '42501' or msg not like '%vínculo desvinculado não volta%' then
    raise exception 'CASO E4 FALHOU: reativar o vínculo excluído de A não foi recusado pelo ciclo da plataforma (% "%").', est, msg;
  end if;
end
$e4$;
rollback to savepoint caso;

--------------- E4b. o vínculo desvinculado não volta (à mão, nem pela lixeira) ---
savepoint caso;
do $e4b$ begin perform pg_temp.prova_reativacao_recusada(); end $e4b$;
rollback to savepoint caso;

---------------- E5. a MESMA empresa com duas maquininhas no mesmo EC: permitido ---
savepoint caso;
do $e5$ begin perform pg_temp.prova_irmas_permitidas(); end $e5$;
rollback to savepoint caso;

------------------------- E6. desvinculado na outra empresa, o EC vai para a nova ---
savepoint caso;
do $e6$ begin perform pg_temp.prova_ec_liberado(); end $e6$;
rollback to savepoint caso;

------------------------------------------------ E7. EC zero ou negativo é recusado ---
savepoint caso;
do $e7$ begin perform pg_temp.prova_ec_nao_positivo(); end $e7$;
rollback to savepoint caso;

------- E8. o gatilho, a trava pela chave do EC antes de conferir, e a restrição ---
savepoint caso;
do $e8$ begin perform pg_temp.prova_trava_do_ec(); end $e8$;
rollback to savepoint caso;

---------------------- E9. a lixeira da empresa não alcança o vínculo da plataforma ---
savepoint caso;
do $e9$ begin perform pg_temp.prova_lixeira_nao_alcanca(); end $e9$;
rollback to savepoint caso;

-- ═══════════════════════════ DEFEITOS PLANTADOS ═══════════════════════════
-- Cada um reescreve a função (ou o gatilho, ou a restrição) com o defeito,
-- dentro do savepoint, e exige que a asserção que o nomeia REPROVE — lendo a
-- mensagem.
create or replace function pg_temp.plantar(p_funcao regprocedure, p_de text, p_para text) returns void language plpgsql as $$
declare def text := pg_get_functiondef(p_funcao); novo text;
begin
  novo := replace(def, p_de, p_para);
  if novo = def then
    raise exception 'PLANTA ENVELHECIDA: o trecho "%" não está mais em %', p_de, p_funcao;
  end if;
  execute novo;
end $$;
create or replace function pg_temp.reprova(p_prova text, p_espera text, p_defeito text) returns void language plpgsql as $$
declare msg text;
begin
  begin
    execute format('select %s()', p_prova);
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  reset role;
  if msg is null then
    raise exception 'DEFEITO PLANTADO NÃO FOI PEGO: "%" — % passou.', p_defeito, p_prova;
  end if;
  if msg not like p_espera then
    raise exception 'VERMELHO PELO MOTIVO ERRADO ("%"): esperado %, veio "%"', p_defeito, p_espera, msg;
  end if;
end $$;
grant execute on all functions in schema pg_temp to authenticated, service_role, anon;

-- ── a espera (D4) ──
savepoint caso;
do $p1$ begin
  perform pg_temp.plantar('public.pinbank_conferencia_reservar(uuid)'::regprocedure,
    '  -- Recusada: a linha NÃO mudou.',
    '  update public.pinbank_conferencia_limite set ultima_em = now(), por = v_uid where org_id = v_org;
  -- Recusada: a linha NÃO mudou.');
  perform pg_temp.reprova('pg_temp.prova_recusa_nao_carimba', '%a recusa carimbou%', 'a recusa que carimba');
end $p1$;
rollback to savepoint caso;

savepoint caso;
do $p2$ begin
  perform pg_temp.plantar('public.pinbank_conferencia_reservar(uuid)'::regprocedure,
    '   where l.ultima_em <= excluded.ultima_em - v_espera
', '');
  perform pg_temp.reprova('pg_temp.prova_recusa_nao_carimba', '%passou antes de 60 s%', 'a espera que nunca recusa');
end $p2$;
rollback to savepoint caso;

savepoint caso;
do $p2b$ begin
  perform pg_temp.plantar('public.pinbank_conferencia_reservar(uuid)'::regprocedure,
    'least((extract(epoch from v_espera) * 1000)::bigint, greatest(1, v_restante))', 'greatest(1, v_restante)');
  perform pg_temp.reprova('pg_temp.prova_teto_da_espera', '%nunca mais que a regra%', 'a recusa sem o teto de 60 s');
end $p2b$;
rollback to savepoint caso;

savepoint caso;
do $p2c$ begin
  -- A espera por PESSOA, no jeito "natural": quem não foi o último a conferir passa.
  perform pg_temp.plantar('public.pinbank_conferencia_reservar(uuid)'::regprocedure,
    '   where l.ultima_em <= excluded.ultima_em - v_espera
', '   where l.ultima_em <= excluded.ultima_em - v_espera or l.por is distinct from excluded.por
');
  perform pg_temp.reprova('pg_temp.prova_outra_pessoa_espera', '%L2c FALHOU: outra pessoa da MESMA empresa não esperou%', 'a espera por pessoa (o outro administrador passa)');
end $p2c$;
rollback to savepoint caso;

savepoint caso;
do $p2d$ begin
  -- … e no jeito "atalho": quem não é o dono do carimbo reserva por cima, sem passar pela espera.
  perform pg_temp.plantar('public.pinbank_conferencia_reservar(uuid)'::regprocedure,
    '  insert into public.pinbank_conferencia_limite as l (org_id, ultima_em, por, vinculo_id)',
    '  if exists (select 1 from public.pinbank_conferencia_limite x where x.org_id = v_org and x.por is distinct from v_uid) then
    update public.pinbank_conferencia_limite set ultima_em = now(), por = v_uid, vinculo_id = p_vinculo where org_id = v_org;
    return jsonb_build_object(''ok'', true);
  end if;
  insert into public.pinbank_conferencia_limite as l (org_id, ultima_em, por, vinculo_id)');
  perform pg_temp.reprova('pg_temp.prova_outra_pessoa_espera', '%L2c FALHOU: outra pessoa da MESMA empresa não esperou%', 'outra pessoa da empresa passa (retorno antecipado)');
end $p2d$;
rollback to savepoint caso;

savepoint caso;
do $p3$ begin
  perform pg_temp.plantar('public.pinbank_conferencia_reservar(uuid)'::regprocedure,
    ' or not public.tem_permissao(''administrar'', v_org)', '');
  perform pg_temp.reprova('pg_temp.prova_leitor_recusado', '%o LEITOR reservou%', 'a RPC sem o portão de permissão');
end $p3$;
rollback to savepoint caso;

savepoint caso;
do $p4$ begin
  perform pg_temp.plantar('public.pinbank_conferencia_reservar(uuid)'::regprocedure,
    ' and v.excluido_em is null and v.ativo', ' and v.ativo');
  perform pg_temp.reprova('pg_temp.prova_excluido_recusado', '%L7 FALHOU: a maquininha DESVINCULADA (com o ativo ligado) reservou%', 'a RPC que aceita o vínculo excluído');
end $p4$;
rollback to savepoint caso;

savepoint caso;
do $p4b$ begin
  perform pg_temp.plantar('public.pinbank_conferencia_reservar(uuid)'::regprocedure,
    ' and v.excluido_em is null and v.ativo and v.codigo_cliente > 0;', ' and v.excluido_em is null and v.codigo_cliente > 0;');
  perform pg_temp.reprova('pg_temp.prova_inativo_ou_sem_ec_recusado', '%L7b FALHOU: a maquininha INATIVA reservou%', 'a RPC que aceita a maquininha inativa');
end $p4b$;
rollback to savepoint caso;

savepoint caso;
do $p4c$ begin
  perform pg_temp.plantar('public.pinbank_conferencia_reservar(uuid)'::regprocedure,
    ' and v.excluido_em is null and v.ativo and v.codigo_cliente > 0;', ' and v.excluido_em is null and v.ativo;');
  perform pg_temp.reprova('pg_temp.prova_inativo_ou_sem_ec_recusado', '%L7b FALHOU: a maquininha SEM o código do extrato (EC) reservou%', 'a RPC que aceita a maquininha sem o EC');
end $p4c$;
rollback to savepoint caso;

-- ── o EC de uma empresa só (D10) ──
savepoint caso;
do $p5$ begin
  -- Sem o gatilho olhar OUTRA empresa, a restrição ainda recusa — mas com o erro cru, não com a frase.
  perform pg_temp.plantar('public.pinbank_vinculo_ec_uma_empresa()'::regprocedure,
    'and v.org_id <> new.org_id', 'and v.org_id = new.org_id');
  perform pg_temp.reprova('pg_temp.prova_ec_outra_empresa_recusado', '%E3 FALHOU: a recusa do EC repetido não é a frase nomeada%', 'o gatilho que não olha outra empresa');
end $p5$;
rollback to savepoint caso;

savepoint caso;
do $p5b$ begin
  -- … e sem a restrição também, o EC fica vivo nas DUAS empresas.
  perform pg_temp.plantar('public.pinbank_vinculo_ec_uma_empresa()'::regprocedure,
    'and v.org_id <> new.org_id', 'and v.org_id = new.org_id');
  perform pg_temp.restricao(null);
  perform pg_temp.reprova('pg_temp.prova_ec_outra_empresa_recusado', '%ficou vivo em 2 empresas%', 'o gatilho que não olha outra empresa, sem a restrição');
end $p5b$;
rollback to savepoint caso;

savepoint caso;
do $p6$ begin
  perform pg_temp.plantar('public.pinbank_vinculo_ec_uma_empresa()'::regprocedure,
    '       and v.org_id <> new.org_id
', '');
  perform pg_temp.reprova('pg_temp.prova_irmas_permitidas', '%E5 FALHOU: a segunda maquininha da MESMA loja foi recusada%', 'o gatilho que recusa as irmãs da mesma empresa');
end $p6$;
rollback to savepoint caso;

savepoint caso;
do $p6b$ begin
  perform pg_temp.restricao('exclude using gist (codigo_cliente with =) where (excluido_em is null and codigo_cliente is not null)');
  perform pg_temp.reprova('pg_temp.prova_irmas_permitidas', '%E5 FALHOU: a segunda maquininha da MESMA loja foi recusada%', 'a restrição que recusa as irmãs (o EC único até dentro da empresa)');
end $p6b$;
rollback to savepoint caso;

savepoint caso;
do $p7$ begin
  perform pg_temp.plantar('public.pinbank_vinculo_ec_uma_empresa()'::regprocedure,
    '       and v.excluido_em is null
', '');
  perform pg_temp.reprova('pg_temp.prova_ec_liberado', '%E6 FALHOU: com o vínculo de A desvinculado, o EC não pôde ir para B%', 'o gatilho em que o excluído continua prendendo o EC');
end $p7$;
rollback to savepoint caso;

savepoint caso;
do $p7b$ begin
  perform pg_temp.restricao('exclude using gist (codigo_cliente with =, org_id with <>) where (codigo_cliente is not null)');
  perform pg_temp.reprova('pg_temp.prova_ec_liberado', '%E6 FALHOU: com o vínculo de A desvinculado, o EC não pôde ir para B%', 'a restrição em que o excluído continua prendendo o EC');
end $p7b$;
rollback to savepoint caso;

savepoint caso;
do $p8$ begin
  perform pg_temp.plantar('public.pinbank_vinculo_ec_uma_empresa()'::regprocedure,
    '  if new.codigo_cliente <= 0 then', '  if false then');
  perform pg_temp.reprova('pg_temp.prova_ec_nao_positivo', '%E7 FALHOU: o EC 0 foi aceito%', 'o EC que não é positivo aceito');
end $p8$;
rollback to savepoint caso;

savepoint caso;
do $p9$ begin
  -- A trava DEPOIS de conferir (a corrida em READ COMMITTED volta a dar a frase crua, ou pior).
  perform pg_temp.plantar('public.pinbank_vinculo_ec_uma_empresa()'::regprocedure,
    '  perform pg_advisory_xact_lock(hashtext(''a4p.pinbank_vinculos.codigo_cliente''), hashint8(new.codigo_cliente));
', '');
  perform pg_temp.plantar('public.pinbank_vinculo_ec_uma_empresa()'::regprocedure,
    '  return new;
end;', '  perform pg_advisory_xact_lock(hashtext(''a4p.pinbank_vinculos.codigo_cliente''), hashint8(new.codigo_cliente));
  return new;
end;');
  perform pg_temp.reprova('pg_temp.prova_trava_do_ec', '%E8 FALHOU: a trava do EC vem depois de conferir%', 'a trava depois de conferir');
end $p9$;
rollback to savepoint caso;

savepoint caso;
do $p9b$ begin
  perform pg_temp.plantar('public.pinbank_vinculo_ec_uma_empresa()'::regprocedure,
    'hashint8(new.codigo_cliente));', 'hashtext(new.id::text));');
  perform pg_temp.reprova('pg_temp.prova_trava_do_ec', '%E8 FALHOU: a trava do gatilho não é pela chave do EC%', 'a trava pela linha (cada gravação na sua)');
end $p9b$;
rollback to savepoint caso;

savepoint caso;
do $p9c$ begin
  perform pg_temp.plantar('public.pinbank_vinculo_ec_uma_empresa()'::regprocedure,
    'pg_advisory_xact_lock(hashtext(''a4p.pinbank_vinculos.codigo_cliente''), hashint8(new.codigo_cliente))',
    'pg_advisory_xact_lock(hashtext(new.org_id::text), hashint8(new.codigo_cliente))');
  perform pg_temp.reprova('pg_temp.prova_trava_do_ec', '%E8 FALHOU: a trava do gatilho não é pela chave do EC%', 'a trava pela empresa e pelo EC (duas empresas não esperam uma pela outra)');
end $p9c$;
rollback to savepoint caso;

savepoint caso;
do $p9d$ begin
  -- O texto da trava certo, mas num ramo que nunca roda: só a prova DE FATO (pg_locks) o pega.
  perform pg_temp.plantar('public.pinbank_vinculo_ec_uma_empresa()'::regprocedure,
    '  perform pg_advisory_xact_lock(hashtext(''a4p.pinbank_vinculos.codigo_cliente''), hashint8(new.codigo_cliente));
  if exists (',
    '  if new.codigo_cliente is null then
  perform pg_advisory_xact_lock(hashtext(''a4p.pinbank_vinculos.codigo_cliente''), hashint8(new.codigo_cliente));
  if exists (select 1) then null; end if; end if;
  if exists (');
  perform pg_temp.reprova('pg_temp.prova_trava_do_ec', '%E8 FALHOU: gravar o EC % não segurou a trava da chave do EC%', 'a trava no texto, mas num ramo que nunca roda');
end $p9d$;
rollback to savepoint caso;

savepoint caso;
do $p9e$ begin
  perform pg_temp.restricao(null);
  perform pg_temp.reprova('pg_temp.prova_trava_do_ec', '%E8 FALHOU: sem a restrição de exclusão do EC%', 'sem a restrição de exclusão (a trava depende só do gatilho)');
end $p9e$;
rollback to savepoint caso;

-- ── o ciclo do vínculo é da plataforma (D10) ──
savepoint caso;
do $p10$ begin
  perform pg_temp.plantar('public.pinbank_vinculo_ciclo_da_plataforma()'::regprocedure,
    '  if old.excluido_em is not null and new.excluido_em is null then', '  if false then');
  perform pg_temp.reprova('pg_temp.prova_reativacao_recusada', '%E4b FALHOU: o vínculo desvinculado pela plataforma voltou à vida%', 'a reativação aceita');
end $p10$;
rollback to savepoint caso;

savepoint caso;
do $p11$ begin
  perform pg_temp.plantar('public.pinbank_vinculo_ciclo_da_plataforma()'::regprocedure,
    'current_setting(''a4p.pinbank_desvincular'', true) is distinct from old.id::text', 'false');
  perform pg_temp.reprova('pg_temp.prova_lixeira_nao_alcanca', '%E9 FALHOU: o LANÇADOR de A excluiu a maquininha pela lixeira%', 'a exclusão por qualquer um (a lixeira do lançador tira a maquininha)');
end $p11$;
rollback to savepoint caso;

savepoint caso;
do $p12$ begin
  perform pg_temp.plantar('public.lixeira_listar(integer)'::regprocedure,
    'and c.relname <> all (v_da_plataforma)', 'and true');
  perform pg_temp.reprova('pg_temp.prova_lixeira_nao_alcanca', '%E9 FALHOU: a lixeira da empresa lista a maquininha desvinculada%', 'a lixeira que lista o vínculo da plataforma');
end $p12$;
rollback to savepoint caso;

savepoint caso;
do $p13$ begin
  perform pg_temp.plantar('public.pinbank_vinculo_ciclo_da_plataforma()'::regprocedure,
    '    if exists (select 1 from public.organizations o where o.id = old.org_id) then', '    if false then');
  perform pg_temp.reprova('pg_temp.prova_lixeira_nao_alcanca', '%E9 FALHOU: o TITULAR de A apagou em definitivo%', 'o apagar por qualquer um (o expurgo da lixeira)');
end $p13$;
rollback to savepoint caso;

savepoint caso;
do $p13b$ begin
  perform pg_temp.plantar('public.pinbank_vinculo_ciclo_da_plataforma()'::regprocedure,
    '    if exists (select 1 from public.organizations o where o.id = old.org_id) then', '    if true then');
  perform pg_temp.reprova('pg_temp.prova_lixeira_nao_alcanca', '%E9 FALHOU: o vínculo de uma empresa que já não existe não se apagou%', 'o apagar recusado até junto com a empresa');
end $p13b$;
rollback to savepoint caso;

savepoint caso;
do $p14$ begin
  perform pg_temp.plantar('public.admin_pinbank_desvincular(uuid,text)'::regprocedure,
    '  perform set_config(''a4p.pinbank_desvincular'', p_vinculo::text, true);
', '');
  perform pg_temp.reprova('pg_temp.prova_rastro_do_ec', '%E2 FALHOU: a plataforma não conseguiu desvincular%', 'o desvincular sem a marca (a plataforma não desliga mais a loja)');
end $p14$;
rollback to savepoint caso;

do $fim$ begin raise notice 'pinbank-limite-ec: 12 casos do limite · 10 do EC · 27 defeitos plantados pegos'; end $fim$;

rollback;
