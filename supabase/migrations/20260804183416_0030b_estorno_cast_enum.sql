create or replace function public.estornar_lancamento(p_id uuid, p_motivo text)
returns uuid language plpgsql volatile security definer set search_path = public as $fn$
declare v_orig public.movements%rowtype; v_novo uuid; v_hoje date := current_date;
begin
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Informe o motivo do estorno.'; end if;
  if not public.tem_permissao('lancar') then
    raise exception 'Seu papel nesta organizacao nao lanca nem estorna.';
  end if;
  select * into v_orig from public.movements where id = p_id;
  if v_orig.id is null then raise exception 'Lancamento nao encontrado.'; end if;
  if v_orig.estornado_em is not null then raise exception 'Este lancamento ja foi estornado.'; end if;
  if public.periodo_fechado(v_hoje, v_orig.org_id) then
    raise exception 'O mes corrente tambem esta fechado - reabra-o para registrar o estorno.';
  end if;
  insert into public.movements (
    org_id, account_id, type, status, amount, due_date, paid_date,
    party_id, category, description, estorno_de, estorno_motivo
  ) values (
    v_orig.org_id, v_orig.account_id,
    (case when v_orig.type = 'entrada' then 'saida' else 'entrada' end)::movement_type,
    v_orig.status, v_orig.amount, v_hoje,
    case when v_orig.paid_date is null then null else v_hoje end,
    v_orig.party_id, v_orig.category,
    'Estorno de ' || coalesce(v_orig.description, 'lancamento') || ' (' || to_char(v_orig.due_date, 'DD/MM/YYYY') || ')',
    v_orig.id, p_motivo
  ) returning id into v_novo;
  update public.movements set estornado_em = now() where id = v_orig.id;
  insert into public.audit_log (org_id, usuario, acao, antes, depois)
  values (v_orig.org_id, coalesce(auth.uid()::text, 'sistema'), 'lancamento.estornar',
    jsonb_build_object('id', v_orig.id, 'valor', v_orig.amount, 'competencia', v_orig.due_date),
    jsonb_build_object('estorno', v_novo, 'motivo', p_motivo, 'competencia', v_hoje));
  return v_novo;
end;
$fn$;