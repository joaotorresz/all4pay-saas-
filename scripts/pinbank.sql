-- ═══════════════════════════════════════════════════════════════════════════
-- GUARDA DA MAQUININHA PINBANK — a fechadura que só existe no banco
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/pinbank.sql
--
-- A guarda pura (`engine-audit`, bloco `pinbank:`) prova a DECISÃO: que título
-- cada evento gera, a ordem do ciclo, o estorno, a assinatura. Esta prova a
-- FECHADURA:
--
--   1. a empresa NÃO se vincula a um estabelecimento (só a plataforma);
--   2. a plataforma vincula, e o mesmo estabelecimento não cai em DUAS empresas;
--   3. o evento sem vínculo fica na quarentena, e a plataforma o vê;
--   4. vínculo não ativado não vira dinheiro;
--   5. o LEITOR não ativa; taxa digitada como percentual é recusada;
--   6. a venda aprovada vira documento + títulos (origem, espécie, autor, NSU,
--      chave) numa transação só, e deixa trilha;
--   7. a reentrega do mesmo EventId não duplica, e a versão velha é recusada;
--   8. o cancelamento cancela só o que não se moveu, pela máquina de estados;
--   9. o título com chave de outro NSU é recusado;
--  10. dado sensível no payload é recusado pelo banco;
--  11. assinatura vencida: o dinheiro não entra, e o motivo é nomeado;
--  12. a empresa B não lê nada da A; a sessão do cliente não executa as RPCs
--      de serviço nem escreve direto.
--
-- ⚠️ SAVEPOINT POR CASO, desfeito no fim de cada um — e o MESMO EventId e o
-- MESMO NSU usados de propósito em todos: se um `rollback to savepoint` deixar
-- de acontecer, o caso seguinte colide na hora em vez de passar por acidente.
-- O arreio é o de `caixa-email.sql`, copiado. Tudo termina em ROLLBACK.
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

begin;

------------------------------------------------------------------ montagem ---
do $montagem$
declare
  ua uuid := gen_random_uuid();   -- titular da empresa A
  ul uuid := gen_random_uuid();   -- leitor da empresa A
  ub uuid := gen_random_uuid();   -- titular da empresa B
  up uuid := gen_random_uuid();   -- administrador da PLATAFORMA
  oa uuid; ob uuid; ca uuid;
begin
  insert into auth.users (id, email) values
    (ua, 'pb-a@guarda.local'), (ul, 'pb-leitor@guarda.local'),
    (ub, 'pb-b@guarda.local'), (up, 'pb-plataforma@guarda.local');
  select om.org_id into oa from public.organization_members om where om.user_id = ua limit 1;
  select om.org_id into ob from public.organization_members om where om.user_id = ub limit 1;
  if oa is null or ob is null or oa = ob then
    raise exception 'GUARDA INVÁLIDA: o provisionamento não criou duas empresas.';
  end if;
  insert into public.organization_members (org_id, user_id, role) values (oa, ul, 'leitor')
    on conflict (org_id, user_id) do update set role = 'leitor';
  insert into public.user_active_org (user_id, org_id) values (ul, oa)
    on conflict (user_id) do update set org_id = excluded.org_id;
  -- A plataforma só aceita administrador de endereço PERMITIDO (com motivo).
  insert into public.platform_admin_permitidos (email, motivo)
  values ('pb-plataforma@guarda.local', 'guarda da maquininha Pinbank (desfeita no fim)')
  on conflict do nothing;
  insert into public.platform_admins (user_id, exige_mfa) values (up, false)
    on conflict (user_id) do update set exige_mfa = false, expira_em = null;

  select a.id into ca from public.financial_accounts a
   where a.org_id = oa and a.excluido_em is null and a.ativo order by a.created_at limit 1;
  if ca is null then
    raise exception 'GUARDA INVÁLIDA: a empresa A nasceu sem conta ativa (o seed mudou?).';
  end if;

  perform set_config('guarda.ua', ua::text, true);
  perform set_config('guarda.ul', ul::text, true);
  perform set_config('guarda.ub', ub::text, true);
  perform set_config('guarda.up', up::text, true);
  perform set_config('guarda.oa', oa::text, true);
  perform set_config('guarda.ob', ob::text, true);
  perform set_config('guarda.ca', ca::text, true);
  perform set_config('guarda.ev', gen_random_uuid()::text, true);
  -- ⚠️ Estabelecimentos que NÃO existem neste banco: um número fixo colidiria
  -- com um vínculo de verdade (o índice é global) e a guarda reprovaria pelo
  -- motivo errado.
  perform set_config('guarda.estab', (select coalesce(max(estabelecimento_id), 0) + 1000 from public.pinbank_vinculos)::text, true);
  perform set_config('guarda.estab_sem', (select coalesce(max(estabelecimento_id), 0) + 2000 from public.pinbank_vinculos)::text, true);
  perform set_config('guarda.doc', gen_random_uuid()::text, true);
