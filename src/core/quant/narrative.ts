/**
 * IA executiva (CFO digital) — interpretação determinística do score e
 * dos indicadores. Plugável a um LLM depois; a saída já é executiva.
 */
import type { IndicadoresFinanceiros, ScoreFinanceiro, CenarioPreditivo } from "./types";
import { CLASSIF_SAUDE_LABEL } from "./types";

import { formatBRL } from "@/lib/format";
const pct = (n: number) => `${Math.round(n * 100)}%`;

export function narrativaExecutiva(
  i: IndicadoresFinanceiros,
  s: ScoreFinanceiro,
  cenarios: CenarioPreditivo[],
): string {
  const partes: string[] = [];

  partes.push(
    `Score financeiro atual: ${s.score}/100 (${CLASSIF_SAUDE_LABEL[s.classificacao].toLowerCase()}). ` +
      `A operação ${
        s.classificacao === "excelente" || s.classificacao === "saudavel"
          ? "apresenta estrutura saudável"
          : s.classificacao === "atencao"
            ? "exige atenção"
            : "apresenta fragilidade relevante"
      }, com liquidez corrente de ${i.liquidezCorrente.toFixed(2)} e runway de ${i.runwayMeses} meses.`,
  );

  if (s.fatoresNegativos.length > 0) {
    partes.push(
      `Principais riscos identificados: ${s.fatoresNegativos
        .slice(0, 3)
        .map((f) => f.toLowerCase())
        .join("; ")}.`,
    );
  } else if (s.fatoresPositivos.length > 0) {
    partes.push(
      `Destaques positivos: ${s.fatoresPositivos
        .slice(0, 3)
        .map((f) => f.toLowerCase())
        .join("; ")}.`,
    );
  }

  if (i.concentracaoReceita > 0.4) {
    partes.push(
      `Elevada concentração de receita (${pct(i.concentracaoReceita)} no maior cliente) gera risco estrutural relevante.`,
    );
  }
  if (i.burnRate > 0) {
    partes.push(
      `O consumo de caixa é de ${fmt(i.burnRate)}/mês${
        i.crescimentoMensal > 0.03 ? ", acompanhado de crescimento — perfil de expansão" : ""
      }.`,
    );
  }

  const pior = [...cenarios].sort((a, b) => a.scoreProjetado - b.scoreProjetado)[0];
  if (pior && pior.delta < 0) {
    partes.push(
      `Em cenário de stress (${pior.label.toLowerCase()}), o score projetado cai para ${pior.scoreProjetado} em ${pior.emDias} dias.`,
    );
  }

  const trend =
    s.tendencia === "melhorando"
      ? "Tendência de melhora consistente da saúde financeira nos últimos meses."
      : s.tendencia === "piorando"
        ? "Tendência de deterioração nos últimos meses — requer ação."
        : "Saúde financeira estável no período recente.";
  partes.push(
    `${trend} Mantido o cenário atual, a probabilidade de deterioração de caixa nos próximos 90 dias é ${
      s.probabilidadeRuptura >= 0.5 ? "elevada" : s.probabilidadeRuptura >= 0.25 ? "moderada" : "baixa"
    }.`,
  );

  return partes.join(" ");
}

function fmt(v: number) {
  return formatBRL(v);
}
