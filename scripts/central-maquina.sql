-- ═══════════════════════════════════════════════════════════════════════════
-- GUARDA DA CENTRAL FINANCEIRA — a máquina de estados no BANCO
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/central-maquina.sql
--
-- ⚠️ As invariantes da Central são de BANCO (gatilho), e a guarda pura do
-- engine-audit não alcança o gatilho: ela prova a decisão, não a fechadura.
-- Aqui as quatro regras são exercitadas contra o Postgres de verdade:
--   1. baixa direta (previsto→baixado) REPROVA — não pula a confirmação;
--   2. auto-confirmação (quem lançou confirma o próprio) REPROVA — R1;
--   3. confirmação acima da alçada REPROVA;
--   4. a transição válida PASSA e vai para a trilha.
--
-- Tudo em transação que termina em ROLLBACK — roda seguro contra qualquer
-- banco. Falha com EXCEÇÃO (ON_ERROR_STOP), nunca com um relatório verde.
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

begin;

do $guarda$
declare
  ana uuid := gen_random_uuid();
  bia uuid := gen_random_uuid();
  o uuid; c uuid; t uuid;
  passou boolean;
  falhas text[] := '{}';
begin
  ---------------------------------------------------------------- montagem ---
  insert into auth.users (id, email, aud, role) values
    (ana, 'central-ana@guarda.local', 'authenticated', 'authenticated'),
    (bia, 'central-bia@guarda.local', 'authenticated', 'authenticated');

  select org_id into o from public.organization_members where user_id = ana limit 1;
  if o is null then raise exception 'GUARDA INVÁLIDA: provisionamento não criou empresa'; end if;

  -- bia entra na MESMA org da ana, como aprovadora (para poder confirmar).
  insert into public.organization_members (org_id, user_id, role)
  values (o, bia, 'aprovador')
  on conflict (org_id, user_id) do update set role = 'aprovador';

  select id into c from public.financial_accounts where org_id = o limit 1;

  -- Título PREVISTO, lançado pela ANA, de R$ 1.000.
  insert into public.movements (org_id, account_id, type, amount, description, status, due_date, origem, situacao, lancado_por)
  values (o, c, 'saida', 1000, 'título da central', 'pendente', current_date, 'manual', 'previsto', ana)
  returning id into t;

  -------------------------------------------- 1. BAIXA DIRETA reprova --------
  perform set_config('request.jwt.claims', json_build_object('sub', bia, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    update public.movements set situacao = 'baixado' where id = t;
    passou := true;
  exception when others then passou := false;
  end;
  reset role;
  if passou then falhas := falhas || 'baixa DIRETA (previsto→baixado) foi permitida — pulou a confirmação'; end if;

  --------------------------------------------- 2. AUTO-CONFIRMAÇÃO reprova ---
  -- A própria ANA (que lançou) tenta confirmar.
  perform set_config('request.jwt.claims', json_build_object('sub', ana, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    update public.movements set situacao = 'confirmado' where id = t;
    passou := true;
  exception when others then passou := false;
  end;
  reset role;
  if passou then falhas := falhas || 'quem LANÇOU confirmou o próprio título (R1 quebrada)'; end if;

  ------------------------------------------- 3. ACIMA DA ALÇADA reprova ------
  -- Sobe o título para R$ 40.000; a bia é 'aprovador' (teto 5.000).
  update public.movements set amount = 40000 where id = t;
  perform set_config('request.jwt.claims', json_build_object('sub', bia, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    update public.movements set situacao = 'confirmado' where id = t;
    passou := true;
  exception when others then passou := false;
  end;
  reset role;
  if passou then falhas := falhas || 'confirmação ACIMA da alçada (40.000 por aprovador de 5.000) foi permitida'; end if;

  ------------------------------------------- 4. O CAMINHO VÁLIDO passa -------
  -- Volta a R$ 1.000; a bia (aprovadora, ≠ quem lançou) confirma. Deve PASSAR.
  update public.movements set amount = 1000 where id = t;
  perform set_config('request.jwt.claims', json_build_object('sub', bia, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    update public.movements set situacao = 'confirmado' where id = t;
    passou := true;
  exception when others then
    passou := false;
    falhas := falhas || format('a confirmação LEGÍTIMA foi recusada: %s', sqlerrm);
  end;
  reset role;
  if not passou then falhas := falhas || 'a confirmação legítima (aprovador ≠ lançador, dentro da alçada) não passou'; end if;

  -- E a transição foi para a trilha, com quem confirmou.
  if not exists (
    select 1 from public.central_transicoes
    where movement_id = t and de = 'previsto' and para = 'confirmado' and por = bia
  ) then
    falhas := falhas || 'a transição confirmada NÃO foi registrada em central_transicoes';
  end if;

  -- E o carimbo de confirmado_por.
  if not exists (select 1 from public.movements where id = t and confirmado_por = bia) then
    falhas := falhas || 'confirmado_por não foi carimbado com quem confirmou';
  end if;

  ------------------------------------------------------------------ fim -----
  if array_length(falhas, 1) is not null then
    raise exception E'MÁQUINA DE ESTADOS DA CENTRAL QUEBRADA:\n  · %', array_to_string(falhas, E'\n  · ');
  end if;
  raise notice '✓ central — baixa direta reprova · auto-confirmação reprova · acima da alçada reprova · confirmação legítima passa e vai para a trilha';
end
$guarda$;

rollback;
