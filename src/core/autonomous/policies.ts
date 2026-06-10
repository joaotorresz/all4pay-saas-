/**
 * Autonomous Policies — a empresa define políticas (SE <condição> ENTÃO
 * <ação>) e a IA executa. Cada política avalia o contexto financeiro e
 * emite FinancialDecision[] explicáveis. Governança automatizada.
 */
import type { FinancialDecision, TipoDecisao } from "./types";

export interface DecisionContext {
  hoje: string;
  saldoAtual: number;
  rupturaDia: number | null;
  probRuptura: number;
  probStress: number;
  runwayDias: number;
  inadimplencia: number;
  topBancoShare: number;
  clientesRisco: { nome: string; score: number; exposicao: number; classificacao: string }[];
  anomalias: { titulo: string; descricao: string; valor: number; severidade: string }[];
  recomendacoes: { titulo: string; descricao: string; valorEnvolvido: number; deltaScore: number; deltaRunwayDias: number; deltaProbRuptura: number }[];
}

/** Rascunho de decisão (o motor finaliza id/prioridade/modo). */
export type DecisionDraft = Omit<FinancialDecision, "id" | "prioridade" | "modo">;

export interface PoliticaDef {
  id: string;
  nome: string;
  se: string;
  entao: string;
  tipo: TipoDecisao;
  avaliar: (ctx: DecisionContext) => DecisionDraft[];
}

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

export const POLITICAS: PoliticaDef[] = [
  {
    id: "cliente_risco",
    nome: "Cliente de alto risco",
    se: "risco do cliente ≥ 80",
    entao: "reduzir limite 30% e intensificar monitoramento",
    tipo: "risco",
    avaliar: (ctx) =>
      ctx.clientesRisco
        .filter((c) => c.score >= 80)
        .map((c) => ({
          tipo: "risco",
          titulo: `Reduzir limite de ${c.nome}`,
          recomendacao: `Risco ${c.score}/100 — reduzir limite em 30% e intensificar monitoramento. Exposição ${fmt(c.exposicao)}.`,
          impactoEsperado: c.exposicao,
          confianca: Math.min(0.95, 0.6 + c.score / 300),
          fatores: [`score ${c.score}/100`, `exposição ${fmt(c.exposicao)}`, `classe ${c.classificacao}`],
          riscoExecucao: 0.15,
          valor: 0, // ação interna reversível
          origem: "Política: cliente de alto risco",
        })),
  },
  {
    id: "saldo_critico",
    nome: "Saldo projetado crítico",
    se: "ruptura projetada < 14 dias OU stress > 50%",
    entao: "bloquear pagamentos não críticos e priorizar recebimentos",
    tipo: "capital",
    avaliar: (ctx) =>
      (ctx.rupturaDia != null && ctx.rupturaDia < 14) || ctx.probStress > 0.5
        ? [
            {
              tipo: "capital",
              titulo: "Bloquear pagamentos não críticos",
              recomendacao: `${ctx.rupturaDia != null ? `Ruptura em ${ctx.rupturaDia} dias` : `Stress ${Math.round(ctx.probStress * 100)}%`} — segurar pagamentos não essenciais e priorizar recebimentos.`,
              impactoEsperado: 0,
              confianca: 0.82,
              fatores: [ctx.rupturaDia != null ? `ruptura em ${ctx.rupturaDia}d` : "stress elevado", `prob. ruptura ${Math.round(ctx.probRuptura * 100)}%`],
              riscoExecucao: 0.4,
              valor: ctx.saldoAtual,
              origem: "Política: saldo crítico",
            },
          ]
        : [],
  },
  {
    id: "inadimplencia_alta",
    nome: "Inadimplência elevada",
    se: "inadimplência > 15%",
    entao: "acionar cobrança autônoma da carteira de risco",
    tipo: "cobranca",
    avaliar: (ctx) => {
      if (ctx.inadimplencia <= 0.15 || ctx.clientesRisco.length === 0) return [];
      const exposicao = ctx.clientesRisco.reduce((s, c) => s + c.exposicao, 0);
      return [
        {
          tipo: "cobranca",
          titulo: `Acionar cobrança de ${ctx.clientesRisco.length} cliente(s)`,
          recomendacao: `Inadimplência em ${Math.round(ctx.inadimplencia * 100)}% — disparar cobrança adaptativa (canal/horário/estratégia por cliente). Exposição ${fmt(exposicao)}.`,
          impactoEsperado: exposicao,
          confianca: 0.74,
          fatores: [`inadimplência ${Math.round(ctx.inadimplencia * 100)}%`, `${ctx.clientesRisco.length} clientes de risco`],
          riscoExecucao: 0.1, // enviar cobrança é seguro
          valor: 0,
          origem: "Política: inadimplência alta",
        },
      ];
    },
  },
  {
    id: "anomalia_despesa",
    nome: "Anomalia de despesa",
    se: "despesa fora do padrão histórico (z-score alto)",
    entao: "revisar lançamento e sugerir renegociação do fornecedor",
    tipo: "pagamento",
    avaliar: (ctx) =>
      ctx.anomalias.slice(0, 3).map((a) => ({
        tipo: "pagamento",
        titulo: a.titulo,
        recomendacao: `${a.descricao} Revisar aprovação e renegociar.`,
        impactoEsperado: a.valor,
        confianca: a.severidade === "critica" ? 0.85 : a.severidade === "alta" ? 0.7 : 0.55,
        fatores: [a.severidade, `valor ${fmt(a.valor)}`],
        riscoExecucao: 0.25,
        valor: a.valor,
        origem: "Política: anomalia de despesa",
      })),
  },
  {
    id: "concentracao_bancaria",
    nome: "Concentração bancária",
    se: "um banco concentra > 60% do caixa",
    entao: "redistribuir caixa entre instituições",
    tipo: "capital",
    avaliar: (ctx) =>
      ctx.topBancoShare > 0.6
        ? [
            {
              tipo: "capital",
              titulo: "Redistribuir caixa entre bancos",
              recomendacao: `Maior banco concentra ${Math.round(ctx.topBancoShare * 100)}% do caixa — diversificar para reduzir risco de contraparte.`,
              impactoEsperado: 0,
              confianca: 0.7,
              fatores: [`concentração ${Math.round(ctx.topBancoShare * 100)}%`],
              riscoExecucao: 0.2,
              valor: Math.round(ctx.saldoAtual * (ctx.topBancoShare - 0.5)),
              origem: "Política: concentração bancária",
            },
          ]
        : [],
  },
  {
    id: "recomendacao_impacto",
    nome: "Otimização de caixa",
    se: "existe ação com impacto positivo no runway/score",
    entao: "executar a ação de maior ganho (antecipar/postergar/reduzir)",
    tipo: "capital",
    avaliar: (ctx) =>
      ctx.recomendacoes.slice(0, 2).map((r) => {
        const ganho =
          r.deltaRunwayDias > 0 ? `+${Math.round(r.deltaRunwayDias)}d runway` : r.deltaScore > 0 ? `+${r.deltaScore} no score` : `${Math.round(-r.deltaProbRuptura * 100)}pp de risco`;
        return {
          tipo: "capital" as TipoDecisao,
          titulo: r.titulo,
          recomendacao: `${r.descricao} Impacto simulado: ${ganho}.`,
          impactoEsperado: r.valorEnvolvido,
          confianca: 0.76,
          fatores: [ganho, `valor ${fmt(r.valorEnvolvido)}`],
          riscoExecucao: 0.3,
          valor: r.valorEnvolvido,
          origem: "Política: otimização de caixa",
        };
      }),
  },
];
