/** Alertas acionáveis derivados do diagnóstico de risco. */
import type { ScoreDetalhado, Alerta } from "@/core/risk-engine/types";

type Diag = Omit<ScoreDetalhado, "narrativa" | "alertas" | "explicacoes" | "fatoresCriticos">;

export function gerarAlertas(d: Diag): Alerta[] {
  const a: Alerta[] = [];

  if (d.rupturaDia !== null) {
    a.push({
      nivel: d.rupturaDia <= 15 ? "critico" : "atencao",
      titulo: `Ruptura projetada em ${d.rupturaDia} dias`,
      detalhe:
        "O caixa fica negativo dentro do horizonte. Antecipe recebíveis ou renegocie pagamentos.",
    });
  }
  if (d.concentracao.topShare >= 0.4) {
    a.push({
      nivel: "atencao",
      titulo: "Concentração de receita elevada",
      detalhe: `${(d.concentracao.topShare * 100).toFixed(0)}% da receita depende de ${d.concentracao.top[0]?.name ?? "um único cliente"}. Diversifique a carteira.`,
    });
  }
  if (d.inadimplencia.overdueRatio >= 0.2) {
    a.push({
      nivel: "atencao",
      titulo: "Inadimplência acima do saudável",
      detalhe: `${(d.inadimplencia.overdueRatio * 100).toFixed(0)}% dos recebíveis em aberto estão vencidos (${d.inadimplencia.clientesEmAtraso} cliente(s)).`,
    });
  }
  const piorStress = [...d.stress].sort((x, y) => x.impactoSaldo - y.impactoSaldo)[0];
  if (piorStress && piorStress.impactoSaldo < 0) {
    a.push({
      nivel: "info",
      titulo: `Cenário sensível: ${piorStress.label}`,
      detalhe: piorStress.descricao,
    });
  }
  if (a.length === 0) {
    a.push({
      nivel: "info",
      titulo: "Sem alertas críticos",
      detalhe: "Os indicadores de risco estão dentro de faixas saudáveis.",
    });
  }
  return a;
}
