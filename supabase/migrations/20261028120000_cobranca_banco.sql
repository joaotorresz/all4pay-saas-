-- ═══════════════════════════════════════════════════════════════════════════
-- COBRANÇA PELA CONTA BANCÁRIA DA EMPRESA — etapa 3 (28/10/2026)
-- "Conectar meu banco" + a reserva genérica (`docs/rodada-11/cobranca-bancos.md`)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A empresa conecta a conta DELA (por ora, o Banco Inter) e emite boleto com
-- Pix pelo sistema; o cliente paga e o dinheiro cai na conta da empresa.
-- Esta migration é a FECHADURA. A chamada ao banco mora em
-- `/api/cobranca-banco/*`, que nasce DESLIGADA (`COBRANCA_BANCO=ligado`).
--
-- ⚠️ **O SEGREDO NUNCA É LEGÍVEL PELO BANCO DE DADOS.** O Client Secret, o
-- certificado e a chave privada chegam aqui CIFRADOS pelo servidor da Quattro
-- (AES-256-GCM, `lib/cobranca-banco/cofre.ts`), com a chave-mestra numa
-- variável do servidor (`COBRANCA_CHAVE_MESTRA`). Quem lê esta tabela — um
-- backup, um painel, um SQL — vê um texto sem a chave. E o texto cifrado é
-- AMARRADO à conexão (dado adicional do GCM = o id da conexão): copiado para
-- outra linha, não abre.
--
-- ⚠️ **O SEGREDO MORA NUMA TABELA À PARTE, SEM `org_id`, sem leitura para
-- ninguém do cliente.** A trilha genérica (`auditar_escrita`) grava a linha
-- INTEIRA no `audit_log`, que os membros da empresa leem; o segredo, mesmo
-- cifrado, não vai para lá. A conexão (quem, quando, ambiente, validade do
-- certificado) tem trilha; o segredo, não — e só `service_role` o lê.
--
-- ⚠️ **QUEM RECEBE O DINHEIRO É A CONTA DA CREDENCIAL**, e só quem ADMINISTRA
-- a empresa a conecta. Um lançador que pudesse trocar a conta mandaria o
-- pagamento do cliente para outro lugar com a cara da cobrança da empresa.
--
-- ⚠️ **UMA COBRANÇA VIVA POR TÍTULO — em QUALQUER banco.** O índice único
-- cobre esta tabela; a reserva confere também a cobrança viva da Pinbank do
-- mesmo título. Dois boletos vivos para o mesmo título são o pagamento em
-- dobro.
--
-- ⚠️ **RESERVA ANTES DA REDE, REGISTRO SÓ PELO SERVIDOR** (o desenho da
-- Pinbank, `20261020120000`). E as duas respostas que NÃO liberam outra
-- cobrança: `processando` (o banco tem o id e ainda monta o boleto) e
-- `incerta` (pode existir; procura-se pelo nosso número). Só `falhou` e
-- `cancelada` liberam.
--
-- ⚠️ **MUDA QUEM PODE CHAMAR O QUÊ** (declarado, para o dono decidir):
--   · `cobranca_banco_conectar` / `cobranca_banco_desconectar`:
--     `authenticated`, recusa quem não administra a empresa ABERTA.
--   · `cobranca_banco_reservar`: `authenticated`, recusa quem não lança.
--   · `cobranca_banco_credencial` e `cobranca_banco_registrar`: SÓ
--     `service_role`.
--   · `authenticated` ganha SELECT em `cobranca_banco_conexoes` e
--     `cobrancas_banco` (recortado por empresa). NENHUM acesso ao segredo.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. A CONEXÃO (o que se pode mostrar)
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.cobranca_banco_conexoes (
  id uuid not null primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  provedor text not null check (provedor in ('inter')),
  ambiente text not null check (ambiente in ('sandbox', 'producao')),
  -- O Client ID não abre nada sozinho (precisa do Secret E do certificado);
  -- fica legível para a tela dizer QUAL credencial está conectada.
  client_id text not null check (length(client_id) between 1 and 200),
  conta_corrente text check (conta_corrente is null or conta_corrente ~ '^[0-9]{1,20}$'),
  certificado_ate date,
  testada_em timestamptz not null,
  criado_por uuid not null default auth.uid(),
  criado_em timestamptz not null default now(),
  desligada_em timestamptz,
  desligada_por uuid,
  constraint cobranca_banco_conexao_desligada_tem_autor
    check (desligada_em is null or desligada_por is not null)
);
alter table public.cobranca_banco_conexoes enable row level security;

