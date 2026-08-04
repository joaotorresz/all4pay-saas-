/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TELEFONE — o que é essencial, e quanto cada tela pode custar
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ Este era o ponto cego confesso da auditoria: ninguém tinha validado o
 * produto numa tela pequena. A medição (Chromium a 390×844, `npm run mobile`)
 * confirmou a suspeita e deu o tamanho dela:
 *
 *  - **DRE com tabela de 15 colunas**, títulos com 8, extrato com 5 — num
 *    aparelho de 390px.
 *  - **97 alvos de toque abaixo de 44×44** em Títulos a receber, 90 no DRE, 76
 *    na Home.
 *  - **51 campos sem nome acessível** numa tela só (o checkbox de cada linha).
 *  - **26 reprovações de contraste**, todas no mesmo token, usado no prefixo
 *    "R$" e nos centavos de TODO valor do produto.
 *  - 37 a 55 requisições e 2,2 a 3,1 MB por tela.
 *
 * **Os quatro fluxos essenciais** abaixo não são "as telas mais bonitas no
 * telefone": são as tarefas que acontecem FORA do escritório. Aprovar pagamento
 * é a mais importante das quatro por um motivo estrutural — quem aprova é quem
 * viaja, e um módulo de governança que só funciona sentado na mesa não é usado.
 *
 * Puro, sem I/O. Versão `desempenho/1.0.0`.
 */

export const DESEMPENHO_VERSION = "desempenho/1.0.0";

/** O aparelho de referência: iPhone 13/14, o mediano do público de PME. */
export const TELEFONE_REFERENCIA = { largura: 390, altura: 844 } as const;

export interface FluxoEssencial {
  id: string;
  nome: string;
  /** A pergunta que a pessoa está tentando responder, no telefone. */
  porque: string;
  rota: string;
  /** Quantos toques até concluir. Mais que isto e o fluxo é de computador. */
  toquesMaximos: number;
}

export const FLUXOS_ESSENCIAIS: FluxoEssencial[] = [
  {
    id: "saldo",
    nome: "Consultar saldo",
    porque: "\"Dá para pagar isso agora?\" — a pergunta que se faz na fila do banco, não na mesa.",
    rota: "/",
    toquesMaximos: 1,
  },
  {
    id: "aprovar",
    nome: "Aprovar pagamento",
    porque:
      "Quem aprova é quem está fora. Sem telefone, a fila de alçada trava até alguém voltar "
      + "para o escritório — e aí a alçada vira atraso, que é o oposto do controle que ela promete.",
    rota: "/aprovacoes",
    toquesMaximos: 3,
  },
  {
    id: "lancar",
    nome: "Lançar despesa",
    porque: "O gasto acontece na rua. Lançado depois, ele é lançado errado ou não é lançado.",
    rota: "/",
    toquesMaximos: 4,
  },
  {
    id: "comprovante",
    nome: "Fotografar comprovante",
    porque:
      "O papel se perde entre a compra e a mesa. A câmera do telefone é o único lugar onde "
      + "o comprovante existe intacto — e por isso a captura tem de caber no telefone.",
    rota: "/upload",
    toquesMaximos: 3,
  },
];

/* ========================================================================== */
/* O ORÇAMENTO                                                                 */
/* ========================================================================== */

export interface Orcamento {
  /** Requisições de rede até a rede ficar ociosa. */
  requisicoes: number;
  /** Peso transferido, em KB. */
  kb: number;
  /** Tempo até a rede ficar ociosa, em ms. */
  ms: number;
}

/**
 * ⚠️ O orçamento é o MEDIDO HOJE com folga curta, não um número aspiracional.
 *
 * Um teto que a tela já estoura nasce vermelho e é ignorado no primeiro dia;
 * um teto folgado demais não impede nada. Estes valores travam a regressão a
 * partir de agora — a redução é trabalho a fazer, e a linha de base fica
 * registrada em `MEDIDO_EM` para que a melhora seja verificável.
 */
