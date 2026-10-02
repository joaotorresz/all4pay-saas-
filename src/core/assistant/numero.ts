/**
 * O número que a IA cita — e DE ONDE ele sai (Rodada 9).
 *
 * Todo número de uma resposta do motor nativo cai num de três casos, e a tela
 * trata cada um de um jeito:
 *
 *  · `origem` com `movimentos` → clicar abre a gaveta com OS lançamentos que
 *    formaram o número (e o total da gaveta é o próprio número). É o que fecha
 *    a conta: "R$ 12.400 de marketing" vira as nove linhas que somam isso.
 *  · `origem` sem `movimentos` → clicar leva à tela que mostra o MESMO número
 *    (um índice, uma razão, uma média: não há linha para apontar).
 *  · `simulacao` → o número nasceu da PERGUNTA (parcela, markup, "caixa depois
 *    de gastar X"). Não existe em tela nenhuma, e a bolha o marca como
 *    simulação em vez de oferecer um link que levaria a lugar nenhum.
 *
 * ⚠️ A origem é DITA por quem calcula, não deduzida do rótulo. A Rodada 5
 * deduzia pelo rótulo e só alcançava 123 de 636 números do corpus: "Marketing",
 * "Loja Alpha", "Em julho" são rótulos que mudam a cada empresa — e o rótulo
 * "Custo fixo" de uma CALCULADORA levava à tela de contas recorrentes, que
 * mostra outro número. O mapa por rótulo (`origem-numero.ts`) fica só como
 * reserva para rótulos fixos.
 *
 * Puro, sem I/O.
 */
import { origemDoNumero } from "@/core/assistant/origem-numero";

export interface OrigemNumero {
  /** A tela que mostra o número (existe no inventário e não é alias). */
  rota: string;
  /** O nome dessa tela, como o menu o escreve. */
  tela: string;
  /** Os lançamentos por trás do número. */
  movimentos?: string[];
  /**
   * `true` quando o número É a soma desses lançamentos (a gaveta mostra o
   * número como total). Sem ele, os lançamentos são a BASE de uma média, razão
   * ou contagem — a gaveta os mostra com o total deles, não com o número, que
   * seria uma soma que não fecha.
   */
  soma?: true;
}

export interface NumeroResposta {
  label: string;
  valor: string;
  origem?: OrigemNumero;
  /** O número nasceu da pergunta (calculadora/simulação), não da base. */
  simulacao?: true;
}

/** As telas que a IA aponta — um lugar só, para a guarda conferir no inventário. */
export const TELAS = {
  inicio: { rota: "/", tela: "Visão geral" },
  extrato: { rota: "/dashboard/financial/statement", tela: "Extrato" },
  receber: { rota: "/contas-a-receber/titulos", tela: "Títulos a receber" },
  pagar: { rota: "/contas-a-pagar/titulos", tela: "Títulos a pagar" },
  painelReceber: { rota: "/contas-a-receber", tela: "Painel de contas a receber" },
  painelPagar: { rota: "/contas-a-pagar", tela: "Painel de contas a pagar" },
  vencidos: { rota: "/dashboard/financial/overdue", tela: "Inadimplência e cobrança" },
  dre: { rota: "/dashboard/reports/dre", tela: "DRE" },
  fluxo: { rota: "/fluxo-caixa", tela: "Fluxo de caixa" },
  fluxoMes: { rota: "/dashboard/reports/cash-flow", tela: "Fluxo de caixa (relatório)" },
  variacao: { rota: "/dashboard/reports/variance", tela: "Análise de variação" },
  recorrentes: { rota: "/contas-a-pagar/recorrentes", tela: "Contas recorrentes" },
  quant: { rota: "/quattro-ai?aba=quant", tela: "Quant" },
  simulador: { rota: "/orcamento?aba=simulador", tela: "Posso comprar?" },
} as const satisfies Record<string, OrigemNumero>;

export type Tela = keyof typeof TELAS;

/** Número que SOMA lançamentos: a gaveta mostra exatamente estes, e o total é ele. */
export function deLancamentos(
  label: string, valor: string, ms: readonly { id: string }[], tela: Tela,
): NumeroResposta {
  return { label, valor, origem: { ...TELAS[tela], movimentos: ms.map((m) => m.id), soma: true } };
}

/** Número CALCULADO sobre lançamentos (média, razão, contagem): a gaveta mostra a base. */
export function sobreLancamentos(
  label: string, valor: string, ms: readonly { id: string }[], tela: Tela,
): NumeroResposta {
  return { label, valor, origem: { ...TELAS[tela], movimentos: ms.map((m) => m.id) } };
}

/** Número que a tela mostra, mas que não é soma de linhas (razão, média, índice). */
export function naTela(label: string, valor: string, tela: Tela): NumeroResposta {
  return { label, valor, origem: { ...TELAS[tela] } };
}

/** Número que nasceu da pergunta — não existe em tela nenhuma. */
export function simulado(label: string, valor: string): NumeroResposta {
  return { label, valor, simulacao: true };
}

/** O valor "R$1.234,56" / "-R$10,00" / "−R$10,00" em número; `null` se não for dinheiro. */
export function valorDoTexto(valor: string): number | null {
  const t = valor.trim();
  const m = /^([−-])?R\$\s?([\d.]+(?:,\d+)?)$/.exec(t.replace(/ /g, " "));
  if (!m) return null;
  const n = Number(m[2].replace(/\./g, "").replace(",", "."));
  return m[1] ? -n : n;
}

/**
 * Completa a origem pelo mapa de rótulos FIXOS (Rodada 5) — só onde quem
 * calculou não disse nada. É o caminho dos números que vêm do Claude e do
 * motor consultivo, que não carregam origem própria.
 */
export function completarPorRotulo(ns: readonly { label: string; valor: string; origem?: OrigemNumero; simulacao?: true }[]): NumeroResposta[] {
  return ns.map((n) => {
    if (n.origem || n.simulacao) return n;
    const o = origemDoNumero(n.label);
    return o ? { ...n, origem: { rota: o.rota, tela: o.tela } } : { label: n.label, valor: n.valor };
  });
}

/**
 * Números que chegam DE FORA do motor (a resposta do Claude): só rótulo e
 * valor, como texto. ⚠️ Qualquer `origem` que viesse no JSON é DESCARTADA —
 * um link que o modelo escrevesse seria uma rota que ninguém conferiu, e a
 * origem tem de ser dita por quem CALCULOU. Depois, o mapa de rótulos fixos.
 */
export function numerosDeFora(bruto: unknown): NumeroResposta[] {
  if (!Array.isArray(bruto)) return [];
  const limpos = bruto
    .filter((n): n is { label: unknown; valor: unknown } => !!n && typeof n === "object" && "label" in n && "valor" in n)
    .map((n) => ({ label: String(n.label).slice(0, 80), valor: String(n.valor).slice(0, 60) }));
  return completarPorRotulo(limpos);
}
