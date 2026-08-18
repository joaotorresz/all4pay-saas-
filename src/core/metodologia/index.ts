/**
 * ═══════════════════════════════════════════════════════════════════════════
 * METODOLOGIA — o que há dentro dos números que o produto PUBLICA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **O achado (A4P-032), medido em 18/08 e CONFIRMADO.** O resumo executivo
 * do fluxo de caixa exibe "Chance de ruptura" e "Financial Score" lado a lado,
 * em dois cartões sem nenhum `info` — e o arquivo inteiro do `QuantView`, que é
 * a casa do score, não tem UM `InfoHint`. Números com cara de rating, sem
 * componente, sem peso, sem janela e sem versão de modelo.
 *
 * ⚠️ **E os dois cartões vêm de MOTORES DIFERENTES.** `chanceRuptura` sai do
 * `risk-engine` (8 pilares, horizonte de 60 dias); `score` sai do `quant`
 * (7 pilares, janela dos indicadores). Ninguém que lê a tela tem como saber
 * disso, e a intuição natural — "são duas faces da mesma conta" — está errada.
 *
 * ⚠️ **E o "97%" É O TETO DA FÓRMULA, não uma medida.** Em
 * `risk-engine/score.engine.ts` a última linha é
 * `Math.min(0.97, Math.max(0.02, p))`. Quando há ruptura projetada para hoje,
 * `p = 1 − 0/60 = 1` e sai 0,97. É exatamente o defeito do `RUNWAY_CAP_DIAS`
 * que a ONDA 4 pegou ("33 meses de fôlego" ao lado de burn zero): a saturação
 * do cálculo lida como se fosse a grandeza. Um teto que não se declara vira
 * medida.
 *
 * Este módulo é PURO e é a fonte única do que a tela diz sobre cada número.
 * Versão `metodologia/1.0.0`.
 */

import { pctDeInteiro } from "@/lib/format";

export const METODOLOGIA_VERSION = "metodologia/1.0.0";

export interface ComponenteMetodologia {
  label: string;
  /** Peso no total. Some 1 dentro de cada metodologia. */
  peso: number;
  /** O que exatamente entra nesse pilar, em linguagem de quem opera. */
  comoMede: string;
}

export interface Saturacao {
  teto: number;
  piso: number;
  /** O que ver o teto na tela realmente significa. */
  oQueOTetoSignifica: string;
}

export interface Metodologia {
  id: string;
  /** O rótulo exato que aparece na tela. */
  indicador: string;
  /** Motor e versão que produzem o número — duas telas, dois motores, e a
   *  pessoa precisa saber qual está lendo. */
  motor: string;
  /** A janela de tempo que o cálculo enxerga. */
  janela: string;
  escala: string;
  formula: string;
  componentes: ComponenteMetodologia[];
  saturacao?: Saturacao;
  /** O que o número NÃO enxerga. Sem isto, metodologia vira propaganda. */
  limitacoes: string[];
}

