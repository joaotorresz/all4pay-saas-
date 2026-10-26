-- ═══════════════════════════════════════════════════════════════════════════
-- PEDIDOS DE MAQUININHA QUATTRO (26/10/2026, pedido do dono)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A página Maquininha Quattro passou a convidar quem ainda não tem maquininha
-- a PEDIR uma, ou a pedir o VÍNCULO da maquininha que já tem. Esta tabela é
-- onde o pedido chega — e chega à plataforma, que é quem credencia.
--
-- ⚠️ Sem esta tabela o botão "Pedir" seria um escritor morto: a tela diria
-- "pedido enviado" e ninguém do outro lado leria. O chamado da Central de
-- Ajuda mora no estado DA EMPRESA (`org_state`) e a plataforma não o vê.
--
-- ⚠️ O pedido de VÍNCULO não vincula nada. Só a plataforma liga um
-- estabelecimento a uma empresa (`admin_pinbank_vincular`): se o número
-- digitado aqui bastasse, qualquer empresa receberia as vendas da loja
-- vizinha digitando o número dela. O pedido é o recado; o vínculo continua
-- sendo ato da plataforma, conferido.
--
-- Quem pede: quem ADMINISTRA a empresa (pedir maquininha é contratar em nome
-- dela). Teto de 5 pedidos em aberto por empresa — o formulário é para pedir,
-- não para encher a fila de quem atende.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. A TABELA
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.maquininha_pedidos (
  id uuid not null default gen_random_uuid() primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  tipo text not null check (tipo in ('pedir', 'vincular')),
  quantidade integer not null default 1 check (quantidade between 1 and 20),
  segmento text check (segmento is null or length(segmento) <= 80),
  faturamento_mensal numeric(14,2) check (faturamento_mensal is null or (faturamento_mensal >= 0 and faturamento_mensal < 1000000000)),
  codigo_estabelecimento text check (codigo_estabelecimento is null or codigo_estabelecimento ~ '^[0-9]{3,15}$'),
  contato_nome text not null check (length(btrim(contato_nome)) between 2 and 120),
  contato_telefone text check (contato_telefone is null or length(contato_telefone) <= 30),
  contato_email text check (contato_email is null or length(contato_email) <= 160),
  endereco text check (endereco is null or length(endereco) <= 300),
  observacao text check (observacao is null or length(observacao) <= 500),
  situacao text not null default 'recebido'
    check (situacao in ('recebido', 'em_analise', 'aprovado', 'enviado', 'concluido', 'cancelado')),
  criado_por uuid not null default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz,
  atualizado_por uuid,
  -- O pedido de vínculo precisa do número; o de maquininha nova, do endereço.
  constraint maquininha_pedidos_vincular_tem_ec check (tipo <> 'vincular' or codigo_estabelecimento is not null),
  constraint maquininha_pedidos_pedir_tem_endereco check (tipo <> 'pedir' or length(btrim(coalesce(endereco, ''))) >= 8),
  constraint maquininha_pedidos_tem_contato check (
    length(regexp_replace(coalesce(contato_telefone, ''), '[^0-9]', '', 'g')) >= 10
    or coalesce(contato_email, '') ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  )
);
alter table public.maquininha_pedidos enable row level security;

create index if not exists maquininha_pedidos_org_idx on public.maquininha_pedidos (org_id, criado_em desc);
create index if not exists maquininha_pedidos_abertos_idx on public.maquininha_pedidos (criado_em desc)
  where situacao not in ('concluido', 'cancelado');

comment on table public.maquininha_pedidos is
  'Pedidos de maquininha Quattro (nova ou vínculo da que a empresa já tem). Criados pela empresa (maquininha_pedido_criar); atendidos pela plataforma (admin_maquininha_pedidos / admin_maquininha_pedido_situacao).';

drop trigger if exists zz_auditar_maquininha_pedidos on public.maquininha_pedidos;
create trigger zz_auditar_maquininha_pedidos
  after insert or update or delete on public.maquininha_pedidos
  for each row execute function public.auditar_escrita();

-- A empresa só LÊ os próprios pedidos; escrever é pela função, que confere o papel.
revoke all on public.maquininha_pedidos from public, anon, authenticated, service_role;
grant select on public.maquininha_pedidos to authenticated;

drop policy if exists "maquininha_pedidos da empresa" on public.maquininha_pedidos;
create policy "maquininha_pedidos da empresa" on public.maquininha_pedidos
  for select to authenticated using (org_id = public.auth_org_id());

-- ───────────────────────────────────────────────────────────────────────────
-- 2. PEDIR — quem administra a empresa aberta
-- ───────────────────────────────────────────────────────────────────────────
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
  p_observacao text
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
    contato_nome, contato_telefone, contato_email, endereco, observacao
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
    nullif(btrim(coalesce(p_observacao, '')), '')
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.maquininha_pedido_criar(text, integer, text, numeric, text, text, text, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.maquininha_pedido_criar(text, integer, text, numeric, text, text, text, text, text, text)
  to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. A PLATAFORMA — a fila de pedidos e a situação de cada um
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
             'criado_em', p.criado_em, 'atualizado_em', p.atualizado_em
           ) order by (p.situacao in ('concluido', 'cancelado')), p.criado_em desc)
      from (select * from public.maquininha_pedidos order by criado_em desc limit 500) p
      join public.organizations o on o.id = p.org_id
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.admin_maquininha_pedidos() from public, anon, authenticated, service_role;
grant execute on function public.admin_maquininha_pedidos() to authenticated;

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
  if p_situacao not in ('recebido', 'em_analise', 'aprovado', 'enviado', 'concluido', 'cancelado') then
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
