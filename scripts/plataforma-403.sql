-- ═══════════════════════════════════════════════════════════════════════════
-- A MATRIZ DE PERFIS × ÁREA DA PLATAFORMA — todos têm de ser NEGADOS
-- ═══════════════════════════════════════════════════════════════════════════
--
--   psql "$SUPABASE_DB_URL" -f scripts/plataforma-403.sql
--
-- ⚠️ Roda contra o banco REAL e termina em ROLLBACK — nada fica gravado. É a
-- contrapartida da guarda estática (LINHA 31e da matriz de consistência): lá se
-- verifica que as três camadas EXISTEM no código; aqui se verifica que o banco
-- de verdade NEGA, com o papel de um usuário comum de verdade.
--
-- ⚠️ O perfil de ORGANIZAÇÃO não influencia `is_platform_admin` — e é
-- exatamente isso que o teste prova. Ser Admin ou Owner da própria empresa NÃO
-- dá acesso à área da plataforma; são papéis distintos, em tabelas distintas.
-- A coluna `perfil` nomeia o cenário auditado para o relatório ficar legível.
begin;

create or replace function pg_temp.matriz_perfis(p_uid uuid)
returns table(perfil text, alvo text, veredito text) language plpgsql as $$
declare p record; n int;
begin
  for p in select * from (values
      ('Leitura','leitor'),('Operacional','lancador'),('Financeiro','aprovador'),
      ('Admin da organizacao','admin'),('Owner da organizacao','owner')) t(nome,papel)
  loop
    perform set_config('request.jwt.claims',
      format('{"sub":"%s","role":"authenticated","user_role":"%s"}', p_uid, p.papel), true);
    perform set_config('role','authenticated', true);
    perfil := p.nome;

    alvo:='admin_overview (MRR/ARR)';
    begin perform public.admin_overview(); veredito:='## PASSOU ##';
    exception when others then veredito:='NEGADO'; end; return next;

    alvo:='admin_orgs (todas as organizacoes)';
    begin select count(*) into n from public.admin_orgs(); veredito:='## PASSOU ##';
    exception when others then veredito:='NEGADO'; end; return next;

    alvo:='admin_users';
    begin select count(*) into n from public.admin_users(); veredito:='## PASSOU ##';
    exception when others then veredito:='NEGADO'; end; return next;

    alvo:='admin_set_subscription (mudar plano alheio)';
    begin perform public.admin_set_subscription(gen_random_uuid(), null, 'active'); veredito:='## PASSOU ##';
    exception when others then veredito:='NEGADO'; end; return next;

    alvo:='select direto em plans';
    begin select count(*) into n from public.plans; veredito:='## PASSOU ##';
    exception when others then veredito:='NEGADO'; end; return next;

    alvo:='select direto em subscriptions';
    begin select count(*) into n from public.subscriptions; veredito:='## PASSOU ##';
    exception when others then veredito:='NEGADO'; end; return next;

    alvo:='select direto em platform_admins';
    begin select count(*) into n from public.platform_admins; veredito:='## PASSOU ##';
    exception when others then veredito:='NEGADO'; end; return next;
  end loop;
end $$;

-- Um usuário que NÃO é dono da plataforma. Falha alto se não houver nenhum:
-- rodar a matriz com o próprio dono aprovaria tudo e não testaria nada — foi
-- exatamente esse engano que produziu o relato de invasão.
do $$
declare v_uid uuid; v_passou int;
begin
  select u.id into v_uid from auth.users u
   where u.id not in (select user_id from public.platform_admins)
     and exists (select 1 from public.organization_members m where m.user_id = u.id)
   limit 1;
  if v_uid is null then
    raise exception 'Nenhum usuario nao-dono encontrado: a matriz nao testaria nada.';
  end if;
  create temp table resultado on commit drop as
    select * from pg_temp.matriz_perfis(v_uid);
  select count(*) into v_passou from resultado where veredito like '%PASSOU%';
  raise notice 'perfis x alvos: % linhas, % passaram (esperado: 0)',
    (select count(*) from resultado), v_passou;
  if v_passou > 0 then
    raise exception 'FALHA: % acesso(s) da area da plataforma concedido(s) a quem nao e dono.', v_passou;
  end if;
end $$;

select perfil, alvo, veredito from resultado order by perfil, alvo;
rollback;
