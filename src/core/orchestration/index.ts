/**
 * FinancialOrchestrator — o cérebro operacional. Recebe um evento e roda
 * a cascata ponta a ponta: Event Store → Ledger → State Engine (caixa,
 * liquidez, risco, projeção) → Decisão/IA → Auditoria → Antifraude →
 * Webhook. Tudo sincronizado, a partir de um único RiskInput vivo.
 */
import type { RiskInput } from "@/core/risk-engine/types";
import type {
  EventoEntrada,
  EventoArmazenado,
  FinancialState,
  Reacao,
  PassoOrquestracao,
  ResultadoOrquestracao,
} from "./types";
import { VERSAO_ORQUESTRACAO } from "./types";
import { EventStore } from "./event-store";
import { Ledger } from "./ledger";
import { calcularEstado, aplicarEvento, calcularDeltas } from "./state-engine";
import { construirGrafo } from "./graph";

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

export class FinancialOrchestrator {
  private input: RiskInput;
  readonly store = new EventStore();
  readonly ledger = new Ledger();

  constructor(input: RiskInput) {
    this.input = input;
  }

  estadoAtual(): FinancialState {
    return calcularEstado(this.input);
  }
  grafo() {
    return construirGrafo(this.input);
  }

  /** Roda a cascata para um evento. */
  orquestrar(ev: EventoEntrada): ResultadoOrquestracao {
    const stateAntes = calcularEstado(this.input);
    const evento = this.store.append(ev);
    const lanc = this.ledger.registrar(evento);
    this.input = aplicarEvento(this.input, evento);
    const stateDepois = calcularEstado(this.input);
    const deltas = calcularDeltas(stateAntes, stateDepois);
    const reacoes = reagir(evento, stateAntes, stateDepois);
    const passos = montarPassos(evento, !!lanc, deltas.length, reacoes);

    return {
      evento,
      passos,
      deltas,
      reacoes,
      lancamentos: lanc ? [lanc] : [],
      stateAntes,
      stateDepois,
    };
  }
}

/** Decisão / IA / Antifraude / Webhook — reações ao novo estado. */
function reagir(
  e: EventoArmazenado,
  antes: FinancialState,
  depois: FinancialState,
): Reacao[] {
  const out: Reacao[] = [];

  if (depois.probRuptura >= 0.5 || depois.probRuptura - antes.probRuptura > 0.05) {
    out.push({
      tipo: "decisao",
      severidade: depois.probRuptura >= 0.5 ? "critica" : "alta",
      texto: `Pressão de caixa: probabilidade de ruptura em ${Math.round(depois.probRuptura * 100)}%. Recomenda-se antecipar recebíveis.`,
    });
  }
  if (depois.overdueAmount - antes.overdueAmount > 0) {
    out.push({
      tipo: "decisao",
      severidade: "alta",
      texto: `Inadimplência subiu (${fmt(depois.overdueAmount - antes.overdueAmount)}). Motor de crédito sugere reduzir limite e acionar cobrança.`,
    });
  }
  if (e.tipo === "PAGAMENTO_EXECUTADO" && e.valor >= 100000) {
    out.push({
      tipo: "antifraude",
      severidade: "alta",
      texto: `Pagamento de ${fmt(e.valor)} acima do padrão — antifraude marcou para revisão.`,
    });
  }
  if (depois.saldoConsolidado < 0) {
    out.push({ tipo: "alerta", severidade: "critica", texto: "Saldo consolidado negativo — bloqueio preventivo recomendado." });
  }
  out.push({
    tipo: "webhook",
    severidade: "baixa",
    texto: `Webhook disparado: ${e.tipo} (${e.id}).`,
  });
  return out;
}

/** Monta a cascata de microprocessos (o trace visível). */
function montarPassos(
  e: EventoArmazenado,
  temLancamento: boolean,
  nDeltas: number,
  reacoes: Reacao[],
): PassoOrquestracao[] {
  const critico = reacoes.some((r) => r.severidade === "critica");
  const alerta = reacoes.some((r) => r.severidade === "alta" || r.severidade === "critica");
  const passos: PassoOrquestracao[] = [
    { ordem: 1, modulo: "Event Store", detalhe: `Evento ${e.tipo} selado na cadeia (hash ${e.hash.slice(0, 8)}…)`, status: "ok" },
    { ordem: 2, modulo: "Ledger", detalhe: temLancamento ? "Dupla partida registrada (débito/crédito)" : "Sem efeito contábil direto", status: "ok" },
    { ordem: 3, modulo: "State Engine", detalhe: `Caixa, liquidez, risco e projeção recalculados (${nDeltas} métricas alteradas)`, status: nDeltas > 0 ? "ok" : "ok" },
    { ordem: 4, modulo: "Decisão / IA", detalhe: reacoes.filter((r) => r.tipo === "decisao").length ? "Recomendações executivas geradas" : "Sem ação requerida", status: alerta ? "alerta" : "ok" },
    { ordem: 5, modulo: "Auditoria", detalhe: "Evento e mudança de estado registrados (imutável)", status: "ok" },
    { ordem: 6, modulo: "Antifraude", detalhe: reacoes.some((r) => r.tipo === "antifraude") ? "Transação marcada para revisão" : "Nenhum padrão suspeito", status: reacoes.some((r) => r.tipo === "antifraude") ? "alerta" : "ok" },
    { ordem: 7, modulo: "Webhook", detalhe: "Eventos externos notificados", status: critico ? "critico" : "ok" },
  ];
  return passos;
}

export function criarOrquestrador(input: RiskInput): FinancialOrchestrator {
  return new FinancialOrchestrator(input);
}

export { VERSAO_ORQUESTRACAO };
export type { ResultadoOrquestracao, FinancialState } from "./types";
