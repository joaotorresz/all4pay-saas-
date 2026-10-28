-- ═══════════════════════════════════════════════════════════════════════════
-- PEDIDO DE MAQUININHA: A SITUAÇÃO "PROPOSTA ENVIADA" (28/10/2026, CRM etapa 2)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A Administração › Comercial mostra os pedidos num funil, e cada coluna É uma
-- situação do pedido (Novo = recebido, Em contato = em análise, Proposta,
-- Aprovado, A caminho, Instalado = concluído, Perdido = cancelado). Faltava a
-- coluna do meio: a proposta de taxas enviada e ainda sem resposta.
--
-- ⚠️ Não nasce um segundo campo de "etapa comercial" ao lado da situação: os
-- dois guardariam o mesmo fato com escritores independentes. Mover o card
-- muda a situação que a empresa acompanha na página dela.

do $$
declare r record;
begin
  -- A restrição da coluna nasceu sem nome (inline): procura-se pela definição.
  for r in
    select conname from pg_constraint
     where conrelid = 'public.maquininha_pedidos'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) like '%situacao%' and pg_get_constraintdef(oid) like '%em_analise%'
  loop
    execute format('alter table public.maquininha_pedidos drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.maquininha_pedidos
  add constraint maquininha_pedidos_situacao_valida
  check (situacao in ('recebido', 'em_analise', 'proposta', 'aprovado', 'enviado', 'concluido', 'cancelado'));

create or replace function public.admin_maquininha_pedido_situacao(p_pedido uuid, p_situacao text)
returns void
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_org uuid;
  v_antes text;
begin
  perform public.admin_exigir_acesso('admin_maquininha_pedido_situacao', p_pedido::text);
  if p_situacao not in ('recebido', 'em_analise', 'proposta', 'aprovado', 'enviado', 'concluido', 'cancelado') then
    raise exception 'A4P-MAQUININHA: situação % não existe.', p_situacao using errcode = 'check_violation';
  end if;
  select org_id, situacao into v_org, v_antes from public.maquininha_pedidos where id = p_pedido for update;
  if v_org is null then
    raise exception 'A4P-MAQUININHA: pedido % não encontrado.', p_pedido using errcode = 'no_data_found';
  end if;
  update public.maquininha_pedidos
     set situacao = p_situacao, atualizado_em = now(), atualizado_por = auth.uid()
   where id = p_pedido;
  insert into public.admin_audit (admin_id, action, target, detail)
  values (auth.uid(), 'maquininha.pedido_situacao', v_org::text,
          jsonb_build_object('pedido', p_pedido, 'de', v_antes, 'para', p_situacao));
end;
$$;

revoke all on function public.admin_maquininha_pedido_situacao(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.admin_maquininha_pedido_situacao(uuid, text) to authenticated;
