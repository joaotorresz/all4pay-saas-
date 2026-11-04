-- ═══════════════════════════════════════════════════════════════════════════
-- O AVISO DE PAGO DA PINBANK ACHA A COBRANÇA (04/11/2026)
--
-- A Pinbank avisa o pagamento por dois eventos do webhook (doc "Eventos"):
--   · `Pix.CreditoRecebido` — o Pix caiu na conta. Traz `NsuSistemaOrigem`
--     (o NsuOrigem que NÓS mandamos ao pedir o QR dinâmico), `TxId`,
--     `IdQrcode` e `Recebedor.CodigoCliente`;
--   · `Boleto.Liquidacao` — o boleto foi pago. Traz `NossoNumero` (o
--     `pinbank_id` que a Pinbank devolveu na emissão), `CodigoBarras` e
--     `CodigoCliente`.
--
-- Esta função só LÊ: devolve QUAL cobrança o aviso paga. Quem grava continua
-- sendo o escritor único `pinbank_cobranca_liquidar` (migration
-- 20261104140000), chamado pela rota logo depois.
--
-- ⚠️ **UMA CHAVE QUE APONTA PARA DUAS COBRANÇAS NÃO PAGA NENHUMA.** Cada chave
-- do aviso é procurada; se elas apontarem para cobranças diferentes, a
-- resposta é `varias` e nada é baixado. Escolher uma seria baixar o título
-- errado com dinheiro de outro cliente.
--
-- ⚠️ **A CONTA DO AVISO TEM DE SER A DA COBRANÇA.** O `CodigoCliente` do aviso
-- precisa ser o `codigo_cliente` gravado na cobrança. Sem ele, nada é achado:
-- um NSU ou nosso número igual de outra conta nunca baixa título daqui.
--
-- ⚠️ **O NOSSO NÚMERO PODE VIR COM OU SEM ZEROS À ESQUERDA** ("00012345678").
-- A comparação é pelos dígitos sem os zeros da frente.
-- ═══════════════════════════════════════════════════════════════════════════

create index if not exists pinbank_cobrancas_txid_idx
  on public.pinbank_cobrancas (txid) where txid is not null;
create index if not exists pinbank_cobrancas_pinbank_id_idx
  on public.pinbank_cobrancas (codigo_cliente, pinbank_id) where pinbank_id is not null;

create or replace function public.pinbank_cobranca_do_aviso(
  p_tipo text,
  p_codigo_cliente bigint,
  p_nsu_origem bigint,
  p_txid text,
  p_pinbank_id text,
  p_codigo_barras text
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_ids uuid[];
  v_txid text := nullif(btrim(coalesce(p_txid, '')), '');
  v_pid text := nullif(ltrim(btrim(coalesce(p_pinbank_id, '')), '0'), '');
  v_barras text := nullif(btrim(coalesce(p_codigo_barras, '')), '');
begin
  if p_tipo is null or p_tipo not in ('pix', 'boleto') then
    raise exception 'A4P-AVISO: tipo de cobrança inválido (%).', coalesce(p_tipo, 'vazio') using errcode = 'invalid_parameter_value';
  end if;
  if p_codigo_cliente is null or p_codigo_cliente <= 0 then
    return jsonb_build_object('achado', 'nenhuma', 'motivo', 'O aviso não traz o código da conta Pinbank.');
  end if;

  select array_agg(distinct c.id) into v_ids
    from public.pinbank_cobrancas c
   where c.tipo = p_tipo
     and c.codigo_cliente = p_codigo_cliente
     and (
       (p_tipo = 'pix' and (
          (p_nsu_origem is not null and c.nsu_origem = p_nsu_origem)
          or (v_txid is not null and c.txid = v_txid)
          or (v_pid is not null and ltrim(c.pinbank_id, '0') = v_pid)))
       or (p_tipo = 'boleto' and (
          (v_pid is not null and ltrim(c.pinbank_id, '0') = v_pid)
          or (v_barras is not null and c.codigo_barras = v_barras)))
     );

  if v_ids is null or cardinality(v_ids) = 0 then
    return jsonb_build_object('achado', 'nenhuma', 'motivo', 'Nenhuma cobrança desta conta tem a referência do aviso.');
  end if;
  if cardinality(v_ids) > 1 then
    return jsonb_build_object('achado', 'varias', 'motivo',
      format('As referências do aviso apontam para %s cobranças diferentes; nada foi baixado.', cardinality(v_ids)));
  end if;
  return jsonb_build_object('achado', 'uma', 'cobranca', v_ids[1]);
end;
$$;

comment on function public.pinbank_cobranca_do_aviso(text, bigint, bigint, text, text, text) is
  'Qual cobrança um aviso de pago da Pinbank (Pix.CreditoRecebido, Boleto.Liquidacao) paga: "uma" com o id, "nenhuma" ou "varias". Só lê; quem grava é pinbank_cobranca_liquidar. Só service_role.';

revoke all on function public.pinbank_cobranca_do_aviso(text, bigint, bigint, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.pinbank_cobranca_do_aviso(text, bigint, bigint, text, text, text) to service_role;
