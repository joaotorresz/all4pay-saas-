-- ═══════════════════════════════════════════════════════════════════════════
-- CHECKOUT PIX E BOLETO — o LINK DE PAGAMENTO de um título a receber
-- (22/10/2026, etapa 4 de `docs/rodada-10/cobranca.md`, MVP)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A empresa gera o Pix e/ou o boleto do título (`pinbank_cobrancas`) e cria
-- UM link (`/pagar/<token>`) que mostra ao cliente dela, sem login, o valor, o
-- vencimento, o nome da empresa e as cobranças EMITIDAS.
--
-- ⚠️ O token é o único segredo do link: 64 hexadecimais de dois uuid
-- aleatórios (244 bits). Ninguém o deduz do título nem da empresa.
--
-- ⚠️ A leitura pública NÃO é uma API aberta: `pinbank_checkout_ler` só executa
-- como `service_role`, e quem a chama é a página do servidor, que antes
-- confere o interruptor da cobrança. O que ela devolve é o MÍNIMO do pagamento:
-- nada de documento, endereço ou contato do pagador, nada de outro título.
--
-- ⚠️ O link não decide nada sobre dinheiro: ele só mostra o que já foi emitido.
-- Cobrança `a_cancelar` (o título mudou) e título recebido, cancelado ou na
-- lixeira deixam de mostrar o Pix e o boleto.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. A TABELA DO LINK
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.pinbank_checkout_links (
  id uuid not null default gen_random_uuid() primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  movement_id uuid not null references public.movements(id) on delete restrict,
  token text not null unique check (token ~ '^[0-9a-f]{64}$'),
  criado_por uuid not null default auth.uid(),
  criado_em timestamptz not null default now(),
  revogado_em timestamptz,
  revogado_por uuid
);
alter table public.pinbank_checkout_links enable row level security;

-- Um link VIVO por título: mandar o mesmo título duas vezes manda o mesmo link.
create unique index if not exists pinbank_checkout_links_vivo_unico
  on public.pinbank_checkout_links (movement_id) where revogado_em is null;

comment on table public.pinbank_checkout_links is
  'Link público de pagamento (Pix/boleto) de um título a receber. Criado pela pessoa (pinbank_checkout_link_criar); lido só pelo servidor (pinbank_checkout_ler, service_role).';

drop trigger if exists zz_auditar_pinbank_checkout_links on public.pinbank_checkout_links;
create trigger zz_auditar_pinbank_checkout_links
  after insert or update or delete on public.pinbank_checkout_links
  for each row execute function public.auditar_escrita();

revoke all on public.pinbank_checkout_links from public, anon, authenticated, service_role;
grant select on public.pinbank_checkout_links to authenticated;

drop policy if exists "pinbank_checkout_links da empresa" on public.pinbank_checkout_links;
create policy "pinbank_checkout_links da empresa" on public.pinbank_checkout_links
  for select to authenticated using (org_id = public.auth_org_id());

-- ───────────────────────────────────────────────────────────────────────────
-- 2. CRIAR — a pessoa, com o papel de lançar, depois de emitir a cobrança
-- ───────────────────────────────────────────────────────────────────────────
-- Exige ao menos UMA cobrança emitida viva: um link sem Pix nem boleto levaria
-- o cliente a uma página sem como pagar. Devolve o link vivo se já existir.
create or replace function public.pinbank_checkout_link_criar(p_movement uuid)
returns text
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  m public.movements%rowtype;
  v_token text;
begin
  if auth.uid() is null then
    raise exception 'A4P-COBRANCA: entre no sistema para criar o link de pagamento.' using errcode = 'insufficient_privilege';
  end if;
  select * into m from public.movements where id = p_movement for update;
  if not found or m.org_id is distinct from public.auth_org_id() then
    raise exception 'A4P-COBRANCA: título não encontrado na empresa aberta.' using errcode = 'no_data_found';
  end if;
  if not public.tem_permissao('lancar', m.org_id) then
    raise exception 'A4P-COBRANCA: seu papel nesta empresa não pode criar link de pagamento.' using errcode = 'insufficient_privilege';
  end if;
  if m.excluido_em is not null or m.is_sample or m.type <> 'entrada' or m.situacao not in ('previsto','confirmado') then
    raise exception 'A4P-COBRANCA: só um título a receber em aberto ganha link de pagamento.' using errcode = 'check_violation';
  end if;
  if not exists (
    select 1 from public.pinbank_cobrancas
     where movement_id = m.id and situacao = 'emitida'
  ) then
    raise exception 'A4P-COBRANCA: gere o Pix ou o boleto antes de criar o link.' using errcode = 'check_violation';
  end if;

  select token into v_token from public.pinbank_checkout_links
   where movement_id = m.id and revogado_em is null;
  if found then
    return v_token;
  end if;

  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.pinbank_checkout_links (org_id, movement_id, token)
  values (m.org_id, m.id, v_token);
  return v_token;
end;
$$;

revoke all on function public.pinbank_checkout_link_criar(uuid) from public, anon, authenticated, service_role;
grant execute on function public.pinbank_checkout_link_criar(uuid) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. LER — só o servidor, pelo token
-- ───────────────────────────────────────────────────────────────────────────
-- `situacao` do link: aberto (mostra as cobranças) · pago · indisponivel.
-- Token desconhecido ou revogado devolve NULL (a página diz "link inválido").
create or replace function public.pinbank_checkout_ler(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  l public.pinbank_checkout_links%rowtype;
  m public.movements%rowtype;
  v_empresa text;
  v_sit text;
  v_cobrancas jsonb;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  select * into l from public.pinbank_checkout_links where token = p_token and revogado_em is null;
  if not found then
    return null;
  end if;
  select * into m from public.movements where id = l.movement_id;
  select name into v_empresa from public.organizations where id = l.org_id;

  v_sit := case
    when m.situacao in ('baixado','conciliado') then 'pago'
    when m.excluido_em is not null or m.situacao not in ('previsto','confirmado') then 'indisponivel'
    else 'aberto'
  end;

  if v_sit = 'aberto' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'tipo', c.tipo,
             'valor', c.valor,
             'vencimento', c.vencimento,
             'textoQrCode', c.texto_qrcode,
             'linhaDigitavel', c.linha_digitavel
           ) order by c.tipo desc), '[]'::jsonb)
      into v_cobrancas
      from public.pinbank_cobrancas c
     where c.movement_id = m.id and c.situacao = 'emitida';
    if v_cobrancas = '[]'::jsonb then
      v_sit := 'indisponivel';
    end if;
  end if;

  return jsonb_build_object(
    'situacao', v_sit,
    'empresa', v_empresa,
    'descricao', case when v_sit = 'aberto' then left(m.description, 120) end,
    'valor', m.amount,
    'vencimento', m.due_date,
    'cobrancas', case when v_sit = 'aberto' then v_cobrancas else '[]'::jsonb end
  );
end;
$$;

revoke all on function public.pinbank_checkout_ler(text) from public, anon, authenticated, service_role;
grant execute on function public.pinbank_checkout_ler(text) to service_role;