export const ORCAMENTO_PADRAO: Orcamento = { requisicoes: 60, kb: 3400, ms: 2500 };

export const ORCAMENTO_POR_TELA: Record<string, Orcamento> = {
  // A Home carrega os motores todos; é a mais pesada por desenho.
  "/": { requisicoes: 45, kb: 3400, ms: 2600 },
  // ⚠️ O fluxo de caixa dispara a maior quantidade de consultas do produto.
  "/fluxo-caixa": { requisicoes: 60, kb: 2700, ms: 2400 },
  "/aprovacoes": { requisicoes: 45, kb: 2400, ms: 1800 },
  "/upload": { requisicoes: 45, kb: 2500, ms: 1800 },
};

export const orcamentoDe = (rota: string): Orcamento =>
  ORCAMENTO_POR_TELA[rota] ?? ORCAMENTO_PADRAO;

/** A linha de base medida, para a melhora ser conferível e não lembrada. */
export const MEDIDO_EM = {
  quando: "2026-08-04",
  aparelho: "Chromium 390×844 (iPhone 13/14), build de produção, modo demonstração",
  telas: {
    "/": { requisicoes: 38, kb: 3152, ms: 1684, alvosPequenos: 76 },
    "/fluxo-caixa": { requisicoes: 55, kb: 2447, ms: 1133, alvosPequenos: 55 },
    "/aprovacoes": { requisicoes: 40, kb: 2190, ms: 661, alvosPequenos: 27 },
    "/dashboard/financial/accounts-and-transfers": { requisicoes: 50, kb: 2357, ms: 789, alvosPequenos: 97 },
    "/dashboard/financial/statement": { requisicoes: 49, kb: 2385, ms: 694, alvosPequenos: 31 },
    "/upload": { requisicoes: 42, kb: 2272, ms: 707, alvosPequenos: 35 },
    "/dashboard/reports/dre": { requisicoes: 48, kb: 2298, ms: 764, alvosPequenos: 90 },
  },
} as const;

export interface Medicao {
  rota: string;
  requisicoes: number;
  kb: number;
  ms: number;
}

export interface Estouro {
  rota: string;
  campo: keyof Orcamento;
  medido: number;
  teto: number;
}

/** O que estourou o orçamento — o que a guarda reprova. */
export function estouros(medicoes: readonly Medicao[]): Estouro[] {
  const out: Estouro[] = [];
  for (const m of medicoes) {
    const o = orcamentoDe(m.rota);
    if (m.requisicoes > o.requisicoes) out.push({ rota: m.rota, campo: "requisicoes", medido: m.requisicoes, teto: o.requisicoes });
    if (m.kb > o.kb) out.push({ rota: m.rota, campo: "kb", medido: m.kb, teto: o.kb });
    if (m.ms > o.ms) out.push({ rota: m.rota, campo: "ms", medido: m.ms, teto: o.ms });
  }
  return out;
}

/* ========================================================================== */
/* ACESSIBILIDADE — o que reprova de verdade                                   */
/* ========================================================================== */

/** Tamanho mínimo do alvo de toque (WCAG 2.5.5 / diretriz de plataforma). */
export const ALVO_MINIMO_PX = 44;

/**
 * As regras cuja falha BLOQUEIA a entrega.
 *
 * ⚠️ A lista é curta de propósito. Uma auditoria que reprova por tudo é uma
 * auditoria que ninguém roda: estas quatro são as que impedem alguém de
 * concluir a tarefa, não as que deixam a experiência pior.
 */
export const BLOQUEANTES = [
  "color-contrast",       // texto que não se lê
  "label",                // campo que o leitor de tela não sabe nomear
  "select-name",          // idem, para lista de opções
  "button-name",          // botão que se anuncia como "botão" e nada mais
  "aria-required-attr",
  "image-alt",
] as const;

export const bloqueante = (regraId: string): boolean =>
  (BLOQUEANTES as readonly string[]).includes(regraId);
