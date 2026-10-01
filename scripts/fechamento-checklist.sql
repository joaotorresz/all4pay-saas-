-- ═══════════════════════════════════════════════════════════════════════════
-- GUARDA DO CHECKLIST DE FECHAMENTO — a máquina e a trava no BANCO
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/fechamento-checklist.sql
--
-- ⚠️ A regra do checklist mora em DOIS lugares de propósito: `core/close/
-- checklist` (a cópia que a tela pergunta antes do clique, provada no
-- `engine-audit`) e o gatilho `close_tasks_maquina` (quem autoriza). A guarda
-- pura prova a DECISÃO; esta prova a FECHADURA — inclusive as portas que a
-- tela nunca usa (`update` direto pelo PostgREST, `excluir_logico`).
--
-- É UMA jornada, em ordem (concluir → revisar → travar → congelar), não casos
-- independentes: cada passo depende do estado do anterior, e isso é o que se
-- quer provar. Tudo termina em ROLLBACK; qualquer asserção que falhe LEVANTA
-- exceção (nunca só imprime "FALHA").
--
-- ⚠️ O teste negativo está no FIM: o gatilho é DESLIGADO dentro da transação e
-- a mesma asserção da segregação tem de reprovar NOMEANDO a segregação. Sem
-- isso, "a guarda passa" não distingue "a fechadura existe" de "a asserção
-- não testa nada".
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

begin;

create function pg_temp.espera_erro(p_sql text, p_trecho text) returns text language plpgsql as $$
declare msg text;
begin
  begin
    execute p_sql;
  exception when others then
    msg := sqlerrm;
    if msg not like '%' || p_trecho || '%' then
      raise exception 'VERMELHO PELO MOTIVO ERRADO: esperava "%", veio "%"', p_trecho, msg;
    end if;
    return msg;
  end;
  raise exception 'NÃO REPROVOU: esperava erro "%" em: %', p_trecho, p_sql;
end $$;
create function pg_temp.confere(p_ok boolean, p_caso text) returns text language plpgsql as $$
begin
  if p_ok is not true then raise exception 'FALHA %', p_caso; end if;
  return 'OK ' || p_caso;
end $$;
create function pg_temp.como(p_uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true), set_config('request.jwt.claim.sub', p_uid::text, true);
$$;
create function pg_temp.root() returns void language sql as $$ select set_config('role', 'postgres', true); $$;

-- ana = titular da empresa A · bia = lançadora na A (depois fechadora) · caio = outra empresa
insert into auth.users (id, email, raw_user_meta_data) values
 ('f3c40000-0000-4000-8000-00000000000a', 'checklist-ana@guarda.local', '{"company":"Checklist A"}'),
 ('f3c40000-0000-4000-8000-00000000000b', 'checklist-bia@guarda.local', '{"company":"Checklist B"}'),
 ('f3c40000-0000-4000-8000-00000000000c', 'checklist-caio@guarda.local', '{"company":"Checklist C"}');
create temp table ctx as
  select org_id as org from public.organization_members where user_id = 'f3c40000-0000-4000-8000-00000000000a' limit 1;
select pg_temp.confere((select count(*) = 1 from ctx), 'montagem: o signup criou a empresa da ana');
grant select on ctx to authenticated;
insert into public.organization_members (org_id, user_id, role)
  select org, 'f3c40000-0000-4000-8000-00000000000b', 'lancador' from ctx
  on conflict (org_id, user_id) do update set role = 'lancador';
insert into public.user_active_org (user_id, org_id)
  select 'f3c40000-0000-4000-8000-00000000000b', org from ctx
  on conflict (user_id) do update set org_id = excluded.org_id;

-- 1 · só a ana é habilitada (bia é lançadora): autorrevisão PERMITIDA e CARIMBADA
select pg_temp.como('f3c40000-0000-4000-8000-00000000000a');
insert into public.close_tasks (title, kind, mes, chave, responsavel_id, revisor_id, prazo)
  values ('Reconciliar bancos', 'standard', '2026-09-01', 'conciliar_bancos',
          'f3c40000-0000-4000-8000-00000000000a', 'f3c40000-0000-4000-8000-00000000000a', '2026-10-03');
