-- ═══════════════════════════════════════════════════════════════════════════
-- GUARDA DO PLANO PRO — quem paga o Pro OU o Enterprise abre as telas Pro
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/plano-pro.sql
--
-- ⚠️ O defeito que ela fixa (09/10/2026, medido em produção): `meu_plano()`
-- decidia o Pro por `ilike '%pro%'` no nome, e o Enterprise — o plano mais
-- caro — ficava de fora. O middleware usa este `pro` para mandar a rota Pro a
-- `/planos`; a única empresa pagante não abria nenhuma tela Pro.
--
-- ⚠️ As duas direções: o Enterprise ATIVO abre, e Starter, teste sem plano,
-- Enterprise vencido e cancelado NÃO abrem. Só a primeira aprovaria um
-- `pro = true` para todo mundo.
--
-- ⚠️ Teste negativo DENTRO do arquivo: a regra antiga é plantada numa
-- subtransação desfeita e o caso Enterprise tem de reprovar com ela. Se não
-- reprovar, a guarda não distingue o defeito e ela mesma falha.
--
-- ⚠️ `array_append`, nunca `falhas || 'texto'`: com o literal sem tipo o Postgres
-- resolve `text[] || unknown` como concatenação de ARRAYS e a guarda morre com
-- "malformed array literal" justamente quando acha o defeito — o vermelho sai
-- pelo motivo errado (medido ao plantar a regra antiga).
--
-- O usuário entra por `auth.users` (o gatilho de signup cria a empresa e o
-- teste grátis), como em `assinatura-bloqueio.sql`. Termina em ROLLBACK.
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

begin;

-- `meu_plano()` respondido COMO o usuário (papel e claims), como o middleware
-- o chama — o dono das funções enxergaria tudo e não provaria nada.
create function pg_temp.pro_de(u uuid) returns boolean
language plpgsql as $$
declare r boolean;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select mp.pro into r from public.meu_plano() mp;
  reset role;
  return coalesce(r, false);
end $$;

do $guarda$
declare
  u uuid := gen_random_uuid();
  o uuid;
  p_starter uuid; p_pro uuid; p_ent uuid;
  falhas text[] := '{}';
  pro boolean; antes boolean;
begin
  ---------------------------------------------------------------- montagem ---
  insert into auth.users (id, email, aud, role)
  values (u, 'plano-pro@guarda.local', 'authenticated', 'authenticated');

  select org_id into o from public.organization_members where user_id = u limit 1;
  if o is null then
    raise exception 'GUARDA INVÁLIDA: o provisionamento não criou a empresa. Nada abaixo prova coisa alguma.';
  end if;

  select id into p_starter from public.plans where name = 'Starter';
  select id into p_pro     from public.plans where name = 'Pro';
  select id into p_ent     from public.plans where name = 'Enterprise';
  if p_starter is null or p_pro is null or p_ent is null then
    raise exception 'GUARDA INVÁLIDA: os planos Starter/Pro/Enterprise não existem neste banco.';
  end if;

  ------------------------------------- 1. teste grátis SEM plano: Simples ---
  if pg_temp.pro_de(u) then
    falhas := array_append(falhas, 'teste grátis SEM plano abriu o Pro');
  end if;

  ---------------------------------------------------- 2. Pro ativo: abre ----
  update public.subscriptions set plan_id = p_pro, status = 'active', current_period_end = null where org_id = o;
  if not pg_temp.pro_de(u) then
    falhas := array_append(falhas, 'Pro ATIVO não abriu o Pro');
  end if;

  ----------------------------------- 3. ENTERPRISE ativo: abre (o defeito) ---
  update public.subscriptions set plan_id = p_ent, status = 'active', current_period_end = null where org_id = o;
  if not pg_temp.pro_de(u) then
    falhas := array_append(falhas, 'ENTERPRISE ATIVO não abriu o Pro');
  end if;

  ----------------------------------- 4. Enterprise que vence HOJE: abre ----
  -- O dia do fim ainda vale (`>=`), a mesma borda do bloqueio suave.
  update public.subscriptions set current_period_end = current_date where org_id = o;
  if not pg_temp.pro_de(u) then
    falhas := array_append(falhas, 'Enterprise no ÚLTIMO dia não abriu o Pro');
  end if;

  --------------------------------------- 5. Enterprise VENCIDO: não abre ----
  update public.subscriptions set current_period_end = current_date - 1 where org_id = o;
  if pg_temp.pro_de(u) then
    falhas := array_append(falhas, 'Enterprise VENCIDO abriu o Pro');
  end if;

  ------------------------------------- 6. Enterprise CANCELADO: não abre ----
  update public.subscriptions set status = 'canceled', current_period_end = null where org_id = o;
  if pg_temp.pro_de(u) then
    falhas := array_append(falhas, 'Enterprise CANCELADO abriu o Pro');
  end if;

  ------------------------------------------- 7. Starter ativo: não abre -----
  update public.subscriptions set plan_id = p_starter, status = 'active', current_period_end = null where org_id = o;
  if pg_temp.pro_de(u) then
    falhas := array_append(falhas, 'Starter ATIVO abriu o Pro');
  end if;

  ------------------------------------------- 8. teste grátis do Pro: abre ---
  update public.subscriptions set plan_id = p_pro, status = 'trial', current_period_end = current_date + 7 where org_id = o;
  if not pg_temp.pro_de(u) then
    falhas := array_append(falhas, 'teste grátis do PLANO Pro não abriu o Pro');
  end if;

  --------------------------- 9. TESTE NEGATIVO: a regra antiga plantada ----
  -- Enterprise ativo de novo; com a regra antiga (`ilike '%pro%'` só) ele TEM
  -- de ficar de fora. A subtransação desfaz a planta.
  update public.subscriptions set plan_id = p_ent, status = 'active', current_period_end = null where org_id = o;
  antes := pg_temp.pro_de(u);
  begin
    create or replace function public.meu_plano()
    returns table (plano text, status text, expira date, pro boolean, org_id uuid)
    language sql security definer set search_path = public as $planta$
      select coalesce(p.name, 'Simples'), coalesce(s.status, 'none'), s.current_period_end,
        (coalesce(s.status, 'none') in ('active', 'trial')
          and coalesce(p.name, '') ilike '%pro%'
          and (s.current_period_end is null or s.current_period_end >= current_date)),
        o.id
      from public.organizations o
      left join public.subscriptions s on s.org_id = o.id
      left join public.plans p on p.id = s.plan_id
      where o.id = public.auth_org_id();
    $planta$;
    pro := pg_temp.pro_de(u);
    raise exception 'desfaz_planta';
  exception when raise_exception then
    if sqlerrm <> 'desfaz_planta' then raise; end if;
  end;
  if pro then
    falhas := array_append(falhas, 'TESTE NEGATIVO INVÁLIDO: com a regra antiga plantada o Enterprise continuou abrindo — esta guarda não distingue o defeito');
  end if;
  -- A planta foi desfeita: a resposta voltou a ser a de antes da planta.
  if pg_temp.pro_de(u) is distinct from antes then
    falhas := array_append(falhas, 'a planta do teste negativo NÃO foi desfeita');
  end if;

  ------------------------------------------------------------------ fim -----
  if array_length(falhas, 1) is not null then
    raise exception E'PLANO PRO QUEBRADO:\n  · %', array_to_string(falhas, E'\n  · ');
  end if;

  raise notice '✓ plano Pro — Pro e Enterprise ativos abrem (até o último dia) · teste sem plano, Starter, vencido e cancelado não abrem · a regra antiga plantada reprova o Enterprise';
end
$guarda$;

rollback;
