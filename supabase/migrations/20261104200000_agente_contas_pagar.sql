-- ═══════════════════════════════════════════════════════════════════════════
-- O AGENTE DE CONTAS A PAGAR (Etapa 6 do plano "AI first", 04/11/2026)
--
-- O agente lê a MESMA caixa de entrada de contas que a tela (boletos DDA,
-- notas da SEFAZ, documentos lidos e e-mails) e propõe "agendar" cada
-- documento pendente. O "Aprovar" abre o cadastro preenchido (decisão do dono):
-- quem grava a conta é o escritor de sempre, e a proposta só vira "executada"
-- quando ESTE banco vê o documento convertido na caixa.
--
--   1. agente_contas_pagar_fontes(org)   — só service_role: o que o runner lê
--      (as chaves da caixa em org_state e os e-mails recebidos). A chave de
--      serviço continua SEM acesso direto a org_state e caixa_email_mensagens
--      (A4P-076): a leitura é esta função, e só estas chaves.
--   2. agente_contas_pagar_concluir_na_empresa(proposta, org) — a regra única
--      do desfecho de uma proposta APROVADA, pela decisão gravada na caixa:
--      convertido → executada; descartado → falhou (com o motivo); sem decisão
--      → continua aprovada. Ninguém de fora chama.
--   3. agente_contas_pagar_concluir(proposta) — a porta da tela (sessão, só a
--      empresa ABERTA); agente_contas_pagar_concluir_servidor(proposta) — a do
--      runner (service_role). As duas pela regra do 2.
--
-- Nenhuma tabela nova, nenhum escritor de dinheiro novo.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. O que o runner lê, de UMA empresa.
create or replace function public.agente_contas_pagar_fontes(p_org uuid)
returns jsonb language sql stable security definer set search_path to 'public'
as $function$
  select jsonb_build_object(
    'boletos', coalesce((select valor from public.org_state where org_id = p_org and chave = 'a4p_boletos_recebidos'), '[]'::jsonb),
    'nfs',     coalesce((select valor from public.org_state where org_id = p_org and chave = 'a4p_nfs_recebidas'), '[]'::jsonb),
    'caixa',   coalesce((select valor from public.org_state where org_id = p_org and chave = 'a4p_caixa_entrada'), '{}'::jsonb),
    'emails',  coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.id, 'recebido_em', m.recebido_em, 'remetente', m.remetente,
               'assunto', m.assunto, 'texto', m.texto, 'anexos', m.anexos)
             order by m.recebido_em desc)
        from (select * from public.caixa_email_mensagens
               where org_id = p_org order by recebido_em desc limit 500) m), '[]'::jsonb)
  );
$function$;

revoke all on function public.agente_contas_pagar_fontes(uuid) from public, anon, authenticated;
grant execute on function public.agente_contas_pagar_fontes(uuid) to service_role;

-- 2. A regra única do desfecho de uma proposta aprovada.
create or replace function public.agente_contas_pagar_concluir_na_empresa(p_proposta uuid, p_org uuid)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_p public.agente_propostas%rowtype;
  v_entrada text;
  v_dec jsonb;
begin
  select * into v_p from public.agente_propostas
   where id = p_proposta and org_id = p_org for update;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'estado', 'inexistente', 'erro', 'Proposta não encontrada nesta empresa.');
  end if;
  if v_p.agente <> 'contas_pagar' then
    raise exception 'agente_contas_pagar_concluir: a proposta é do agente %, não de contas a pagar.', v_p.agente;
  end if;
  if v_p.estado <> 'aprovada' then
    return jsonb_build_object('ok', v_p.estado = 'executada', 'estado', v_p.estado, 'erro', v_p.erro);
  end if;

  v_entrada := v_p.dados->>'entrada';
  -- A ÚLTIMA decisão sobre o documento, na caixa da MESMA empresa.
  select d into v_dec
    from public.org_state s,
         jsonb_array_elements(coalesce(s.valor->'decisoes', '[]'::jsonb)) with ordinality as e(d, i)
   where s.org_id = v_p.org_id and s.chave = 'a4p_caixa_entrada' and d->>'chave' = v_entrada
   order by i desc limit 1;

  if v_dec is null then
    return jsonb_build_object('ok', true, 'estado', 'aprovada', 'erro', null);
  end if;

  if v_dec->>'acao' = 'convertido' then
    update public.agente_propostas
       set estado = 'executada', executada_em = now(), erro = null
     where id = v_p.id;
    return jsonb_build_object('ok', true, 'estado', 'executada', 'erro', null,
      'referencia', v_dec->>'referencia');
  end if;

  update public.agente_propostas
     set estado = 'falhou',
         erro = left('O documento foi descartado na caixa de entrada: ' || coalesce(v_dec->>'motivo', 'sem motivo'), 1000)
   where id = v_p.id;
  return jsonb_build_object('ok', false, 'estado', 'falhou',
    'erro', left('O documento foi descartado na caixa de entrada: ' || coalesce(v_dec->>'motivo', 'sem motivo'), 1000));
end;
$function$;

revoke all on function public.agente_contas_pagar_concluir_na_empresa(uuid, uuid) from public, anon, authenticated, service_role;

-- 3. As portas, pela regra do 2: a sessão conclui só na empresa ABERTA; o
-- runner (service_role), na empresa da própria proposta.
create or replace function public.agente_contas_pagar_concluir(p_proposta uuid)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
begin
  return public.agente_contas_pagar_concluir_na_empresa(p_proposta, public.auth_org_id());
end;
$function$;

revoke all on function public.agente_contas_pagar_concluir(uuid) from public, anon, service_role;
grant execute on function public.agente_contas_pagar_concluir(uuid) to authenticated;

create or replace function public.agente_contas_pagar_concluir_servidor(p_proposta uuid)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_org uuid;
begin
  select org_id into v_org from public.agente_propostas where id = p_proposta;
  return public.agente_contas_pagar_concluir_na_empresa(p_proposta, v_org);
end;
$function$;

revoke all on function public.agente_contas_pagar_concluir_servidor(uuid) from public, anon, authenticated;
grant execute on function public.agente_contas_pagar_concluir_servidor(uuid) to service_role;