update public.close_tasks set status = 'review' where chave = 'conciliar_bancos';
update public.close_tasks set status = 'done' where chave = 'conciliar_bancos';
select pg_temp.confere((select autorrevisao and revisada_por = 'f3c40000-0000-4000-8000-00000000000a'
                               and autorrevisao_motivo like '%sem outro membro%'
                          from public.close_tasks where chave = 'conciliar_bancos'),
                       '1: autorrevisão carimbada (lançadora não conta como revisora)');

-- 2 · bia vira fechadora: ana não revisa o que concluiu; bia revisa
select pg_temp.root();
update public.organization_members set role = 'fechador'
 where user_id = 'f3c40000-0000-4000-8000-00000000000b' and org_id = (select org from ctx);
select pg_temp.como('f3c40000-0000-4000-8000-00000000000a');
insert into public.close_tasks (title, kind, mes, chave) values
  ('Revisar DRE', 'standard', '2026-09-01', 'revisar_dre'),
  ('Impostos', 'standard', '2026-09-01', 'conferir_impostos');
update public.close_tasks set status = 'review' where chave in ('revisar_dre', 'conferir_impostos');
select pg_temp.espera_erro($q$update public.close_tasks set status='done' where chave='revisar_dre'$q$, 'A4P-FECHAMENTO-SEGREGACAO');

-- 3 · as portas laterais da segregação, todas fechadas
select pg_temp.espera_erro($q$update public.close_tasks set mes=null, status='done' where chave='revisar_dre'$q$, 'A4P-FECHAMENTO-TRANSICAO');
select pg_temp.espera_erro($q$update public.close_tasks set mes='2026-11-01' where chave='revisar_dre'$q$, 'A4P-FECHAMENTO-TRANSICAO');
select pg_temp.espera_erro($q$update public.close_tasks set chave='outra' where chave='revisar_dre'$q$, 'A4P-FECHAMENTO-TRANSICAO');
select pg_temp.espera_erro($q$update public.close_tasks set excluido_em=now() where chave='revisar_dre'$q$, 'A4P-FECHAMENTO-TRANSICAO');
select pg_temp.espera_erro(format($q$select public.excluir_logico('close_tasks', %L, 'sumir com a tarefa aberta')$q$,
                                  (select id::text from public.close_tasks where chave = 'conferir_impostos')),
                           'A4P-FECHAMENTO-TRANSICAO');
-- uma linha antiga (sem mês) não vira tarefa do checklist pela porta dos fundos
insert into public.close_tasks (title, kind, status) values ('legado', 'standard', 'done');
select pg_temp.espera_erro($q$update public.close_tasks set mes='2026-09-01', chave='exportar_contador' where title='legado'$q$, 'A4P-FECHAMENTO-TRANSICAO');
-- carimbo não se escreve à mão
update public.close_tasks set revisada_por = 'f3c40000-0000-4000-8000-00000000000b', autorrevisao = false where chave = 'conciliar_bancos';
select pg_temp.confere((select revisada_por = 'f3c40000-0000-4000-8000-00000000000a' and autorrevisao
                          from public.close_tasks where chave = 'conciliar_bancos'), '3: carimbo preservado');
-- pular a conclusão, nascer revisada, membro de fora
insert into public.close_tasks (title, kind, mes, chave) values ('Exportar', 'standard', '2026-09-01', 'exportar_contador');
select pg_temp.espera_erro($q$update public.close_tasks set status='done' where chave='exportar_contador'$q$, 'A4P-FECHAMENTO-TRANSICAO');
select pg_temp.espera_erro($q$insert into public.close_tasks(title, kind, mes, chave, status) values ('x','standard','2026-09-01','x','done')$q$, 'nasce pendente');
select pg_temp.espera_erro($q$update public.close_tasks set responsavel_id='f3c40000-0000-4000-8000-00000000000c' where chave='exportar_contador'$q$, 'A4P-FECHAMENTO-MEMBRO');
select pg_temp.espera_erro($q$insert into public.close_tasks(title, kind, mes, chave) values ('dup','standard','2026-09-01','revisar_dre')$q$, 'close_tasks_mes_chave_uniq');