end
$montagem$;

-- Os papéis, por função: a mesma troca de identidade em todo caso.
create or replace function pg_temp.como(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
end $$;
create or replace function pg_temp.como_servico() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

-- O plano de venda que o planejador puro devolveria (300,00 em 1x, taxa 10,50).
create or replace function pg_temp.plano_venda(p_nsu bigint, p_chave_taxa text default null) returns jsonb language sql as $$
  select jsonb_build_object(
    'acao', 'criar_venda',
    'novoEstado', jsonb_build_object('status', 'Aprovada', 'ocorridoEm', now(), 'valor', 300, 'valorOriginal', 300),
    'documento', jsonb_build_object(
      'id', current_setting('guarda.doc'), 'doc_date', current_date, 'competence_date', current_date,
      'due_date', current_date, 'account_id', current_setting('guarda.ca'), 'subtotal', 300, 'total', 300,
      'detalhe', jsonb_build_object('plataforma', 'Maquininha Pinbank', 'idExterno', p_nsu::text)),
    'itens', jsonb_build_array(jsonb_build_object('description', 'Venda na maquininha', 'qty', 1, 'unit_price', 300, 'total', 300)),
    'titulos', jsonb_build_array(
      jsonb_build_object('type', 'entrada', 'amount', 300, 'due_date', current_date + 30, 'competence_date', current_date,
                         'category', 'Vendas', 'description', 'Maquininha Pinbank · NSU', 'chave', 'pinbank:' || p_nsu || ':1:r'),
      jsonb_build_object('type', 'saida', 'amount', 10.5, 'due_date', current_date + 30, 'competence_date', current_date,
                         'category', 'Tarifas de adquirência', 'description', 'Maquininha Pinbank · NSU · taxa',
                         'chave', coalesce(p_chave_taxa, 'pinbank:' || p_nsu || ':1:t'))),
    'avisos', '[]'::jsonb)
$$;

-- Registra o evento e roda o contexto, como a rota faz. Devolve o contexto.
create or replace function pg_temp.receber(p_estab bigint, p_payload jsonb default '{}'::jsonb) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform pg_temp.como_servico();
  set local role service_role;
  perform public.pinbank_registrar_evento(current_setting('guarda.ev')::uuid, 'Compra.TransacaoRealizada', '1.0',
    '123456', now(), 123456, p_estab, null, 'Loja da guarda', p_payload);
  r := public.pinbank_contexto(current_setting('guarda.ev')::uuid);
  reset role;
  return r;
end $$;

-- A plataforma vincula o estabelecimento da guarda à empresa A.
create or replace function pg_temp.vincular_77() returns uuid language plpgsql as $$
declare v uuid;
begin
  perform pg_temp.como(current_setting('guarda.up')::uuid);
  set local role authenticated;
  v := public.admin_pinbank_vincular(current_setting('guarda.oa')::uuid, current_setting('guarda.estab')::bigint, null, 'Loja da guarda');
  reset role;
  return v;
end $$;

-- O titular de A ativa com a conta e taxas válidas.
create or replace function pg_temp.ativar(p_vinculo uuid) returns void language plpgsql as $$
begin
  perform pg_temp.como(current_setting('guarda.ua')::uuid);
  set local role authenticated;
  perform public.pinbank_configurar_vinculo(p_vinculo, current_setting('guarda.ca')::uuid,
    '{"debito":0.0199,"credito_vista":0.035}'::jsonb, '{}'::jsonb, false, true);
  reset role;
end $$;

grant execute on all functions in schema pg_temp to authenticated, service_role;

------------------------------- 1. a EMPRESA não se vincula a um estabelecimento ---
savepoint caso;
do $c1$
declare msg text;
begin
  perform pg_temp.como(current_setting('guarda.ua')::uuid);
  set local role authenticated;
  begin
    perform public.admin_pinbank_vincular(current_setting('guarda.oa')::uuid, current_setting('guarda.estab')::bigint, null, 'tentativa');
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  reset role;
  if msg is null then
    raise exception 'CASO 1 FALHOU: o titular de uma empresa se vinculou a um estabelecimento — bastaria digitar o número da loja vizinha para receber as vendas dela.';
  end if;
  if msg not like '%Acesso administrativo negado%' then
    raise exception 'VERMELHO PELO MOTIVO ERRADO (caso 1): esperado a recusa administrativa, veio "%"', msg;
  end if;
end
$c1$;
rollback to savepoint caso;

----------------- 2. a plataforma vincula; o mesmo estabelecimento não vai a DUAS ---
savepoint caso;
do $c2$
declare v uuid; msg text; n bigint;
begin
  v := pg_temp.vincular_77();
  select count(*) into n from public.pinbank_vinculos where id = v and org_id = current_setting('guarda.oa')::uuid and not ativo;
  if n <> 1 then raise exception 'CASO 2 FALHOU: o vínculo não nasceu na empresa A, inativo (% linha(s))', n; end if;
  perform pg_temp.como(current_setting('guarda.up')::uuid);
  set local role authenticated;
  begin
    perform public.admin_pinbank_vincular(current_setting('guarda.ob')::uuid, current_setting('guarda.estab')::bigint, null, 'segunda empresa');
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  reset role;
  if msg is null then
    raise exception 'CASO 2 FALHOU: o mesmo estabelecimento ficou vinculado a DUAS empresas — a mesma venda cairia nas duas.';
  end if;
  if msg not like '%pinbank_vinculos_estabelecimento_unico%' then
    raise exception 'VERMELHO PELO MOTIVO ERRADO (caso 2): esperado o índice único global, veio "%"', msg;
  end if;
end
$c2$;
rollback to savepoint caso;

------------------------------ 3. sem vínculo: quarentena, e a plataforma a vê ---
savepoint caso;
do $c3$
declare ctx jsonb; painel jsonb; s text;
begin
  ctx := pg_temp.receber(current_setting('guarda.estab_sem')::bigint);
  if ctx -> 'vinculo' <> 'null'::jsonb then
    raise exception 'CASO 3 FALHOU: um estabelecimento sem vínculo resolveu para uma empresa: %', ctx -> 'vinculo';
  end if;
  perform pg_temp.como_servico();
  set local role service_role;
  perform public.pinbank_marcar_evento(current_setting('guarda.ev')::uuid, 'sem_vinculo', 'sem vínculo');
  reset role;
  select situacao into s from public.pinbank_eventos where event_id = current_setting('guarda.ev')::uuid;
  if s <> 'sem_vinculo' then raise exception 'CASO 3 FALHOU: o evento sem vínculo ficou "%"', s; end if;
  perform pg_temp.como(current_setting('guarda.up')::uuid);
  set local role authenticated;
  painel := public.admin_pinbank_painel();
  reset role;
  if not exists (select 1 from jsonb_array_elements(painel -> 'quarentena') q where (q ->> 'estabelecimento_id')::bigint = current_setting('guarda.estab_sem')::bigint) then
    raise exception 'CASO 3 FALHOU: a quarentena da plataforma não mostra o estabelecimento sem vínculo: %', painel -> 'quarentena';
  end if;
end
$c3$;
rollback to savepoint caso;

------------------------------------------- 4. vínculo inativo não vira dinheiro ---
savepoint caso;
do $c4$
declare ctx jsonb; msg text; n bigint;
begin
  perform pg_temp.vincular_77();
  ctx := pg_temp.receber(current_setting('guarda.estab')::bigint);
  if (ctx -> 'vinculo' ->> 'ativo')::boolean then
    raise exception 'CASO 4 FALHOU: o vínculo recém-criado já veio ativo.';
  end if;
  perform pg_temp.como_servico();
  set local role service_role;
  begin
    perform public.pinbank_aplicar(current_setting('guarda.ev')::uuid, 0, pg_temp.plano_venda(123456));
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  reset role;
  if msg is null then
    raise exception 'CASO 4 FALHOU: a venda entrou sem a empresa ter ativado a maquininha (a segunda chave).';
  end if;
  if msg not like '%não está ativo%' then
    raise exception 'VERMELHO PELO MOTIVO ERRADO (caso 4): esperado vínculo inativo, veio "%"', msg;
  end if;
  select count(*) into n from public.movements where chave like 'pinbank:123456:%';
  if n <> 0 then raise exception 'CASO 4 FALHOU: % título(s) ficaram de pé.', n; end if;
end
$c4$;
rollback to savepoint caso;

---------------------- 5. o LEITOR não ativa; taxa em percentual é recusada ---
savepoint caso;
do $c5$
declare v uuid; msg text;
begin
  v := pg_temp.vincular_77();
  perform pg_temp.como(current_setting('guarda.ul')::uuid);
  set local role authenticated;
  begin
    perform public.pinbank_configurar_vinculo(v, current_setting('guarda.ca')::uuid, '{}'::jsonb, '{}'::jsonb, false, true);
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  reset role;
  if msg is null then raise exception 'CASO 5 FALHOU: o LEITOR ativou a maquininha.'; end if;
  if msg not like '%só quem administra%' then
    raise exception 'VERMELHO PELO MOTIVO ERRADO (caso 5a): esperado a recusa por papel, veio "%"', msg;
  end if;

  perform pg_temp.como(current_setting('guarda.ua')::uuid);
  set local role authenticated;
  begin
    perform public.pinbank_configurar_vinculo(v, current_setting('guarda.ca')::uuid, '{"debito":2}'::jsonb, '{}'::jsonb, false, true);
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  reset role;
  if msg is null then raise exception 'CASO 5 FALHOU: taxa 2 (200%%) aceita — alguém digitou o percentual.'; end if;
  if msg not like '%fora de 0 a 1%' then
    raise exception 'VERMELHO PELO MOTIVO ERRADO (caso 5b): esperado a faixa da taxa, veio "%"', msg;
  end if;
end
$c5$;
rollback to savepoint caso;

---------- 6/7/8. venda aprovada → documento + títulos; reentrega; cancelamento ---
savepoint caso;
do $c6$
declare v uuid; ctx jsonb; r jsonb; n bigint; msg text; ua uuid := current_setting('guarda.ua')::uuid;
        oa uuid := current_setting('guarda.oa')::uuid; numero text; s text; ids jsonb;
begin
  v := pg_temp.vincular_77();
  perform pg_temp.ativar(v);
  ctx := pg_temp.receber(current_setting('guarda.estab')::bigint);
  if not (ctx -> 'vinculo' ->> 'ativo')::boolean or ctx -> 'vinculo' ->> 'contaId' is null then
    raise exception 'CASO 6 FALHOU: o contexto não trouxe o vínculo ativo com a conta: %', ctx -> 'vinculo';
  end if;
  perform pg_temp.como_servico();
  set local role service_role;
  r := public.pinbank_aplicar(current_setting('guarda.ev')::uuid, 0, pg_temp.plano_venda(123456));
  reset role;

  select d.numero into numero from public.sales_docs d where d.id = current_setting('guarda.doc')::uuid and d.org_id = oa;
  if numero is null or numero !~ '^\d{4}-\d{4}$' then
    raise exception 'CASO 6 FALHOU: o documento da venda não nasceu numerado na empresa A (%)', numero;
  end if;
  select count(*) into n from public.movements m
   where m.org_id = oa and m.sale_doc_id = current_setting('guarda.doc')::uuid
     and m.origem = 'venda' and m.especie = 'titulo' and m.situacao = 'previsto'
     and m.lancado_por = ua and m.nsu = '123456' and m.chave like 'pinbank:123456:1:%';
  if n <> 2 then
    raise exception 'CASO 6 FALHOU: esperado 2 títulos (receita + taxa) com origem, espécie, autor, NSU e chave; vieram %', n;
  end if;
  -- ⚠️ O VALOR, não só a existência: 300 de receita e 10,50 de taxa.
  if (select sum(case when type = 'entrada' then amount else -amount end) from public.movements
       where org_id = oa and sale_doc_id = current_setting('guarda.doc')::uuid) <> 289.50 then
    raise exception 'CASO 6 FALHOU: o líquido da venda não fecha em 289,50.';
  end if;
  select count(*) into n from public.audit_log where org_id = oa and acao = 'movements.criar'
     and (depois ->> 'chave') like 'pinbank:123456:%';
  if n <> 2 then raise exception 'CASO 6 FALHOU: os títulos não deixaram evento na trilha (% evento(s))', n; end if;
  select situacao into s from public.pinbank_eventos where event_id = current_setting('guarda.ev')::uuid;
  if s <> 'processado' then raise exception 'CASO 6 FALHOU: o evento ficou "%"', s; end if;

  -- 7. A REENTREGA (mesmo EventId) soma tentativa e não cria nada.
  ctx := pg_temp.receber(current_setting('guarda.estab')::bigint);
  select tentativas into n from public.pinbank_eventos where event_id = current_setting('guarda.ev')::uuid;
  if n <> 2 then raise exception 'CASO 7 FALHOU: a reentrega não somou tentativa (%)', n; end if;
  if (ctx -> 'estado' ->> 'versao')::int <> 1 then
    raise exception 'CASO 7 FALHOU: o estado da transação não está na versão 1: %', ctx -> 'estado';
  end if;
  perform pg_temp.como_servico();
  set local role service_role;
  begin
    perform public.pinbank_aplicar(current_setting('guarda.ev')::uuid, 0, pg_temp.plano_venda(123456));
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  reset role;
  if msg is null then raise exception 'CASO 7 FALHOU: a versão VELHA foi aceita — a venda seria lançada de novo.'; end if;
  if msg not like '%A4P-PINBANK-VERSAO%' then
    raise exception 'VERMELHO PELO MOTIVO ERRADO (caso 7): esperado a versão, veio "%"', msg;
  end if;

  -- 8. O CANCELAMENTO cancela os dois títulos pela máquina de estados.
  select jsonb_agg(m.id) into ids from public.movements m where m.org_id = oa and m.sale_doc_id = current_setting('guarda.doc')::uuid;
  perform pg_temp.como_servico();
  set local role service_role;
  r := public.pinbank_aplicar(current_setting('guarda.ev')::uuid, 1, jsonb_build_object(
    'acao', 'desfazer_venda',
    'novoEstado', jsonb_build_object('status', 'Cancelada', 'ocorridoEm', now(), 'valor', 300, 'valorOriginal', 300),
    'cancelar', ids, 'estornos', '[]'::jsonb, 'statusVenda', 'cancelada', 'motivo', 'cancelada na guarda'));
  reset role;
  select count(*) into n from public.movements where org_id = oa and sale_doc_id = current_setting('guarda.doc')::uuid and situacao = 'cancelado';
  if n <> 2 then raise exception 'CASO 8 FALHOU: % de 2 títulos cancelados.', n; end if;
  select count(*) into n from public.central_transicoes where org_id = oa and para = 'cancelado' and por = ua
     and movement_id in (select (x #>> '{}')::uuid from jsonb_array_elements(ids) x);
  if n <> 2 then raise exception 'CASO 8 FALHOU: o cancelamento não passou pela máquina com o responsável (% transição(ões)).', n; end if;
  select status into s from public.sales_docs where id = current_setting('guarda.doc')::uuid;
  if s <> 'cancelada' then raise exception 'CASO 8 FALHOU: o documento ficou "%"', s; end if;
  if (select versao from public.pinbank_transacoes where org_id = oa and nsu = 123456) <> 2 then
    raise exception 'CASO 8 FALHOU: a transação não foi para a versão 2.';
  end if;
end
$c6$;
rollback to savepoint caso;

---------------------------------- 9. título com chave de OUTRO NSU é recusado ---
savepoint caso;
do $c9$
declare v uuid; msg text; n bigint;
begin
  v := pg_temp.vincular_77();
  perform pg_temp.ativar(v);
  perform pg_temp.receber(current_setting('guarda.estab')::bigint);
  perform pg_temp.como_servico();
  set local role service_role;
  begin
    perform public.pinbank_aplicar(current_setting('guarda.ev')::uuid, 0, pg_temp.plano_venda(123456, 'pinbank:999999:1:t'));
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  reset role;
  if msg is null then raise exception 'CASO 9 FALHOU: entrou um título com a chave de outra venda.'; end if;
  if msg not like '%fora do NSU%' then
    raise exception 'VERMELHO PELO MOTIVO ERRADO (caso 9): esperado a chave do NSU, veio "%"', msg;
  end if;
  -- E NADA ficou: nem o documento, nem a receita (tudo ou nada).
  select count(*) into n from public.sales_docs where id = current_setting('guarda.doc')::uuid;
  if n <> 0 then raise exception 'CASO 9 FALHOU: o documento ficou de pé sem os títulos.'; end if;
end
$c9$;
rollback to savepoint caso;

------------------------------------------- 10. dado sensível: o banco recusa ---
savepoint caso;
do $c10$
declare msg text;
begin
  begin
    perform pg_temp.receber(current_setting('guarda.estab')::bigint, '{"cartao":{"bandeira":"VISA","pan":"411111******1111"}}'::jsonb);
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  reset role;
  if msg is null then raise exception 'CASO 10 FALHOU: o PAN do cartão foi gravado.'; end if;
  if msg not like '%pinbank_eventos_sem_dado_sensivel%' then
    raise exception 'VERMELHO PELO MOTIVO ERRADO (caso 10): esperado a trava do dado sensível, veio "%"', msg;
  end if;
end
$c10$;
rollback to savepoint caso;

------------------------------- 11. assinatura vencida: o dinheiro não entra ---
savepoint caso;
do $c11$
declare v uuid; msg text;
begin
  v := pg_temp.vincular_77();
  perform pg_temp.ativar(v);
  perform pg_temp.receber(current_setting('guarda.estab')::bigint);
  insert into public.subscriptions (org_id, status, current_period_end)
  values (current_setting('guarda.oa')::uuid, 'past_due', current_date - 1)
  on conflict (org_id) do update set status = 'past_due', current_period_end = current_date - 1;
  perform pg_temp.como_servico();
  set local role service_role;
  begin
    perform public.pinbank_aplicar(current_setting('guarda.ev')::uuid, 0, pg_temp.plano_venda(123456));
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  reset role;
  if msg is null then raise exception 'CASO 11 FALHOU: a venda entrou numa empresa com assinatura vencida.'; end if;
  if msg not like '%A4P-PINBANK-BLOQUEIO%' then
    raise exception 'VERMELHO PELO MOTIVO ERRADO (caso 11): esperado o bloqueio da assinatura, veio "%"', msg;
  end if;
end
$c11$;
rollback to savepoint caso;

------------------- 12. isolamento, e a sessão do cliente não chama o serviço ---
savepoint caso;
do $c12$
declare v uuid; n bigint; msg text;
begin
  v := pg_temp.vincular_77();
  perform pg_temp.ativar(v);
  perform pg_temp.receber(current_setting('guarda.estab')::bigint);
  perform pg_temp.como_servico();
  set local role service_role;
  perform public.pinbank_aplicar(current_setting('guarda.ev')::uuid, 0, pg_temp.plano_venda(123456));
  reset role;

  -- B não vê nada de A.
  perform pg_temp.como(current_setting('guarda.ub')::uuid);
  set local role authenticated;
  select (select count(*) from public.pinbank_vinculos) + (select count(*) from public.pinbank_eventos)
       + (select count(*) from public.pinbank_transacoes) into n;
  reset role;
  if n <> 0 then raise exception 'CASO 12 FALHOU: o titular de B leu % linha(s) da maquininha de A.', n; end if;

  -- A vê o próprio.
  perform pg_temp.como(current_setting('guarda.ua')::uuid);
  set local role authenticated;
  select (select count(*) from public.pinbank_vinculos) + (select count(*) from public.pinbank_eventos)
       + (select count(*) from public.pinbank_transacoes) into n;
  -- E a sessão do cliente não executa o serviço nem escreve direto.
  begin
    perform public.pinbank_aplicar(current_setting('guarda.ev')::uuid, 1, '{"acao":"registrar"}'::jsonb);
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  reset role;
  if n <> 3 then raise exception 'CASO 12 FALHOU: o titular de A leu % de 3 linhas da própria maquininha.', n; end if;
  if msg is null or msg not like '%permission denied%' then
    raise exception 'CASO 12 FALHOU: a sessão do cliente executou pinbank_aplicar (ou foi recusada por outro motivo: "%")', msg;
  end if;
  perform pg_temp.como(current_setting('guarda.ua')::uuid);
  set local role authenticated;
  begin
    insert into public.pinbank_vinculos (org_id, estabelecimento_id) values (current_setting('guarda.oa')::uuid, 555);
    msg := null;
  exception when others then msg := SQLERRM;
  end;
  reset role;
  if msg is null or msg not like '%permission denied%' then
    raise exception 'CASO 12 FALHOU: a sessão do cliente inseriu um vínculo direto (ou foi recusada por outro motivo: "%")', msg;
  end if;
end
$c12$;
rollback to savepoint caso;

do $fim$ begin raise notice 'pinbank: 12 casos · a fechadura confere'; end $fim$;

rollback;
