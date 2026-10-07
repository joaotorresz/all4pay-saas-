-- ═══════════════════════════════════════════════════════════════════════════
-- A MAQUININHA DA PINBANK NO ERP (05/10/2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Toda venda, cancelamento e estorno numa maquininha Pinbank VINCULADA a uma
-- empresa chega pelo webhook `Compra.*` (`/api/pinbank/webhook`) e vira, no
-- MESMO desenho da venda de maquininha que o sistema já tem: o documento em
-- `sales_docs` + `sale_items`, e por parcela a receita bruta a receber e a
-- taxa a pagar, na data estimada do repasse (`core/pinbank`).
--
-- ⚠️ **O VÍNCULO TEM DUAS CHAVES, e de pessoas diferentes.**
--   1. A PLATAFORMA vincula o estabelecimento da Pinbank a uma empresa
--      (`admin_pinbank_vincular`). Só ela, porque só ela conferiu com a
--      Pinbank que aquela loja é cliente nossa: se a própria empresa pudesse se
--      vincular a um estabelecimento qualquer, bastaria digitar o número da
--      loja vizinha para receber as vendas dela.
--   2. A EMPRESA ativa (`pinbank_configurar_vinculo`, quem administra): diz em
--      que conta o repasse cai e quais taxas contratou. Sem a segunda chave,
--      nada vira dinheiro — o evento espera, guardado, e entra quando ela ativar.
--
-- ⚠️ **UM ESTABELECIMENTO, UMA EMPRESA.** Índice único GLOBAL (não por empresa)
-- sobre o estabelecimento e a chave do gateway: a venda de uma maquininha não
-- tem como cair em duas empresas.
--
-- ⚠️ **O EVENTO É GUARDADO ANTES DE QUALQUER DECISÃO** (`pinbank_eventos`, a
-- caixa de entrada bruta, chave = EventId). A Pinbank entrega "pelo menos uma
-- vez" e fora de ordem; a chave primária faz a reentrega cair no mesmo registro,
-- e o ESTADO da transação (`pinbank_transacoes`, com versão) faz o evento
-- atrasado não voltar o ciclo. Um evento sem vínculo não é descartado: fica na
-- quarentena da plataforma e entra quando o vínculo existir.
--
-- ⚠️ **`pinbank_eventos` FICA FORA DA TRILHA genérica, e de propósito** (a
-- mesma razão de `raw_events`): ela própria é o registro bruto do que chegou,
-- com data de recebimento e tentativas, e o evento sem vínculo NÃO TEM empresa —
-- a trilha exige uma. O que mexe em dinheiro (`pinbank_vinculos`,
-- `pinbank_transacoes`, `sales_docs`, `sale_items`, `movements`) segue com o
-- gatilho. A exclusão está declarada também em `scripts/trilha-completa.sql`.
--
-- ⚠️ **DADO SENSÍVEL NÃO ENTRA.** BIN e PAN do cartão, assinatura eletrônica do
-- portador e os dados do responsável pelo sub-estabelecimento saem na rota,
-- ANTES desta tabela — o banco ainda recusa o payload que os traga
-- (`pinbank_eventos_sem_dado_sensivel`).
--
-- ⚠️ **MUDA QUEM PODE CHAMAR O QUÊ** (declarado, para o dono decidir):
--   · `pinbank_registrar_evento`, `pinbank_contexto`, `pinbank_aplicar` e
--     `pinbank_marcar_evento` são SECURITY DEFINER e executáveis SÓ por
--     `service_role` — a rota do webhook, que além disso confere a assinatura
--     Ed25519 da Pinbank e nasce DESLIGADA (`PINBANK_WEBHOOK` ≠ "ligado" → 503).
--   · `admin_pinbank_*`: só administrador da PLATAFORMA (`admin_exigir_acesso`,
--     que registra o acesso).
--   · `pinbank_configurar_vinculo` e `pinbank_eventos_para_reprocessar`:
--     `authenticated`, recusam quem não ADMINISTRA a empresa aberta.
--   · `authenticated` ganha SELECT nas três tabelas, recortado por empresa.
--     Ninguém do cliente insere, altera ou apaga direto.
--
-- ⚠️ **ASSINATURA VENCIDA NÃO PERDE VENDA.** O bloqueio suave (Etapa D) para a
-- escrita de quem está vencido; aqui o evento é GUARDADO como `bloqueado` e
-- entra no reprocessamento depois de regularizar. Perder a venda seria punir o
-- cliente com o próprio dado.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. O VÍNCULO — estabelecimento da Pinbank → empresa
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.pinbank_vinculos (
  id uuid not null default gen_random_uuid() primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  -- `estabelecimento.id` do webhook — o id interno da loja na Pinbank.
  estabelecimento_id bigint check (estabelecimento_id is null or estabelecimento_id > 0),
  -- `estabelecimento.chaveGateway` — a chave da loja no gateway.
  chave_gateway text check (chave_gateway is null or length(chave_gateway) between 1 and 200),
  -- `CodigoCliente` do extrato consolidado (a conferência pelo extrato é a
  -- próxima fase; o campo nasce aqui para o vínculo não precisar mudar).
  codigo_cliente bigint,
  nome text check (nome is null or length(nome) <= 200),
  conta_id uuid references public.financial_accounts(id) on delete set null,
  -- Taxas contratadas, em FRAÇÃO, por forma (debito, credito_vista, parcelado,
  -- pix, voucher). Ausente = não informada: a venda entra sem o custo, com aviso.
  taxas jsonb not null default '{}'::jsonb check (jsonb_typeof(taxas) = 'object'),
  -- Prazos do repasse em dias (debito, credito, pix, antecipado).
  prazos jsonb not null default '{}'::jsonb check (jsonb_typeof(prazos) = 'object'),
  antecipado boolean not null default false,
  ativo boolean not null default false,
  -- Quem ATIVOU responde pelos lançamentos que a maquininha gera
  -- (`movements.lancado_por`): um título sem autor é um título que ninguém
  -- sabe a quem perguntar.
  responsavel_id uuid,
  ativado_em timestamptz,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  excluido_em timestamptz,
  excluido_por uuid,
  excluido_motivo text,
  constraint pinbank_vinculo_tem_chave check (estabelecimento_id is not null or chave_gateway is not null),
  constraint pinbank_vinculo_ativo_tem_responsavel check (not ativo or responsavel_id is not null)
);
alter table public.pinbank_vinculos enable row level security;

create unique index if not exists pinbank_vinculos_estabelecimento_unico
  on public.pinbank_vinculos (estabelecimento_id)
  where estabelecimento_id is not null and excluido_em is null;
create unique index if not exists pinbank_vinculos_chave_unica
  on public.pinbank_vinculos (chave_gateway)
  where chave_gateway is not null and excluido_em is null;
create index if not exists pinbank_vinculos_org_idx on public.pinbank_vinculos (org_id);
create index if not exists pinbank_vinculos_lixeira_idx
  on public.pinbank_vinculos (org_id, excluido_em desc) where excluido_em is not null;

comment on table public.pinbank_vinculos is
  'Estabelecimento da Pinbank → empresa. Criado só pela plataforma (admin_pinbank_vincular); ativado pela empresa (pinbank_configurar_vinculo). Um estabelecimento vivo pertence a UMA empresa.';

-- ───────────────────────────────────────────────────────────────────────────
-- 2. A CAIXA DE ENTRADA DOS EVENTOS
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.pinbank_eventos (
  event_id uuid not null primary key,
  event_type text not null check (length(event_type) <= 100),
  event_version text check (event_version is null or length(event_version) <= 20),
  entity_id text check (entity_id is null or length(entity_id) <= 100),
  ocorrido_em timestamptz not null,
  recebido_em timestamptz not null default now(),
  tentativas integer not null default 1,
  -- Nulos enquanto o estabelecimento não tem vínculo — é a quarentena.
  org_id uuid references public.organizations(id) on delete cascade,
  vinculo_id uuid references public.pinbank_vinculos(id) on delete set null,
  nsu bigint,
  estabelecimento_id bigint,
  chave_gateway text,
  estabelecimento_nome text,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  situacao text not null default 'recebido'
    check (situacao in ('recebido','processado','ignorado','sem_vinculo','aguardando_ativacao','bloqueado','erro')),
  motivo text check (motivo is null or length(motivo) <= 2000),
  processado_em timestamptz,
  -- ⚠️ O banco recusa o que a rota deveria ter tirado. Uma trava só no código
  -- protege o código de hoje.
  constraint pinbank_eventos_sem_dado_sensivel check (
    not (payload -> 'cartao' ? 'pan')
    and not (payload -> 'cartao' ? 'bin')
    and not (payload ? 'assinaturaEletronica')
    and not (payload -> 'estabelecimento' ? 'responsavel')
    and not (payload -> 'subCredenciadora' ? 'cpfCnpj')
  )
);
alter table public.pinbank_eventos enable row level security;

create index if not exists pinbank_eventos_org_idx
  on public.pinbank_eventos (org_id, recebido_em desc) where org_id is not null;
create index if not exists pinbank_eventos_quarentena_idx
  on public.pinbank_eventos (recebido_em desc) where situacao = 'sem_vinculo';
create index if not exists pinbank_eventos_nsu_idx on public.pinbank_eventos (nsu);

comment on table public.pinbank_eventos is
  'Eventos Compra.* recebidos da Pinbank (sem dado sensível). Chave = EventId: a reentrega não duplica. Fora da trilha genérica (é ela própria o registro bruto; o evento sem vínculo não tem empresa).';

-- ───────────────────────────────────────────────────────────────────────────
-- 3. O ESTADO DE CADA TRANSAÇÃO (o que o ciclo já disse)
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.pinbank_transacoes (
  id uuid not null default gen_random_uuid() primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  nsu bigint not null,
  vinculo_id uuid references public.pinbank_vinculos(id) on delete set null,
  status text not null check (status in ('Pendente','Aprovada','Negada','Cancelada','Desfeita','Reembolsada')),
  valor numeric(14,2) not null check (valor >= 0),
  valor_original numeric(14,2) not null check (valor_original >= 0),
  ocorrido_em timestamptz not null,
  sale_doc_id uuid references public.sales_docs(id) on delete restrict,
  -- ⚠️ A trava da concorrência: `pinbank_aplicar` só grava sobre a versão que o
  -- planejador leu. Dois eventos da mesma venda ao mesmo tempo não se apagam.
  versao integer not null default 1,
  atualizado_em timestamptz not null default now(),
  constraint pinbank_transacoes_unica unique (org_id, nsu)
);
alter table public.pinbank_transacoes enable row level security;

comment on table public.pinbank_transacoes is
  'Estado consolidado de cada transação da maquininha Pinbank (o ciclo só anda para a frente). Escrita só por pinbank_aplicar().';

-- ───────────────────────────────────────────────────────────────────────────
-- 4. A TRILHA — vínculo e transação são de negócio
-- ───────────────────────────────────────────────────────────────────────────
drop trigger if exists zz_auditar_pinbank_vinculos on public.pinbank_vinculos;
create trigger zz_auditar_pinbank_vinculos
  after insert or update or delete on public.pinbank_vinculos
  for each row execute function public.auditar_escrita();

drop trigger if exists zz_auditar_pinbank_transacoes on public.pinbank_transacoes;
create trigger zz_auditar_pinbank_transacoes
  after insert or update or delete on public.pinbank_transacoes
  for each row execute function public.auditar_escrita();

-- ───────────────────────────────────────────────────────────────────────────
-- 5. QUEM LÊ (e ninguém escreve direto)
-- ───────────────────────────────────────────────────────────────────────────
revoke all on public.pinbank_vinculos   from public, anon, authenticated, service_role;
revoke all on public.pinbank_eventos    from public, anon, authenticated, service_role;
revoke all on public.pinbank_transacoes from public, anon, authenticated, service_role;
grant select on public.pinbank_vinculos   to authenticated;
grant select on public.pinbank_eventos    to authenticated;
grant select on public.pinbank_transacoes to authenticated;

drop policy if exists pinbank_vinculos_org on public.pinbank_vinculos;
create policy pinbank_vinculos_org on public.pinbank_vinculos
  for select to authenticated using (org_id = public.auth_org_id());
drop policy if exists pinbank_vinculos_esconde_excluido on public.pinbank_vinculos;
create policy pinbank_vinculos_esconde_excluido on public.pinbank_vinculos
  as restrictive for select to authenticated using (excluido_em is null);

drop policy if exists pinbank_eventos_org on public.pinbank_eventos;
create policy pinbank_eventos_org on public.pinbank_eventos
  for select to authenticated using (org_id = public.auth_org_id());

drop policy if exists pinbank_transacoes_org on public.pinbank_transacoes;
create policy pinbank_transacoes_org on public.pinbank_transacoes
  for select to authenticated using (org_id = public.auth_org_id());

-- ───────────────────────────────────────────────────────────────────────────
-- 6. REGISTRAR O EVENTO — só a rota do webhook
-- ───────────────────────────────────────────────────────────────────────────
-- A reentrega (mesmo EventId) soma uma tentativa e devolve a situação que o
-- evento já tem: `processado`/`ignorado` encerram, o resto é processado de novo
-- (o processamento é idempotente pela versão da transação).
create or replace function public.pinbank_registrar_evento(
  p_event_id uuid,
  p_event_type text,
  p_event_version text,
  p_entity_id text,
  p_ocorrido_em timestamptz,
  p_nsu bigint,
  p_estabelecimento_id bigint,
  p_chave_gateway text,
  p_estabelecimento_nome text,
  p_payload jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_novo boolean;
  v_situacao text;
  v_tentativas integer;
begin
  if p_event_id is null or p_event_type is null or p_ocorrido_em is null then
    raise exception 'A4P-PINBANK: evento sem EventId, EventType ou OccurredAt.'
      using errcode = 'check_violation';
  end if;
  insert into public.pinbank_eventos as e
    (event_id, event_type, event_version, entity_id, ocorrido_em, nsu,
     estabelecimento_id, chave_gateway, estabelecimento_nome, payload)
  values
    (p_event_id, left(p_event_type, 100), left(p_event_version, 20), left(p_entity_id, 100),
     p_ocorrido_em, p_nsu, p_estabelecimento_id, left(nullif(btrim(coalesce(p_chave_gateway, '')), ''), 200),
     left(p_estabelecimento_nome, 200), coalesce(p_payload, '{}'::jsonb))
  on conflict (event_id) do update set tentativas = e.tentativas + 1
  returning (xmax = 0), e.situacao, e.tentativas into v_novo, v_situacao, v_tentativas;
  return jsonb_build_object('novo', v_novo, 'situacao', v_situacao, 'tentativas', v_tentativas);
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 7. O CONTEXTO DO EVENTO — o que o planejador precisa saber
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.pinbank_contexto(p_event_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_ev public.pinbank_eventos%rowtype;
  v_vin public.pinbank_vinculos%rowtype;
  v_conta uuid;
  v_estado jsonb;
  v_titulos jsonb := '[]'::jsonb;
  v_sale uuid;
  v_envelope jsonb;
begin
  select * into v_ev from public.pinbank_eventos where event_id = p_event_id;
  if not found then
    raise exception 'A4P-PINBANK: evento % não registrado.', p_event_id using errcode = 'no_data_found';
  end if;

  -- O vínculo vivo do estabelecimento — pelo id da loja, ou pela chave do
  -- gateway quando o id não veio.
  select * into v_vin from public.pinbank_vinculos v
   where v.excluido_em is null
     and ((v_ev.estabelecimento_id is not null and v.estabelecimento_id = v_ev.estabelecimento_id)
       or (v_ev.chave_gateway is not null and v.chave_gateway = v_ev.chave_gateway))
   order by (v.estabelecimento_id = v_ev.estabelecimento_id) desc nulls last
   limit 1;

  -- O envelope guardado: é dele que o reprocessamento remonta a transação, sem
  -- depender de a Pinbank reenviar.
  v_envelope := jsonb_build_object(
    'EventType', v_ev.event_type, 'EventVersion', v_ev.event_version, 'EventId', v_ev.event_id,
    'EntityId', v_ev.entity_id, 'OccurredAt', v_ev.ocorrido_em, 'Data', v_ev.payload);

  if v_vin.id is null then
    update public.pinbank_eventos set org_id = null, vinculo_id = null where event_id = p_event_id;
    return jsonb_build_object('evento_id', p_event_id, 'envelope', v_envelope, 'vinculo', null);
  end if;

  update public.pinbank_eventos set org_id = v_vin.org_id, vinculo_id = v_vin.id where event_id = p_event_id;

  -- ⚠️ A conta escolhida no vínculo vence; só quando NÃO há escolha entra a
  -- primeira conta ativa. Uma conta escolhida e depois desativada não é
  -- trocada em silêncio por outra: o evento volta com erro nomeado.
  if v_vin.conta_id is not null then
    select a.id into v_conta from public.financial_accounts a
     where a.id = v_vin.conta_id and a.org_id = v_vin.org_id and a.excluido_em is null and a.ativo;
  else
    select a.id into v_conta from public.financial_accounts a
     where a.org_id = v_vin.org_id and a.excluido_em is null and a.ativo
     order by a.created_at, a.id limit 1;
  end if;

  select jsonb_build_object(
           'status', t.status, 'ocorridoEm', t.ocorrido_em, 'valor', t.valor,
           'valorOriginal', t.valor_original, 'saleDocId', t.sale_doc_id, 'versao', t.versao),
         t.sale_doc_id
    into v_estado, v_sale
    from public.pinbank_transacoes t
   where t.org_id = v_vin.org_id and t.nsu = v_ev.nsu;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', m.id, 'type', m.type, 'situacao', m.situacao, 'amount', m.amount, 'chave', m.chave)
           order by m.due_date, m.chave), '[]'::jsonb)
    into v_titulos
    from public.movements m
   where m.org_id = v_vin.org_id
     and m.excluido_em is null
     and ((v_sale is not null and m.sale_doc_id = v_sale)
       or m.chave like 'pinbank:' || v_ev.nsu::text || ':%');

  return jsonb_build_object(
    'evento_id', p_event_id,
    'envelope', v_envelope,
    'vinculo', jsonb_build_object(
      'id', v_vin.id, 'orgId', v_vin.org_id, 'ativo', v_vin.ativo, 'contaId', v_conta,
      'taxas', v_vin.taxas, 'prazos', v_vin.prazos, 'antecipado', v_vin.antecipado),
    'pode_escrever', public.org_pode_escrever(v_vin.org_id),
    'estado', v_estado,
    'titulos', v_titulos);
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 8. MARCAR O EVENTO (sem vínculo, aguardando, bloqueado, ignorado, erro)
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.pinbank_marcar_evento(p_event_id uuid, p_situacao text, p_motivo text)
returns void
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
begin
  if p_situacao not in ('ignorado','sem_vinculo','aguardando_ativacao','bloqueado','erro') then
    raise exception 'A4P-PINBANK: situação % não se marca por aqui.', p_situacao using errcode = 'check_violation';
  end if;
  update public.pinbank_eventos
     set situacao = p_situacao, motivo = left(p_motivo, 2000), processado_em = now()
   where event_id = p_event_id;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 9. APLICAR O PLANO — uma transação só
-- ───────────────────────────────────────────────────────────────────────────
-- `p_plano` vem do planejador puro (`core/pinbank/plano`), já com o documento
-- traduzido (`core/vendas/documento.vendaDaPinbank`). O banco não reinventa a
-- regra do dinheiro; ele confere o que pode ser conferido aqui (a versão, o
-- dono dos títulos, a conta, a venda que já existe) e grava tudo ou nada.
create or replace function public.pinbank_aplicar(p_event_id uuid, p_versao integer, p_plano jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_ev public.pinbank_eventos%rowtype;
  v_vin public.pinbank_vinculos%rowtype;
  v_tr public.pinbank_transacoes%rowtype;
  v_acao text := p_plano ->> 'acao';
  v_novo jsonb := p_plano -> 'novoEstado';
  v_doc jsonb := p_plano -> 'documento';
  v_sale uuid;
  v_numero text;
  v_ano int;
  v_maior int;
  v_t jsonb;
  v_conta uuid;
  v_n_titulos int := 0;
  v_n_cancelados int := 0;
  v_avisos text;
begin
  select * into v_ev from public.pinbank_eventos where event_id = p_event_id for update;
  if not found or v_ev.org_id is null or v_ev.nsu is null then
    raise exception 'A4P-PINBANK: evento % sem empresa ou sem NSU — rode o contexto antes.', p_event_id
      using errcode = 'check_violation';
  end if;
  select * into v_vin from public.pinbank_vinculos where id = v_ev.vinculo_id;
  if v_vin.id is null or v_vin.excluido_em is not null or not v_vin.ativo then
    raise exception 'A4P-PINBANK: o vínculo do estabelecimento não está ativo.' using errcode = 'check_violation';
  end if;

  -- ⚠️ Um evento por vez para a MESMA venda. A versão abaixo detecta a corrida;
  -- o lock evita que ela aconteça na primeira gravação (quando ainda não há
  -- linha para travar).
  perform pg_advisory_xact_lock(hashtextextended('pinbank:' || v_ev.org_id::text || ':' || v_ev.nsu::text, 0));
  select * into v_tr from public.pinbank_transacoes where org_id = v_ev.org_id and nsu = v_ev.nsu for update;
  if coalesce(v_tr.versao, 0) <> coalesce(p_versao, 0) then
    raise exception 'A4P-PINBANK-VERSAO: a transação % mudou desde a leitura (versão % ≠ %).',
      v_ev.nsu, coalesce(v_tr.versao, 0), coalesce(p_versao, 0)
      using errcode = 'serialization_failure';
  end if;

  if v_acao in ('criar_venda', 'desfazer_venda') and not public.org_pode_escrever(v_ev.org_id) then
    raise exception 'A4P-PINBANK-BLOQUEIO: a assinatura da empresa está vencida; o evento fica guardado e entra ao regularizar.'
      using errcode = 'insufficient_privilege';
  end if;

  v_sale := v_tr.sale_doc_id;

  if v_acao = 'criar_venda' then
    if v_sale is not null then
      raise exception 'A4P-PINBANK: a venda do NSU % já está lançada.', v_ev.nsu using errcode = 'unique_violation';
    end if;
    v_conta := nullif(v_doc ->> 'account_id', '')::uuid;
    if v_conta is null or not exists (
      select 1 from public.financial_accounts a
       where a.id = v_conta and a.org_id = v_ev.org_id and a.excluido_em is null and a.ativo) then
      raise exception 'A4P-PINBANK: a conta do repasse não é uma conta ativa desta empresa.' using errcode = 'check_violation';
    end if;

    -- O número é MÁXIMO + 1 do ano, decidido aqui e sob trava da empresa: duas
    -- vendas da maquininha no mesmo segundo não tiram o mesmo número.
    v_ano := extract(year from (v_doc ->> 'doc_date')::date);
    perform pg_advisory_xact_lock(hashtextextended('sales_docs_numero:' || v_ev.org_id::text, 0));
    select coalesce(max(nullif(regexp_replace(substr(d.numero, 6), '\D', '', 'g'), '')::int), 0)
      into v_maior
      from public.sales_docs d
     where d.org_id = v_ev.org_id and d.excluido_em is null and d.numero like v_ano::text || '-%';
    v_numero := v_ano::text || '-' || lpad((v_maior + 1)::text, 4, '0');

    insert into public.sales_docs
      (id, org_id, kind, item_kind, numero, doc_date, competence_date, due_date, account_id,
       subtotal, discount, total, status, status_nf, notes, detalhe)
    values
      ((v_doc ->> 'id')::uuid, v_ev.org_id, 'venda', 'produto', v_numero,
       (v_doc ->> 'doc_date')::date, (v_doc ->> 'competence_date')::date, (v_doc ->> 'due_date')::date,
       v_conta, coalesce((v_doc ->> 'subtotal')::numeric, 0), 0, (v_doc ->> 'total')::numeric,
       'aprovada', 'a_emitir', null,
       coalesce(v_doc -> 'detalhe', '{}'::jsonb) || jsonb_build_object('numero', v_numero))
    returning id into v_sale;

    insert into public.sale_items (doc_id, org_id, product_id, description, qty, unit_price, discount, total)
    select v_sale, v_ev.org_id, null, left(i ->> 'description', 500),
           (i ->> 'qty')::numeric, (i ->> 'unit_price')::numeric, 0, (i ->> 'total')::numeric
      from jsonb_array_elements(coalesce(p_plano -> 'itens', '[]'::jsonb)) i;

    for v_t in select * from jsonb_array_elements(coalesce(p_plano -> 'titulos', '[]'::jsonb)) loop
      perform public.pinbank_inserir_titulo(v_ev.org_id, v_conta, v_sale, v_vin.responsavel_id, v_ev.nsu, v_t);
      v_n_titulos := v_n_titulos + 1;
    end loop;

  elsif v_acao = 'desfazer_venda' then
    if v_sale is null then
      raise exception 'A4P-PINBANK: não há venda lançada para o NSU %.', v_ev.nsu using errcode = 'no_data_found';
    end if;
    select s.account_id into v_conta from public.sales_docs s where s.id = v_sale;

    -- Só os títulos DESTA venda, e só o que ainda não se moveu. O que já caiu
    -- na conta não é reescrito: entra o estorno.
    update public.movements m
       set situacao = 'cancelado'
     where m.id in (select (x #>> '{}')::uuid from jsonb_array_elements(coalesce(p_plano -> 'cancelar', '[]'::jsonb)) x)
       and m.org_id = v_ev.org_id
       and m.sale_doc_id = v_sale
       and m.situacao in ('previsto', 'confirmado');
    get diagnostics v_n_cancelados = row_count;

    for v_t in select * from jsonb_array_elements(coalesce(p_plano -> 'estornos', '[]'::jsonb)) loop
      perform public.pinbank_inserir_titulo(v_ev.org_id, v_conta, v_sale, v_vin.responsavel_id, v_ev.nsu, v_t);
      v_n_titulos := v_n_titulos + 1;
    end loop;

    update public.sales_docs
       set status = case when p_plano ->> 'statusVenda' = 'reembolsada' then 'reembolsada' else 'cancelada' end
     where id = v_sale and org_id = v_ev.org_id;

  elsif v_acao <> 'registrar' then
    raise exception 'A4P-PINBANK: ação % não se aplica por aqui.', v_acao using errcode = 'check_violation';
  end if;

  if v_novo is not null and jsonb_typeof(v_novo) = 'object' then
    insert into public.pinbank_transacoes as t
      (org_id, nsu, vinculo_id, status, valor, valor_original, ocorrido_em, sale_doc_id, versao, atualizado_em)
    values
      (v_ev.org_id, v_ev.nsu, v_vin.id, v_novo ->> 'status', (v_novo ->> 'valor')::numeric,
       (v_novo ->> 'valorOriginal')::numeric, (v_novo ->> 'ocorridoEm')::timestamptz, v_sale, 1, now())
    on conflict (org_id, nsu) do update
      set status = excluded.status, valor = excluded.valor, valor_original = excluded.valor_original,
          ocorrido_em = excluded.ocorrido_em, sale_doc_id = coalesce(t.sale_doc_id, excluded.sale_doc_id),
          vinculo_id = excluded.vinculo_id, versao = t.versao + 1, atualizado_em = now();
  end if;

  select string_agg(a #>> '{}', ' · ') into v_avisos
    from jsonb_array_elements(coalesce(p_plano -> 'avisos', '[]'::jsonb)) a;
  update public.pinbank_eventos
     set situacao = 'processado', processado_em = now(),
         motivo = left(coalesce(nullif(concat_ws(' · ', p_plano ->> 'motivo', v_avisos), ''), null), 2000)
   where event_id = p_event_id;

  return jsonb_build_object('ok', true, 'acao', v_acao, 'sale_doc_id', v_sale,
                            'titulos', v_n_titulos, 'cancelados', v_n_cancelados);
end;
$$;

-- O título da maquininha — uma forma só, para a venda e para o estorno.
create or replace function public.pinbank_inserir_titulo(
  p_org uuid, p_conta uuid, p_sale uuid, p_autor uuid, p_nsu bigint, p_t jsonb
)
returns uuid
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_id uuid;
  v_cat uuid;
  v_chave text := p_t ->> 'chave';
begin
  -- ⚠️ A chave é da maquininha e do NSU: um título com outra chave vindo por
  -- aqui seria um escritor de dinheiro sem dono.
  if v_chave is null or v_chave not like 'pinbank:' || p_nsu::text || ':%' then
    raise exception 'A4P-PINBANK: título com chave % fora do NSU %.', v_chave, p_nsu using errcode = 'check_violation';
  end if;
  if (p_t ->> 'type') not in ('entrada', 'saida') then
    raise exception 'A4P-PINBANK: tipo de título inválido.' using errcode = 'check_violation';
  end if;

  -- A categoria do cadastro, quando é seguro (a regra de
  -- `vincular_categorias_por_nome`): nome único, viva e FOLHA. Senão fica o
  -- texto, que é o que o DRE lê.
  select (array_agg(c.id))[1] into v_cat
    from public.categories c
   where c.org_id = p_org and c.excluido_em is null and coalesce(c.active, true)
     and lower(btrim(c.name)) = lower(btrim(p_t ->> 'category'))
     and not exists (select 1 from public.categories f where f.parent_id = c.id and f.excluido_em is null)
  having count(*) = 1;

  insert into public.movements
    (org_id, account_id, type, situacao, amount, due_date, competence_date, category, category_id,
     description, origem, especie, sale_doc_id, chave, nsu, lancado_por)
  values
    (p_org, p_conta, (p_t ->> 'type')::public.movement_type, 'previsto', (p_t ->> 'amount')::numeric,
     (p_t ->> 'due_date')::date, (p_t ->> 'competence_date')::date, p_t ->> 'category', v_cat,
     left(p_t ->> 'description', 500), 'venda', 'titulo', p_sale, v_chave, p_nsu::text, p_autor)
  returning id into v_id;
  return v_id;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 10. A PLATAFORMA VINCULA (e desvincula), e vê a quarentena
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.admin_pinbank_vincular(
  p_org uuid, p_estabelecimento_id bigint, p_chave_gateway text, p_nome text, p_codigo_cliente bigint default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_id uuid;
begin
  perform public.admin_exigir_acesso('admin_pinbank_vincular', p_org::text);
  if not exists (select 1 from public.organizations o where o.id = p_org) then
    raise exception 'A4P-PINBANK: empresa % não existe.', p_org using errcode = 'no_data_found';
  end if;
  insert into public.pinbank_vinculos (org_id, estabelecimento_id, chave_gateway, nome, codigo_cliente, criado_por)
  values (p_org, p_estabelecimento_id, nullif(btrim(coalesce(p_chave_gateway, '')), ''),
          nullif(btrim(coalesce(p_nome, '')), ''), p_codigo_cliente, auth.uid())
  returning id into v_id;

  -- A quarentena desse estabelecimento passa a esperar a ATIVAÇÃO da empresa.
  update public.pinbank_eventos e
     set org_id = p_org, vinculo_id = v_id, situacao = 'aguardando_ativacao',
         motivo = 'Vinculado pela plataforma; aguardando a empresa ativar.'
   where e.situacao = 'sem_vinculo'
     and ((p_estabelecimento_id is not null and e.estabelecimento_id = p_estabelecimento_id)
       or (p_chave_gateway is not null and e.chave_gateway = btrim(p_chave_gateway)));

  insert into public.admin_audit (admin_id, action, target, detail)
  values (auth.uid(), 'pinbank.vincular', p_org::text,
          jsonb_build_object('vinculo', v_id, 'estabelecimento_id', p_estabelecimento_id,
                             'chave_gateway', p_chave_gateway, 'nome', p_nome));
  return v_id;
end;
$$;

create or replace function public.admin_pinbank_desvincular(p_vinculo uuid, p_motivo text)
returns void
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_org uuid;
begin
  perform public.admin_exigir_acesso('admin_pinbank_desvincular', p_vinculo::text);
  if length(btrim(coalesce(p_motivo, ''))) < 10 then
    raise exception 'A4P-PINBANK: desvincular exige motivo (10+ caracteres).' using errcode = 'check_violation';
  end if;
  update public.pinbank_vinculos
     set ativo = false, excluido_em = now(), excluido_por = auth.uid(), excluido_motivo = btrim(p_motivo)
   where id = p_vinculo and excluido_em is null
  returning org_id into v_org;
  if v_org is null then
    raise exception 'A4P-PINBANK: vínculo % não encontrado.', p_vinculo using errcode = 'no_data_found';
  end if;
  insert into public.admin_audit (admin_id, action, target, detail)
  values (auth.uid(), 'pinbank.desvincular', v_org::text,
          jsonb_build_object('vinculo', p_vinculo, 'motivo', btrim(p_motivo)));
end;
$$;

create or replace function public.admin_pinbank_painel()
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
begin
  perform public.admin_exigir_acesso('admin_pinbank_painel', null);
  return jsonb_build_object(
    'vinculos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', v.id, 'org_id', v.org_id, 'empresa', o.name,
               'estabelecimento_id', v.estabelecimento_id, 'chave_gateway', v.chave_gateway,
               'nome', v.nome, 'ativo', v.ativo, 'criado_em', v.criado_em) order by v.criado_em desc)
        from public.pinbank_vinculos v join public.organizations o on o.id = v.org_id
       where v.excluido_em is null), '[]'::jsonb),
    'quarentena', coalesce((
      select jsonb_agg(s.q order by s.ultimo desc)
        from (
          select jsonb_build_object(
                   'estabelecimento_id', e.estabelecimento_id, 'chave_gateway', e.chave_gateway,
                   'nome', max(e.estabelecimento_nome), 'eventos', count(*),
                   'ultimo', max(e.recebido_em)) as q,
                 max(e.recebido_em) as ultimo
            from public.pinbank_eventos e
           where e.situacao = 'sem_vinculo'
           group by e.estabelecimento_id, e.chave_gateway
           limit 200
        ) s), '[]'::jsonb));
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 11. A EMPRESA ATIVA (a segunda chave) e pede o reprocessamento
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.pinbank_configurar_vinculo(
  p_vinculo uuid, p_conta uuid, p_taxas jsonb, p_prazos jsonb, p_antecipado boolean, p_ativo boolean
)
returns void
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_org uuid := public.auth_org_id();
  k text;
  v numeric;
begin
  if v_org is null or not public.tem_permissao('administrar', v_org) then
    raise exception 'A4P-PINBANK: só quem administra a empresa configura a maquininha.'
      using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.pinbank_vinculos where id = p_vinculo and org_id = v_org and excluido_em is null) then
    raise exception 'A4P-PINBANK: maquininha não vinculada a esta empresa.' using errcode = 'no_data_found';
  end if;
  if p_conta is not null and not exists (
    select 1 from public.financial_accounts a where a.id = p_conta and a.org_id = v_org and a.excluido_em is null and a.ativo) then
    raise exception 'A4P-PINBANK: a conta do repasse precisa ser uma conta ATIVA desta empresa.' using errcode = 'check_violation';
  end if;
  -- Taxa é fração entre 0 e 1 (0,0199 = 1,99%). "2" quase sempre é alguém que
  -- digitou o percentual — e lançaria um custo de 200% em toda venda.
  for k, v in select key, (value #>> '{}')::numeric from jsonb_each(coalesce(p_taxas, '{}'::jsonb))
              where jsonb_typeof(value) = 'number' loop
    if k not in ('debito','credito_vista','parcelado','pix','voucher') or v < 0 or v >= 1 then
      raise exception 'A4P-PINBANK: taxa % = % fora de 0 a 1 (fração: 1,99%% = 0.0199).', k, v using errcode = 'check_violation';
    end if;
  end loop;
  for k, v in select key, (value #>> '{}')::numeric from jsonb_each(coalesce(p_prazos, '{}'::jsonb))
              where jsonb_typeof(value) = 'number' loop
    if k not in ('debito','credito','pix','antecipado') or v < 0 or v > 365 or v <> trunc(v) then
      raise exception 'A4P-PINBANK: prazo % = % fora de 0 a 365 dias inteiros.', k, v using errcode = 'check_violation';
    end if;
  end loop;

  update public.pinbank_vinculos
     set conta_id = p_conta,
         taxas = coalesce(p_taxas, '{}'::jsonb),
         prazos = coalesce(p_prazos, '{}'::jsonb),
         antecipado = coalesce(p_antecipado, false),
         ativo = coalesce(p_ativo, false),
         -- Quem ATIVA passa a responder pelos lançamentos.
         responsavel_id = case when coalesce(p_ativo, false) and not ativo then auth.uid() else responsavel_id end,
         ativado_em = case when coalesce(p_ativo, false) and not ativo then now() else ativado_em end
   where id = p_vinculo and org_id = v_org;
end;
$$;

-- Os eventos desta empresa que podem ser reprocessados — a rota usa a lista
-- (pergunta feita COMO a pessoa, portanto recortada pela permissão dela) e
-- processa com a chave de serviço.
create or replace function public.pinbank_eventos_para_reprocessar(p_limite integer default 200)
returns setof uuid
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_org uuid := public.auth_org_id();
begin
  if v_org is null or not public.tem_permissao('administrar', v_org) then
    raise exception 'A4P-PINBANK: só quem administra a empresa reprocessa os eventos da maquininha.'
      using errcode = 'insufficient_privilege';
  end if;
  return query
    select e.event_id from public.pinbank_eventos e
     where e.org_id = v_org and e.situacao in ('aguardando_ativacao','bloqueado','erro','recebido')
     order by e.ocorrido_em
     limit greatest(1, least(coalesce(p_limite, 200), 500));
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 12. QUEM CHAMA O QUÊ
-- ───────────────────────────────────────────────────────────────────────────
revoke all on function public.pinbank_registrar_evento(uuid, text, text, text, timestamptz, bigint, bigint, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.pinbank_contexto(uuid) from public, anon, authenticated;
revoke all on function public.pinbank_marcar_evento(uuid, text, text) from public, anon, authenticated;
revoke all on function public.pinbank_aplicar(uuid, integer, jsonb) from public, anon, authenticated;
revoke all on function public.pinbank_inserir_titulo(uuid, uuid, uuid, uuid, bigint, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.pinbank_registrar_evento(uuid, text, text, text, timestamptz, bigint, bigint, text, text, jsonb) to service_role;
grant execute on function public.pinbank_contexto(uuid) to service_role;
grant execute on function public.pinbank_marcar_evento(uuid, text, text) to service_role;
grant execute on function public.pinbank_aplicar(uuid, integer, jsonb) to service_role;

revoke all on function public.admin_pinbank_vincular(uuid, bigint, text, text, bigint) from public, anon;
revoke all on function public.admin_pinbank_desvincular(uuid, text) from public, anon;
revoke all on function public.admin_pinbank_painel() from public, anon;
grant execute on function public.admin_pinbank_vincular(uuid, bigint, text, text, bigint) to authenticated;
grant execute on function public.admin_pinbank_desvincular(uuid, text) to authenticated;
grant execute on function public.admin_pinbank_painel() to authenticated;

revoke all on function public.pinbank_configurar_vinculo(uuid, uuid, jsonb, jsonb, boolean, boolean) from public, anon;
revoke all on function public.pinbank_eventos_para_reprocessar(integer) from public, anon;
grant execute on function public.pinbank_configurar_vinculo(uuid, uuid, jsonb, jsonb, boolean, boolean) to authenticated;
grant execute on function public.pinbank_eventos_para_reprocessar(integer) to authenticated;
