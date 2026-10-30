-- ═══════════════════════════════════════════════════════════════════════════
-- MULTA E JUROS DA COBRANÇA, POR EMPRESA (30/10/2026, pedido do dono)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- "Coloque para eu conseguir configurar e ajustar multa, juros, a partir de
-- quanto tempo, quantos %": a regra mora aqui, uma por empresa.
--
--   · `cobranca_encargos` — multa (% única), juros (% ao mês, por dia de
--     atraso), tolerância (dias depois do vencimento sem encargo) e até
--     quando o pagamento é aceito (null = sem limite). Só quem ADMINISTRA
--     muda, e só pela função `cobranca_encargos_definir`.
--   · `pinbank_cobrancas.encargos` — a regra que o BANCO registrou naquele
--     boleto, gravada pelo servidor no resultado da emissão. ⚠️ É ela, e não a
--     configuração de hoje, que a página do link mostra: mudar a regra da
--     empresa não muda o que um boleto já emitido cobra.
--   · `pinbank_checkout_ler` devolve `encargos` em cada cobrança.
--
-- ⚠️ Os percentuais são PONTOS PERCENTUAIS (2 = 2%), com teto de 10 — o que
-- passa de 2% de multa é abusivo contra consumidor (CDC art. 52); a tela avisa,
-- o banco só recusa o absurdo.

create table if not exists public.cobranca_encargos (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid() unique,
  multa_pct numeric(5,2) not null check (multa_pct >= 0 and multa_pct <= 10),
  juros_mes_pct numeric(5,2) not null check (juros_mes_pct >= 0 and juros_mes_pct <= 10),
  carencia_dias int not null default 0 check (carencia_dias between 0 and 60),
  aceitar_ate_dias int check (aceitar_ate_dias between 0 and 365),
  atualizado_por uuid default auth.uid(),
  atualizado_em timestamptz not null default now(),
  constraint cobranca_encargos_prazo_depois_da_tolerancia
    check (aceitar_ate_dias is null or aceitar_ate_dias >= carencia_dias)
);

alter table public.cobranca_encargos enable row level security;

drop policy if exists cobranca_encargos_ler on public.cobranca_encargos;
create policy cobranca_encargos_ler on public.cobranca_encargos
  for select to authenticated using (org_id = public.auth_org_id());

-- Só leitura direta; escrever é pela função, que confere o papel.
revoke all on table public.cobranca_encargos from public, anon, authenticated;
grant select on table public.cobranca_encargos to authenticated;

drop trigger if exists zz_auditar_cobranca_encargos on public.cobranca_encargos;
create trigger zz_auditar_cobranca_encargos
  after insert or update or delete on public.cobranca_encargos
  for each row execute function public.auditar_escrita();

create or replace function public.cobranca_encargos_definir(
  p_multa numeric, p_juros numeric, p_carencia int, p_aceitar_ate int)
returns void
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_org uuid := public.auth_org_id();
begin
  if v_org is null or not public.tem_permissao('administrar', v_org) then
    raise exception 'A4P-COBRANCA: só quem administra a empresa muda a multa e os juros.' using errcode = 'insufficient_privilege';
  end if;
  insert into public.cobranca_encargos (org_id, multa_pct, juros_mes_pct, carencia_dias, aceitar_ate_dias, atualizado_por, atualizado_em)
  values (v_org, p_multa, p_juros, coalesce(p_carencia, 0), p_aceitar_ate, auth.uid(), now())
  on conflict (org_id) do update set
    multa_pct = excluded.multa_pct,
    juros_mes_pct = excluded.juros_mes_pct,
    carencia_dias = excluded.carencia_dias,
    aceitar_ate_dias = excluded.aceitar_ate_dias,
    atualizado_por = excluded.atualizado_por,
    atualizado_em = excluded.atualizado_em;
end;
$$;

revoke all on function public.cobranca_encargos_definir(numeric, numeric, int, int) from public, anon, authenticated, service_role;
grant execute on function public.cobranca_encargos_definir(numeric, numeric, int, int) to authenticated;

-- ── A regra registrada no boleto ───────────────────────────────────────────
alter table public.pinbank_cobrancas add column if not exists encargos jsonb
  check (encargos is null or jsonb_typeof(encargos) = 'object');

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
  v_enc jsonb := p_resultado -> 'encargos';
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
  -- Só o boleto emitido carrega encargos, e só as quatro chaves da regra.
  if v_sit <> 'emitida' or c.tipo <> 'boleto' or jsonb_typeof(v_enc) <> 'object' then
    v_enc := null;
  else
    v_enc := jsonb_strip_nulls(jsonb_build_object(
      'multaPct', (v_enc ->> 'multaPct')::numeric,
      'jurosMesPct', (v_enc ->> 'jurosMesPct')::numeric,
      'carenciaDias', (v_enc ->> 'carenciaDias')::int,
      'aceitarAteDias', (v_enc ->> 'aceitarAteDias')::int));
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
    encargos = v_enc,
    emitida_em = case when v_sit = 'emitida' then now() end,
    atualizado_em = now()
  where id = c.id;
end;
$$;

revoke all on function public.pinbank_cobranca_registrar(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.pinbank_cobranca_registrar(uuid, jsonb) to service_role;

-- ── A página do link: a regra de cada cobrança (o resto como em 20261029150000) ──
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
  v_db jsonb;
  v_credor jsonb;
  v_comprador text;
  k text;
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
             'linhaDigitavel', c.linha_digitavel,
             'encargos', c.encargos
           ) order by c.tipo desc), '[]'::jsonb)
      into v_cobrancas
      from public.pinbank_cobrancas c
     where c.movement_id = m.id and c.situacao = 'emitida';
    if v_cobrancas = '[]'::jsonb then
      v_sit := 'indisponivel';
    end if;
  end if;

  -- A empresa que cobra: só as chaves permitidas do cadastro, texto curto.
  select cp.profile -> 'db' into v_db from public.company_profiles cp where cp.org_id = l.org_id limit 1;
  v_credor := '{}'::jsonb;
  if jsonb_typeof(v_db) = 'object' then
    foreach k in array array['fantasia','razaoSocial','cnpj','cpf','email','telefone','whatsapp','ddi',
                             'rua','numero','complemento','bairro','cidade','estado','cep'] loop
      if jsonb_typeof(v_db -> k) in ('string','number') and btrim(v_db ->> k) <> '' then
        v_credor := v_credor || jsonb_build_object(k, left(btrim(v_db ->> k), 120));
      end if;
    end loop;
  end if;

  if v_sit = 'aberto' and m.party_id is not null then
    select left(btrim(p.name), 120) into v_comprador from public.parties p where p.id = m.party_id and p.org_id = l.org_id;
  end if;

  return jsonb_build_object(
    'situacao', v_sit,
    'empresa', v_empresa,
    'credor', v_credor,
    'comprador', case when v_sit = 'aberto' and coalesce(v_comprador, '') <> '' then jsonb_build_object('nome', v_comprador) end,
    'descricao', case when v_sit = 'aberto' then left(m.description, 120) end,
    'valor', m.amount,
    'vencimento', m.due_date,
    'cobrancas', case when v_sit = 'aberto' then v_cobrancas else '[]'::jsonb end
  );
end;
$$;

revoke all on function public.pinbank_checkout_ler(text) from public, anon, authenticated, service_role;
grant execute on function public.pinbank_checkout_ler(text) to service_role;