-- Uma viva por empresa e banco.
create unique index if not exists cobranca_banco_conexao_viva_unica
  on public.cobranca_banco_conexoes (org_id, provedor) where desligada_em is null;

comment on table public.cobranca_banco_conexoes is
  'A conta bancária da empresa conectada para emitir boleto e Pix (etapa 3). Só quem administra conecta (cobranca_banco_conectar). O segredo mora em cobranca_banco_segredos, cifrado pelo servidor.';

drop trigger if exists zz_auditar_cobranca_banco_conexoes on public.cobranca_banco_conexoes;
create trigger zz_auditar_cobranca_banco_conexoes
  after insert or update or delete on public.cobranca_banco_conexoes
  for each row execute function public.auditar_escrita();

revoke all on public.cobranca_banco_conexoes from public, anon, authenticated, service_role;
grant select on public.cobranca_banco_conexoes to authenticated;

drop policy if exists "cobranca_banco_conexoes da empresa" on public.cobranca_banco_conexoes;
create policy "cobranca_banco_conexoes da empresa" on public.cobranca_banco_conexoes
  for select to authenticated using (org_id = public.auth_org_id());

-- ───────────────────────────────────────────────────────────────────────────
-- 2. O SEGREDO (cifrado; ninguém do cliente lê)
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.cobranca_banco_segredos (
  conexao_id uuid not null primary key references public.cobranca_banco_conexoes(id) on delete cascade,
  -- `v1.<iv>.<tag>.<cifra>` em base64: o formato do cofre. Texto puro não cabe.
  cifrado text not null check (
    length(cifrado) <= 40000
    and cifrado ~ '^v1\.[A-Za-z0-9+/]+={0,2}\.[A-Za-z0-9+/]+={0,2}\.[A-Za-z0-9+/]+={0,2}$'
  ),
  criado_em timestamptz not null default now()
);
alter table public.cobranca_banco_segredos enable row level security;
-- Sem política: com RLS ligada e nenhuma política, nega tudo a quem não é
-- `service_role` — e nem a concessão existe.
revoke all on public.cobranca_banco_segredos from public, anon, authenticated, service_role;
grant select on public.cobranca_banco_segredos to service_role;

comment on table public.cobranca_banco_segredos is
  'O Client Secret, o certificado e a chave da conexão, CIFRADOS pelo servidor (AES-256-GCM, dado adicional = id da conexão). Só service_role lê; fora da trilha genérica de propósito (ela copiaria a linha para o audit_log).';

-- ───────────────────────────────────────────────────────────────────────────
-- 3. CONECTAR / DESCONECTAR — quem administra a empresa aberta
-- ───────────────────────────────────────────────────────────────────────────
-- O servidor TESTA a credencial no banco antes de chamar (o token sai?) e
-- gera o id da conexão — é ele que amarra o texto cifrado.
create or replace function public.cobranca_banco_conectar(
  p_id uuid,
  p_provedor text,
  p_ambiente text,
  p_client_id text,
  p_conta_corrente text,
  p_certificado_ate date,
  p_cifrado text
)
returns uuid
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_org uuid := public.auth_org_id();
begin
  if auth.uid() is null or v_org is null then
    raise exception 'A4P-COBRANCA-BANCO: entre no sistema para conectar o banco.' using errcode = 'insufficient_privilege';
  end if;
  if not public.tem_permissao('administrar', v_org) then
    raise exception 'A4P-COBRANCA-BANCO: só quem administra a empresa conecta a conta que recebe as cobranças.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_id is null or p_cifrado is null or btrim(coalesce(p_client_id, '')) = '' then
    raise exception 'A4P-COBRANCA-BANCO: credencial incompleta.' using errcode = 'invalid_parameter_value';
  end if;

  -- A anterior do mesmo banco sai junto com o segredo dela.
  delete from public.cobranca_banco_segredos s
   using public.cobranca_banco_conexoes c
   where s.conexao_id = c.id and c.org_id = v_org and c.provedor = p_provedor and c.desligada_em is null;
  update public.cobranca_banco_conexoes
     set desligada_em = now(), desligada_por = auth.uid()
   where org_id = v_org and provedor = p_provedor and desligada_em is null;

  insert into public.cobranca_banco_conexoes
    (id, org_id, provedor, ambiente, client_id, conta_corrente, certificado_ate, testada_em)
  values
    (p_id, v_org, p_provedor, p_ambiente, btrim(p_client_id),
     nullif(regexp_replace(coalesce(p_conta_corrente, ''), '\D', '', 'g'), ''),
     p_certificado_ate, now());
  insert into public.cobranca_banco_segredos (conexao_id, cifrado) values (p_id, p_cifrado);
  return p_id;
