/**
 * Benchmark Engine — compara a empresa com PARES reais da coorte (setor
 * + faixa), com percentil e mediana. "Sua margem 9% vs 18% do setor."
 * Percepção de inteligência que só a base cross-tenant permite.
 */
import type { EmpresaFeatures, Setor, Benchmark, BenchmarkLinha } from "./types";
import { coorte } from "./cohort";

const mediana = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0;
};
const percentil = (xs: number[], v: number) =>
  xs.length ? Math.round((xs.filter((x) => x <= v).length / xs.length) * 100) : 50;

export function benchmark(e: EmpresaFeatures, setor: Setor): Benchmark {
  const todos = coorte();
  let pares = todos.filter((c) => c.setor === setor);
  if (pares.length < 8) pares = todos;
  const faixa = pares[0]?.faixa ?? "5-20M";

  const def: { metrica: string; key: keyof EmpresaFeatures; formato: BenchmarkLinha["formato"]; maior: boolean }[] = [
    { metrica: "Margem operacional", key: "margem", formato: "pct", maior: true },
    { metrica: "Runway", key: "runwayMeses", formato: "meses", maior: true },
    { metrica: "Inadimplência", key: "inadimplencia", formato: "pct", maior: false },
    { metrica: "Concentração", key: "concentracao", formato: "pct", maior: false },
    { metrica: "Receita recorrente", key: "recorrencia", formato: "pct", maior: true },
    { metrica: "Volatilidade", key: "volatilidade", formato: "pct", maior: false },
  ];

  const linhas: BenchmarkLinha[] = def.map((d) => {
    const vals = pares.map((c) => c[d.key]);
    const empresa = e[d.key];
    const med = mediana(vals);
    let pct = percentil(vals, empresa);
    if (!d.maior) pct = 100 - pct; // para métricas onde menor é melhor
    return {
      metrica: d.metrica,
      empresa,
      medianaSetor: med,
      percentil: pct,
      melhorAcima: d.maior ? empresa >= med : empresa <= med,
      formato: d.formato,
    };
  });

  return { setor, faixa, pares: pares.length, linhas };
}
