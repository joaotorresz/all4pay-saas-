/**
 * Financial State Engine — sempre que algo muda, recalcula caixa,
 * liquidez, risco, projeção e score. Reusa o motor de risco de caixa
 * (uma execução) e aplica cada evento ao RiskInput, produzindo o novo
 * estado consolidado e os deltas (a propagação visível da cascata).
 */
import type { RiskInput, RiskMovement } from "@/core/risk-engine/types";
import { scoreRiscoCaixa } from "@/core/risk-engine";
import type { EventoArmazenado, FinancialState, StateDelta } from "./types";

let _mid = 0;
const movId = () => `evtmov_${(_mid++).toString(36)}`;

function diasAtras(hoje: string, dias: number): string {
  const d = new Date(hoje);
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}

/** Calcula o estado consolidado a partir de um RiskInput. */
export function calcularEstado(input: RiskInput): FinancialState {
  const r = scoreRiscoCaixa(input);
  return {
    saldoConsolidado: input.saldoAtual,
    runwayDias: r.runway.base,
    riscoScore: r.score,
    probRuptura: r.probabilidadeRuptura,
    inadimplenciaRatio: r.inadimplencia.overdueRatio,
    overdueAmount: r.inadimplencia.overdueAmount,
    concentracaoTop: r.concentracao.topShare,
    burnMensal: r.burn.burnMensal,
  };
}

/** Aplica um evento ao RiskInput, devolvendo um novo input (imutável). */
export function aplicarEvento(input: RiskInput, e: EventoArmazenado): RiskInput {
  const hoje = input.hoje;
  const movements = [...input.movements];
  let saldoAtual = input.saldoAtual;
  const novo = (m: Omit<RiskMovement, "id">): RiskMovement => ({ id: movId(), ...m });
  const parte = e.contraparte ?? null;

  switch (e.tipo) {
    case "PIX_RECEBIDO":
      movements.push(novo({ type: "entrada", status: "pago", amount: e.valor, due_date: hoje, paid_date: hoje, party_id: parte, category: "venda" }));
      saldoAtual += e.valor;
      break;
    case "BOLETO_EMITIDO":
      movements.push(novo({
        type: "entrada",
        status: "pendente",
        amount: e.valor,
        due_date: String(e.payload.vencimento ?? hoje),
        paid_date: null,
        party_id: parte,
        category: "venda",
      }));
      break;
    case "BOLETO_VENCIDO":
      movements.push(novo({ type: "entrada", status: "pendente", amount: e.valor, due_date: diasAtras(hoje, 5), paid_date: null, party_id: parte, category: "venda" }));
      break;
    case "PAGAMENTO_EXECUTADO":
      movements.push(novo({ type: "saida", status: "pago", amount: e.valor, due_date: hoje, paid_date: hoje, party_id: parte, category: null }));
      saldoAtual -= e.valor;
      break;
    case "PAGAMENTO_APROVADO":
      movements.push(novo({ type: "saida", status: "pendente", amount: e.valor, due_date: hoje, paid_date: null, party_id: parte, category: null }));
      break;
    default:
      break; // SALDO_NEGATIVO / RISCO_ALTERADO / LIMITE_REDUZIDO / APROVACAO_CONCLUIDA: sinais, sem efeito direto
  }

  return { ...input, saldoAtual, movements };
}

/** Deltas entre dois estados (campos relevantes da cascata). */
export function calcularDeltas(antes: FinancialState, depois: FinancialState): StateDelta[] {
  const defs: { campo: keyof FinancialState; label: string; formato: StateDelta["formato"] }[] = [
    { campo: "saldoConsolidado", label: "Caixa consolidado", formato: "moeda" },
    { campo: "runwayDias", label: "Runway", formato: "dias" },
    { campo: "riscoScore", label: "Score de risco", formato: "score" },
    { campo: "probRuptura", label: "Prob. de ruptura", formato: "pct" },
    { campo: "inadimplenciaRatio", label: "Inadimplência", formato: "pct" },
    { campo: "overdueAmount", label: "Vencido em aberto", formato: "moeda" },
    { campo: "burnMensal", label: "Burn mensal", formato: "moeda" },
  ];
  return defs
    .map(({ campo, label, formato }) => ({
      campo: String(campo),
      label,
      antes: antes[campo],
      depois: depois[campo],
      delta: depois[campo] - antes[campo],
      formato,
    }))
    .filter((d) => Math.abs(d.delta) > 1e-6);
}
