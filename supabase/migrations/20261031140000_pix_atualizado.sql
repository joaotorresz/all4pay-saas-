-- ═══════════════════════════════════════════════════════════════════════════
-- PIX ATUALIZADO NO LINK DE PAGAMENTO (30/10/2026, decisão do dono)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Depois do vencimento, com a multa e os juros correndo, o Pix original
-- (valor fixo) pagaria menos do que é devido, e a página deixou de mostrá-lo.
-- O dono escolheu "Pix atualizado": a página gera um Pix NOVO com o valor do
-- dia (original + multa + juros), que vale só até 23:59 daquele dia.
--
--   · `pinbank_cobrancas.dia_referencia` — o dia do Pix atualizado (null nas
--     cobranças comuns). `origem_regra` aponta o BOLETO cuja regra foi usada.
--   · `pinbank_checkout_pix_reservar(token, valor)` — só o SERVIDOR (a página
--     é pública). O banco confere tudo de novo: link vivo, título em aberto,
--     vencido, além da tolerância, dentro do prazo aceito, e o VALOR pedido
--     igual (a 1 centavo) ao que a regra do boleto dá hoje.
--   · Um Pix atualizado vivo por título e por dia (índice único) e no máximo
--     3 tentativas por dia — a página é pública, e cada tentativa é uma
--     chamada à Pinbank.
--   · `pinbank_checkout_ler` só devolve o Pix atualizado DE HOJE.
--
-- ⚠️ A regra é a REGISTRADA no boleto (`encargos`), nunca a configuração de
-- hoje da empresa: o Pix cobra o mesmo que o boleto cobraria no banco.
-- ⚠️ O Pix original continua pagável na Pinbank (não há cancelamento nesta
-- integração): quem guardou o QR antigo ainda paga o valor sem encargo.

alter table public.pinbank_cobrancas add column if not exists dia_referencia date;
alter table public.pinbank_cobrancas add column if not exists origem_regra uuid references public.pinbank_cobrancas(id);
alter table public.pinbank_cobrancas drop constraint if exists pinbank_cobrancas_dia_so_no_pix;
alter table public.pinbank_cobrancas add constraint pinbank_cobrancas_dia_so_no_pix
  check (dia_referencia is null or (tipo = 'pix' and origem_regra is not null));

-- A "uma viva por título e tipo" passa a valer só para as cobranças comuns.
drop index if exists public.pinbank_cobrancas_viva_unica;
create unique index if not exists pinbank_cobrancas_viva_unica
  on public.pinbank_cobrancas (movement_id, tipo)
  where situacao in ('reservada','emitida','incerta','a_cancelar') and dia_referencia is null;
-- E o Pix atualizado: um vivo por título e por dia.
create unique index if not exists pinbank_cobrancas_pix_do_dia
  on public.pinbank_cobrancas (movement_id, dia_referencia)
  where situacao in ('reservada','emitida','incerta','a_cancelar') and dia_referencia is not null;

