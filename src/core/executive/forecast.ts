/**
 * motorPreditivo() — a joia: prevê o caixa futuro. Curto prazo via média
 * móvel ponderada × índice de sazonalidade (ARIMA/Prophet/LSTM são
 * evolução). Detecta a janela de pressão de caixa do próximo período.
 */
import type { RiskInput } from "@/core/risk-engine/types";
import { calcularSazonalidade } from "@/core/risk-engine/sazonalidade.engine";
import { serieMensal } from "@/core/quant/series";
import type { Forecast, ForecastPonto } from "./types";

const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function motorPreditivo(input: RiskInput, horizonteMeses = 3): Forecast {
  const serie = serieMensal(input).filter((p) => p.receita > 0 || p.despesa > 0);
  const saz = calcularSazonalidade(input);

  const historico: ForecastPonto[] = serie.map((p) => ({
    label: p.label,
    valor: p.liquido,
    tipo: "historico",
  }));

  // Média móvel ponderada dos últimos 3 meses (pesos 1,2,3).
  const ultimos = serie.slice(-3).map((p) => p.liquido);
  const pesos = ultimos.map((_, i) => i + 1);
  const baseMM =
    ultimos.length > 0
      ? ultimos.reduce((s, v, i) => s + v * pesos[i], 0) / pesos.reduce((a, b) => a + b, 0)
      : 0;

  const base = new Date(input.hoje);
  const previsto: ForecastPonto[] = [];
  for (let k = 1; k <= horizonteMeses; k++) {
    const d = new Date(base.getFullYear(), base.getMonth() + k, 1);
    const indice = saz.indicePorMes[d.getMonth()]?.indice || 1;
    previsto.push({
      label: MES[d.getMonth()],
      valor: Math.round(baseMM * (indice > 0 ? indice : 1)),
      tipo: "previsto",
    });
  }

  // Janela de pressão: mês previsto de menor líquido.
  const pior = [...previsto].sort((a, b) => a.valor - b.valor)[0];
  const janelaPressao =
    pior && pior.valor < baseMM * 0.8
      ? {
          mes: pior.label,
          texto: `Pressão de caixa estimada em ${pior.label} (líquido projetado ${fmt(pior.valor)}).`,
        }
      : undefined;

  const proximo = previsto[0];
  const texto = janelaPressao
    ? janelaPressao.texto
    : proximo
      ? `Fluxo projetado estável: líquido de ${fmt(proximo.valor)} no próximo mês.`
      : "Histórico insuficiente para projeção confiável.";

  return { serie: [...historico, ...previsto], janelaPressao, texto };
}

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
}