select pg_temp.como('f3c40000-0000-4000-8000-00000000000b');
update public.close_tasks set status = 'done' where chave = 'revisar_dre';
select pg_temp.confere((select not autorrevisao and revisada_por = 'f3c40000-0000-4000-8000-00000000000b'
                          from public.close_tasks where chave = 'revisar_dre'), '2: outra pessoa revisou, sem carimbo de autorrevisão');

-- 4 · a trava: sem motivo e com motivo de fachada, recusa; com motivo, trava
select pg_temp.como('f3c40000-0000-4000-8000-00000000000a');
select pg_temp.espera_erro($q$select public.fechar_periodo('2026-09', true, null)$q$, 'A4P-FECHAMENTO-TRAVA');
select pg_temp.espera_erro($q$select public.fechar_periodo('2026-09', true, 'ok, travar')$q$, 'A4P-FECHAMENTO-TRAVA');
select pg_temp.espera_erro($q$insert into public.accounting_periods(period, status) values ('2026-09-01','locked')$q$, 'A4P-FECHAMENTO-TRAVA');
select public.fechar_periodo('2026-09', true, 'Contador pediu a trava antes da conferência dos impostos');
select pg_temp.confere((select bool_and(status = 'locked' and trava_motivo like 'Contador pediu%')
                          from public.accounting_periods where period = '2026-09-01'), '4: travou com o motivo gravado');

-- 5 · mês travado congela: não muda, não sai, não ganha tarefa
select pg_temp.espera_erro($q$update public.close_tasks set status='pending' where chave='conferir_impostos'$q$, 'A4P-FECHAMENTO-MES-TRAVADO');
select pg_temp.espera_erro($q$insert into public.close_tasks(title, kind, mes, chave) values ('nova','standard','2026-09-01','nova')$q$, 'A4P-FECHAMENTO-MES-TRAVADO');

-- 6 · mês todo revisado trava sem motivo
insert into public.close_tasks (title, kind, mes, chave) values ('Out', 'standard', '2026-10-01', 'revisar_dre');
update public.close_tasks set status = 'review' where mes = '2026-10-01';
select pg_temp.como('f3c40000-0000-4000-8000-00000000000b');
update public.close_tasks set status = 'done' where mes = '2026-10-01';
select pg_temp.como('f3c40000-0000-4000-8000-00000000000a');
select public.fechar_periodo('2026-10', true, null);
select pg_temp.confere((select count(*) = 1 from public.accounting_periods where period = '2026-10-01' and status = 'locked'),
                       '6: mês todo revisado trava sem motivo');

-- 7 · outra empresa não enxerga o checklist
select pg_temp.como('f3c40000-0000-4000-8000-00000000000c');
select pg_temp.confere((select count(*) = 0 from public.close_tasks), '7: caio não vê o checklist da empresa A');

-- 8 · TESTE NEGATIVO: sem o gatilho, a asserção da segregação TEM de reprovar,
--     e reprovar dizendo que não reprovou a segregação.
select pg_temp.root();
alter table public.close_tasks disable trigger close_tasks_maquina_trg;
select pg_temp.como('f3c40000-0000-4000-8000-00000000000a');
insert into public.close_tasks (title, kind, mes, chave) values ('Plantada', 'standard', '2026-12-01', 'plantada');
update public.close_tasks set status = 'review', concluida_por = 'f3c40000-0000-4000-8000-00000000000a' where chave = 'plantada';
do $neg$
declare msg text;
begin
  begin
    perform pg_temp.espera_erro($q$update public.close_tasks set status='done' where chave='plantada'$q$, 'A4P-FECHAMENTO-SEGREGACAO');
  exception when others then msg := sqlerrm;
  end;
  if msg is null or msg not like 'NÃO REPROVOU%A4P-FECHAMENTO-SEGREGACAO%' then
    raise exception 'GUARDA CEGA: com o gatilho desligado a asserção da segregação deveria reprovar nomeando-a; veio "%"', coalesce(msg, 'nada');
  end if;
end $neg$;
select 'OK 8: sem o gatilho a guarda reprova nomeando a segregação';

rollback;
