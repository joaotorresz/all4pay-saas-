-- ═══════════════════════════════════════════════════════════════════════════
-- FICHA DO LEAD DA MAQUININHA (28/10/2026, CRM da plataforma, etapa 3)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- O funil Comercial (etapa 2) mostra ONDE o pedido está. A ficha guarda o
-- trabalho comercial em volta dele: quem é o responsável, quando é o próximo
-- contato, por que se perdeu, que taxas o consultor propôs e as anotações de
-- cada conversa.
--
-- ⚠️ Mora em tabelas PRÓPRIAS, e não em colunas de `maquininha_pedidos`: a
-- empresa LÊ os próprios pedidos (política "maquininha_pedidos da empresa"),
-- e o motivo da perda, a anotação do consultor e a taxa ainda em negociação
-- não são dela. Uma coluna nova ali vazaria para a página da empresa no
-- primeiro `select *`. Aqui a RLS está ligada SEM política: só as funções da
-- plataforma (SECURITY DEFINER, `admin_exigir_acesso`) leem e escrevem.
--
-- ⚠️ A situação do pedido continua sendo UMA (`maquininha_pedidos.situacao`).
-- A ficha não tem "etapa": mover no funil é a única forma de mudar onde o
-- pedido está.
--
-- ⚠️ As anotações são um HISTÓRICO: não há função que edite ou apague uma
-- anotação. Corrigir é anotar de novo.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. AS TABELAS
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.maquininha_leads (
  pedido_id uuid primary key references public.maquininha_pedidos(id) on delete cascade,
  responsavel uuid references public.platform_admins(user_id) on delete set null,
  proximo_contato date,
  motivo_perda text check (motivo_perda is null or motivo_perda in
    ('preco', 'concorrente', 'sem_resposta', 'sem_interesse', 'credito', 'outro')),
  motivo_detalhe text check (motivo_detalhe is null or length(motivo_detalhe) <= 300),
  -- Frações por forma (pix, debito, credito, parcelado), conferidas na função.
  taxas_propostas jsonb check (taxas_propostas is null or jsonb_typeof(taxas_propostas) = 'object'),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);
alter table public.maquininha_leads enable row level security;

create table if not exists public.maquininha_lead_notas (
  id uuid not null default gen_random_uuid() primary key,
  pedido_id uuid not null references public.maquininha_pedidos(id) on delete cascade,
  autor uuid not null,
  texto text not null check (length(btrim(texto)) between 1 and 2000),
  criado_em timestamptz not null default now()
);
alter table public.maquininha_lead_notas enable row level security;
create index if not exists maquininha_lead_notas_pedido_idx on public.maquininha_lead_notas (pedido_id, criado_em desc);

revoke all on public.maquininha_leads from public, anon, authenticated, service_role;
revoke all on public.maquininha_lead_notas from public, anon, authenticated, service_role;

comment on table public.maquininha_leads is
  'Ficha comercial do pedido de maquininha (responsável, próximo contato, motivo de perda, taxas propostas). Só da plataforma: RLS sem política, lida e escrita por admin_maquininha_lead*.';
comment on table public.maquininha_lead_notas is
  'Anotações do comercial sobre o pedido de maquininha. Histórico: nenhuma função edita ou apaga.';

-- ───────────────────────────────────────────────────────────────────────────
-- 2. LER A FICHA
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.admin_maquininha_lead(p_pedido uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
begin
  perform public.admin_exigir_acesso('admin_maquininha_lead', p_pedido::text);
  if not exists (select 1 from public.maquininha_pedidos where id = p_pedido) then
    raise exception 'A4P-MAQUININHA: pedido % não encontrado.', p_pedido using errcode = 'no_data_found';
  end if;
  return jsonb_build_object(
    'lead', (
      select jsonb_build_object(
               'responsavel', l.responsavel, 'proximo_contato', l.proximo_contato,
               'motivo_perda', l.motivo_perda, 'motivo_detalhe', l.motivo_detalhe,
               'taxas_propostas', l.taxas_propostas, 'atualizado_em', l.atualizado_em)
        from public.maquininha_leads l where l.pedido_id = p_pedido),
    'notas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', n.id, 'autor_email', u.email, 'texto', n.texto, 'criado_em', n.criado_em)
             order by n.criado_em desc)
        from public.maquininha_lead_notas n
        left join auth.users u on u.id = n.autor
       where n.pedido_id = p_pedido), '[]'::jsonb),
    'responsaveis', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.user_id, 'email', u.email) order by u.email)
        from public.platform_admins a
        join auth.users u on u.id = a.user_id), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_maquininha_lead(uuid) from public, anon, authenticated, service_role;
