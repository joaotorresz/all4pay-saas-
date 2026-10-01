/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EXTRATO DO CLIENTE (e do fornecedor) — o documento que se manda ao outro lado
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A ficha do contato responde "como está este cliente" para quem OPERA. O
 * extrato responde a mesma pergunta para quem está do OUTRO lado — e por isso
 * tem forma de documento: saldo anterior, os títulos do período com vencimento,
 * pagamento e situação, o que foi quitado, e a posição no fim.
 *
 * ⚠️ **O EXTRATO FECHA POR CONSTRUÇÃO, e a guarda cobra isso por fora.**
 *
 *     saldo final = saldo anterior + lançado no período − quitado no período
 *
 * e o saldo final tem de ser, ao centavo, a soma dos títulos EM ABERTO na data
 * final, calculada de forma independente. Um extrato que não fecha é o pior
 * documento que se pode mandar a um cliente: a primeira conta que ele faz é
 * essa, e a conversa seguinte é sobre confiança, não sobre cobrança.
 *
 * ⚠️ **"Quitado no período" pega o título pago ANTES de vencer.** Um título do
 * período pago antecipadamente (antes da data inicial) não está no saldo
 * anterior (ainda não tinha vencido) e está no lançado — se a quitação só
 * contasse pagamentos DENTRO do período, ele ficaria em aberto no extrato de um
 * cliente que já pagou. A quitação conta todo pagamento até a data final dos
 * títulos que o extrato carrega.
 *
 * ⚠️ **O LADO É ESCOLHIDO, não misturado.** Um contato pode ser cliente e
 * fornecedor ao mesmo tempo; somar o que ele nos deve com o que devemos a ele
 * produziria um saldo que não é cobrável nem pagável. O extrato é de UM lado.
 *
 * Puro, sem relógio (`hoje` vem do RiskInput). `extrato-contato/1.0.0`.
 */
import type { RiskInput, RiskMovement } from "@/core/risk-engine/types";

export const EXTRATO_CONTATO_VERSION = "extrato-contato/1.0.0";

export type LadoExtrato = "receber" | "pagar";

export type SituacaoLinha = "quitado" | "a_vencer" | "vencido";

export const ROTULO_SITUACAO: Record<LadoExtrato, Record<SituacaoLinha, string>> = {
  receber: { quitado: "Recebido", a_vencer: "A vencer", vencido: "Vencido" },
  pagar: { quitado: "Pago", a_vencer: "A vencer", vencido: "Vencido" },
};

export interface LinhaExtrato {
  id: string;
  descricao: string;
  vencimento: string;
  pagamento: string | null;
  valor: number;
  situacao: SituacaoLinha;
  documento: string | null;
}

export interface ExtratoContato {
  lado: LadoExtrato;
  contato: string;
  de: string;
  ate: string;
  saldoAnterior: number;
  lancado: number;
  quitado: number;
  saldoFinal: number;
  /** Em aberto na data final (== saldoFinal, conferido pela guarda). */
  emAberto: number;
  /** Do que está em aberto, o que já venceu na data de referência. */
  vencido: number;
  /** min(ate, hoje): vencido é o que passou do prazo ATÉ onde há como saber. */
  referencia: string;
  linhas: LinhaExtrato[];
  /** Problema do pedido (intervalo invertido), dito — nunca um extrato vazio calado. */
  problema: string | null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const d10 = (s: string | null | undefined) => (s ?? "").slice(0, 10);
const pago = (m: RiskMovement) => m.status === "pago" && !!m.paid_date;

/** O título está em aberto NA data? (vencido ou não — só não quitado até ela.) */
export const abertoEm = (m: RiskMovement, data: string): boolean =>
  d10(m.due_date) <= data && !(pago(m) && d10(m.paid_date) <= data);

export function ladoPadrao(input: RiskInput, partyId: string): LadoExtrato {
  let e = 0, s = 0;
  for (const m of input.movements) {
    if (m.party_id !== partyId || m.status === "cancelado") continue;
    if (m.type === "entrada") e += Math.abs(m.amount); else s += Math.abs(m.amount);
  }
  return s > e ? "pagar" : "receber";
}

export function montarExtratoContato(
  input: RiskInput,
  partyId: string,
  lado: LadoExtrato,
  de: string,
  ate: string,
): ExtratoContato {
  const contato = input.partyNames?.[partyId] ?? partyId;
  const referencia = ate < input.hoje ? ate : input.hoje;
  const vazio = (problema: string | null): ExtratoContato => ({
    lado, contato, de, ate, saldoAnterior: 0, lancado: 0, quitado: 0, saldoFinal: 0,
    emAberto: 0, vencido: 0, referencia, linhas: [], problema,
  });
  if (!de || !ate || de > ate) {
    return vazio("O período pedido não existe: a data inicial vem depois da final.");
  }
  const tipo = lado === "receber" ? "entrada" : "saida";
  const doLado = input.movements.filter(
    (m) => m.party_id === partyId && m.type === tipo && m.status !== "cancelado" && !!m.due_date,
  );
  // Anterior: venceu antes do período e NÃO estava quitado quando ele começou.
  const anteriores = doLado.filter((m) => d10(m.due_date) < de && !(pago(m) && d10(m.paid_date) < de));
  const doPeriodo = doLado.filter((m) => d10(m.due_date) >= de && d10(m.due_date) <= ate);
  const carregados = [...anteriores, ...doPeriodo];
  const soma = (xs: RiskMovement[]) => r2(xs.reduce((s, m) => s + Math.abs(m.amount), 0));

  const saldoAnterior = soma(anteriores);
  const lancado = soma(doPeriodo);
  const quitado = soma(carregados.filter((m) => pago(m) && d10(m.paid_date) <= ate));
  const saldoFinal = r2(saldoAnterior + lancado - quitado);
  const abertos = doLado.filter((m) => abertoEm(m, ate));
  const emAberto = soma(abertos);
  const vencido = soma(abertos.filter((m) => d10(m.due_date) < referencia));

  const situacao = (m: RiskMovement): SituacaoLinha =>
    pago(m) && d10(m.paid_date) <= ate ? "quitado" : d10(m.due_date) < referencia ? "vencido" : "a_vencer";

  const linhas: LinhaExtrato[] = doPeriodo
    .sort((a, b) => d10(a.due_date).localeCompare(d10(b.due_date)))
    .map((m) => ({
      id: m.id,
      descricao: m.descricao || m.category || (lado === "receber" ? "Recebimento" : "Pagamento"),
      vencimento: d10(m.due_date),
      pagamento: pago(m) && d10(m.paid_date) <= ate ? d10(m.paid_date) : null,
      valor: r2(Math.abs(m.amount)),
      situacao: situacao(m),
      documento: m.referenceCode ?? null,
    }));

  return { lado, contato, de, ate, saldoAnterior, lancado, quitado, saldoFinal, emAberto, vencido, referencia, linhas, problema: null };
}
