/** Insights — extrai os fatores críticos a partir dos componentes do score. */
import type { ScoreDetalhado } from "@/core/risk-engine/types";

export function fatoresCriticos(d: Omit<ScoreDetalhado, "fatoresCriticos" | "narrativa" | "alertas" | "explicacoes">): string[] {
  const out: string[] = [];

  if (d.rupturaDia !== null && d.rupturaDia <= 30)
    out.push(`Ruptura de caixa projetada em ${d.rupturaDia} dias no cenário base.`);
  if (d.runway.pessimista < 90)
    out.push(`Runway pessimista de apenas ${d.runway.pessimista} dias.`);
  if (d.concentracao.topShare >= 0.4)
    out.push(
      `Receita concentrada: ${(d.concentracao.topShare * 100).toFixed(0)}% vem de ${d.concentracao.top[0]?.name ?? "um cliente"}.`,
    );
  if (d.inadimplencia.overdueRatio >= 0.2)
    out.push(`${(d.inadimplencia.overdueRatio * 100).toFixed(0)}% do total a receber está vencido.`);
  if (d.burn.liquidoMensal < 0)
    out.push(`Operação queima caixa (${Math.round(d.burn.burnMensal)}/mês).`);

  // Pilares com pior pontuação completam a lista.
  d.componentes
    .filter((c) => c.score < 45)
    .sort((a, b) => a.score - b.score)
    .forEach((c) => {
      const txt = `${c.label} fraco (${c.score}/100).`;
      if (!out.some((o) => o.includes(c.label))) out.push(txt);
    });

  return out.slice(0, 6);
}