grant execute on function public.admin_maquininha_lead(uuid) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. SALVAR A FICHA
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.admin_maquininha_lead_salvar(
  p_pedido uuid,
  p_responsavel uuid,
  p_proximo_contato date,
  p_motivo_perda text,
  p_motivo_detalhe text,
  p_taxas_propostas jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_org uuid;
  v_chave text;
  v_valor jsonb;
  v_taxas jsonb := nullif(p_taxas_propostas, '{}'::jsonb);
  v_motivo text := nullif(btrim(coalesce(p_motivo_perda, '')), '');
  v_detalhe text := nullif(btrim(coalesce(p_motivo_detalhe, '')), '');
begin
  perform public.admin_exigir_acesso('admin_maquininha_lead_salvar', p_pedido::text);
  select org_id into v_org from public.maquininha_pedidos where id = p_pedido;
  if v_org is null then
    raise exception 'A4P-MAQUININHA: pedido % não encontrado.', p_pedido using errcode = 'no_data_found';
  end if;
  if p_responsavel is not null and not exists (select 1 from public.platform_admins where user_id = p_responsavel) then
    raise exception 'A4P-MAQUININHA: o responsável tem de ser alguém da plataforma.' using errcode = 'check_violation';
  end if;
  if p_proximo_contato is not null and p_proximo_contato > current_date + 365 then
    raise exception 'A4P-MAQUININHA: o próximo contato passa de um ano. Confira a data.' using errcode = 'check_violation';
  end if;
  -- A taxa proposta vira conta de economia na tela: chave inventada ou taxa
  -- acima de 20% (um "3,5" digitado no lugar de "0,035") é recusada aqui.
  if v_taxas is not null then
    if jsonb_typeof(v_taxas) <> 'object' then
      raise exception 'A4P-MAQUININHA: as taxas propostas vêm por forma de pagamento.' using errcode = 'check_violation';
    end if;
    for v_chave, v_valor in select * from jsonb_each(v_taxas) loop
      if v_chave not in ('pix', 'debito', 'credito', 'parcelado') then
        raise exception 'A4P-MAQUININHA: forma de pagamento % não existe.', v_chave using errcode = 'check_violation';
      end if;
      if jsonb_typeof(v_valor) = 'null' then continue; end if;
      if jsonb_typeof(v_valor) <> 'number' or (v_valor)::numeric < 0 or (v_valor)::numeric > 0.2 then
        raise exception 'A4P-MAQUININHA: a taxa proposta de % tem de ficar entre 0%% e 20%%.', v_chave using errcode = 'check_violation';
      end if;
    end loop;
  end if;

  insert into public.maquininha_leads as l
    (pedido_id, responsavel, proximo_contato, motivo_perda, motivo_detalhe, taxas_propostas, atualizado_em, atualizado_por)
  values (p_pedido, p_responsavel, p_proximo_contato, v_motivo, v_detalhe, v_taxas, now(), auth.uid())
  on conflict (pedido_id) do update set
    responsavel = excluded.responsavel,
    proximo_contato = excluded.proximo_contato,
    motivo_perda = excluded.motivo_perda,
    motivo_detalhe = excluded.motivo_detalhe,
    taxas_propostas = excluded.taxas_propostas,
    atualizado_em = excluded.atualizado_em,
    atualizado_por = excluded.atualizado_por;

  insert into public.admin_audit (admin_id, action, target, detail)
  values (auth.uid(), 'maquininha.lead_salvar', v_org::text,
          jsonb_build_object('pedido', p_pedido, 'responsavel', p_responsavel,
                             'proximo_contato', p_proximo_contato, 'motivo_perda', v_motivo,
                             'taxas_propostas', v_taxas));
end;
$$;

revoke all on function public.admin_maquininha_lead_salvar(uuid, uuid, date, text, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.admin_maquininha_lead_salvar(uuid, uuid, date, text, text, jsonb) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. ANOTAR
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.admin_maquininha_lead_anotar(p_pedido uuid, p_texto text)
returns uuid
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_org uuid;
  v_id uuid;
  v_texto text := btrim(coalesce(p_texto, ''));
begin
  perform public.admin_exigir_acesso('admin_maquininha_lead_anotar', p_pedido::text);
  select org_id into v_org from public.maquininha_pedidos where id = p_pedido;
  if v_org is null then
    raise exception 'A4P-MAQUININHA: pedido % não encontrado.', p_pedido using errcode = 'no_data_found';
  end if;
  if length(v_texto) = 0 then
    raise exception 'A4P-MAQUININHA: a anotação está vazia.' using errcode = 'check_violation';
  end if;
  if length(v_texto) > 2000 then
    raise exception 'A4P-MAQUININHA: a anotação passa de 2.000 letras.' using errcode = 'check_violation';
  end if;
  insert into public.maquininha_lead_notas (pedido_id, autor, texto)
  values (p_pedido, auth.uid(), v_texto)
  returning id into v_id;
  insert into public.admin_audit (admin_id, action, target, detail)
  values (auth.uid(), 'maquininha.lead_anotar', v_org::text, jsonb_build_object('pedido', p_pedido, 'nota', v_id));
  return v_id;
end;
$$;

revoke all on function public.admin_maquininha_lead_anotar(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.admin_maquininha_lead_anotar(uuid, text) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. A FILA DA PLATAFORMA — passa a trazer o resumo da ficha para o card
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
             'criado_em', p.criado_em, 'atualizado_em', p.atualizado_em,
             'responsavel_email', ur.email, 'proximo_contato', l.proximo_contato,
             'motivo_perda', l.motivo_perda,
             'notas', (select count(*) from public.maquininha_lead_notas n where n.pedido_id = p.id)
           ) order by (p.situacao in ('concluido', 'cancelado')), p.criado_em desc)
      from (select * from public.maquininha_pedidos order by criado_em desc limit 500) p
      join public.organizations o on o.id = p.org_id
      left join public.maquininha_leads l on l.pedido_id = p.id
      left join auth.users ur on ur.id = l.responsavel
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.admin_maquininha_pedidos() from public, anon, authenticated, service_role;
grant execute on function public.admin_maquininha_pedidos() to authenticated;