export const METODOLOGIAS: Metodologia[] = [
  {
    id: "score-saude",
    indicador: "Financial Score",
    motor: "quant/1.0.0 · scoreSaudeFinanceira",
    janela: "Indicadores dos últimos 90 dias para caixa e margem; série mensal completa para crescimento e volatilidade.",
    escala: "0 a 100. 85+ excelente · 70–84 saudável · 50–69 atenção · 30–49 risco · abaixo de 30 crítico.",
    formula: "Cada pilar vira uma nota de 0 a 1 por normalização entre um piso e um teto declarados; o score é a média ponderada dessas notas × 100.",
    componentes: [
      { label: "Liquidez corrente", peso: 0.2, comoMede: "Ativo de curto prazo sobre passivo de curto prazo. Nota 0 em 0,7× e nota 1 em 2,0×." },
      { label: "Runway", peso: 0.15, comoMede: "Meses de caixa no ritmo atual de queima. Nota 0 em 3 meses e nota 1 em 18." },
      { label: "Inadimplência", peso: 0.15, comoMede: "Fatia do total a receber que está vencida. Quanto menor, maior a nota." },
      { label: "Margem de caixa (90d)", peso: 0.15, comoMede: "Resultado sobre receita nos últimos 90 dias. Nota 0 em 0% e nota 1 em 35%." },
      { label: "Crescimento mensal", peso: 0.15, comoMede: "Variação da receita mês a mês. Nota 0 em −10% e nota 1 em +15%." },
      { label: "Volatilidade do fluxo", peso: 0.1, comoMede: "Coeficiente de variação do fluxo mensal. Fluxo previsível pontua mais." },
      { label: "Concentração de receita", peso: 0.1, comoMede: "Peso do maior cliente na receita. Receita distribuída pontua mais." },
    ],
    limitacoes: [
      "É um modelo interno, calibrado com os pisos e tetos acima — não é rating de agência nem tem validação externa.",
      "Empresa com pouco histórico pontua pelo que existe: com dois meses de lançamentos, crescimento e volatilidade dizem pouco.",
      "Não enxerga o que não está lançado: contrato assinado e ainda não faturado não conta.",
    ],
  },
  {
    id: "chance-ruptura",
    indicador: "Chance de ruptura",
    motor: "risk-engine/1.0.0 · calcularScore",
    janela: "Horizonte de 60 dias (o padrão do motor de risco), sobre os títulos com data marcada.",
    escala: "0% a 97%.",
    formula: "Quando existe um dia projetado de ruptura, o valor é 1 − (dias até a ruptura ÷ 60). Sem ruptura projetada, cai para (100 − score de risco) ÷ 250. Runway pessimista abaixo de 30 dias força o piso de 60%.",
    componentes: [
      { label: "Liquidez imediata", peso: 0.2, comoMede: "Runway base, penalizado quando há ruptura projetada dentro do horizonte." },
      { label: "Previsibilidade de receita", peso: 0.15, comoMede: "Coeficiente de variação da receita mensal já recebida." },
      { label: "Concentração de clientes", peso: 0.15, comoMede: "Fatia do maior cliente na receita." },
      { label: "Tendência de caixa", peso: 0.15, comoMede: "Geração líquida dos últimos 30 dias contra os 30 anteriores." },
      { label: "Burn rate", peso: 0.1, comoMede: "Queima mensal sobre receita mensal. Operação que gera caixa pontua o máximo." },
      { label: "Inadimplência", peso: 0.1, comoMede: "Fatia vencida do total a receber." },
      { label: "Compromissos futuros", peso: 0.1, comoMede: "Cobertura dos próximos 30 dias: (saldo + a receber) ÷ a pagar." },
      { label: "Sazonalidade", peso: 0.05, comoMede: "Índice do mês corrente contra a média dos meses." },
    ],
    saturacao: {
      teto: 0.97,
      piso: 0.02,
      oQueOTetoSignifica:
        "97% é o TETO da fórmula, não uma medida. Ele aparece quando a ruptura está projetada para hoje ou já em curso — a leitura correta é \"o caixa não fecha dentro do horizonte\", não \"há 3% de chance de escapar\".",
    },
    limitacoes: [
      "Só enxerga o que tem data marcada: uma despesa que ninguém lançou não entra, e uma negociação de prazo em andamento também não.",
      "É probabilidade de MODELO, não frequência observada — o produto não tem base histórica de rupturas para calibrar contra a realidade.",
      "Não é a mesma conta do Financial Score: os dois vêm de motores diferentes, com pilares e pesos diferentes.",
    ],
  },
  {
    /*
     * ⚠️ **EXISTE UMA TERCEIRA, e descobri montando esta lista.** A tela do
     * `/inteligencia` mostra "Prob. ruptura (90d)" — e ela NÃO é a mesma da
     * tela de risco (60d): sai do `quant`, por uma fórmula própria, sobre um
     * horizonte diferente. Duas telas do mesmo produto respondiam "qual a
     * chance de o caixa quebrar" com números que não têm por que coincidir, e
     * nenhuma das duas dizia qual estava respondendo. É a mesma família do
     * POSIÇÃO × FLUXO da ONDA 1: duas respostas verdadeiras a perguntas
     * diferentes, exibidas com o mesmo rótulo.
     */
    id: "chance-ruptura-90d",
    indicador: "Prob. ruptura (90 dias)",
    motor: "quant/1.0.0 · scoreSaudeFinanceira",
    janela: "90 dias.",
    escala: "0% a 100%.",
    formula: "Parte de 1 − (Financial Score ÷ 100) e agrava: multiplica por 1,3 quando o runway é menor que 6 meses e por 1,1 quando a volatilidade do fluxo passa de 0,7.",
    componentes: [
      { label: "Financial Score", peso: 1, comoMede: "O complemento do score de saúde é o ponto de partida — os sete pilares dele valem aqui, com os mesmos pesos." },
    ],
    limitacoes: [
      "É DERIVADA do Financial Score, não uma medição independente: se o score sobe, ela cai por construção.",
      "Não é a mesma da tela de risco, que olha 60 dias e parte dos títulos com data marcada. As duas podem discordar sem nenhuma estar errada.",
      "Probabilidade de modelo, sem base histórica de rupturas para calibrar.",
    ],
  },
];

export function metodologiaDe(id: string): Metodologia | undefined {
  return METODOLOGIAS.find((m) => m.id === id);
}

/**
 * A frase do teto, quando o valor exibido está saturado — e `null` quando não
 * está, porque marcar sempre é não marcar nunca (a regra do selo de
 * procedência).
 */
export function avisoDeSaturacao(id: string, valor: number): string | null {
  const m = metodologiaDe(id);
  if (!m?.saturacao) return null;
  const { teto, piso, oQueOTetoSignifica } = m.saturacao;
  if (valor >= teto - 1e-9) return oQueOTetoSignifica;
  if (valor <= piso + 1e-9) {
    return `${pctDeInteiro(piso * 100)} é o PISO da fórmula, não uma medida: o modelo não desce abaixo disso mesmo quando não vê risco nenhum.`;
  }
  return null;
}

/** O conteúdo do botão "i" — o mesmo texto do popover e da página. */
export function infoDaMetodologia(id: string): { titulo: string; oQue: string; comoCalcula: string } | undefined {
  const m = metodologiaDe(id);
  if (!m) return undefined;
  const pilares = m.componentes
    .map((c) => `${c.label} ${pctDeInteiro(c.peso * 100)}`)
    .join(" · ");
  return {
    titulo: m.indicador,
    oQue: `${m.escala} ${m.limitacoes[0]}`,
    comoCalcula: `${m.formula}\n\nPesos: ${pilares}.\n\nJanela: ${m.janela}\n\nModelo: ${m.motor}.`,
  };
}
