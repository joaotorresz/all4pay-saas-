/**
 * executiveBriefing() — resumo executivo diário (WhatsApp / e-mail /
 * push / dashboard). Caixa, runway, alertas, oportunidades, risco de
 * ruptura e ações sugeridas — em linguagem de relatório de gestora.
 */
import type {
  ExecutiveContext,
  ExecutiveInsight,
  Forecast,
  Briefing,
} from "./types";

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

const dataExtenso = (iso: string) => {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
};

export function executiveBriefing(
  ctx: ExecutiveContext,
  insights: ExecutiveInsight[],
  forecast: Forecast,
  nome = "operador",
): Briefing {
  const alertas = insights
    .filter((i) => i.severidade === "alta" || i.severidade === "critica")
    .slice(0, 4)
    .map((i) => i.titulo);

  const oportunidades = insights
    .filter((i) => i.tipo === "crescimento" || i.tipo === "oportunidade")
    .slice(0, 3)
    .map((i) => i.titulo);
  if (forecast.janelaPressao == null && oportunidades.length === 0 && ctx.crescimentoMensal > 0)
    oportunidades.push("Sazonalidade/recebíveis favoráveis no curto prazo");

  const riscoRuptura: Briefing["riscoRuptura"] =
    ctx.probRuptura >= 0.5 ? "elevado" : ctx.probRuptura >= 0.25 ? "moderado" : "baixo";

  const acoes = Array.from(
    new Set(insights.slice(0, 3).flatMap((i) => i.recomendacoes)),
  ).slice(0, 4);

  const texto = [
    `Bom dia, ${cap(nome)}.`,
    `Resumo financeiro — ${dataExtenso(ctx.hoje)}.`,
    `Saldo consolidado: ${fmt(ctx.saldoAtual)}. Runway: ${ctx.runwayMeses} meses. Score de saúde: ${ctx.scoreFinanceiro}/100.`,
    alertas.length ? `Principais alertas: ${alertas.join("; ").toLowerCase()}.` : "Sem alertas críticos.",
    oportunidades.length ? `Oportunidades: ${oportunidades.join("; ").toLowerCase()}.` : "",
    `Risco estimado de ruptura: ${riscoRuptura}.`,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    saudacao: `Bom dia, ${cap(nome)}`,
    data: dataExtenso(ctx.hoje),
    saldo: ctx.saldoAtual,
    runway: ctx.runwayMeses,
    alertas,
    oportunidades,
    riscoRuptura,
    acoes,
    texto,
  };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
