-- ═══════════════════════════════════════════════════════════════════════════
-- O AGENTE DE FECHAMENTO (Etapa 8 do plano "AI first", 05/11/2026)
--
-- O agente lê o MESMO checklist de fechamento da tela (`close_tasks`, a regra
-- de `core/close/checklist`) e a trava do mês (`accounting_periods`), e propõe
-- o próximo passo de cada tarefa aberta. O "Aprovar" abre a tarefa na tela de
-- sempre (o padrão que o dono escolheu para o agente de caixa): o agente nunca
-- conclui, revisa nem trava o mês.
--
--   agente_fechamento_fontes(org, mes) — só service_role: o que o runner lê.
--   A chave de serviço continua SEM acesso direto a close_tasks e
--   accounting_periods (`service_role_grants_minimos`): a leitura é esta
--   função, só desta empresa e deste mês.
--
-- Nenhuma tabela nova, nenhum escritor novo.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.agente_fechamento_fontes(p_org uuid, p_mes text)
returns jsonb language sql stable security definer set search_path to 'public'
as $function$
  select jsonb_build_object(
    'mes', p_mes,
    'travado', exists (
      select 1 from public.accounting_periods p
       where p.org_id = p_org and p.status = 'locked'
         and to_char(p.period, 'YYYY-MM') = p_mes),
    'tarefas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id, 'chave', coalesce(t.chave, t.id::text), 'titulo', t.title,
               'href', t.href, 'ordem', t.ordem, 'status', t.status,
               'prazo', t.prazo, 'responsavel', t.responsavel_id)
             order by t.ordem, t.title)
        from public.close_tasks t
       where t.org_id = p_org and to_char(t.mes, 'YYYY-MM') = p_mes), '[]'::jsonb)
  );
$function$;

revoke all on function public.agente_fechamento_fontes(uuid, text) from public, anon, authenticated;
grant execute on function public.agente_fechamento_fontes(uuid, text) to service_role;
