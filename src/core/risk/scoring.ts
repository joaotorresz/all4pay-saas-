/**
 * Behavioral Scoring + Delinquency Prediction.
 * Normaliza cada feature (0..1, direção de risco), pondera, e converte
 * em score 0..100 + probabilidade calibrada (logística). Sempre
 * explicável: devolve a contribuição de cada fator (nunca só o número).
 */
import type {
  ClienteFeatures,
  FatorExplicado,
  ClassificacaoRisco,
} from "./types";
import { normalizar, clamp01, logistica, classificar } from "./normalize";

/** Pesos do modelo (somam 1.0). Auditável e ajustável. */
export const PESOS = {
  recorrencia: 0.28,
  atrasoMedio: 0.2,
  tendencia: 0.16,
  oscilacao: 0.14,
  ticket: 0.1,
  concentracao: 0.07,
  sazonalidade: 0.05,
} as const;

export interface ScoreResult {
  score: number; // 0..100
  raw: number; // 0..1
  probabilidadeInadimplencia: number; // 0..1
  classificacao: ClassificacaoRisco;
  fatoresRisco: FatorExplicado[];
}

export function pontuar(f: ClienteFeatures): ScoreResult {
  const n = {
    recorrencia: clamp01(f.recorrenciaAtraso),
    atrasoMedio: normalizar(f.diasAtrasoMedio, 0, 30),
    tendencia: clamp01(f.tendenciaRecente),
    oscilacao: normalizar(f.oscilacaoPagamento, 0, 20),
    ticket: clamp01(-f.variacaoTicket), // queda de ticket → risco
    concentracao: clamp01(f.concentracao),
    sazonalidade: clamp01(f.sazonalidade),
  };

  const raw = (Object.keys(PESOS) as (keyof typeof PESOS)[]).reduce(
    (s, k) => s + n[k] * PESOS[k],
    0,
  );
  const score = Math.round(clamp01(raw) * 100);

  const detalhes: Record<keyof typeof PESOS, string> = {
    recorrencia: `${Math.round(f.recorrenciaAtraso * 100)}% dos pagamentos avaliados saíram com atraso`,
    atrasoMedio: `atraso médio de ${f.diasAtrasoMedio.toFixed(1)} dias`,
    tendencia:
      f.tendenciaRecente > 0
        ? `atraso recente (${f.atrasoRecente.toFixed(1)}d) acima do histórico`
        : "comportamento recente estável",
    oscilacao: `oscilação de ${f.oscilacaoPagamento.toFixed(1)} dias entre pagamentos`,
    ticket:
      f.variacaoTicket < 0
        ? `queda de ${Math.round(-f.variacaoTicket * 100)}% no ticket recente`
        : "ticket estável",
    concentracao: `${Math.round(f.concentracao * 100)}% da receita da carteira`,
    sazonalidade: "atraso varia por período do ano",
  };

  const fatoresRisco: FatorExplicado[] = (
    Object.keys(PESOS) as (keyof typeof PESOS)[]
  )
    .map((k) => ({
      fator: LABEL[k],
      contribuicao: Math.round(n[k] * PESOS[k] * 100),
      detalhe: detalhes[k],
    }))
    .filter((c) => c.contribuicao >= 3)
    .sort((a, b) => b.contribuicao - a.contribuicao);

  return {
    score,
    raw,
    probabilidadeInadimplencia: logistica(raw),
    classificacao: classificar(score),
    fatoresRisco,
  };
}

const LABEL: Record<keyof typeof PESOS, string> = {
  recorrencia: "Frequência de atraso",
  atrasoMedio: "Atraso médio",
  tendencia: "Deterioração recente",
  oscilacao: "Oscilação de pagamento",
  ticket: "Queda de ticket",
  concentracao: "Concentração de receita",
  sazonalidade: "Sazonalidade",
};

/** Recomendações textuais derivadas da classificação + fatores. */
export function recomendar(
  f: ClienteFeatures,
  classificacao: ClassificacaoRisco,
  fatores: FatorExplicado[],
): string[] {
  const rec: string[] = [];
  if (classificacao === "critico") {
    rec.push("Antecipar cobrança e exigir entrada em novos pedidos.");
    rec.push("Reduzir prazo e limite até regularização.");
  } else if (classificacao === "alto") {
    rec.push("Cobrança proativa antes do vencimento.");
    rec.push("Reavaliar prazo concedido.");
  } else if (classificacao === "moderado") {
    rec.push("Monitorar de perto os próximos vencimentos.");
  } else {
    rec.push("Manter condições; cliente saudável.");
  }
  const top = fatores[0];
  if (top?.fator === "Deterioração recente")
    rec.push("Tendência recente piorando — agir antes do próximo vencimento.");
  if (f.variacaoTicket < -0.2)
    rec.push("Queda de ticket relevante — investigar saúde do cliente.");
  if (f.concentracao > 0.25)
    rec.push(
      `Cliente representa ${Math.round(f.concentracao * 100)}% da receita — risco de concentração no caixa.`,
    );
  return rec;
}
