-- Integração OWN/Agilli — All4Pay. Alimentada por webhook (tempo real) e por
-- pull de reconciliação. Toda entidade tem chave natural da OWN e é gravada por
-- UPSERT: as duas pernas podem trazer o mesmo fato e o resultado tem que ser igual.

create table if not exists public.own_lojistas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  doc_parceiro text not null,
  razao_social text,
  nome_fantasia text,
  numero_contrato text,
  conveniada_id text,
  cnpj_cliente text,
  mcc text,
  cnae text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint own_lojistas_doc_unico unique (org_id, doc_parceiro)
);
comment on table public.own_lojistas is 'Estabelecimento final que tem a maquininha da All4Pay. É o "parceiro" na terminologia da OWN. doc_parceiro é a chave que isola os dados de um cliente — nenhuma consulta do ERP pode existir sem ele.';
comment on column public.own_lojistas.doc_parceiro is 'CPF ou CNPJ do lojista, só dígitos. Corresponde a docParceiro / cnpjCpfParceiro na API da OWN.';
comment on column public.own_lojistas.cnpj_cliente is 'CNPJ enviado como cnpjCliente nas consultas desta conta. Guardado por lojista porque a premissa "é sempre o CNPJ da Privilege" ainda não se confirmou em sandbox.';
comment on column public.own_lojistas.conveniada_id is 'ID interno da OWN (aparece em mensagens de erro como "conveniada ID"). Útil para abrir chamado com o suporte.';

create table if not exists public.own_terminais (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  lojista_id uuid references public.own_lojistas(id) on delete set null,
  numero_serie text not null,
  modelo text,
  numero_contrato text,
  doc_parceiro text,
  data_ativacao date,
  data_inativacao date,
  status text,
  numero_serie_antigo text,
  raw jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint own_terminais_serie_unica unique (org_id, numero_serie, data_ativacao)
);
comment on table public.own_terminais is 'Histórico de maquininhas por contrato, vindo de /agilli/historico/v2/numero-serie. Existe por um motivo específico: quando o lojista troca de equipamento, as transações antigas continuam apontando para o número de série velho. Sem esta tabela o ERP perde metade do extrato na troca.';
comment on column public.own_terminais.status is 'Status na OWN. "A" = ativo, observado em sandbox.';
create index if not exists own_terminais_lojista_idx on public.own_terminais (org_id, lojista_id);
create index if not exists own_terminais_serie_idx on public.own_terminais (numero_serie);

create table if not exists public.own_transacoes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  lojista_id uuid references public.own_lojistas(id) on delete set null,
  identificador_transacao text not null,
  doc_parceiro text not null,
  cnpj_cliente text,
  data_transacao timestamptz not null,
  numero_serie text,
  terminal text,
  valor numeric(14,2) not null,
  quantidade_parcelas integer not null default 1,
  mdr numeric(14,2),
  valor_antecipacao_total numeric(14,2),
  taxa_antecipacao_total numeric(9,4),
  status_transacao text not null,
  bandeira text,
  modalidade text,
  codigo_autorizacao text,
  numero_cartao text,
  mcc text,
  nome_portador text,
  origem text not null default 'pull',
  visto_em_webhook_em timestamptz,
  visto_em_pull_em timestamptz,
  raw jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint own_transacoes_id_unico unique (org_id, identificador_transacao),
  constraint own_transacoes_origem_ck check (origem in ('webhook','pull','ambos')),
  constraint own_transacoes_cartao_mascarado_ck check (numero_cartao is null or numero_cartao !~ '^[0-9]{13,19}$')
);
comment on table public.own_transacoes is 'Uma linha por transação, não por evento. identificadorTransacao é estável: o webhook de estorno reusa o mesmo identificador da venda confirmada, mudando só tipoTransacao. Por isso status_transacao é atualizado no lugar, e o histórico de eventos vive em own_webhook_eventos.';
comment on column public.own_transacoes.origem is 'De onde o registro chegou primeiro: webhook (tempo real), pull (reconciliação) ou ambos. É a métrica que diz se a perna 1 está perdendo evento.';
comment on column public.own_transacoes.numero_cartao is 'PAN mascarado como a OWN entrega (ex. 52343107****9237). O CHECK recusa cartão completo — esta base não é ambiente PCI.';
comment on column public.own_transacoes.status_transacao is 'VENDA CONFIRMADA | ESTORNADA | CANCELADA | PENDENTE | LIQUIDADA | LIQUIDADA PARCIALMENTE.';
create index if not exists own_transacoes_lojista_data_idx on public.own_transacoes (org_id, lojista_id, data_transacao desc);
create index if not exists own_transacoes_doc_data_idx on public.own_transacoes (org_id, doc_parceiro, data_transacao desc);
create index if not exists own_transacoes_status_idx on public.own_transacoes (org_id, status_transacao);
create index if not exists own_transacoes_serie_idx on public.own_transacoes (numero_serie);

