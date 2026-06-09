/**
 * Early Warning System — detecta stress financeiro ANTES do default.
 * Sinais clássicos: atraso crescente, pagamento errático, queda de
 * ticket, deterioração recente, volume vencido aberto.
 */
import type { ClienteFeatures, EarlyWarning } from "./types";

export function detectarEarlyWarning(f: ClienteFeatures): EarlyWarning {
  const sinais: string[] = [];

  if (f.tendenciaRecente > 0.2 && f.atrasoRecente > f.diasAtrasoMedio + 2)
    sinais.push("Atraso recente acima do padrão histórico");
  if (f.oscilacaoPagamento > 8)
    sinais.push("Pagamentos cada vez mais erráticos");
  if (f.variacaoTicket < -0.2)
    sinais.push(`Ticket caiu ${Math.round(-f.variacaoTicket * 100)}% no período recente`);
  if (f.recorrenciaAtraso > 0.5)
    sinais.push("Mais da metade dos pagamentos com atraso");
  if (f.volumeVencido > 0)
    sinais.push("Possui valores já vencidos em aberto");
  if (f.diasAtrasoMaximo > 30)
    sinais.push(`Já atrasou até ${f.diasAtrasoMaximo} dias`);

  const severidade =
    sinais.length >= 3 ? "alta" : sinais.length === 2 ? "media" : "baixa";

  return { ativo: sinais.length >= 2, severidade, sinais };
}
