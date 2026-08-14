/** motorBenchmarking() — compara a operação com o setor. */
import type { IndicadoresFinanceiros, BenchmarkLinha } from "./types";

export type Setor = "fintech" | "saas" | "varejo" | "eventos" | "aviacao" | "pme";

/** Referências setoriais (medianas ilustrativas). */
const BENCHMARKS: Record<Setor, { margem: number; eficiencia: number; inadimplencia: number; crescimento: number }> = {
  fintech: { margem: 0.18, eficiencia: 6.5, inadimplencia: 0.08, crescimento: 0.06 },
  saas: { margem: 0.22, eficiencia: 7.0, inadimplencia: 0.04, crescimento: 0.05 },
  varejo: { margem: 0.08, eficiencia: 5.0, inadimplencia: 0.06, crescimento: 0.02 },
  eventos: { margem: 0.15, eficiencia: 5.5, inadimplencia: 0.1, crescimento: 0.04 },
  aviacao: { margem: 0.1, eficiencia: 4.5, inadimplencia: 0.07, crescimento: 0.03 },
  pme: { margem: 0.12, eficiencia: 5.5, inadimplencia: 0.09, crescimento: 0.03 },
};

export function motorBenchmarking(
  i: IndicadoresFinanceiros,
  setor: Setor = "pme",
): BenchmarkLinha[] {
  const b = BENCHMARKS[setor];
  return [
    { metrica: "Margem de caixa (90d)", empresa: i.margemCaixa90d, setor: b.margem, unidade: "pct", acima: i.margemCaixa90d >= b.margem },
    { metrica: "Eficiência operacional", empresa: i.eficienciaOperacional, setor: b.eficiencia, unidade: "num", acima: i.eficienciaOperacional >= b.eficiencia },
    { metrica: "Inadimplência", empresa: i.inadimplencia, setor: b.inadimplencia, unidade: "pct", acima: i.inadimplencia <= b.inadimplencia },
    { metrica: "Crescimento mensal", empresa: i.crescimentoMensal, setor: b.crescimento, unidade: "pct", acima: i.crescimentoMensal >= b.crescimento },
  ];
}
