/**
 * Credit Recommendation + AI Collections (cobrança adaptativa) +
 * Dynamic Credit Limit. Ajusta limite, prazo, entrada e a agressividade
 * da cobrança ao comportamento — não a uma regra fixa.
 */
import type {
  ClienteFeatures,
  ClassificacaoRisco,
  EarlyWarning,
  CreditRecommendation,
  AcaoCredito,
  EstrategiaCobranca,
} from "./types";

const ESTRATEGIA: Record<ClassificacaoRisco, EstrategiaCobranca> = {
  baixo: "amigavel",
  moderado: "amigavel",
  alto: "proativa",
  critico: "agressiva_precoce",
};

export function recomendarCredito(
  f: ClienteFeatures,
  score: number,
  classificacao: ClassificacaoRisco,
  ew: EarlyWarning,
): CreditRecommendation {
  const raw = score / 100;

  // Limite dinâmico: base no ticket médio, encolhido pelo risco.
  const limiteBase = Math.max(f.ticketMedio * 3, f.faturamentoPeriodo * 0.4);
  const limiteSugerido = Math.round((limiteBase * (1 - raw * 0.8)) / 50) * 50;

  // Prazo: 30 dias, reduzido para risco mais alto.
  const prazoSugeridoDias = Math.max(7, Math.round(30 * (1 - raw * 0.6)));

  // Entrada exigida: cresce com o risco.
  const entradaSugeridaPct =
    classificacao === "critico"
      ? 0.5
      : classificacao === "alto"
        ? 0.3
        : classificacao === "moderado"
          ? 0.1
          : 0;

  let acao: AcaoCredito;
  if (classificacao === "critico") acao = "exigir_entrada";
  else if (classificacao === "alto")
    acao = ew.severidade === "alta" ? "reduzir_prazo" : "antecipar_cobranca";
  else if (classificacao === "moderado") acao = "monitorar";
  else acao = "manter";
  if (f.diasAtrasoMaximo > 90 && f.volumeVencido > 0) acao = "suspender";

  const probTxt = `${Math.round(raw * 100)}% de risco`;
  const resumo =
    acao === "suspender"
      ? `Suspender novos pedidos: ${probTxt} e dívida vencida antiga.`
      : acao === "exigir_entrada"
        ? `${probTxt}: exigir ${Math.round(entradaSugeridaPct * 100)}% de entrada e prazo de ${prazoSugeridoDias}d.`
        : acao === "reduzir_prazo"
          ? `${probTxt}: reduzir prazo para ${prazoSugeridoDias}d e cobrança proativa.`
          : acao === "antecipar_cobranca"
            ? `${probTxt}: antecipar cobrança antes do vencimento.`
            : acao === "monitorar"
              ? `${probTxt}: manter limite e monitorar.`
              : `Cliente saudável: manter condições (limite até ${formatLimite(limiteSugerido)}).`;

  return {
    acao,
    limiteSugerido: Math.max(0, limiteSugerido),
    prazoSugeridoDias,
    entradaSugeridaPct,
    estrategiaCobranca: ESTRATEGIA[classificacao],
    resumo,
  };
}

function formatLimite(v: number): string {
  return v >= 1000 ? `R$ ${(v / 1000).toFixed(0)}k` : `R$ ${v}`;
}
