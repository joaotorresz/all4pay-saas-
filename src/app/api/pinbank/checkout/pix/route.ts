import { NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase/admin";
import { emitirCobrancaPinbank, pixAtualizadoLiberado } from "@/lib/pinbank/api";
import { lerLinkDePagamento, tokenDoLink } from "@/lib/checkout-leitura";
import { encargosDaFatura, lerRegraEncargos } from "@/core/cobranca/fatura";
import { lerReservaCobranca, problemasDoDevedor, type ReservaCobranca, type ResultadoCobranca } from "@/core/pinbank/cobranca";
import { hojeEm } from "@/core/automacoes/tempo";

/**
 * O PIX ATUALIZADO DO LINK DE PAGAMENTO (decisão do dono, 30/10/2026).
 *
 *   POST /api/pinbank/checkout/pix  { t: <token do link> }
 *
 * Depois do vencimento, com multa e juros correndo, a página pública pede um
 * Pix com o valor do DIA (vale até 23:59, sem pagamento depois disso).
 *
 * ⚠️ **MUDA QUEM PODE CHAMAR O QUÊ:** é a única chamada à Pinbank que um
 * VISITANTE (sem login) dispara. O pedido só traz o token; o valor sai da
 * MESMA conta da página (`encargosDaFatura` sobre a regra registrada no
 * boleto), e o banco a confere de novo, junto com o link vivo, o título em
 * aberto, o prazo e o teto de 3 tentativas por título e por dia
 * (`pinbank_checkout_pix_reservar`, só o servidor).
 *
 * Portões, na ordem: interruptor (`PINBANK_PIX_ATUALIZADO` + cobrança liberada)
 * → chave de serviço → o link (a leitura da página) → a regra e o valor de
 * hoje → a reserva no banco → o cadastro do pagador → a Pinbank → o registro.
 * Um registro no log por chamada à Pinbank, sem valor nem dado do pagador.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const resposta = (status: number, corpo: Record<string, unknown>) =>
  NextResponse.json(corpo, { status, headers: { "cache-control": "no-store, max-age=0" } });

const INDISPONIVEL = "O Pix com o valor de hoje não está disponível agora. Pague pelo boleto.";

function fraseDoBanco(msg: string | undefined): string {
  const m = /A4P-COBRANCA:\s*(.+)$/.exec(msg ?? "");
  return m ? m[1].trim() : INDISPONIVEL;
}

export async function POST(req: Request) {
  if (!pixAtualizadoLiberado()) return resposta(503, { ok: false, codigo: "desligado", motivo: INDISPONIVEL });
  const admin = createAdmin();
  if (!admin) return resposta(503, { ok: false, codigo: "sem_servico", motivo: INDISPONIVEL });

  let pedido: unknown = null;
  try {
    pedido = await req.json();
  } catch {
    pedido = null;
  }
  const bruto = pedido && typeof pedido === "object" ? (pedido as Record<string, unknown>).t : undefined;
  const token = tokenDoLink(typeof bruto === "string" ? bruto : undefined);

  // O link, pela MESMA leitura da página: o valor que ela mostra é o que se pede.
  const r = await lerLinkDePagamento(token);
  if (r === "invalido") return resposta(404, { ok: false, codigo: "link_invalido", motivo: "Este link de pagamento não existe ou foi cancelado." });
  if (r === "fora_do_ar") return resposta(503, { ok: false, codigo: "fora_do_ar", motivo: INDISPONIVEL });
  if (r.situacao !== "aberto") return resposta(409, { ok: false, codigo: "fechada", motivo: "Esta cobrança não está mais em aberto." });
  const boleto = r.cobrancas.find((x) => x.tipo === "boleto" && x.linhaDigitavel);
  const regra = boleto ? lerRegraEncargos(boleto.encargos) : null;
  const enc = encargosDaFatura(r.valor, r.vencimento, hojeEm(new Date()), regra);
  if (!regra || enc.expirada || !(enc.total > r.valor)) {
    return resposta(409, { ok: false, codigo: "sem_encargo", motivo: "Esta cobrança não tem multa e juros hoje; o Pix original vale." });
  }

  const { data: res, error: eR } = await admin.rpc("pinbank_checkout_pix_reservar", { p_token: token, p_valor: enc.total });
  if (eR) return resposta(409, { ok: false, codigo: "recusada", motivo: fraseDoBanco(eR.message) });
  let reserva: ReservaCobranca;
  try {
    reserva = lerReservaCobranca(res);
  } catch {
    return resposta(500, { ok: false, codigo: "reserva_ilegivel", motivo: INDISPONIVEL });
  }
  // O segundo clique: o Pix de hoje já existe, a página o mostra.
  if (reserva.existente) return resposta(200, { ok: true, existente: true });
  if (!reserva.diaReferencia) return resposta(500, { ok: false, codigo: "reserva_ilegivel", motivo: INDISPONIVEL });

  const registrar = (x: ResultadoCobranca) => admin.rpc("pinbank_cobranca_registrar", { p_id: reserva.id, p_resultado: x });
  const faltam = problemasDoDevedor("pix", reserva.devedor);
  if (faltam.length) {
    await registrar({ situacao: "falhou", motivo: faltam.join(" ") });
    return resposta(422, { ok: false, codigo: "cadastro_incompleto", motivo: INDISPONIVEL });
  }

  const resultado = await emitirCobrancaPinbank(reserva);
  const { error: eG } = await registrar(resultado);
  console.info(JSON.stringify({
    evento: "pinbank.pix_atualizado",
    cobranca: reserva.id,
    situacao: resultado.situacao,
    gravou: !eG,
  }));
  if (eG) return resposta(500, { ok: false, codigo: "registro_falhou", motivo: INDISPONIVEL });
  if (resultado.situacao === "emitida") return resposta(201, { ok: true });
  return resposta(resultado.situacao === "incerta" ? 504 : 502, { ok: false, codigo: resultado.situacao, motivo: INDISPONIVEL });
}
