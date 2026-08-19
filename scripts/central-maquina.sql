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
  caio uuid := gen_random_uuid();
  o uuid; c uuid; t uuid;
  sit text;
  erro text;
  falhas text[] := '{}';
begin
  ---------------------------------------------------------------- montagem ---
  insert into auth.users (id, email, aud, role) values
    (ana, 'central-ana@guarda.local', 'authenticated', 'authenticated'),
    (bia, 'central-bia@guarda.local', 'authenticated', 'authenticated'),
    (caio, 'central-caio@guarda.local', 'authenticated', 'authenticated');

  select org_id into o from public.organization_members where user_id = ana limit 1;
  if o is null then raise exception 'GUARDA INVÁLIDA: provisionamento não criou empresa'; end if;

  -- bia entra na MESMA org da ana, como aprovadora, e passa a tê-la como ATIVA.
  insert into public.organization_members (org_id, user_id, role)
  values (o, bia, 'aprovador')
  on conflict (org_id, user_id) do update set role = 'aprovador';
  insert into public.user_active_org (user_id, org_id)
  values (bia, o)
  on conflict (user_id) do update set org_id = excluded.org_id;

  -- caio entra na MESMA org como LANCADOR: papel real, sem a acao 'aprovar'.
  insert into public.organization_members (org_id, user_id, role)
  values (o, caio, 'lancador')
  on conflict (org_id, user_id) do update set role = 'lancador';
  insert into public.user_active_org (user_id, org_id)
  values (caio, o)
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
  -- Sobe o título para R$ 40.000; a bia é 'aprovador' (teto padrão 10.000).
  update public.movements set amount = 40000 where id = t;
  perform set_config('request.jwt.claims', json_build_object('sub', bia, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin update public.movements set situacao = 'confirmado' where id = t; exception when others then erro := sqlerrm; end;
  reset role;
  select situacao into sit from public.movements where id = t;
  if sit = 'confirmado' then
    falhas := array_append(falhas, 'confirmacao acima da alcada (40.000 por aprovador de 10.000) foi permitida');
  elsif erro is null or erro not like 'A4P-CENTRAL-ALCADA%' then
    falhas := array_append(falhas, format('recusa por alcada veio com a mensagem errada (esperado A4P-CENTRAL-ALCADA): %s', coalesce(erro,'<sem erro>')));
  end if;
  erro := null;


  ------------------------- 3b. SEM A ACAO 'aprovar' reprova (BLINDAGEM B) ----
  -- ⚠️ O caio é 'lancador': papel REAL, com linha de alçada (teto 0) e SEM a
  -- ação `aprovar`. Ele tenta confirmar R$ 1.000 — um valor pequeno. Tem de
  -- ser recusado por PERMISSÃO, não por valor: quem aprova sai de
  -- `role_permissions`, a alçada só responde QUANTO.
  update public.movements set amount = 1000 where id = t;
  perform set_config('request.jwt.claims', json_build_object('sub', caio, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin update public.movements set situacao = 'confirmado' where id = t; exception when others then erro := sqlerrm; end;
  reset role;
  select situacao into sit from public.movements where id = t;
  if sit = 'confirmado' then
    falhas := array_append(falhas, 'papel sem a acao aprovar (lancador) confirmou um titulo');
  elsif erro is null or erro not like 'A4P-CENTRAL-PERMISSAO%' then
    falhas := array_append(falhas, format('recusa do lancador veio com a mensagem errada (esperado A4P-CENTRAL-PERMISSAO): %s', coalesce(erro,'<sem erro>')));
  end if;
  erro := null;

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
  raise notice '✓ central — baixa direta reprova · auto-confirmacao reprova · sem a acao aprovar reprova (msg propria) · acima da alcada reprova (msg propria) · confirmacao legitima passa e vai para a trilha';
end
$guarda$;

-- ═══════════════════════════════════════════════════════════════════════════
-- GUARDA DA TAXONOMIA DE PAPÉIS — a alçada tem de cobrir os papéis REAIS
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ **O DEFEITO QUE ESTAS TRÊS EXISTEM PARA PEGAR.** A primeira versão da
-- migration semeava `central_alcada` com seis nomes digitados à mão
-- (leitor/lancador/aprovador/fechador/admin/titular) enquanto o gatilho lê
-- `organization_members.role`, que vale owner/admin/member na base real.
-- `central_teto('owner')` devolvia 0 e **16 dos 17 vínculos de produção não
-- confirmavam nada** — inclusive o dono. Só 'admin' funcionava, por
-- coincidência de nome.
--
-- ⚠️ A guarda de isolamento NÃO pegou isso: ela cria o usuário pelo gatilho de
-- signup, que atribui um papel que por acaso coincidia. É a mesma família do
-- furo da org nova sem alçada — agora pelo lado do NOME do papel em vez da
-- linha faltando.
do $taxonomia$
declare
  falhas text[] := '{}';
  n int;
  detalhe text;
begin
  ------------------------------------------------------------------ (a) -----
  -- Papel em uso que não tem linha de alçada na PRÓPRIA org: esse vínculo não
  -- confirma nada, e ninguém descobre até tentar.
  select count(*), coalesce(string_agg(distinct om.role, ', '), '')
    into n, detalhe
    from public.organization_members om
    left join public.central_alcada ca
      on ca.org_id = om.org_id and ca.papel = om.role
   where ca.papel is null;
  if n > 0 then
    falhas := array_append(falhas,
      format('%s vinculo(s) com papel sem linha de alcada na propria org [%s] - nao confirmam nada', n, detalhe));
  end if;

  ------------------------------------------------------------------ (b) -----
  -- Papel em uso que a matriz canônica não conhece: `tem_permissao` devolve
  -- false para tudo e o usuário fica sem ação nenhuma, sem mensagem que explique.
  select count(*), coalesce(string_agg(distinct om.role, ', '), '')
    into n, detalhe
    from public.organization_members om
   where not exists (select 1 from public.role_permissions rp where rp.papel = om.role);
  if n > 0 then
    falhas := array_append(falhas,
      format('%s vinculo(s) com papel ausente de role_permissions [%s]', n, detalhe));
  end if;

  ------------------------------------------------------------------ (c) -----
  -- Incoerência de configuração, nos DOIS sentidos. Um papel que PODE aprovar
  -- com teto 0 é permissão morta; um papel com teto que NÃO pode aprovar é
  -- configuração que mente (era o caso do `fechador`: teto 50.000 sem a ação
  -- `aprovar`). Nenhum dos dois quebra hoje — os dois enganam quem configura.
  select count(*), coalesce(string_agg(distinct ca.papel, ', '), '')
    into n, detalhe
    from public.central_alcada ca
   where exists (select 1 from public.role_permissions rp where rp.papel = ca.papel and rp.acao = 'aprovar')
     and ca.teto_valor is not null and ca.teto_valor = 0;
  if n > 0 then
    falhas := array_append(falhas,
      format('papel(is) que podem aprovar com teto ZERO [%s] - permissao morta', detalhe));
  end if;

  select count(*), coalesce(string_agg(distinct ca.papel, ', '), '')
    into n, detalhe
    from public.central_alcada ca
   where not exists (select 1 from public.role_permissions rp where rp.papel = ca.papel and rp.acao = 'aprovar')
     and (ca.teto_valor is null or ca.teto_valor > 0);
  if n > 0 then
    falhas := array_append(falhas,
      format('papel(is) com teto mas SEM a acao aprovar [%s] - configuracao que mente', detalhe));
  end if;

  ------------------------------------------------------------------ fim -----
  if array_length(falhas, 1) is not null then
    raise exception E'TAXONOMIA DE PAPEIS INCOERENTE:\n  . %', array_to_string(falhas, E'\n  . ');
  end if;
  raise notice '. papeis — todo vinculo tem alcada na propria org, todo papel existe na matriz, e teto x aprovar sao coerentes nos dois sentidos';
end
$taxonomia$;

rollback;
