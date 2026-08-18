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
-- ⚠️ **"PERMITIDO" é medido pela SITUAÇÃO REAL, não pela ausência de exceção.**
-- Uma versão anterior lia "não deu erro" como "permitido" — e um UPDATE que a
-- RLS filtra para 0 linhas NÃO dá erro. O `bia` é criado por signup e nasce com
-- a PRÓPRIA organização como ativa; sem apontar a org ativa dele para a do
-- título, `auth_org_id(bia)` não era a org do título, o UPDATE casava 0 linhas
-- em silêncio, e a guarda lia "baixa direta permitida" onde nada acontecera.
-- Agora a org ativa é fixada, e "permitido" = a situação MUDOU de verdade.
--
-- Tudo em transação que termina em ROLLBACK. Falha com EXCEÇÃO (ON_ERROR_STOP).
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

begin;

do $guarda$
declare
  ana uuid := gen_random_uuid();
  bia uuid := gen_random_uuid();
  o uuid; c uuid; t uuid;
  sit text;
  falhas text[] := '{}';
begin
  ---------------------------------------------------------------- montagem ---
  insert into auth.users (id, email, aud, role) values
    (ana, 'central-ana@guarda.local', 'authenticated', 'authenticated'),
    (bia, 'central-bia@guarda.local', 'authenticated', 'authenticated');

  select org_id into o from public.organization_members where user_id = ana limit 1;
  if o is null then raise exception 'GUARDA INVÁLIDA: provisionamento não criou empresa'; end if;

  -- bia entra na MESMA org da ana, como aprovadora, e passa a tê-la como ATIVA.
  insert into public.organization_members (org_id, user_id, role)
  values (o, bia, 'aprovador')
  on conflict (org_id, user_id) do update set role = 'aprovador';
  insert into public.user_active_org (user_id, org_id)
  values (bia, o)
  on conflict (user_id) do update set org_id = excluded.org_id;

  select id into c from public.financial_accounts where org_id = o limit 1;

  -- Título PREVISTO, lançado pela ANA, de R$ 1.000.
  insert into public.movements (org_id, account_id, type, amount, description, status, due_date, origem, situacao, lancado_por)
  values (o, c, 'saida', 1000, 'título da central', 'pendente', current_date, 'manual', 'previsto', ana)
  returning id into t;

  -------------------------------------------- 1. BAIXA DIRETA reprova --------
  perform set_config('request.jwt.claims', json_build_object('sub', bia, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin update public.movements set situacao = 'baixado' where id = t; exception when others then end;
  reset role;
  select situacao into sit from public.movements where id = t;
  if sit = 'baixado' then falhas := array_append(falhas, 'baixa direta (previsto->baixado) foi permitida - pulou a confirmacao'); end if;

  --------------------------------------------- 2. AUTO-CONFIRMAÇÃO reprova ---
  -- A própria ANA (que lançou) tenta confirmar. A org ativa da ana é a dela.
  perform set_config('request.jwt.claims', json_build_object('sub', ana, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin update public.movements set situacao = 'confirmado' where id = t; exception when others then end;
  reset role;
  select situacao into sit from public.movements where id = t;
  if sit = 'confirmado' then falhas := array_append(falhas, 'quem lancou confirmou o proprio titulo (R1 quebrada)'); end if;

  ------------------------------------------- 3. ACIMA DA ALÇADA reprova ------
  -- Sobe o título para R$ 40.000; a bia é 'aprovador' (teto 5.000).
  update public.movements set amount = 40000 where id = t;
  perform set_config('request.jwt.claims', json_build_object('sub', bia, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin update public.movements set situacao = 'confirmado' where id = t; exception when others then end;
  reset role;
  select situacao into sit from public.movements where id = t;
  if sit = 'confirmado' then falhas := array_append(falhas, 'confirmacao acima da alcada (40.000 por aprovador de 5.000) foi permitida'); end if;

  ------------------------------------------- 4. O CAMINHO VÁLIDO passa -------
  -- Volta a R$ 1.000; a bia (aprovadora, ≠ quem lançou) confirma. Deve PASSAR.
  update public.movements set amount = 1000 where id = t;
  perform set_config('request.jwt.claims', json_build_object('sub', bia, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    update public.movements set situacao = 'confirmado' where id = t;
  exception when others then
    falhas := array_append(falhas, format('a confirmacao legitima foi recusada: %s', sqlerrm));
  end;
  reset role;
  select situacao into sit from public.movements where id = t;
  if sit <> 'confirmado' then falhas := array_append(falhas, 'a confirmacao legitima (aprovador != lancador, dentro da alcada) nao passou'); end if;

  -- E a transição foi para a trilha, com quem confirmou.
  if not exists (
    select 1 from public.central_transicoes
    where movement_id = t and de = 'previsto' and para = 'confirmado' and por = bia
  ) then
    falhas := array_append(falhas, 'a transicao confirmada NAO foi registrada em central_transicoes');
  end if;

  if not exists (select 1 from public.movements where id = t and confirmado_por = bia) then
    falhas := array_append(falhas, 'confirmado_por nao foi carimbado com quem confirmou');
  end if;

  ------------------------------------------------------------------ fim -----
  if array_length(falhas, 1) is not null then
    raise exception E'MAQUINA DE ESTADOS DA CENTRAL QUEBRADA:\n  · %', array_to_string(falhas, E'\n  · ');
  end if;
  raise notice '✓ central — baixa direta reprova · auto-confirmacao reprova · acima da alcada reprova · confirmacao legitima passa e vai para a trilha';
end
$guarda$;

rollback;
