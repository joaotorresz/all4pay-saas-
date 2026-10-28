-- ═══════════════════════════════════════════════════════════════════════════
-- A PÁGINA DA FATURA NO MODELO ASAAS (28/10/2026, decisão do dono)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `pinbank_checkout_ler` passa a devolver, além do mínimo do pagamento:
--
--   · `credor` — a EMPRESA que cobra, como o cadastro dela diz (Dados da
--     empresa, `company_profiles.profile->'db'`): nome fantasia, razão social,
--     documento, e-mail, telefone e endereço. É o cabeçalho da fatura: o
--     cliente precisa saber QUEM está cobrando antes de pagar um Pix.
--   · `comprador` — SÓ o nome do pagador, e só enquanto o título está em
--     aberto (o mesmo cuidado da `descricao`).
--
-- ⚠️ Do PAGADOR nada além do nome: documento, e-mail, telefone e endereço dele
-- continuam fora. O link é aberto por quem tem o token, e o token viaja em
-- e-mail e WhatsApp — repassado, ele não pode virar a ficha de alguém.
--
-- ⚠️ Do cadastro da empresa entram SÓ as chaves listadas (lista de PERMITIDOS,
-- cada uma cortada em 120 letras). O cadastro guarda também o logo (imagem
-- embutida, megabytes), o faturamento e o regime — nenhum é da conta de quem
-- vai pagar. A guarda `scripts/pinbank-checkout.sql` (caso 4) reprova chave a
-- mais em qualquer nível.

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
             'linhaDigitavel', c.linha_digitavel
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
