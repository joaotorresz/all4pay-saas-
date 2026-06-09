/**
 * Financial Observability — além de logs: monitora as invariantes
 * financeiras em tempo real (divergência de saldo, inconsistência do
 * ledger, jobs em falha, atraso de liquidação). É o que separa operação
 * amadora de infraestrutura bancária.
 */
import type { LedgerCore } from "./ledger-core";
import type { FinancialQueue } from "./queue";
import type { SinalObservabilidade } from "./types";
import { uid } from "./types";

export function checarSaude(
  ledger: LedgerCore,
  queue: FinancialQueue,
  saldoReportado?: number,
): SinalObservabilidade[] {
  const out: SinalObservabilidade[] = [];

  // 1) Invariante do ledger: Σdébitos == Σcréditos.
  const tb = ledger.trialBalance();
  out.push({
    id: uid("obs"),
    nome: "Integridade do ledger",
    status: tb.balanceado ? "ok" : "critico",
    detalhe: tb.balanceado
      ? "Trial balance fechado (débitos = créditos)."
      : `Ledger desbalanceado: D ${tb.totalDebito} ≠ C ${tb.totalCredito}.`,
  });

  // 2) Divergência de saldo: caixa derivado vs reportado.
  if (saldoReportado != null) {
    const derivado = ledger.saldo("1.1");
    const div = Math.abs(derivado - saldoReportado);
    out.push({
      id: uid("obs"),
      nome: "Divergência de saldo",
      status: div < 1 ? "ok" : div < 1000 ? "degradado" : "critico",
      detalhe:
        div < 1
          ? "Caixa derivado do ledger bate com o reportado."
          : `Diferença de ${div.toFixed(2)} entre ledger e saldo reportado.`,
    });
  }

  // 3) Fila: jobs em falha / retentando.
  const jobs = queue.jobs();
  const falhas = jobs.filter((j) => j.status === "falha").length;
  const retentando = jobs.filter((j) => j.status === "retentando").length;
  out.push({
    id: uid("obs"),
    nome: "Fila de pagamentos",
    status: falhas > 0 ? "critico" : retentando > 0 ? "degradado" : "ok",
    detalhe:
      falhas > 0
        ? `${falhas} job(s) em falha — requer replay/intervenção.`
        : retentando > 0
          ? `${retentando} job(s) em retry.`
          : "Sem jobs presos na fila.",
  });

  // 4) Liquidação pendente (jobs antigos não concluídos).
  const pendentesAntigos = jobs.filter((j) => j.status === "pendente" || j.status === "retentando").length;
  out.push({
    id: uid("obs"),
    nome: "Atraso de liquidação",
    status: pendentesAntigos > 3 ? "degradado" : "ok",
    detalhe: pendentesAntigos > 0 ? `${pendentesAntigos} liquidação(ões) pendente(s).` : "Liquidações em dia.",
  });

  return out;
}