create table if not exists public.own_parcelas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  transacao_id uuid references public.own_transacoes(id) on delete cascade,
  parcela_id bigint not null,
  identificador_transacao text,
  numero_parcela integer,
  status_pagamento text,
  valor_parcela numeric(14,2),
  mdr numeric(14,2),
  data_transacao timestamptz,
  data_pagamento_prevista date,
  data_pagamento_real date,
  valor_antecipado numeric(14,2),
  taxa_antecipada numeric(9,4),
  antecipada boolean,
  numero_titulo text,
  raw jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint own_parcelas_id_unico unique (org_id, parcela_id)
);
comment on table public.own_parcelas is 'Parcelas de uma transação. Chega por dois caminhos com nomes diferentes para o mesmo campo: buscaTransacoesGerais usa parcelaId/taxaAntecipada/antecipado, buscaParcela usa idParcela/antecipada. Normalizado aqui — o ERP não deve ver essa inconsistência.';
comment on column public.own_parcelas.antecipada is 'Booleano. A OWN entrega "S"/"N" em campos de nome diferente conforme o endpoint.';
comment on column public.own_parcelas.numero_titulo is 'Texto de propósito: a OWN devolve ora número, ora string, e há títulos com zero à esquerda.';
create index if not exists own_parcelas_transacao_idx on public.own_parcelas (transacao_id);
create index if not exists own_parcelas_prev_idx on public.own_parcelas (org_id, data_pagamento_prevista);
create index if not exists own_parcelas_titulo_idx on public.own_parcelas (org_id, numero_titulo);

create table if not exists public.own_antecipacoes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  antecipacao_id bigint not null,
  parcela_id bigint not null,
  parcela_uuid uuid references public.own_parcelas(id) on delete cascade,
  valor_bruto_antecipado numeric(14,2),
  valor_liquido_antecipado numeric(14,2),
  taxa_antecipacao numeric(9,4),
  data_antecipacao timestamptz,
  raw jsonb,
  criado_em timestamptz not null default now(),
  constraint own_antecipacoes_unica unique (org_id, antecipacao_id, parcela_id)
);
comment on table public.own_antecipacoes is 'detalheAntecipacao de cada parcela. A chave é composta porque a OWN reusa o mesmo id de antecipação para parcelas diferentes da mesma operação — visto no exemplo da doc v5.3 (id 57567668 em duas parcelas).';

create table if not exists public.own_liquidacoes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  lojista_id uuid references public.own_lojistas(id) on delete set null,
  lancamento_id bigint not null,
  identificador_transacao text,
  doc_parceiro text,
  codigo_cliente text,
  numero_parcela integer,
  numero_titulo text,
  nsu_transacao text,
  status_pagamento text,
  valor numeric(14,2),
  mdr numeric(14,2),
  valor_antecipado numeric(14,2),
  taxa_antecipacao numeric(9,4),
  antecipada boolean,
  data_pagamento_prevista date,
  data_pagamento_real date,
  origem text not null default 'pull',
  raw jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint own_liquidacoes_unica unique (org_id, lancamento_id),
  constraint own_liquidacoes_origem_ck check (origem in ('webhook','pull','ambos'))
);
comment on table public.own_liquidacoes is 'O que efetivamente caiu na conta do lojista. Vem de consultaLiquidacoes (pull por data) e do webhook de liquidações — que entrega um ARRAY, não um objeto; o receptor precisa iterar.';
comment on column public.own_liquidacoes.data_pagamento_prevista is 'Cuidado na ingestão: o webhook entrega dd/MM/aa e a consulta entrega dd/MM/yyyy. Normalizar antes de gravar.';
create index if not exists own_liquidacoes_lojista_data_idx on public.own_liquidacoes (org_id, lojista_id, data_pagamento_real desc);
create index if not exists own_liquidacoes_transacao_idx on public.own_liquidacoes (org_id, identificador_transacao);

create table if not exists public.own_webhook_eventos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  tipo text not null,
  chave_idempotencia text not null,
  payload jsonb not null,
  identificador_transacao text,
  doc_parceiro text,
  recebido_em timestamptz not null default now(),
  processado_em timestamptz,
  tentativas integer not null default 0,
  erro text,
  ip_origem inet,
  constraint own_webhook_eventos_idem unique (chave_idempotencia),
  constraint own_webhook_eventos_tipo_ck check (tipo in ('transacao','liquidacao','cadastro','desconhecido'))
);
comment on table public.own_webhook_eventos is 'Todo POST recebido da OWN cai aqui ANTES de virar transação. Duas razões: a OWN reentrega até receber 200/204, então o receptor precisa responder rápido e processar depois; e quando o parser quebrar, o payload original ainda existe para reprocessar.';
comment on column public.own_webhook_eventos.chave_idempotencia is 'Hash do conteúdo semântico do evento, não do identificadorTransacao sozinho — venda confirmada e venda estornada compartilham o identificador. Regra: identificadorTransacao + tipoTransacao + data + valor.';
create index if not exists own_webhook_pendentes_idx on public.own_webhook_eventos (recebido_em) where processado_em is null;
create index if not exists own_webhook_tx_idx on public.own_webhook_eventos (identificador_transacao);