end;
$$;

revoke all on function public.cobranca_banco_conectar(uuid, text, text, text, text, date, text) from public, anon, authenticated, service_role;
grant execute on function public.cobranca_banco_conectar(uuid, text, text, text, text, date, text) to authenticated;

create or replace function public.cobranca_banco_desconectar(p_provedor text)
returns void
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_org uuid := public.auth_org_id();
begin
  if auth.uid() is null or v_org is null then
    raise exception 'A4P-COBRANCA-BANCO: entre no sistema para desconectar o banco.' using errcode = 'insufficient_privilege';
  end if;
  if not public.tem_permissao('administrar', v_org) then
    raise exception 'A4P-COBRANCA-BANCO: só quem administra a empresa desconecta a conta.' using errcode = 'insufficient_privilege';
  end if;
  -- O segredo de uma conexão desligada não serve a ninguém: sai.
  delete from public.cobranca_banco_segredos s
   using public.cobranca_banco_conexoes c
   where s.conexao_id = c.id and c.org_id = v_org and c.provedor = p_provedor and c.desligada_em is null;
  update public.cobranca_banco_conexoes
     set desligada_em = now(), desligada_por = auth.uid()
   where org_id = v_org and provedor = p_provedor and desligada_em is null;
end;
$$;

revoke all on function public.cobranca_banco_desconectar(text) from public, anon, authenticated, service_role;
grant execute on function public.cobranca_banco_desconectar(text) to authenticated;

