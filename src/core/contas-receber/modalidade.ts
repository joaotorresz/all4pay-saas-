/**
 * A MODALIDADE DA VENDA — por onde o dinheiro de um título a receber chega:
 * Pix, boleto, link de pagamento ou maquininha (pedido do dono, 26/10/2026,
 * para o filtro do Painel de vendas).
 *
 * ⚠️ Não existe uma coluna "modalidade". Ela é LIDA do que o título já carrega,
 * do mais específico ao mais genérico — o CANAL vence a forma, porque um Pix
 * pago pelo checkout de uma plataforma é venda por link, e um Pix na
 * maquininha é venda de maquininha:
 *
 *   1. maquininha — tem NSU (a venda de POS é a única que o grava) ou a venda
 *      que o gerou é de maquininha;
 *   2. link — a venda que o gerou saiu de uma plataforma de checkout
 *      (Hotmart, Stripe, Kiwify…), ou o código de origem é `link:`;
 *   3. pix / boleto — a forma de pagamento do título ou o método da venda.
 *
 * O que não diz nada fica SEM modalidade (`null`), e com o filtro ligado não
 * aparece: chutar "Pix" para um título que ninguém classificou poria dinheiro
 * na modalidade errada.
 *
 * Puro, tipado, sem I/O.
 */
import type { RiskMovement } from "@/core/risk-engine/types";

export type ModalidadeVenda = "pix" | "boleto" | "link" | "maquininha";

export const MODALIDADES_VENDA: { id: ModalidadeVenda; rotulo: string }[] = [
  { id: "pix", rotulo: "Pix" },
  { id: "boleto", rotulo: "Boleto" },
  { id: "link", rotulo: "Link de pagamento" },
  { id: "maquininha", rotulo: "Maquininha" },
];

const norm = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

const ehPlataformaMaquininha = (p: string) => /\bmaquininha\b|\bpos\b/.test(p);
/** "Outros" e vazio não dizem qual plataforma: não são venda por link. */
const ehPlataformaDeLink = (p: string) => !!p && p !== "outros" && !ehPlataformaMaquininha(p);

export function modalidadeDoTitulo(m: RiskMovement): ModalidadeVenda | null {
  const plataforma = norm(m.venda?.plataforma);
  const ref = norm(m.referenceCode);
  if (m.nsu || ref.startsWith("pinbank:") || ehPlataformaMaquininha(plataforma)) return "maquininha";
  if (ref.startsWith("link:") || ehPlataformaDeLink(plataforma)) return "link";
  const forma = norm(m.formaPagamento) || norm(m.venda?.metodo);
  if (forma === "pix") return "pix";
  if (forma === "boleto") return "boleto";
  return null;
}

/** Lista vazia ou ausente = todas as modalidades (o filtro desligado). */
export function passaNaModalidade(m: RiskMovement, modalidades: readonly ModalidadeVenda[] | null | undefined): boolean {
  if (!modalidades || modalidades.length === 0) return true;
  const mod = modalidadeDoTitulo(m);
  return mod !== null && modalidades.includes(mod);
}
