/**
 * gerarInsights() + priorizadorExecutivo() — transforma contexto +
 * anomalias + forecast em ExecutiveInsight[] explicáveis, e os ordena
 * por impacto × urgência × probabilidade × criticidade (executivos
 * morrem afogados em informação — a IA prioriza).
 */
import type {
  ExecutiveContext,
  ExecutiveInsight,
  Anomalia,
  Forecast,
  Severidade,
} from "./types";
import { uid } from "./types";

const reais = (centavos: number) => centavos / 100;
const C = (v: number) => Math.round(v * 100); // reais → centavos

export function gerarInsights(
  ctx: ExecutiveContext,
  anomalias: Anomalia[],
  forecast: Forecast,
): ExecutiveInsight[] {
  const out: ExecutiveInsight[] = [];
  const now = ctx.hoje;

  // Ruptura / caixa
  if (ctx.probRuptura >= 0.25 || (ctx.rupturaDia != null && ctx.rupturaDia < 60)) {
    out.push({
      id: uid("ins"),
      tipo: "caixa",
      severidade: ctx.probRuptura >= 0.5 ? "critica" : "alta",
      titulo: "Pressão de caixa no horizonte",
      descricao:
        ctx.rupturaDia != null
          ? `Projeção indica ruptura de caixa em ${ctx.rupturaDia} dias no cenário base.`
          : `Probabilidade de deterioração de caixa em 90 dias é ${Math.round(ctx.probRuptura * 100)}%.`,
      impactoCentavos: C(ctx.burnRate),
      confianca: 0.8,
      recomendacoes: ["Antecipar recebíveis relevantes", "Revisar despesas não essenciais"],
      criadoEm: now,
    });
  }

  // Inadimplência / clientes em risco
  if (ctx.clientesRisco.length > 0) {
    const exposicao = ctx.clientesRisco.reduce((s, c) => s + c.exposicao, 0);
    out.push({
      id: uid("ins"),
      tipo: "inadimplencia",
      severidade: ctx.inadimplencia > 0.2 ? "alta" : "media",
      titulo: `${ctx.clientesRisco.length} cliente(s) em risco de inadimplência`,
      descricao: `Exposição em aberto de clientes de risco alto/crítico, liderada por ${ctx.clientesRisco[0].nome}.`,
      impactoCentavos: C(exposicao),
      confianca: 0.75,
      recomendacoes: ["Cobrança proativa antes do vencimento", "Reavaliar limite e prazo"],
      criadoEm: now,
    });
  }

  // Concentração
  const conc = ctx.concentracao[0];
  if (conc && conc.percentual >= 40) {
    out.push({
      id: uid("ins"),
      tipo: "risco",
      severidade: conc.percentual >= 60 ? "alta" : "media",
      titulo: "Concentração de receita elevada",
      descricao: `${conc.nome} representa ${conc.percentual}% da receita — risco estrutural se atrasar ou sair.`,
      impactoCentavos: C(ctx.receitaMensal * (conc.percentual / 100)),
      confianca: 0.85,
      recomendacoes: ["Diversificar carteira de clientes", "Monitorar de perto este cliente"],
      criadoEm: now,
    });
  }

  // Margem
  if (ctx.margemCaixa90d < 0.1) {
    out.push({
      id: uid("ins"),
      tipo: "margem",
      severidade: ctx.margemCaixa90d < 0 ? "critica" : "media",
      titulo: "Margem operacional comprimida",
      descricao: `Margem de caixa (90d) em ${Math.round(ctx.margemCaixa90d * 100)}% — estrutura de custos pesada para o ritmo do caixa.`,
      impactoCentavos: C(ctx.despesaMensal * 0.1),
      confianca: 0.7,
      recomendacoes: ["Revisar maiores centros de custo", "Renegociar fornecedores recorrentes"],
      criadoEm: now,
    });
  }

  // Crescimento (oportunidade)
  if (ctx.crescimentoMensal >= 0.05) {
    out.push({
      id: uid("ins"),
      tipo: "crescimento",
      severidade: "baixa",
      titulo: "Crescimento de receita consistente",
      descricao: `Receita cresceu ${Math.round(ctx.crescimentoMensal * 100)}% no mês — janela para expansão moderada.`,
      impactoCentavos: C(ctx.receitaMensal * ctx.crescimentoMensal),
      confianca: 0.65,
      recomendacoes: ["Avaliar expansão dentro do runway", "Reforçar capacidade operacional"],
      criadoEm: now,
    });
  }

  // Anomalias → insights
  for (const a of anomalias.slice(0, 3)) {
    out.push({
      id: uid("ins"),
      tipo: "anomalia",
      severidade: a.severidade,
      titulo: a.titulo,
      descricao: a.descricao,
      impactoCentavos: C(a.valor),
      confianca: a.zscore ? Math.min(0.95, 0.5 + a.zscore / 10) : 0.6,
      recomendacoes: ["Validar lançamento e aprovação", "Verificar duplicidade / favorecido"],
      criadoEm: now,
    });
  }

  // Forecast (pressão futura)
  if (forecast.janelaPressao) {
    out.push({
      id: uid("ins"),
      tipo: "caixa",
      severidade: "media",
      titulo: "Pressão de caixa prevista",
      descricao: forecast.janelaPressao.texto,
      impactoCentavos: 0,
      confianca: 0.55,
      recomendacoes: ["Planejar reforço de caixa para o período", "Antecipar cobranças"],
      criadoEm: now,
    });
  }

  return priorizar(out);
}

const SEV_PESO: Record<Severidade, number> = { baixa: 0.25, media: 0.5, alta: 0.8, critica: 1 };
const URG_TIPO: Record<string, number> = {
  caixa: 1,
  inadimplencia: 0.85,
  anomalia: 0.8,
  margem: 0.6,
  risco: 0.6,
  crescimento: 0.3,
  oportunidade: 0.3,
};

/** Priorizador: impacto × urgência × probabilidade × criticidade. */
export function priorizar(insights: ExecutiveInsight[]): ExecutiveInsight[] {
  const maxImpacto = Math.max(1, ...insights.map((i) => Math.abs(reais(i.impactoCentavos))));
  const score = (i: ExecutiveInsight) => {
    const nImpacto = Math.abs(reais(i.impactoCentavos)) / maxImpacto;
    const urg = URG_TIPO[i.tipo] ?? 0.5;
    const crit = SEV_PESO[i.severidade];
    return 0.4 * nImpacto + 0.3 * crit + 0.15 * i.confianca + 0.15 * urg;
  };
  return insights
    .map((i) => ({ i, s: score(i) }))
    .sort((a, b) => b.s - a.s)
    .map(({ i }, idx) => ({ ...i, prioridade: idx + 1 }));
}
