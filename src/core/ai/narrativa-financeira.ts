/**
 * Camada Narrativa — interpretação executiva (tom de gestora), não KPIs secos.
 * Compositor determinístico: estruturado para, no futuro, ser substituído/
 * complementado por um LLM (Claude API) sem mudar o contrato. Recebe o
 * diagnóstico e devolve um parágrafo de interpretação.
 */
import type { ScoreDetalhado } from "@/core/risk-engine/types";
import { formatBRL } from "@/lib/format";
import { rotuloRunwayLido } from "@/core/indicadores";

type Diag = Omit<ScoreDetalhado, "narrativa" | "alertas" | "explicacoes" | "fatoresCriticos">;

const NIVEL_TXT: Record<string, string> = {
  baixo: "saudável no curto prazo",
  medio: "estável, mas com pontos de atenção",
  alto: "sob pressão relevante",
  critico: "em situação crítica",
};

export function narrativaExecutiva(d: Diag): string {
  const partes: string[] = [];

  partes.push(
    `Seu caixa está ${NIVEL_TXT[d.nivel]} (score ${d.score}/100).`,
  );

  if (d.concentracao.topShare >= 0.35) {
    const dois = d.concentracao.top.slice(0, 2).reduce((s, c) => s + c.share, 0);
    partes.push(
      `A concentração de ${(dois * 100).toFixed(0)}% da receita em ${d.concentracao.top.length >= 2 ? "apenas dois clientes" : `${d.concentracao.top[0]?.name}`} aumenta significativamente o risco operacional caso ocorram atrasos simultâneos.`,
    );
  }

  if (d.burn.liquidoMensal >= 0) {
    partes.push(
      `A operação gera caixa (${formatBRL(d.burn.liquidoMensal)}/mês), sustentando o runway.`,
    );
  } else {
    const base = d.runway.leitura.base;
    if (base.indisponivel) {
      // Queima COM o caixa já zerado ou negativo: não existe prazo a projetar,
      // e um "0,0 meses" diria que o fôlego acabou hoje, não que nem começou.
      partes.push(`O caixa já está zerado ou negativo e a operação queima caixa: não há runway a projetar.`);
    } else partes.push(
      // ⚠️ Pela LEITURA, não pelo número cru: `>= 999 ? "mais de 24 meses"`
      // chamava o teto do cálculo (33 meses) de 24, e o pessimista sem teto
      // nenhum saía "33.3 meses" ou "0.0 meses" com o caixa já negativo.
      `Mantido o ritmo atual de despesas, o runway projetado é de ${rotuloRunwayLido(d.runway.leitura.base)} no cenário base e ${rotuloRunwayLido(d.runway.leitura.pessimista)} no cenário pessimista.`,
    );
  }

  if (d.rupturaDia !== null) {
    partes.push(
      `Atenção: a projeção diária indica ruptura de caixa em ${d.rupturaDia} dias — priorize antecipação de recebíveis e renegociação de vencimentos.`,
    );
  } else if (d.inadimplencia.overdueRatio >= 0.2) {
    partes.push(
      `A inadimplência de ${(d.inadimplencia.overdueRatio * 100).toFixed(0)}% sobre os recebíveis em aberto é o principal fator a endereçar.`,
    );
  }

  if (d.sazonalidade.mesesBaixos.length) {
    partes.push(
      `Considere o efeito sazonal: ${d.sazonalidade.mesesBaixos.join(", ")} tendem a ter receita abaixo da média.`,
    );
  }

  return partes.join(" ");
}
