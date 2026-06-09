/**
 * memoryEngine() — o sistema aprende o comportamento da empresa:
 * sazonalidade, clientes críticos, despesas recorrentes, ciclos. Daí a
 * IA vira contextual ("junho historicamente tem aumento de caixa…").
 */
import type { RiskInput } from "@/core/risk-engine/types";
import { calcularSazonalidade } from "@/core/risk-engine/sazonalidade.engine";
import type { ExecutiveContext, PadraoMemoria } from "./types";

const MES_NOME: Record<string, string> = {
  jan: "janeiro", fev: "fevereiro", mar: "março", abr: "abril", mai: "maio", jun: "junho",
  jul: "julho", ago: "agosto", set: "setembro", out: "outubro", nov: "novembro", dez: "dezembro",
};

export function memoryEngine(input: RiskInput, ctx: ExecutiveContext): PadraoMemoria[] {
  const out: PadraoMemoria[] = [];
  const saz = calcularSazonalidade(input);

  // Sazonalidade: meses fortes.
  const fortes = saz.indicePorMes.filter((m) => m.indice >= 1.3).sort((a, b) => b.indice - a.indice);
  if (fortes.length > 0) {
    const m = fortes[0];
    out.push({
      tipo: "sazonalidade",
      texto: `${cap(MES_NOME[m.label] ?? m.label)} historicamente apresenta receita ${Math.round((m.indice - 1) * 100)}% acima da média — sazonalidade positiva.`,
    });
  }
  if (saz.mesesBaixos.length > 0) {
    out.push({
      tipo: "sazonalidade",
      texto: `Meses tipicamente fracos: ${saz.mesesBaixos.map((m) => MES_NOME[m] ?? m).join(", ")} — planejar reforço de caixa.`,
    });
  }

  // Despesas recorrentes (categorias presentes em quase todo mês).
  const mesesPorCat = new Map<string, Set<string>>();
  let totalMeses = new Set<string>();
  for (const mv of input.movements) {
    if (mv.type !== "saida" || mv.status !== "pago") continue;
    const ym = (mv.paid_date ?? mv.due_date).slice(0, 7);
    totalMeses.add(ym);
    const cat = mv.category ?? "Sem categoria";
    (mesesPorCat.get(cat) ?? mesesPorCat.set(cat, new Set()).get(cat)!).add(ym);
  }
  const n = totalMeses.size || 1;
  const recorrentes = Array.from(mesesPorCat.entries())
    .filter(([, set]) => set.size >= Math.max(3, n * 0.7))
    .map(([cat]) => cat);
  if (recorrentes.length > 0) {
    out.push({
      tipo: "despesa",
      texto: `Despesas recorrentes identificadas: ${recorrentes.slice(0, 4).join(", ")}.`,
    });
  }

  // Cliente crítico.
  const conc = ctx.concentracao[0];
  if (conc && conc.percentual >= 25) {
    out.push({
      tipo: "cliente",
      texto: `${conc.nome} é cliente estrutural (${conc.percentual}% da receita) — monitorar comportamento de pagamento.`,
    });
  }

  return out;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
