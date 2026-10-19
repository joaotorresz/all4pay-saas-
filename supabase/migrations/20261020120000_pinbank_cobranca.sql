-- ═══════════════════════════════════════════════════════════════════════════
-- COBRANÇA POR PIX E BOLETO PELA CONTA PINBANK — etapas 2 e 3 (20/10/2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Um título A RECEBER vira uma cobrança emitida pela conta Pinbank da empresa:
-- um QR Pix dinâmico (`Pix/SolicitarDynamicQrCode`) ou um boleto
-- (`CashIn/GerarBoleto`). Esta migration é a FECHADURA; a chamada à Pinbank
-- mora em `/api/pinbank/cobranca` (que nasce DESLIGADA: `PINBANK_COBRANCA`).
--
-- ⚠️ **QUEM RECEBE O DINHEIRO É O `CodigoCliente`, E ELE NÃO VEM DO PEDIDO.**
-- Ele sai do vínculo da maquininha (`pinbank_vinculos.codigo_cliente`), que só
-- a PLATAFORMA digita, e a restrição de exclusão de 20261014120100 já impede o
-- mesmo código vivo em duas empresas. Se a empresa pudesse escolher o código,
-- bastaria digitar o da loja vizinha para o cliente dela pagar à vizinha.
-- (Que o código da conta digital seja o MESMO do extrato é pergunta aberta à
-- Pinbank — `docs/rodada-10/cobranca.md`; se não for, ganha coluna própria,
-- também só da plataforma.)
--
-- ⚠️ **DUAS CHAVES, como na maquininha.** A plataforma vincula (o código); a
-- EMPRESA liga a cobrança (`pinbank_cobranca_configurar`, quem ADMINISTRA).
-- Sem as duas, o botão nem aparece.
--
-- ⚠️ **UMA COBRANÇA VIVA POR TÍTULO E POR TIPO.** Índice único parcial: o
-- clique duplo e as duas abas não emitem dois QR para o mesmo título — que o
-- cliente da empresa poderia pagar duas vezes.
--
-- ⚠️ **RESERVA ANTES DA REDE, REGISTRO SÓ PELO SERVIDOR.** A pessoa RESERVA
-- (`pinbank_cobranca_reservar`, com o papel de lançar): a linha nasce
-- `reservada` com o NSU de origem, o valor e o vencimento do TÍTULO (nunca do
-- pedido). O resultado da Pinbank só é gravado por `pinbank_cobranca_registrar`,
-- executável SÓ por `service_role` — senão qualquer lançador gravaria um "QR"
-- ou uma "linha digitável" que paga a conta de outra pessoa, com a cara da
-- cobrança da empresa.
--
-- ⚠️ **A FALHA DEPOIS DE ENVIADO É `incerta`, NUNCA `falhou`.** O pedido pode
-- ter chegado e a cobrança existir na Pinbank; tratá-lo como falha liberaria
-- uma segunda emissão para o mesmo título. `incerta` segura o título até a
-- conferência (próxima etapa).
--
-- ⚠️ **TÍTULO QUE MUDA DEPOIS DE EMITIDO deixa a cobrança `a_cancelar`.**
-- Valor, vencimento, pagador, cancelamento, exclusão ou baixa manual: o QR e o
-- boleto antigos continuam pagáveis na Pinbank até serem cancelados lá
-- (próxima etapa). Enquanto isso, a tela não os mostra mais e uma nova emissão
-- do mesmo tipo é recusada — duas cobranças vivas são o pagamento em dobro.
--
-- ⚠️ **MUDA QUEM PODE CHAMAR O QUÊ** (declarado, para o dono decidir): é o
-- primeiro caminho em que a EMPRESA faz a Pinbank CRIAR algo (uma cobrança) —
-- a conferência só lia. Nenhum caminho PAGA, transfere ou devolve dinheiro.
--   · `pinbank_cobranca_configurar`: `authenticated`, recusa quem não
--     administra a empresa do vínculo.
--   · `pinbank_cobranca_reservar`: `authenticated`, recusa quem não pode
--     lançar na empresa ABERTA (que é a do título).
--   · `pinbank_cobranca_registrar`: SÓ `service_role`.
--   · `authenticated` ganha SELECT em `pinbank_cobrancas`, recortado por
--     empresa. Ninguém do cliente insere, altera ou apaga direto.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. A SEGUNDA CHAVE — a empresa liga a cobrança no vínculo
-- ───────────────────────────────────────────────────────────────────────────
alter table public.pinbank_vinculos
  add column if not exists cobranca_ativa boolean not null default false,
  add column if not exists cobranca_ativada_por uuid,
  add column if not exists cobranca_ativada_em timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pinbank_vinculo_cobranca_tem_codigo') then
    alter table public.pinbank_vinculos
      add constraint pinbank_vinculo_cobranca_tem_codigo
      check (not cobranca_ativa or (codigo_cliente is not null and ativo and cobranca_ativada_por is not null));
  end if;
end $$;

comment on column public.pinbank_vinculos.cobranca_ativa is
  'A empresa ligou a cobrança por Pix e boleto pela conta Pinbank deste vínculo (pinbank_cobranca_configurar). Recebe quem tem o codigo_cliente, que só a plataforma digita.';

create or replace function public.pinbank_cobranca_configurar(p_vinculo uuid, p_ativa boolean)
returns void
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v public.pinbank_vinculos%rowtype;
begin
  if auth.uid() is null then
    raise exception 'A4P-COBRANCA: entre no sistema para ligar a cobrança.' using errcode = 'insufficient_privilege';
  end if;
  select * into v from public.pinbank_vinculos where id = p_vinculo and excluido_em is null for update;
  if not found then
    raise exception 'A4P-COBRANCA: maquininha não encontrada.' using errcode = 'no_data_found';
  end if;
  if not public.tem_permissao('administrar', v.org_id) then
    raise exception 'A4P-COBRANCA: só quem administra a empresa liga ou desliga a cobrança pela conta Pinbank.'
      using errcode = 'insufficient_privilege';
  end if;
  if coalesce(p_ativa, false) then
    if not v.ativo then
      raise exception 'A4P-COBRANCA: ative a maquininha (conta do repasse e taxas) antes de ligar a cobrança.'
        using errcode = 'check_violation';
    end if;
    if v.codigo_cliente is null then
      raise exception 'A4P-COBRANCA: o código da conta Pinbank desta empresa ainda não foi cadastrado pela plataforma. Peça ao suporte da Quattro.'
        using errcode = 'check_violation';
    end if;
    update public.pinbank_vinculos
       set cobranca_ativa = true, cobranca_ativada_por = auth.uid(), cobranca_ativada_em = now()
     where id = v.id;
  else
    update public.pinbank_vinculos set cobranca_ativa = false where id = v.id;
  end if;
end;
$$;

revoke all on function public.pinbank_cobranca_configurar(uuid, boolean) from public, anon, authenticated, service_role;
grant execute on function public.pinbank_cobranca_configurar(uuid, boolean) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. A COBRANÇA
-- ───────────────────────────────────────────────────────────────────────────
create sequence if not exists public.pinbank_cobranca_nsu_seq as bigint start with 1000001;

create table if not exists public.pinbank_cobrancas (
  id uuid not null default gen_random_uuid() primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  vinculo_id uuid not null references public.pinbank_vinculos(id) on delete restrict,
  movement_id uuid not null references public.movements(id) on delete restrict,
  tipo text not null check (tipo in ('pix','boleto')),
  situacao text not null default 'reservada'
    check (situacao in ('reservada','emitida','falhou','incerta','a_cancelar','paga','cancelada')),
  -- Do TÍTULO, no instante da reserva — nunca do pedido.
  valor numeric(14,2) not null check (valor > 0),
  vencimento date not null,
  codigo_cliente bigint not null check (codigo_cliente > 0),
  -- O NsuOrigem que vai à Pinbank: único em toda a plataforma, de uma sequência.
  nsu_origem bigint not null default nextval('public.pinbank_cobranca_nsu_seq') unique,
  -- O que a Pinbank devolveu (só `pinbank_cobranca_registrar` escreve).
  pinbank_id text check (pinbank_id is null or length(pinbank_id) <= 100),
  txid text check (txid is null or length(txid) <= 100),
  texto_qrcode text check (texto_qrcode is null or length(texto_qrcode) <= 1000),
  qrcode_url text check (qrcode_url is null or (length(qrcode_url) <= 1000 and qrcode_url ~* '^https://')),
  linha_digitavel text check (linha_digitavel is null or linha_digitavel ~ '^[0-9]{47,48}$'),
  codigo_barras text check (codigo_barras is null or codigo_barras ~ '^[0-9]{44}$'),
  motivo text check (motivo is null or length(motivo) <= 500),
  criado_por uuid not null default auth.uid(),
  criado_em timestamptz not null default now(),
  emitida_em timestamptz,
  atualizado_em timestamptz not null default now(),
  constraint pinbank_cobranca_emitida_tem_dado check (
    situacao <> 'emitida'
    or (tipo = 'pix' and texto_qrcode is not null)
    or (tipo = 'boleto' and linha_digitavel is not null)
  )
);
alter table public.pinbank_cobrancas enable row level security;

-- Uma viva por título e tipo. `a_cancelar` CONTA como viva: na Pinbank ela
-- ainda pode ser paga.
create unique index if not exists pinbank_cobrancas_viva_unica
  on public.pinbank_cobrancas (movement_id, tipo)
  where situacao in ('reservada','emitida','incerta','a_cancelar');
create index if not exists pinbank_cobrancas_org_idx on public.pinbank_cobrancas (org_id, criado_em desc);
create index if not exists pinbank_cobrancas_movement_idx on public.pinbank_cobrancas (movement_id);

comment on table public.pinbank_cobrancas is
  'Cobranças Pix/boleto emitidas pela conta Pinbank a partir de um título a receber. Reservada pela pessoa (pinbank_cobranca_reservar); o resultado da Pinbank só entra por pinbank_cobranca_registrar (service_role).';

drop trigger if exists zz_auditar_pinbank_cobrancas on public.pinbank_cobrancas;
create trigger zz_auditar_pinbank_cobrancas
  after insert or update or delete on public.pinbank_cobrancas
  for each row execute function public.auditar_escrita();

revoke all on public.pinbank_cobrancas from public, anon, authenticated, service_role;
grant select on public.pinbank_cobrancas to authenticated;
revoke all on sequence public.pinbank_cobranca_nsu_seq from public, anon, authenticated, service_role;

drop policy if exists "pinbank_cobrancas da empresa" on public.pinbank_cobrancas;
create policy "pinbank_cobrancas da empresa" on public.pinbank_cobrancas
  for select to authenticated using (org_id = public.auth_org_id());

-- ───────────────────────────────────────────────────────────────────────────
-- 3. RESERVAR — a pessoa, antes de a rota falar com a Pinbank
-- ───────────────────────────────────────────────────────────────────────────
-- Devolve o que a rota precisa para montar o pedido — tudo lido AQUI: valor e
-- vencimento do título, o código do vínculo, o pagador do cadastro. Com uma
-- cobrança EMITIDA viva do mesmo tipo, devolve ELA (`existente: true`): o
-- segundo clique mostra o mesmo QR em vez de pedir outro.
create or replace function public.pinbank_cobranca_reservar(p_movement uuid, p_tipo text)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  m public.movements%rowtype;
  v public.pinbank_vinculos%rowtype;
  p public.parties%rowtype;
  c public.pinbank_cobrancas%rowtype;
  n_codigos int;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if auth.uid() is null then
    raise exception 'A4P-COBRANCA: entre no sistema para gerar a cobrança.' using errcode = 'insufficient_privilege';
  end if;
  if p_tipo is null or p_tipo not in ('pix','boleto') then
    raise exception 'A4P-COBRANCA: o tipo da cobrança é pix ou boleto.' using errcode = 'invalid_parameter_value';
  end if;

  -- O título, travado: duas reservas do mesmo título fazem fila aqui.
  select * into m from public.movements where id = p_movement for update;
  if not found or m.org_id is distinct from public.auth_org_id() then
    raise exception 'A4P-COBRANCA: título não encontrado na empresa aberta.' using errcode = 'no_data_found';
  end if;
  if not public.tem_permissao('lancar', m.org_id) then
    raise exception 'A4P-COBRANCA: seu papel nesta empresa não pode gerar cobrança.' using errcode = 'insufficient_privilege';
  end if;
  if m.excluido_em is not null or m.is_sample then
    raise exception 'A4P-COBRANCA: este título está na lixeira ou é de demonstração.' using errcode = 'check_violation';
  end if;
  if m.type <> 'entrada' then
    raise exception 'A4P-COBRANCA: só se cobra um título A RECEBER.' using errcode = 'check_violation';
  end if;
  if m.situacao not in ('previsto','confirmado') then
    raise exception 'A4P-COBRANCA: este título já foi recebido, cancelado ou estornado.' using errcode = 'check_violation';
  end if;
  if coalesce(m.category, '') = 'Transferência entre contas' then
    raise exception 'A4P-COBRANCA: transferência entre contas próprias não se cobra.' using errcode = 'check_violation';
  end if;
  if m.amount <= 0 then
    raise exception 'A4P-COBRANCA: título sem valor.' using errcode = 'check_violation';
  end if;

  -- A conta que recebe: o vínculo vivo, ativo, com a cobrança ligada.
  select count(distinct codigo_cliente) into n_codigos
    from public.pinbank_vinculos
   where org_id = m.org_id and excluido_em is null and ativo and cobranca_ativa;
  if n_codigos = 0 then
    raise exception 'A4P-COBRANCA: a cobrança pela conta Pinbank não está ligada nesta empresa.' using errcode = 'check_violation';
  end if;
  if n_codigos > 1 then
    raise exception 'A4P-COBRANCA: há mais de uma conta Pinbank com a cobrança ligada; deixe ligada só a que deve receber.'
      using errcode = 'check_violation';
  end if;
  select * into v from public.pinbank_vinculos
   where org_id = m.org_id and excluido_em is null and ativo and cobranca_ativa
   order by cobranca_ativada_em, criado_em limit 1;

  -- Já existe uma viva deste tipo?
  select * into c from public.pinbank_cobrancas
   where movement_id = m.id and tipo = p_tipo and situacao in ('reservada','emitida','incerta','a_cancelar')
   limit 1;
  if found then
    if c.situacao = 'emitida' then
      return jsonb_build_object('existente', true, 'id', c.id);
    elsif c.situacao = 'reservada' then
      raise exception 'A4P-COBRANCA: esta cobrança já está sendo gerada; aguarde e abra o título de novo.' using errcode = 'unique_violation';
    elsif c.situacao = 'incerta' then
      raise exception 'A4P-COBRANCA: a Pinbank não confirmou a cobrança anterior deste título; ela pode existir. Nada novo foi gerado até a conferência.'
        using errcode = 'unique_violation';
    else
      raise exception 'A4P-COBRANCA: o título mudou depois da cobrança anterior, e ela ainda precisa ser cancelada na Pinbank antes de uma nova.'
        using errcode = 'unique_violation';
    end if;
  end if;

  if m.party_id is not null then
    select * into p from public.parties where id = m.party_id;
  end if;

  insert into public.pinbank_cobrancas (org_id, vinculo_id, movement_id, tipo, valor, vencimento, codigo_cliente)
  values (m.org_id, v.id, m.id, p_tipo, m.amount, greatest(m.due_date, v_hoje), v.codigo_cliente)
  returning * into c;

  return jsonb_build_object(
    'existente', false,
    'id', c.id,
    'tipo', c.tipo,
    'nsuOrigem', c.nsu_origem,
    'codigoCliente', c.codigo_cliente,
    'valor', c.valor,
    'vencimento', c.vencimento,
    'descricao', m.description,
    'devedor', case when p.id is null then null else jsonb_build_object(
      'nome', p.name, 'documento', p.doc_digits, 'email', p.email, 'telefone', p.phone,
      'cep', p.zip, 'logradouro', p.street, 'numero', p.number, 'complemento', p.complement,
      'bairro', p.district, 'cidade', p.city, 'uf', p.state) end
  );
end;
$$;

revoke all on function public.pinbank_cobranca_reservar(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.pinbank_cobranca_reservar(uuid, text) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. REGISTRAR — só o servidor, só a partir de `reservada`
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.pinbank_cobranca_registrar(p_id uuid, p_resultado jsonb)
returns void
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  c public.pinbank_cobrancas%rowtype;
  v_sit text := p_resultado ->> 'situacao';
begin
  if v_sit is null or v_sit not in ('emitida','falhou','incerta') then
    raise exception 'A4P-COBRANCA: resultado de cobrança inválido (%).', coalesce(v_sit, 'vazio') using errcode = 'invalid_parameter_value';
  end if;
  select * into c from public.pinbank_cobrancas where id = p_id for update;
  if not found then
    raise exception 'A4P-COBRANCA: reserva não encontrada.' using errcode = 'no_data_found';
  end if;
  if c.situacao <> 'reservada' then
    raise exception 'A4P-COBRANCA: a reserva já tem resultado (%); ele não se reescreve.', c.situacao using errcode = 'check_violation';
  end if;
  update public.pinbank_cobrancas set
    situacao = v_sit,
    pinbank_id = nullif(p_resultado ->> 'pinbankId', ''),
    txid = nullif(p_resultado ->> 'txid', ''),
    texto_qrcode = nullif(p_resultado ->> 'textoQrCode', ''),
    qrcode_url = nullif(p_resultado ->> 'qrCodeUrl', ''),
    linha_digitavel = nullif(p_resultado ->> 'linhaDigitavel', ''),
    codigo_barras = nullif(p_resultado ->> 'codigoBarras', ''),
    motivo = left(nullif(p_resultado ->> 'motivo', ''), 500),
    emitida_em = case when v_sit = 'emitida' then now() end,
    atualizado_em = now()
  where id = c.id;
end;
$$;

revoke all on function public.pinbank_cobranca_registrar(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.pinbank_cobranca_registrar(uuid, jsonb) to service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. O TÍTULO MUDOU — a cobrança viva vira `a_cancelar`
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.pinbank_cobranca_titulo_mudou()
returns trigger
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
begin
  if new.amount is distinct from old.amount
     or new.due_date is distinct from old.due_date
     or new.party_id is distinct from old.party_id
     or new.excluido_em is distinct from old.excluido_em
     or (new.situacao is distinct from old.situacao and new.situacao not in ('previsto','confirmado')) then
    update public.pinbank_cobrancas
       set situacao = 'a_cancelar',
           motivo = 'O título mudou depois da emissão; a cobrança antiga precisa ser cancelada na Pinbank.',
           atualizado_em = now()
     where movement_id = new.id and situacao in ('emitida','incerta');
  end if;
  return new;
end;
$$;

revoke all on function public.pinbank_cobranca_titulo_mudou() from public, anon, authenticated, service_role;

drop trigger if exists pinbank_cobranca_titulo_mudou on public.movements;
create trigger pinbank_cobranca_titulo_mudou
  after update of amount, due_date, party_id, excluido_em, situacao on public.movements
  for each row execute function public.pinbank_cobranca_titulo_mudou();