-- O servidor, para falar com o banco: a conexão VIVA e o texto cifrado.
create or replace function public.cobranca_banco_credencial(p_conexao uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  c public.cobranca_banco_conexoes%rowtype;
  v_cifrado text;
begin
  select * into c from public.cobranca_banco_conexoes where id = p_conexao and desligada_em is null;
  if not found then
    raise exception 'A4P-COBRANCA-BANCO: a conta desta cobrança foi desconectada.' using errcode = 'no_data_found';
  end if;
  select cifrado into v_cifrado from public.cobranca_banco_segredos where conexao_id = c.id;
  if v_cifrado is null then
    raise exception 'A4P-COBRANCA-BANCO: a credencial desta conta não está guardada; conecte de novo.' using errcode = 'no_data_found';
  end if;
  return jsonb_build_object(
    'id', c.id, 'orgId', c.org_id, 'provedor', c.provedor, 'ambiente', c.ambiente,
    'clientId', c.client_id, 'contaCorrente', c.conta_corrente, 'cifrado', v_cifrado
  );
end;
$$;

revoke all on function public.cobranca_banco_credencial(uuid) from public, anon, authenticated, service_role;
grant execute on function public.cobranca_banco_credencial(uuid) to service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. A COBRANÇA
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.cobrancas_banco (
  id uuid not null primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  conexao_id uuid not null references public.cobranca_banco_conexoes(id) on delete restrict,
  movement_id uuid not null references public.movements(id) on delete restrict,
  provedor text not null check (provedor in ('inter')),
  -- Da conexão no instante da reserva: a cobrança de TESTE nunca tem a cara da real.
  ambiente text not null check (ambiente in ('sandbox', 'producao')),
  tipo text not null check (tipo in ('pix', 'boleto', 'boleto_pix')),
  situacao text not null default 'reservada'
    check (situacao in ('reservada','processando','emitida','falhou','incerta','a_cancelar','paga','cancelada')),
  -- Do TÍTULO, no instante da reserva — nunca do pedido.
  valor numeric(14,2) not null check (valor > 0),
  vencimento date not null,
  -- O NOSSO número: os 15 primeiros hexadecimais do id (`seuNumeroDaReserva`).
  seu_numero text not null check (seu_numero ~ '^[0-9a-f]{15}$'),
  -- O que o banco devolveu (só `cobranca_banco_registrar` escreve).
  id_provedor text check (id_provedor is null or length(id_provedor) <= 100),
  linha_digitavel text check (linha_digitavel is null or linha_digitavel ~ '^[0-9]{47,48}$'),
  codigo_barras text check (codigo_barras is null or codigo_barras ~ '^[0-9]{44}$'),
  pix_copia_cola text check (pix_copia_cola is null or length(pix_copia_cola) <= 1000),
  txid text check (txid is null or length(txid) <= 100),
  valor_recebido numeric(14,2),
  pago_em timestamptz,
  marcada_manualmente boolean,
  motivo text check (motivo is null or length(motivo) <= 500),
  criado_por uuid not null default auth.uid(),
  criado_em timestamptz not null default now(),
  emitida_em timestamptz,
  atualizado_em timestamptz not null default now(),
  constraint cobranca_banco_seu_numero_do_id check (seu_numero = left(replace(id::text, '-', ''), 15)),
  constraint cobranca_banco_emitida_tem_dado check (
    situacao <> 'emitida' or linha_digitavel is not null or pix_copia_cola is not null
  ),
  constraint cobranca_banco_processando_tem_id check (situacao <> 'processando' or id_provedor is not null)
);
alter table public.cobrancas_banco enable row level security;

-- Uma viva por título (qualquer tipo, qualquer banco desta tabela).
create unique index if not exists cobrancas_banco_viva_unica
  on public.cobrancas_banco (movement_id)
  where situacao in ('reservada','processando','emitida','incerta','a_cancelar');
create unique index if not exists cobrancas_banco_seu_numero_unico on public.cobrancas_banco (conexao_id, seu_numero);
create unique index if not exists cobrancas_banco_id_provedor_unico
  on public.cobrancas_banco (conexao_id, id_provedor) where id_provedor is not null;
create index if not exists cobrancas_banco_org_idx on public.cobrancas_banco (org_id, criado_em desc);

comment on table public.cobrancas_banco is
  'Boleto/Pix emitido pela conta bancária conectada da empresa a partir de um título a receber. Reservado pela pessoa (cobranca_banco_reservar); o resultado do banco só entra por cobranca_banco_registrar (service_role).';

drop trigger if exists zz_auditar_cobrancas_banco on public.cobrancas_banco;
create trigger zz_auditar_cobrancas_banco
  after insert or update or delete on public.cobrancas_banco
  for each row execute function public.auditar_escrita();

revoke all on public.cobrancas_banco from public, anon, authenticated, service_role;
grant select on public.cobrancas_banco to authenticated;

drop policy if exists "cobrancas_banco da empresa" on public.cobrancas_banco;
create policy "cobrancas_banco da empresa" on public.cobrancas_banco
  for select to authenticated using (org_id = public.auth_org_id());

-- ───────────────────────────────────────────────────────────────────────────
-- 5. RESERVAR — a pessoa, antes de a rota falar com o banco
-- ───────────────────────────────────────────────────────────────────────────
-- Devolve o que a rota precisa — tudo lido AQUI. Com uma cobrança viva do
-- título, devolve ELA: `emitida` volta para mostrar; `processando` e
-- `incerta` voltam para a rota CONFERIR no banco (nunca pedir outra);
-- `reservada` e `a_cancelar` são recusa.
create or replace function public.cobranca_banco_reservar(p_movement uuid, p_tipo text)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  m public.movements%rowtype;
  cx public.cobranca_banco_conexoes%rowtype;
  p public.parties%rowtype;
  c public.cobrancas_banco%rowtype;
  n_conexoes int;
  v_id uuid := gen_random_uuid();
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if auth.uid() is null then
    raise exception 'A4P-COBRANCA-BANCO: entre no sistema para gerar a cobrança.' using errcode = 'insufficient_privilege';
  end if;
  if p_tipo is null or p_tipo not in ('pix', 'boleto', 'boleto_pix') then
    raise exception 'A4P-COBRANCA-BANCO: tipo de cobrança inválido.' using errcode = 'invalid_parameter_value';
  end if;

  -- O título, travado: duas reservas do mesmo título fazem fila aqui.
  select * into m from public.movements where id = p_movement for update;
  if not found or m.org_id is distinct from public.auth_org_id() then
    raise exception 'A4P-COBRANCA-BANCO: título não encontrado na empresa aberta.' using errcode = 'no_data_found';
  end if;
  if not public.tem_permissao('lancar', m.org_id) then
    raise exception 'A4P-COBRANCA-BANCO: seu papel nesta empresa não pode gerar cobrança.' using errcode = 'insufficient_privilege';
  end if;
  if m.excluido_em is not null or m.is_sample then
    raise exception 'A4P-COBRANCA-BANCO: este título está na lixeira ou é de demonstração.' using errcode = 'check_violation';
  end if;
  if m.type <> 'entrada' then
    raise exception 'A4P-COBRANCA-BANCO: só se cobra um título A RECEBER.' using errcode = 'check_violation';
  end if;
  if m.situacao not in ('previsto', 'confirmado') then
    raise exception 'A4P-COBRANCA-BANCO: este título já foi recebido, cancelado ou estornado.' using errcode = 'check_violation';
  end if;
  if coalesce(m.category, '') = 'Transferência entre contas' then
    raise exception 'A4P-COBRANCA-BANCO: transferência entre contas próprias não se cobra.' using errcode = 'check_violation';
  end if;
  if m.amount <= 0 then
    raise exception 'A4P-COBRANCA-BANCO: título sem valor.' using errcode = 'check_violation';
  end if;

  -- Já existe uma viva deste título aqui?
  select * into c from public.cobrancas_banco
   where movement_id = m.id and situacao in ('reservada','processando','emitida','incerta','a_cancelar')
   limit 1;
  if found then
    if c.situacao = 'emitida' then
      return jsonb_build_object('existente', true, 'id', c.id);
    elsif c.situacao in ('processando', 'incerta') then
      return jsonb_build_object(
        'pendente', true, 'id', c.id, 'situacao', c.situacao, 'conexaoId', c.conexao_id,
        'idProvedor', c.id_provedor, 'seuNumero', c.seu_numero, 'vencimento', c.vencimento);
    elsif c.situacao = 'reservada' then
      raise exception 'A4P-COBRANCA-BANCO: esta cobrança já está sendo gerada; aguarde e abra o título de novo.' using errcode = 'unique_violation';
    else
      raise exception 'A4P-COBRANCA-BANCO: o título mudou depois da cobrança anterior, e ela ainda precisa ser cancelada no banco antes de uma nova.'
        using errcode = 'unique_violation';
    end if;
  end if;

  -- E na Pinbank? Duas cobranças vivas do mesmo título são o pagamento em dobro.
  if exists (select 1 from public.pinbank_cobrancas
              where movement_id = m.id and situacao in ('reservada','emitida','incerta','a_cancelar')) then
    raise exception 'A4P-COBRANCA-BANCO: este título já tem uma cobrança viva pela conta Pinbank.' using errcode = 'unique_violation';
  end if;

  -- A conta que recebe: a conexão viva da empresa.
  select count(*) into n_conexoes from public.cobranca_banco_conexoes
   where org_id = m.org_id and desligada_em is null;
  if n_conexoes = 0 then
    raise exception 'A4P-COBRANCA-BANCO: nenhuma conta bancária conectada para cobrar. Conecte em Integrações.' using errcode = 'check_violation';
  end if;
  if n_conexoes > 1 then
    raise exception 'A4P-COBRANCA-BANCO: há mais de uma conta conectada; deixe só a que deve receber.' using errcode = 'check_violation';
  end if;
  select * into cx from public.cobranca_banco_conexoes where org_id = m.org_id and desligada_em is null;

  if m.party_id is not null then
    select * into p from public.parties where id = m.party_id;
  end if;

  insert into public.cobrancas_banco
    (id, org_id, conexao_id, movement_id, provedor, ambiente, tipo, valor, vencimento, seu_numero)
  values
    (v_id, m.org_id, cx.id, m.id, cx.provedor, cx.ambiente, p_tipo, m.amount,
     greatest(m.due_date, v_hoje), left(replace(v_id::text, '-', ''), 15))
  returning * into c;

  return jsonb_build_object(
    'existente', false,
    'id', c.id,
    'conexaoId', c.conexao_id,
    'provedor', c.provedor,
    'ambiente', c.ambiente,
    'tipo', c.tipo,
    'seuNumero', c.seu_numero,
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

revoke all on function public.cobranca_banco_reservar(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.cobranca_banco_reservar(uuid, text) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 6. REGISTRAR — só o servidor, e só pelas transições que fazem sentido
-- ───────────────────────────────────────────────────────────────────────────
--   reservada   → processando · emitida · falhou · incerta
--   processando → processando · emitida · paga · cancelada · falhou
--                 (`incerta` de uma CONSULTA que falhou não rebaixa: o id existe)
--   incerta     → processando · emitida · paga · cancelada · incerta
--                 (nunca `falhou`: não achar na busca não prova que não existe)
--   emitida     → emitida · paga · cancelada
--   a_cancelar  → a_cancelar · paga · cancelada
--   falhou · paga · cancelada → nada (terminal)
-- E o id do banco, uma vez gravado, não troca.
create or replace function public.cobranca_banco_registrar(p_id uuid, p_resultado jsonb)
returns text
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  c public.cobrancas_banco%rowtype;
  v_sit text := p_resultado ->> 'situacao';
  v_idp text := nullif(p_resultado ->> 'idProvedor', '');
  v_ok boolean;
begin
  if v_sit is null or v_sit not in ('processando','emitida','falhou','incerta','paga','cancelada') then
    raise exception 'A4P-COBRANCA-BANCO: resultado de cobrança inválido (%).', coalesce(v_sit, 'vazio') using errcode = 'invalid_parameter_value';
  end if;
  select * into c from public.cobrancas_banco where id = p_id for update;
  if not found then
    raise exception 'A4P-COBRANCA-BANCO: reserva não encontrada.' using errcode = 'no_data_found';
  end if;

  -- A consulta que falhou não rebaixa quem já tem o id.
  if v_sit = 'incerta' and c.situacao in ('processando', 'emitida', 'a_cancelar') then
    return c.situacao;
  end if;

  v_ok := case c.situacao
    when 'reservada'   then v_sit in ('processando','emitida','falhou','incerta')
    when 'processando' then v_sit in ('processando','emitida','paga','cancelada','falhou')
    when 'incerta'     then v_sit in ('processando','emitida','paga','cancelada','incerta')
    when 'emitida'     then v_sit in ('emitida','paga','cancelada')
    when 'a_cancelar'  then v_sit in ('paga','cancelada')
    else false end;
  if not v_ok then
    raise exception 'A4P-COBRANCA-BANCO: a cobrança está "%" e não passa a "%".', c.situacao, v_sit using errcode = 'check_violation';
  end if;
  if c.id_provedor is not null and v_idp is not null and v_idp <> c.id_provedor then
    raise exception 'A4P-COBRANCA-BANCO: o banco devolveu outro id para esta cobrança; nada foi gravado.' using errcode = 'check_violation';
  end if;

  update public.cobrancas_banco set
    situacao = v_sit,
    id_provedor = coalesce(c.id_provedor, v_idp),
    linha_digitavel = coalesce(nullif(p_resultado ->> 'linhaDigitavel', ''), linha_digitavel),
    codigo_barras = coalesce(nullif(p_resultado ->> 'codigoBarras', ''), codigo_barras),
    pix_copia_cola = coalesce(nullif(p_resultado ->> 'pixCopiaECola', ''), pix_copia_cola),
    txid = coalesce(nullif(p_resultado ->> 'txid', ''), txid),
    valor_recebido = case when v_sit = 'paga' then nullif(p_resultado ->> 'valorRecebido', '')::numeric else valor_recebido end,
    pago_em = case when v_sit = 'paga' then coalesce(nullif(p_resultado ->> 'dataHora', '')::timestamptz, now()) else pago_em end,
    marcada_manualmente = case when v_sit = 'paga' then coalesce((p_resultado ->> 'marcadaManualmente')::boolean, false) else marcada_manualmente end,
    motivo = case when v_sit in ('falhou','incerta','cancelada') then left(nullif(p_resultado ->> 'motivo', ''), 500) else motivo end,
    emitida_em = case when v_sit = 'emitida' and emitida_em is null then now() else emitida_em end,
    atualizado_em = now()
  where id = c.id;
  return v_sit;
end;
$$;

revoke all on function public.cobranca_banco_registrar(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.cobranca_banco_registrar(uuid, jsonb) to service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 7. O TÍTULO MUDOU — a cobrança viva vira `a_cancelar`
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.cobranca_banco_titulo_mudou()
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
    update public.cobrancas_banco
       set situacao = 'a_cancelar',
           motivo = 'O título mudou depois da emissão; a cobrança antiga precisa ser cancelada no banco.',
           atualizado_em = now()
     where movement_id = new.id and situacao in ('processando','emitida','incerta');
  end if;
  return new;
end;
$$;

revoke all on function public.cobranca_banco_titulo_mudou() from public, anon, authenticated, service_role;

drop trigger if exists cobranca_banco_titulo_mudou on public.movements;
create trigger cobranca_banco_titulo_mudou
  after update of amount, due_date, party_id, excluido_em, situacao on public.movements
  for each row execute function public.cobranca_banco_titulo_mudou();
