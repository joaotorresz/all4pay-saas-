/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A POSIÇÃO CONSOLIDADA — antes e depois das eliminações entre empresas
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A tela de Consolidado somava as empresas do grupo e dizia, em letra pequena,
 * "sem eliminações intercompany". O motor que elimina (`eliminacoesIntercompany`,
 * ONDA 13) já existia e já rodava dentro da DRE multiempresas — só não chegava
 * à tela onde o dono olha o TAMANHO do grupo. Resultado: a receita consolidada
 * incluía a fatura que a holding manda para a operadora, que é dinheiro que
 * nunca entrou no grupo, e é esse número que vai ao banco pedir crédito.
 *
 * ⚠️ **ANTES E DEPOIS, LADO A LADO — nunca só o depois.** Um consolidado menor
 * que a soma das partes, sem nada explicando a diferença, é a primeira pergunta
 * do contador. A diferença é a lista de eliminações, com quem, quanto e em que
 * competência, e ela aparece inteira.
 *
 * ⚠️ **O RESULTADO NÃO MUDA — e isso é a prova de que a eliminação é justa.**
 * Cada eliminação tira o MESMO valor da receita de uma empresa e da despesa da
 * outra: a receita e a despesa do grupo encolhem juntas, e o resultado fica
 * onde estava. Uma eliminação que movesse o resultado estaria apagando um lado
 * só — receita real sumindo, que é o erro que o critério conservador existe
 * para impedir. A guarda cobra essa identidade.
 *
 * ⚠️ **A MESMA REGRA DE SOMA DA RPC `org_consolidado`**: não cancelado, com
 * vencimento dentro do período. Uma segunda regra ("pago no período") faria
 * esta tela e a DRE multiempresas discordarem sobre o mesmo grupo.
 */
import type { RiskInput } from "@/core/risk-engine/types";
import { eliminacoesIntercompany, type Eliminacao, type EntidadeRelatorio } from "./index";

export const POSICAO_CONSOLIDADA_VERSION = "posicao-consolidada/1.0.0";

/** O critério, em uma frase — o mesmo texto na tela e no info. */
export const CRITERIO_ELIMINACAO =
  "Só elimina o par que se reconhece com certeza: mesmo valor ao centavo, competência a até 5 dias, sentidos opostos (uma recebe, a outra paga) e a contraparte de cada lado sendo OUTRA empresa desta consolidação. Venda a terceiro que por acaso coincide não é eliminada.";

export interface PosicaoEmpresa {
  id: string;
  nome: string;
  saldo: number;
  receita: number;
  despesa: number;
  resultado: number;
}

export interface Totais { saldo: number; receita: number; despesa: number; resultado: number }

export interface PosicaoConsolidada {
  empresas: PosicaoEmpresa[];
  /** A soma simples das partes. */
  antes: Totais;
  /** Depois de tirar os pares intercompany. */
  depois: Totais;
  eliminacoes: Eliminacao[];
  /** Quanto saiu de cada lado (iguais por construção). */
  eliminadoReceita: number;
  eliminadoDespesa: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const noPeriodo = (d: string, de: string, ate: string) => d >= de && d <= ate;

function somar(input: RiskInput, de: string, ate: string, tipo: "entrada" | "saida", fora: Set<string>, prefixo: string): number {
  let s = 0;
  for (const m of input.movements) {
    if (m.status === "cancelado" || m.type !== tipo || !m.due_date) continue;
    if (!noPeriodo(m.due_date.slice(0, 10), de, ate)) continue;
    if (fora.has(`${prefixo}:${m.id}`)) continue;
    s += Math.abs(m.amount);
  }
  return r2(s);
}

export function montarPosicaoConsolidada(
  entidades: readonly EntidadeRelatorio[],
  de: string,
  ate: string,
): PosicaoConsolidada {
  // Só entram as eliminações cuja competência está no período — a mesma janela
  // das somas. Eliminar um par de outro mês tiraria da receita um valor que ela
  // nunca somou, e o "depois" ficaria menor que o real.
  const eliminacoes = eliminacoesIntercompany(entidades).filter((e) => noPeriodo(e.competencia, de, ate));
  const saidas = new Set(eliminacoes.map((e) => e.saida));
  const entradas = new Set(eliminacoes.map((e) => e.entrada));
  const nenhum = new Set<string>();

  const empresas: PosicaoEmpresa[] = entidades.map((e) => {
    const receita = somar(e.input, de, ate, "entrada", nenhum, e.id);
    const despesa = somar(e.input, de, ate, "saida", nenhum, e.id);
    return { id: e.id, nome: e.nome, saldo: r2(e.input.saldoAtual), receita, despesa, resultado: r2(receita - despesa) };
  });
  const tot = (k: keyof Totais) => r2(empresas.reduce((s, x) => s + x[k], 0));
  const antes: Totais = { saldo: tot("saldo"), receita: tot("receita"), despesa: tot("despesa"), resultado: tot("resultado") };

  const receitaDepois = r2(entidades.reduce((s, e) => s + somar(e.input, de, ate, "entrada", entradas, e.id), 0));
  const despesaDepois = r2(entidades.reduce((s, e) => s + somar(e.input, de, ate, "saida", saidas, e.id), 0));
  const depois: Totais = {
    // ⚠️ O saldo é POSIÇÃO de caixa de cada empresa: o dinheiro que andou entre
    // elas já saiu de uma conta e entrou na outra. Eliminar de novo aqui
    // tiraria do grupo um dinheiro que ele TEM.
    saldo: antes.saldo,
    receita: receitaDepois,
    despesa: despesaDepois,
    resultado: r2(receitaDepois - despesaDepois),
  };
  return {
    empresas, antes, depois, eliminacoes,
    eliminadoReceita: r2(antes.receita - depois.receita),
    eliminadoDespesa: r2(antes.despesa - depois.despesa),
  };
}
