-- ═══════════════════════════════════════════════════════════════════════════
-- PEDIDO DE MAQUININHA COM A SIMULAÇÃO (28/10/2026, pedido do dono)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- O pedido que sai do pop-up da comparação ("você pode economizar R$ X por
-- mês" ou "fale com um consultor") passa a levar a SIMULAÇÃO estruturada:
-- volume, mix, taxas de hoje (digitadas ou estimadas), taxas da Quattro,
-- custos e a economia por mês. Ela ia como texto solto na observação, e o
-- CRM da plataforma (etapas 2 e 3) precisa ordenar e filtrar por ela.
--
-- ⚠️ A simulação é montada pelo NAVEGADOR: é dado de fora. O banco só exige
-- que seja um objeto pequeno; quem a lê (`lerSimulacao` em
-- core/maquininha/oferta) descarta a que vier fora de faixa em vez de deixá-la
-- ordenar o funil.
--
-- ⚠️ A função muda de assinatura (dois parâmetros novos, com padrão): a
-- antiga é APAGADA, senão o PostgREST teria duas candidatas para a mesma
-- chamada nomeada. O navegador antigo (sem os dois parâmetros) continua
-- chamando a nova, pelos padrões.

alter table public.maquininha_pedidos
  add column if not exists origem text not null default 'formulario',
  add column if not exists simulacao jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'maquininha_pedidos_origem_valida') then
    alter table public.maquininha_pedidos
      add constraint maquininha_pedidos_origem_valida
      check (origem in ('formulario', 'economia', 'consultor'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'maquininha_pedidos_simulacao_objeto') then
    alter table public.maquininha_pedidos
      add constraint maquininha_pedidos_simulacao_objeto
      check (simulacao is null or (jsonb_typeof(simulacao) = 'object' and length(simulacao::text) <= 4000));
  end if;
end $$;

comment on column public.maquininha_pedidos.origem is
  'formulario (pedido direto) · economia (pop-up: a Quattro sai mais barata) · consultor (pop-up: taxas de hoje menores ou iguais).';
comment on column public.maquininha_pedidos.simulacao is
  'A comparação que levou ao pedido (core/maquininha/oferta SimulacaoDoPedido). Montada pelo navegador: lida com lerSimulacao, que descarta a fora de faixa.';

-- ───────────────────────────────────────────────────────────────────────────
-- PEDIR — a mesma regra de antes, com a origem e a simulação
-- ───────────────────────────────────────────────────────────────────────────
drop function if exists public.maquininha_pedido_criar(text, integer, text, numeric, text, text, text, text, text, text);

create or replace function public.maquininha_pedido_criar(
  p_tipo text,
  p_quantidade integer,
  p_segmento text,
  p_faturamento_mensal numeric,
  p_codigo_estabelecimento text,
  p_contato_nome text,
  p_contato_telefone text,
  p_contato_email text,
  p_endereco text,
  p_observacao text,
  p_origem text default 'formulario',
  p_simulacao jsonb default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_org uuid := public.auth_org_id();
  v_id uuid;
begin
  if auth.uid() is null or v_org is null then
    raise exception 'A4P-MAQUININHA: entre no sistema para pedir a maquininha.' using errcode = 'insufficient_privilege';
  end if;
  if not public.tem_permissao('administrar', v_org) then
    raise exception 'A4P-MAQUININHA: só quem administra a empresa pode pedir a maquininha. Peça a quem administra.' using errcode = 'insufficient_privilege';
  end if;
  if (select count(*) from public.maquininha_pedidos
       where org_id = v_org and situacao in ('recebido', 'em_analise')) >= 5 then
    raise exception 'A4P-MAQUININHA: já há 5 pedidos em análise nesta empresa. Aguarde o contato da equipe Quattro.' using errcode = 'check_violation';
  end if;

  insert into public.maquininha_pedidos (
    org_id, tipo, quantidade, segmento, faturamento_mensal, codigo_estabelecimento,
    contato_nome, contato_telefone, contato_email, endereco, observacao, origem, simulacao
  ) values (
    v_org,
    p_tipo,
    case when p_tipo = 'vincular' then 1 else coalesce(p_quantidade, 1) end,
    nullif(btrim(coalesce(p_segmento, '')), ''),
    p_faturamento_mensal,
    case when p_tipo = 'vincular' then nullif(btrim(coalesce(p_codigo_estabelecimento, '')), '') end,
    btrim(coalesce(p_contato_nome, '')),
    nullif(btrim(coalesce(p_contato_telefone, '')), ''),
    nullif(lower(btrim(coalesce(p_contato_email, ''))), ''),
    nullif(btrim(coalesce(p_endereco, '')), ''),
    nullif(btrim(coalesce(p_observacao, '')), ''),
    coalesce(nullif(btrim(coalesce(p_origem, '')), ''), 'formulario'),
    p_simulacao
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.maquininha_pedido_criar(text, integer, text, numeric, text, text, text, text, text, text, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.maquininha_pedido_criar(text, integer, text, numeric, text, text, text, text, text, text, text, jsonb)
  to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- A FILA DA PLATAFORMA — passa a devolver a origem e a simulação
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.admin_maquininha_pedidos()
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
begin
  perform public.admin_exigir_acesso('admin_maquininha_pedidos', null);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', p.id, 'org_id', p.org_id, 'empresa', o.name, 'tipo', p.tipo,
             'quantidade', p.quantidade, 'segmento', p.segmento,
             'faturamento_mensal', p.faturamento_mensal,
             'codigo_estabelecimento', p.codigo_estabelecimento,
             'contato_nome', p.contato_nome, 'contato_telefone', p.contato_telefone,
             'contato_email', p.contato_email, 'endereco', p.endereco,
             'observacao', p.observacao, 'situacao', p.situacao,
             'origem', p.origem, 'simulacao', p.simulacao,
             'criado_em', p.criado_em, 'atualizado_em', p.atualizado_em
           ) order by (p.situacao in ('concluido', 'cancelado')), p.criado_em desc)
      from (select * from public.maquininha_pedidos order by criado_em desc limit 500) p
      join public.organizations o on o.id = p.org_id
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.admin_maquininha_pedidos() from public, anon, authenticated, service_role;
grant execute on function public.admin_maquininha_pedidos() to authenticated;
