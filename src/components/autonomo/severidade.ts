import type { Severidade } from "@/core/executive/types";

/**
 * A cor da SEVERIDADE de uma leitura ou anomalia do motor executivo. É nível de
 * alerta, não número por sinal — por isso continua colorida (decisão de
 * 30/09/2026). Uma tabela só para os dois cartões da aba Sugestões que vieram
 * do antigo `/copiloto`.
 */
export const SEV_COR: Record<Severidade, string> = {
  baixa: "var(--color-text-secondary)",
  media: "var(--color-warning)",
  alta: "var(--color-negative)",
  critica: "var(--color-negative)",
};
