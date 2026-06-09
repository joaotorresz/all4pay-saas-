/**
 * Behavioral / Payment Pattern Engine.
 * Reconstrói o histórico de recebíveis por cliente a partir dos
 * movements e extrai os sinais comportamentais (features). A premissa:
 * inadimplência deixa rastros ANTES de acontecer — atraso crescente,
 * pagamento errático, queda de ticket, deterioração recente.
 */
import type { RiskMovement } from "@/core/risk-engine/types";
import { diasEntre } from "@/core/risk-engine/types";
import type { PagamentoEvento, ClienteFeatures } from "./types";
import { media, desvioPadrao, clamp01 } from "./normalize";

const JANELA_RECENTE = 90; // dias

function diasAtras(hoje: string, dias: number): string {
  const d = new Date(hoje);
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}

/** Eventos de recebível (entrada) do cliente, com atraso já calculado. */
export function eventosDoCliente(
  movs: RiskMovement[],
  hoje: string,
): PagamentoEvento[] {
  return movs
    .filter((m) => m.type === "entrada" && m.status !== "cancelado")
    .map((m) => {
      const pago = m.status === "pago";
      const vencido = m.status === "pendente" && m.due_date < hoje;
      let diasAtraso = 0;
      if (pago) diasAtraso = m.paid_date ? diasEntre(m.due_date, m.paid_date) : 0;
      else if (vencido) diasAtraso = diasEntre(m.due_date, hoje);
      return {
        id: m.id,
        due_date: m.due_date,
        paid_date: m.paid_date,
        status: m.status,
        valor: m.amount,
        diasAtraso,
        vencido,
        emAberto: m.status === "pendente",
      };
    });
}

/** Tendência: atraso recente pior que o histórico → 0..1 (deterioração). */
function tendencia(atrasoAntigo: number, atrasoRecente: number): number {
  const diff = atrasoRecente - atrasoAntigo;
  if (diff <= 0) return 0;
  return clamp01(diff / 15); // +15 dias de piora satura
}

/** Sinal sazonal: variação do atraso médio entre meses (CV normalizado). */
function calcularSazonalidade(avaliaveis: PagamentoEvento[]): number {
  const porMes = new Map<string, number[]>();
  for (const e of avaliaveis) {
    const mes = e.due_date.slice(0, 7);
    (porMes.get(mes) ?? porMes.set(mes, []).get(mes)!).push(
      Math.max(0, e.diasAtraso),
    );
  }
  if (porMes.size < 3) return 0;
  const mediasMes = Array.from(porMes.values()).map((xs) => media(xs));
  const m = media(mediasMes);
  if (m <= 0) return 0;
  return clamp01(desvioPadrao(mediasMes) / (m + 1)); // coef. de variação amortecido
}

/** Extrai todas as features comportamentais de um cliente. */
export function extrairFeatures(
  clienteId: string,
  nome: string,
  eventos: PagamentoEvento[],
  hoje: string,
  receitaTotalCarteira: number,
): ClienteFeatures {
  // "Avaliáveis" = atraso é definido (pago ou já vencido).
  const avaliaveis = eventos.filter((e) => e.status === "pago" || e.vencido);
  const atrasosPos = avaliaveis.map((e) => Math.max(0, e.diasAtraso));
  const pagos = eventos.filter((e) => e.status === "pago");

  const diasAtrasoMedio = media(atrasosPos);
  const diasAtrasoMaximo = atrasosPos.length ? Math.max(...atrasosPos) : 0;
  const recorrenciaAtraso = avaliaveis.length
    ? avaliaveis.filter((e) => e.diasAtraso > 1).length / avaliaveis.length
    : 0;
  const oscilacaoPagamento = desvioPadrao(pagos.map((e) => e.diasAtraso));

  const corte = diasAtras(hoje, JANELA_RECENTE);
  const recentes = avaliaveis.filter((e) => e.due_date >= corte);
  const antigos = avaliaveis.filter((e) => e.due_date < corte);
  const atrasoRecente = media(recentes.map((e) => Math.max(0, e.diasAtraso)));
  const atrasoAntigo = media(antigos.map((e) => Math.max(0, e.diasAtraso)));
  const tendenciaRecente = tendencia(atrasoAntigo, atrasoRecente);

  const ticketMedio = media(eventos.map((e) => e.valor));
  const ticketRecente = media(
    eventos.filter((e) => e.due_date >= corte).map((e) => e.valor),
  );
  const ticketAntigo = media(
    eventos.filter((e) => e.due_date < corte).map((e) => e.valor),
  );
  const variacaoTicket =
    ticketAntigo > 0 ? (ticketRecente - ticketAntigo) / ticketAntigo : 0;

  const abertos = eventos.filter((e) => e.emAberto);
  const volumeAberto = abertos.reduce((s, e) => s + e.valor, 0);
  const volumeVencido = abertos
    .filter((e) => e.vencido)
    .reduce((s, e) => s + e.valor, 0);
  const faturamentoPeriodo = eventos.reduce((s, e) => s + e.valor, 0);
  const concentracao =
    receitaTotalCarteira > 0 ? faturamentoPeriodo / receitaTotalCarteira : 0;

  return {
    clienteId,
    nome,
    totalPagamentos: eventos.length,
    pagos: pagos.length,
    diasAtrasoMedio,
    diasAtrasoMaximo,
    atrasoRecente,
    recorrenciaAtraso,
    oscilacaoPagamento,
    ticketMedio,
    variacaoTicket,
    tendenciaRecente,
    faturamentoPeriodo,
    concentracao,
    volumeAberto,
    volumeVencido,
    sazonalidade: calcularSazonalidade(avaliaveis),
  };
}
