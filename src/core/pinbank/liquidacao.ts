/**
 * O AVISO DE PAGO DA PINBANK — lido e saneado. Puro, tipado, sem I/O.
 *
 * Pago o Pix ou o boleto de uma cobrança emitida pela conta Pinbank, a
 * Pinbank entrega pelo MESMO webhook (`/api/pinbank/webhook`) um destes
 * eventos (doc "Eventos", v1):
 *
 *   · `Pix.CreditoRecebido` — `Valor` em REAIS (250.50), `DataLancamento`
 *     (ISO), `NsuSistemaOrigem` (o NsuOrigem que mandamos no QR dinâmico),
 *     `TxId`, `IdQrcode`, `Recebedor.CodigoCliente`;
 *   · `Boleto.Liquidacao` — `ValorPago` em REAIS, `DataPagamento`
 *     ("AAAA-MM-DD", só a data), `NossoNumero`, `CodigoBarras`,
 *     `CodigoCliente`, `ModalidadeBoleto`.
 *
 * ⚠️ **AQUI O VALOR VEM EM REAIS**, ao contrário do `Compra.*` (centavos). Os
 * dois domínios convivem na mesma rota: ler um no formato do outro multiplica
 * ou divide o recebido por cem.
 *
 * ⚠️ **A REFERÊNCIA DA BAIXA É O `EventId`.** A entrega é "ao menos uma vez":
 * o mesmo aviso reentregue chega com o mesmo `EventId`, e o escritor único
 * (`pinbank_cobranca_liquidar`) devolve `duplicado` sem gravar nada.
 *
 * ⚠️ **SÓ O BOLETO DE COBRANÇA (`C`).** A modalidade `R` (cartão) "pode liquidar
 * mais de uma vez", e a `P` é proposta; nenhuma das duas é emitida pelo ERP.
 */
import type { EnvelopePinbank, Leitura } from "./evento";

export const EVENTOS_LIQUIDACAO = ["Pix.CreditoRecebido", "Boleto.Liquidacao"] as const;
export type EventoLiquidacao = (typeof EVENTOS_LIQUIDACAO)[number];

export const ehEventoDeLiquidacao = (t: string): t is EventoLiquidacao =>
  (EVENTOS_LIQUIDACAO as readonly string[]).includes(t);

/**
 * O interruptor da baixa automática — lido SÓ aqui (a rota e a tela de
 * interruptores chamam esta função). Desligado, a rota responde 503 aos
 * avisos de pago: a Pinbank reenvia por até 24 h, e nada se perde se ligar
 * nesse prazo.
 */
export const liquidacaoPinbankLigada = (env: Record<string, string | undefined> = process.env): boolean =>
  env.PINBANK_LIQUIDACAO === "ligado";

export interface AvisoDeLiquidacao {
  tipo: "pix" | "boleto";
  codigoCliente: number;
  /** Pix: o NsuOrigem que mandamos. */
  nsuOrigem: number | null;
  txid: string | null;
  /** Pix: `IdQrcode`; boleto: `NossoNumero`. */
  pinbankId: string | null;
  codigoBarras: string | null;
  /** Em REAIS, duas casas. */
  valor: number;
  /** ISO 8601 com fuso. */
  pagoEm: string;
  /** O `EventId`: a idempotência da baixa. */
  ref: string;
}

const obj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const texto = (x: unknown, max = 100): string | null => {
  const s = typeof x === "number" && Number.isFinite(x) ? String(x) : typeof x === "string" ? x.trim() : "";
  return s && s.length <= max ? s : null;
};
const numero = (x: unknown): number | null => {
  const n = typeof x === "number" ? x : typeof x === "string" && x.trim() ? Number(x) : NaN;
  return Number.isFinite(n) ? n : null;
};
const inteiroPositivo = (x: unknown): number | null => {
  const n = numero(x);
  return n !== null && Number.isSafeInteger(n) && n > 0 ? n : null;
};
const digitos = (x: unknown, max: number): string | null => {
  const s = texto(x, max);
  return s && /^\d+$/.test(s) ? s : null;
};

/**
 * O instante do pagamento, em ISO com fuso.
 *
 *   · "AAAA-MM-DD" (o boleto, sem hora) vira o meio-dia de São Paulo: a data
 *     do caixa é a do pagamento em qualquer fuso que o servidor use;
 *   · data com hora e fuso (`Z`, `-03:00`) passa como veio;
 *   · ⚠️ MEIA-NOITE EXATA ("…T00:00:00", com ou sem `Z`) é SÓ A DATA. Medido
 *     no primeiro Pix real (05/11/2026): pago às 19h25 do dia 5 em São Paulo,
 *     o aviso trouxe `DataLancamento` à meia-noite do dia 5, gravado como
 *     `2026-11-05 00:00:00+00` — 21h do dia 4 em São Paulo, e o título entrou
 *     no caixa do dia anterior. Vira o meio-dia de São Paulo daquele dia;
 *   · ⚠️ data com hora e SEM fuso é hora de São Paulo (lida como UTC, que é o
 *     que `new Date` faz na Vercel, a noite viraria o dia seguinte).
 */