-- ── A reserva da empresa: o Pix atualizado não conta como "o Pix do título" ──
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
   where movement_id = m.id and tipo = p_tipo and dia_referencia is null
     and situacao in ('reservada','emitida','incerta','a_cancelar')
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
-- ── A reserva do Pix do dia, pela página pública (só o servidor) ──────────
create or replace function public.pinbank_checkout_pix_reservar(p_token text, p_valor numeric)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  l public.pinbank_checkout_links%rowtype;
  m public.movements%rowtype;
  b public.pinbank_cobrancas%rowtype;
  v public.pinbank_vinculos%rowtype;
  p public.parties%rowtype;
  c public.pinbank_cobrancas%rowtype;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_dias int;
  v_multa numeric; v_juros numeric; v_carencia int; v_ate int;
  v_total numeric;
  n_tentativas int;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'A4P-COBRANCA: link inválido.' using errcode = 'invalid_parameter_value';
  end if;
  select * into l from public.pinbank_checkout_links where token = p_token and revogado_em is null;
  if not found then
    raise exception 'A4P-COBRANCA: link inválido.' using errcode = 'no_data_found';
  end if;

  -- O título, travado: dois cliques fazem fila aqui.
  select * into m from public.movements where id = l.movement_id for update;
  if not found or m.org_id is distinct from l.org_id or m.excluido_em is not null or m.is_sample
     or m.type <> 'entrada' or m.situacao not in ('previsto','confirmado') or m.amount <= 0 then
    raise exception 'A4P-COBRANCA: esta cobrança não está mais em aberto.' using errcode = 'check_violation';
  end if;
  if m.due_date is null or m.due_date >= v_hoje then
    raise exception 'A4P-COBRANCA: a cobrança ainda está no prazo; o Pix original vale.' using errcode = 'check_violation';
  end if;

  -- A regra: a registrada no boleto emitido deste título.
  select * into b from public.pinbank_cobrancas
   where movement_id = m.id and tipo = 'boleto' and situacao = 'emitida' and encargos is not null
   order by emitida_em desc limit 1;
  if not found then
    raise exception 'A4P-COBRANCA: esta cobrança não tem multa e juros registrados no boleto.' using errcode = 'check_violation';
  end if;
  v_multa := coalesce((b.encargos ->> 'multaPct')::numeric, 0);
  v_juros := coalesce((b.encargos ->> 'jurosMesPct')::numeric, 0);
  v_carencia := coalesce((b.encargos ->> 'carenciaDias')::int, 0);
  v_ate := (b.encargos ->> 'aceitarAteDias')::int;
  v_dias := v_hoje - m.due_date;
  if v_ate is not null and v_dias > v_ate then
    raise exception 'A4P-COBRANCA: passou do prazo em que a empresa aceita o pagamento.' using errcode = 'check_violation';
  end if;
  if v_dias <= v_carencia or (v_multa = 0 and v_juros = 0) then
    raise exception 'A4P-COBRANCA: ainda não há multa nem juros; o Pix original vale.' using errcode = 'check_violation';
  end if;
  -- A mesma conta de `encargosDaFatura` (core/cobranca/fatura): multa uma vez,
  -- juros pro rata die desde o vencimento. O pedido tem de bater a 1 centavo.
  v_total := round(m.amount + round(m.amount * v_multa / 100, 2) + round(m.amount * v_juros / 100 * v_dias / 30, 2), 2);
  if p_valor is null or abs(p_valor - v_total) > 0.01 then
    raise exception 'A4P-COBRANCA: o valor do Pix não confere com a multa e os juros de hoje.' using errcode = 'check_violation';
  end if;

  -- Já existe o Pix de hoje?
  select * into c from public.pinbank_cobrancas
   where movement_id = m.id and dia_referencia = v_hoje and situacao in ('reservada','emitida','incerta','a_cancelar')
   limit 1;
  if found then
    if c.situacao = 'emitida' then
      return jsonb_build_object('existente', true, 'id', c.id);
    end if;
    raise exception 'A4P-COBRANCA: o Pix de hoje já está sendo gerado; abra a página de novo em instantes.' using errcode = 'unique_violation';
  end if;
  select count(*) into n_tentativas from public.pinbank_cobrancas
   where movement_id = m.id and dia_referencia = v_hoje;
  if n_tentativas >= 3 then
    raise exception 'A4P-COBRANCA: não foi possível gerar o Pix hoje; pague pelo boleto.' using errcode = 'check_violation';
  end if;

  -- A conta que recebe: a mesma do boleto, se ainda estiver ligada.
  select * into v from public.pinbank_vinculos
   where id = b.vinculo_id and excluido_em is null and ativo and cobranca_ativa;
  if not found then
    raise exception 'A4P-COBRANCA: a conta que recebe esta cobrança não está mais ligada.' using errcode = 'check_violation';
  end if;

  if m.party_id is not null then
    select * into p from public.parties where id = m.party_id;
  end if;

  insert into public.pinbank_cobrancas (org_id, vinculo_id, movement_id, tipo, valor, vencimento, codigo_cliente,
                                        dia_referencia, origem_regra)
  values (m.org_id, v.id, m.id, 'pix', round(p_valor, 2), v_hoje, b.codigo_cliente, v_hoje, b.id)
  returning * into c;

  return jsonb_build_object(
    'existente', false,
    'id', c.id,
    'tipo', c.tipo,
    'nsuOrigem', c.nsu_origem,
    'codigoCliente', c.codigo_cliente,
    'valor', c.valor,
    'vencimento', c.vencimento,
    'diaReferencia', c.dia_referencia,
    'descricao', m.description,
    'devedor', case when p.id is null then null else jsonb_build_object(
      'nome', p.name, 'documento', p.doc_digits, 'email', p.email, 'telefone', p.phone,
      'cep', p.zip, 'logradouro', p.street, 'numero', p.number, 'complemento', p.complement,
      'bairro', p.district, 'cidade', p.city, 'uf', p.state) end
  );
end;
$$;

revoke all on function public.pinbank_checkout_pix_reservar(text, numeric) from public, anon, authenticated, service_role;
grant execute on function public.pinbank_checkout_pix_reservar(text, numeric) to service_role;

-- ── A página do link: o Pix de hoje entra, o de ontem não ─────────────────
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
             'encargos', c.encargos,
             'diaReferencia', c.dia_referencia
           ) order by c.tipo desc, c.dia_referencia nulls first), '[]'::jsonb)
      into v_cobrancas
      from public.pinbank_cobrancas c
     where c.movement_id = m.id and c.situacao = 'emitida'
       -- O Pix do dia só no dia dele: o de ontem não aceita mais pagamento.
       and (c.dia_referencia is null or c.dia_referencia = (now() at time zone 'America/Sao_Paulo')::date);
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
