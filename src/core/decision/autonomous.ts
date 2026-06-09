/**
 * Autonomous Actions — o sistema começa a AGIR. Diante de stress
 * detectado, monta um plano de resposta coordenado (pausar pagamentos
 * não críticos, antecipar cobrança, alertar diretoria, reorganizar
 * fluxo), com guardrails: ações pequenas automáticas, grandes exigem
 * aprovação. Autonomous Finance com controle.
 */
import type { FinancialFeatures, RiskMatrix, PlanoAutonomo, AcaoAutonoma } from "./types";

export function planoAutonomo(risco: RiskMatrix, f: FinancialFeatures): PlanoAutonomo {
  const critico = risco.nivelGeral === "critico" || (f.rupturaDia != null && f.rupturaDia < 14);
  const ativo = risco.probabilidadeStress >= 0.5 || critico || (f.rupturaDia != null && f.rupturaDia < 21);

  if (!ativo) {
    return {
      ativo: false,
      severidade: risco.nivelGeral,
      resumo: "Sem stress relevante — operação em monitoramento contínuo.",
      acoes: [
        { ordem: 1, acao: "Monitorar caixa e recebíveis", gatilho: "rotina", modo: "automatico", impacto: "vigilância contínua" },
      ],
    };
  }

  const acoes: AcaoAutonoma[] = [
    {
      ordem: 1,
      acao: "Alertar diretoria e tesouraria",
      gatilho: `probabilidade de stress ${Math.round(risco.probabilidadeStress * 100)}%`,
      modo: "automatico",
      impacto: "ciência imediata da liderança",
    },
    {
      ordem: 2,
      acao: "Antecipar cobrança de clientes de risco",
      gatilho: "inadimplência crescente",
      modo: "automatico",
      impacto: "reduz exposição vencida",
    },
    {
      ordem: 3,
      acao: "Pausar pagamentos não críticos",
      gatilho: f.rupturaDia != null ? `ruptura em ${f.rupturaDia} dias` : "runway curto",
      modo: "proposto",
      impacto: "preserva caixa de curto prazo",
    },
    {
      ordem: 4,
      acao: "Reorganizar fluxo (postergar fornecedores)",
      gatilho: "pressão de liquidez",
      modo: "proposto",
      impacto: "ganha dias de runway",
    },
  ];

  if (critico) {
    acoes.push({
      ordem: 5,
      acao: "Bloqueio preventivo de pagamentos acima do limite",
      gatilho: "stress crítico",
      modo: "requer_aprovacao",
      impacto: "trava saída de caixa relevante",
    });
  }

  return {
    ativo: true,
    severidade: risco.nivelGeral,
    resumo: `Stress ${risco.nivelGeral} (${Math.round(risco.probabilidadeStress * 100)}%) — plano de resposta acionado.`,
    acoes,
  };
}