export function instanteDoPagamento(x: unknown): string | null {
  const s = texto(x, 40);
  if (!s) return null;
  const dia = /^(\d{4}-\d{2}-\d{2})/.exec(s)?.[1];
  if (!dia) return null;
  let d: Date;
  const soData = s === dia || /^\d{4}-\d{2}-\d{2}T00:00(:00(\.0+)?)?(Z|[+-]00:?00)?$/i.test(s);
  if (soData) d = new Date(`${dia}T12:00:00-03:00`);
  else if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return null;
  else if (/(Z|[+-]\d{2}:?\d{2})$/i.test(s)) d = new Date(s);
  else d = new Date(`${s}-03:00`);
  if (Number.isNaN(d.getTime())) return null;
  // 31/02 não existe: o dia lido tem de ser o dia escrito (em São Paulo, quando não há fuso).
  if (soData || !/(Z|[+-]\d{2}:?\d{2})$/i.test(s)) {
    if (d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }) !== dia) return null;
  }
  return d.toISOString();
}

/** O aviso, conferido campo a campo. Recusa = 200 "ignorado" na rota (reenviar não muda nada). */
export function lerAvisoDeLiquidacao(env: EnvelopePinbank): Leitura<AvisoDeLiquidacao> {
  const d = env.data;
  if (env.eventVersion !== "v1") return { ok: false, motivo: `Versão ${env.eventVersion} do aviso não é lida.` };
  if (env.eventType === "Pix.CreditoRecebido") {
    if (d.Status !== undefined && d.Status !== "PAGO") return { ok: false, motivo: "O Pix do aviso não está PAGO." };
    const rec = obj(d.Recebedor) ? d.Recebedor : {};
    const codigoCliente = inteiroPositivo(rec.CodigoCliente);
    const valor = numero(d.Valor);
    const pagoEm = instanteDoPagamento(d.DataLancamento);
    if (!codigoCliente) return { ok: false, motivo: "O aviso não traz Recebedor.CodigoCliente." };
    if (valor === null || valor <= 0) return { ok: false, motivo: "O aviso não traz um Valor positivo." };
    if (!pagoEm) return { ok: false, motivo: "O aviso não traz DataLancamento legível." };
    const idQr = inteiroPositivo(d.IdQrcode);
    return {
      ok: true,
      valor: {
        tipo: "pix",
        codigoCliente,
        nsuOrigem: inteiroPositivo(d.NsuSistemaOrigem),
        txid: texto(d.TxId),
        pinbankId: idQr ? String(idQr) : null,
        codigoBarras: null,
        valor: Math.round(valor * 100) / 100,
        pagoEm,
        ref: env.eventId,
      },
    };
  }
  if (env.eventType === "Boleto.Liquidacao") {
    const modalidade = texto(d.ModalidadeBoleto, 2);
    if (modalidade && modalidade !== "C") return { ok: false, motivo: `Boleto da modalidade ${modalidade} não é emitido pelo ERP.` };
    const codigoCliente = inteiroPositivo(d.CodigoCliente);
    const valor = numero(d.ValorPago);
    const pagoEm = instanteDoPagamento(d.DataPagamento);
    const nossoNumero = digitos(d.NossoNumero, 20) ?? digitos(env.entityId, 20);
    if (!codigoCliente) return { ok: false, motivo: "O aviso não traz CodigoCliente." };
    if (valor === null || valor <= 0) return { ok: false, motivo: "O aviso não traz um ValorPago positivo." };
    if (!pagoEm) return { ok: false, motivo: "O aviso não traz DataPagamento legível." };
    const barras = digitos(d.CodigoBarras, 44);
    if (!nossoNumero && !barras) return { ok: false, motivo: "O aviso não traz NossoNumero nem CodigoBarras." };
    return {
      ok: true,
      valor: {
        tipo: "boleto",
        codigoCliente,
        nsuOrigem: null,
        txid: null,
        pinbankId: nossoNumero,
        codigoBarras: barras && barras.length === 44 ? barras : null,
        valor: Math.round(valor * 100) / 100,
        pagoEm,
        ref: env.eventId,
      },
    };
  }
  return { ok: false, motivo: `O evento ${env.eventType} não é aviso de pago.` };
}
