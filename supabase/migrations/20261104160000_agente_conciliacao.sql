-- ═══════════════════════════════════════════════════════════════════════════
-- OS AGENTES · ETAPA 4 — O AGENTE DE CONCILIAÇÃO (04/11/2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- O agente propõe o par (título previsto × linha do extrato) e a conciliação
-- acontece AQUI, pela MESMA regra do botão da tela.
--
-- ⚠️ UMA REGRA DE CONCILIAÇÃO SÓ. O corpo de `conciliar_movimentos` vai para
-- `conciliar_na_empresa`, que as duas portas chamam:
--   · a tela: `conciliar_movimentos` (a empresa é a ABERTA da sessão e a
--     permissão é `baixar`, como sempre foi);
--   · o agente: `agente_conciliar`, com a empresa da PROPOSTA.
--
-- ⚠️ DEFEITO CORRIGIDO NO CAMINHO: a versão anterior não conferia a linha do
-- extrato. Um id de outra empresa, inexistente, já conciliado ou ainda não
-- pago fazia o UPDATE do extrato tocar zero linhas e o título previsto era
-- cancelado mesmo assim, apontando para nada: dinheiro previsto sumia sem par.
-- Agora a regra recusa antes de mudar qualquer coisa.
--
-- ⚠️ "SÓ PERGUNTA O QUE NÃO FECHOU": sozinho (dentro do limite), o banco só
-- concilia par de confiança alta (85 ou mais) e com o agente ligado no nível 2
-- ou 3. O resto espera a aprovação, pela tela ou pelo WhatsApp.
--
-- ⚠️ MUDA QUEM PODE CHAMAR O QUÊ — declarado:
--   · `conciliar_na_empresa`: ninguém executa direto (SECURITY DEFINER, só
--     chamada pelas duas funções acima).
--   · `agente_conciliar`: só a chave de serviço (o runner e as rotas que
--     executam a proposta aprovada).
--   · `conciliar_movimentos`: o mesmo de antes (authenticated, `baixar`).
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.conciliar_na_empresa(p_previsto uuid, p_extrato uuid, p_org uuid, p_usuario text)
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare v_prev public.movements%rowtype; v_ext public.movements%rowtype;
begin
  if p_org is null then
    raise exception 'Nenhuma empresa aberta.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_prev from public.movements where id = p_previsto and org_id = p_org for update;
  if v_prev.id is null then
    raise exception 'Título previsto não encontrado nesta empresa.' using errcode = 'no_data_found';
  end if;
  if v_prev.conciliado_com is not null then
    raise exception 'Este título já está conciliado.' using errcode = 'check_violation';
  end if;
  if v_prev.status <> 'pendente' then
    raise exception 'Este título não está mais em aberto.' using errcode = 'check_violation';
  end if;

  select * into v_ext from public.movements where id = p_extrato and org_id = p_org for update;
  if v_ext.id is null or v_ext.id = v_prev.id then
    raise exception 'A linha do extrato não foi encontrada nesta empresa.' using errcode = 'no_data_found';
  end if;
  if v_ext.conciliado_com is not null then
    raise exception 'Esta linha do extrato já está conciliada.' using errcode = 'check_violation';
  end if;
  if v_ext.status <> 'pago' then
    raise exception 'A linha do extrato ainda não foi paga.' using errcode = 'check_violation';
  end if;
  if v_ext.type <> v_prev.type then
    raise exception 'Entrada não concilia com saída.' using errcode = 'check_violation';
  end if;

  update public.movements m
     set party_id       = coalesce(v_prev.party_id, m.party_id),
         category_id    = coalesce(v_prev.category_id, m.category_id),
         cost_center_id = coalesce(v_prev.cost_center_id, m.cost_center_id),
         description    = coalesce(v_prev.description, m.description),
         conciliado_com = v_prev.id,
         conciliado_em  = now()
   where m.id = v_ext.id;

  update public.movements
     set situacao = 'cancelado', conciliado_com = v_ext.id, conciliado_em = now()
   where id = v_prev.id;

  insert into public.audit_log (org_id, usuario, acao, antes, depois, entidade, entidade_id, origem)
  values (p_org, coalesce(auth.uid()::text, p_usuario, 'sistema'), 'movements.conciliar',
          jsonb_build_object('situacao', v_prev.situacao),
          jsonb_build_object('situacao', 'cancelado', 'par', v_ext.id),
          'movements', v_prev.id::text, 'conciliacao');
end;
$function$;

revoke all on function public.conciliar_na_empresa(uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;

-- A porta da tela: a mesma assinatura, a mesma permissão.
create or replace function public.conciliar_movimentos(p_previsto uuid, p_extrato uuid)
returns void language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not public.tem_permissao('baixar') then
    raise exception 'Seu papel nesta empresa não concilia.' using errcode = 'insufficient_privilege';
  end if;
  perform public.conciliar_na_empresa(p_previsto, p_extrato, public.auth_org_id(), null);
end;
$function$;

revoke all on function public.conciliar_movimentos(uuid, uuid) from public;
grant execute on function public.conciliar_movimentos(uuid, uuid) to authenticated;

-- A porta do agente: executa UMA proposta e grava o resultado na mesma transação.
--   p_sozinho = false: só a APROVADA (alguém com permissão já decidiu);
--   p_sozinho = true : só a PENDENTE, confiança 85+, agente ligado no nível 2+.
create or replace function public.agente_conciliar(p_proposta uuid, p_sozinho boolean)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_p public.agente_propostas%rowtype; v_cfg public.agentes%rowtype; v_erro text;
begin
  select * into v_p from public.agente_propostas where id = p_proposta for update;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'estado', 'inexistente', 'erro', 'Proposta não encontrada.');
  end if;
  if v_p.agente <> 'conciliacao' then
    raise exception 'agente_conciliar: a proposta é do agente %, não da conciliação.', v_p.agente;
  end if;
  if (p_sozinho and v_p.estado <> 'pendente') or (not p_sozinho and v_p.estado <> 'aprovada') then
    return jsonb_build_object('ok', false, 'estado', v_p.estado, 'erro', v_p.erro);
  end if;

  if p_sozinho then
    select * into v_cfg from public.agentes where org_id = v_p.org_id and agente = 'conciliacao';
    if v_cfg.org_id is null or not v_cfg.ativo or v_cfg.nivel < 2 then
      raise exception 'agente_conciliar: o nível do agente nesta empresa não deixa conciliar sozinho.';
    end if;
    if coalesce((v_p.dados->>'confianca')::numeric, 0) < 85 then
      raise exception 'agente_conciliar: par sem confiança alta não é conciliado sozinho.';
    end if;
  end if;

  begin
    perform public.conciliar_na_empresa((v_p.dados->>'previsto')::uuid, (v_p.dados->>'extrato')::uuid,
                                        v_p.org_id, 'agente:conciliacao');
  exception when others then
    v_erro := left(sqlerrm, 1000);
  end;

  update public.agente_propostas
     set estado      = case when v_erro is null then 'executada' else 'falhou' end,
         erro        = v_erro,
         executada_em = case when v_erro is null then now() else executada_em end,
         decidida_em = case when p_sozinho then now() else decidida_em end,
         motivo      = case when p_sozinho then 'Dentro do limite que a empresa escolheu.' else motivo end
   where id = v_p.id;

  return jsonb_build_object('ok', v_erro is null,
    'estado', case when v_erro is null then 'executada' else 'falhou' end, 'erro', v_erro);
end;
$function$;

revoke all on function public.agente_conciliar(uuid, boolean) from public, anon, authenticated;
grant execute on function public.agente_conciliar(uuid, boolean) to service_role;

