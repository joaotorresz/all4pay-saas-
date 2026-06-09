/**
 * Risk Engine — risco operacional PROBABILÍSTICO multidimensional.
 * Não só "saldo": 8 dimensões (caixa, liquidez, inadimplência,
 * concentração, fornecedor, operacional, sazonal, crescimento), cada uma
 * com probabilidade e fator, agregadas numa probabilidade de stress.
 */
import type { FinancialFeatures, RiskMatrix, RiscoDimensao, RiscoNivel, DimensaoRisco } from "./types";

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const norm = (v: number, min: number, max: number) => (max <= min ? 0 : clamp01((v - min) / (max - min)));
const logistica = (x: number, k = 6, x0 = 0.5) => 1 / (1 + Math.exp(-k * (x - x0)));

function nivel(p: number): RiscoNivel {
  if (p <= 0.2) return "baixo";
  if (p <= 0.45) return "moderado";
  if (p <= 0.7) return "alto";
  return "critico";
}

const PESOS: Record<DimensaoRisco, number> = {
  caixa: 0.22,
  liquidez: 0.18,
  inadimplencia: 0.15,
  concentracao: 0.12,
  operacional: 0.12,
  fornecedor: 0.08,
  sazonal: 0.07,
  crescimento: 0.06,
};

export function calcularRiskMatrix(f: FinancialFeatures): RiskMatrix {
  const burnRatio = f.burnMensal > 0 && f.saldo > 0 ? f.burnMensal / (f.saldo / 6) : 0;

  const baseDims: { id: DimensaoRisco; label: string; probabilidade: number; fator: string }[] = [
    {
      id: "caixa",
      label: "Risco de caixa",
      probabilidade: clamp01(f.probRuptura),
      fator: f.rupturaDia != null ? `ruptura projetada em ${f.rupturaDia} dias` : "fluxo de caixa positivo",
    },
    {
      id: "liquidez",
      label: "Risco de liquidez",
      probabilidade: 1 - norm(f.runwayMeses, 3, 18),
      fator: `runway de ${f.runwayMeses} meses`,
    },
    {
      id: "inadimplencia",
      label: "Risco de inadimplência",
      probabilidade: clamp01(f.inadimplencia * 1.4),
      fator: `${Math.round(f.inadimplencia * 100)}% da carteira vencida`,
    },
    {
      id: "concentracao",
      label: "Concentração de receita",
      probabilidade: clamp01(f.concentracaoReceita),
      fator: `maior cliente = ${Math.round(f.concentracaoReceita * 100)}% da receita`,
    },
    {
      id: "fornecedor",
      label: "Concentração de fornecedor",
      probabilidade: clamp01(f.concentracaoFornecedor),
      fator: `maior fornecedor = ${Math.round(f.concentracaoFornecedor * 100)}% dos pagamentos`,
    },
    {
      id: "operacional",
      label: "Risco operacional (burn)",
      probabilidade: clamp01(burnRatio),
      fator: f.burnMensal > 0 ? "consumo de caixa relevante" : "operação gera caixa",
    },
    {
      id: "sazonal",
      label: "Risco sazonal",
      probabilidade: clamp01(f.sazonalidade),
      fator: "variação sazonal do fluxo",
    },
    {
      id: "crescimento",
      label: "Risco de crescimento",
      probabilidade: 1 - norm(f.crescimentoMensal, -0.1, 0.1),
      fator: `crescimento de ${Math.round(f.crescimentoMensal * 100)}%/mês`,
    },
  ];
  const dims: RiscoDimensao[] = baseDims.map((d) => ({
    ...d,
    peso: PESOS[d.id],
    nivel: nivel(d.probabilidade),
  }));

  const media = dims.reduce((s, d) => s + d.probabilidade * d.peso, 0);
  const probabilidadeStress = logistica(media);
  const fatoresCriticos = dims
    .filter((d) => d.nivel === "alto" || d.nivel === "critico")
    .sort((a, b) => b.probabilidade - a.probabilidade)
    .map((d) => d.fator);

  return { dimensoes: dims, probabilidadeStress, nivelGeral: nivel(probabilidadeStress), fatoresCriticos };
}