create table if not exists public.own_sync_execucoes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  endpoint text not null,
  janela_inicio timestamptz,
  janela_fim timestamptz,
  iniciado_em timestamptz not null default now(),
  concluido_em timestamptz,
  status text not null default 'rodando',
  registros_lidos integer default 0,
  registros_novos integer default 0,
  registros_alterados integer default 0,
  faltaram_no_webhook integer default 0,
  erro text,
  detalhe jsonb,
  constraint own_sync_status_ck check (status in ('rodando','ok','erro','bloqueado_perimetro'))
);
comment on table public.own_sync_execucoes is 'Diário de bordo da perna 2. faltaram_no_webhook é a métrica que justifica a existência do pull: se ficar em zero por meses, o job vira só custo; se subir, a perna 1 está falhando e alguém precisa saber.';
comment on column public.own_sync_execucoes.status is 'bloqueado_perimetro é status próprio de propósito — 429/Cloudflare não é falha de código e não deve acordar ninguém como se fosse.';

create table if not exists public.own_erp_credenciais (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  lojista_id uuid not null references public.own_lojistas(id) on delete cascade,
  nome text not null,
  chave_prefixo text not null,
  chave_hash text not null,
  escopos text[] not null default array['transacoes:ler','liquidacoes:ler'],
  ativo boolean not null default true,
  expira_em timestamptz,
  ultimo_uso_em timestamptz,
  criado_em timestamptz not null default now(),
  revogado_em timestamptz,
  constraint own_erp_prefixo_unico unique (chave_prefixo)
);
comment on table public.own_erp_credenciais is 'Uma chave por integração de ERP, amarrada a UM lojista. É isto que permite não expor a API da OWN: o ERP fala com a All4Pay, a All4Pay fala com a OWN. Guarda-se só o hash — a chave em claro aparece uma vez, na criação.';
comment on column public.own_erp_credenciais.chave_prefixo is 'Primeiros caracteres da chave, em claro, para localizar o registro sem quebrar o hash. Ex.: a4p_live_7f3a.';

alter table public.own_lojistas enable row level security;
alter table public.own_terminais enable row level security;
alter table public.own_transacoes enable row level security;
alter table public.own_parcelas enable row level security;
alter table public.own_antecipacoes enable row level security;
alter table public.own_liquidacoes enable row level security;
alter table public.own_webhook_eventos enable row level security;
alter table public.own_sync_execucoes enable row level security;
alter table public.own_erp_credenciais enable row level security;

do $$
declare t text;
begin
  foreach t in array array['own_lojistas','own_terminais','own_transacoes','own_parcelas','own_antecipacoes','own_liquidacoes','own_webhook_eventos','own_sync_execucoes','own_erp_credenciais'] loop
    execute format('create policy %I on public.%I for all to authenticated using (org_id = auth_org_id()) with check (org_id = auth_org_id())', 'org rw '||t, t);
  end loop;
end $$;

revoke insert, update, delete on public.own_webhook_eventos from authenticated;
revoke insert, update, delete on public.own_erp_credenciais from authenticated;

create or replace function public.own_touch() returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['own_lojistas','own_terminais','own_transacoes','own_parcelas','own_liquidacoes'] loop
    execute format('drop trigger if exists %I on public.%I', t||'_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.own_touch()', t||'_touch', t);
  end loop;
end $$;

create or replace view public.own_extrato_lojista
with (security_invoker = true) as
select
  t.org_id,
  t.lojista_id,
  l.doc_parceiro,
  t.identificador_transacao,
  t.data_transacao,
  t.valor as valor_bruto,
  t.mdr as taxa_mdr,
  (t.valor - coalesce(t.mdr,0)) as valor_liquido_previsto,
  t.quantidade_parcelas,
  t.status_transacao,
  t.bandeira,
  t.modalidade,
  t.numero_cartao,
  t.numero_serie,
  t.codigo_autorizacao,
  (select count(*) from public.own_parcelas p where p.transacao_id = t.id and p.status_pagamento ilike 'pago') as parcelas_pagas,
  (select coalesce(sum(p.valor_parcela),0) from public.own_parcelas p where p.transacao_id = t.id and p.status_pagamento ilike 'pago') as valor_ja_liquidado,
  (select min(p.data_pagamento_prevista) from public.own_parcelas p where p.transacao_id = t.id and p.data_pagamento_real is null) as proximo_vencimento
from public.own_transacoes t
join public.own_lojistas l on l.id = t.lojista_id;

comment on view public.own_extrato_lojista is 'Forma estável que o ERP do lojista enxerga. Não expõe cnpj_cliente da Privilege nem estrutura da adquirente — se a OWN mudar de schema amanhã, esta view absorve a mudança e o contrato com o ERP não quebra.';