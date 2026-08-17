/**
 * copilotoFinanceiro() — a principal feature: o usuário conversa com os
 * dados da empresa. Detecta a intenção, consulta o contexto estruturado
 * (indicadores, projeção, inadimplência, concentração, fluxo) e devolve
 * uma resposta contextual + números + fontes (explainability).
 *
 * Determinístico hoje (intenções mapeadas); o mesmo contexto serializa
 * direto para o prompt de um LLM quando plugado.
 */
import type { ExecutiveContext, RespostaCopiloto } from "./types";

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

const SALARIO_MEDIO = 7000; // R$/mês (encargos incluídos no fator 1.4)

function num(label: string, valor: string) {
  return { label, valor };
}

/** Extrai o primeiro inteiro da pergunta (ex.: "5 funcionários"). */
function extrairN(p: string, fallback: number): number {
  const m = p.match(/\d+/);
  return m ? parseInt(m[0], 10) : fallback;
}

export function copilotoFinanceiro(
  pergunta: string,
  ctx: ExecutiveContext,
): RespostaCopiloto {
  const p = pergunta.toLowerCase();

  // 1) Contratação
  if (/(contrat|funcion[aá]ri|equipe|head ?count|pessoa)/.test(p)) {
    const n = extrairN(p, 5);
    const deltaCusto = n * SALARIO_MEDIO * 1.4; // folha + encargos
    const liquidoAtual = ctx.receitaMensal - ctx.despesaMensal;
    const liquidoNovo = liquidoAtual - deltaCusto;
    const geraCaixa = liquidoNovo >= 0;
    const burnFinal = Math.max(0, -liquidoNovo);
    const novoRunwayMeses = geraCaixa
      ? 24
      : Math.min(24, Math.round((ctx.saldoAtual / burnFinal) * 10) / 10);
    const comporta = geraCaixa || novoRunwayMeses >= 6;
    const riscoConc =
      ctx.concentracao[0] && ctx.concentracao[0].percentual >= 30
        ? ` O principal risco segue na concentração de receita (${ctx.concentracao[0].nome}, ${ctx.concentracao[0].percentual}%).`
        : "";
    return {
      resposta:
        `Contratar ${n} ${n === 1 ? "pessoa" : "pessoas"} aumentaria a folha em aproximadamente ${fmt(deltaCusto)}/mês. ` +
        (geraCaixa
          ? `Mesmo assim a operação seguiria gerando caixa (${fmt(liquidoNovo)}/mês) — o runway é preservado e ${
              comporta ? "há folga para a contratação" : "convém acompanhar"
            }.`
          : `O resultado mensal passaria a negativo (${fmt(liquidoNovo)}/mês), reduzindo o runway para cerca de ${novoRunwayMeses} meses — ${
              comporta ? "expansão moderada ainda viável" : "expansão arriscada"
            }.`) +
        riscoConc,
      numeros: [
        num("Aumento de folha", `${fmt(deltaCusto)}/mês`),
        num("Resultado mensal", `${fmt(liquidoNovo)}`),
        num("Runway projetado", geraCaixa ? "preservado" : `${novoRunwayMeses} m`),
      ],
      confianca: 0.7,
      fontes: ["motor quantitativo", "fluxo projetado"],
    };
  }

  // 2) Capacidade de investimento
  if (/(investir|quanto posso|capacidade|sobra|aplicar|gastar)/.test(p)) {
    const reserva = ctx.burnRate > 0 ? ctx.burnRate * 6 : ctx.despesaMensal * 3;
    const folga = Math.max(0, ctx.saldoAtual - reserva);
    return {
      resposta:
        `Preservando uma reserva de segurança de ~6 meses de operação (${fmt(reserva)}), ` +
        `o caixa comporta um investimento de até cerca de ${fmt(folga)} sem comprometer o runway mínimo. ` +
        `Acima disso, o risco de pressão de caixa cresce${ctx.probRuptura >= 0.25 ? " — e a probabilidade de ruptura já está elevada" : ""}.`,
      numeros: [
        num("Saldo atual", fmt(ctx.saldoAtual)),
        num("Reserva sugerida", fmt(reserva)),
        num("Folga p/ investir", fmt(folga)),
      ],
      confianca: 0.65,
      fontes: ["motor quantitativo", "motor de risco de caixa"],
    };
  }

  // 3) Cliente que mais impacta risco
  if (/(cliente|concentra|depend[eê]nc|quem.*risco|maior risco)/.test(p)) {
    const c = ctx.clientesRisco[0];
    const conc = ctx.concentracao[0];
    return {
      resposta:
        conc
          ? `O maior risco de concentração é ${conc.nome}, com ${conc.percentual}% da receita. ` +
            (c
              ? `Em risco de inadimplência, ${c.nome} lidera (score ${c.score}/100, exposição ${fmt(c.exposicao)} em aberto). ` +
                "A combinação de peso na receita e comportamento de pagamento define o cliente mais crítico."
              : "Nenhum cliente está classificado como alto risco de inadimplência no momento.")
          : "A receita está bem distribuída — sem cliente dominante.",
      numeros: conc
        ? [
            num(conc.nome, `${conc.percentual}% da receita`),
            ...(c ? [num(`${c.nome} (risco)`, `${c.score}/100`)] : []),
          ]
        : [],
      confianca: 0.8,
      fontes: ["concentração de receita", "motor de inadimplência"],
    };
  }

  // 4) Despesas que cresceram
  if (/(despesa|custo|gasto).*(cresc|aument|subi|maior)|onde.*gast/.test(p)) {
    return {
      resposta:
        `A despesa mensal está em ${fmt(ctx.despesaMensal)} (margem de caixa de ${Math.round(ctx.margemCaixa90d * 100)}%). ` +
        "Veja o detector de anomalias para as categorias que fugiram do padrão histórico — ele aponta os aumentos relevantes por z-score.",
      numeros: [
        num("Despesa mensal", fmt(ctx.despesaMensal)),
        num("Receita mensal", fmt(ctx.receitaMensal)),
        num("Margem operacional", `${Math.round(ctx.margemCaixa90d * 100)}%`),
      ],
      confianca: 0.6,
      fontes: ["motor quantitativo", "detector de anomalias"],
    };
  }

  // 5) Expansão / nova unidade
  if (/(unidade|expandir|expans|abrir|filial|crescer)/.test(p)) {
    const comporta = ctx.runwayMeses >= 9 && ctx.probRuptura < 0.25;
    return {
      resposta:
        `Hoje o runway é de ${ctx.runwayMeses} meses e o score de saúde ${ctx.scoreFinanceiro}/100. ` +
        `${comporta ? "Há margem para expansão moderada" : "A estrutura atual ainda não sustenta expansão com folga"}. ` +
        "Use o simulador de cenários para projetar o impacto exato no runway e no score antes de decidir.",
      numeros: [
        num("Runway", `${ctx.runwayMeses} m`),
        num("Score de saúde", `${ctx.scoreFinanceiro}/100`),
        num("Prob. ruptura", `${Math.round(ctx.probRuptura * 100)}%`),
      ],
      confianca: 0.6,
      fontes: ["motor quantitativo", "simulador de cenários"],
    };
  }

  // Default — panorama executivo
  return {
    resposta:
      `Panorama atual: saldo de ${fmt(ctx.saldoAtual)}, runway de ${ctx.runwayMeses} meses e score de saúde ${ctx.scoreFinanceiro}/100. ` +
      `Inadimplência em ${Math.round(ctx.inadimplencia * 100)}% e probabilidade de ruptura em 90 dias ${
        ctx.probRuptura >= 0.5 ? "elevada" : ctx.probRuptura >= 0.25 ? "moderada" : "baixa"
      }. Pergunte sobre contratação, capacidade de investimento, clientes de risco, despesas ou expansão.`,
    numeros: [
      num("Saldo", fmt(ctx.saldoAtual)),
      num("Runway", `${ctx.runwayMeses} m`),
      num("Score", `${ctx.scoreFinanceiro}/100`),
    ],
    confianca: 0.55,
    fontes: ["contexto executivo"],
  };
}

/** Perguntas sugeridas para o copiloto. */
export const PERGUNTAS_SUGERIDAS = [
  "Posso contratar mais 5 funcionários?",
  "Quanto posso investir sem comprometer o caixa?",
  "Qual cliente mais impacta meu risco?",
  "Quais despesas mais cresceram?",
  "Se eu abrir outra unidade, qual o impacto?",
];
