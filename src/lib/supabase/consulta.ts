"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O TETO DE LINHAS — defesa em profundidade sobre a política de acesso
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ A política de linha garante que a consulta só devolva dados da SUA
 * empresa. Ela não garante que devolva um número de linhas que caiba na
 * memória do navegador: uma empresa com cinco anos de extrato pede
 * `select * from movements` e recebe tudo — a tela congela, e o socorro do
 * usuário é recarregar, que refaz a mesma consulta.
 *
 * Duas coisas diferentes, então, e as duas precisam existir:
 *
 *  1. **O teto** — `.limit()` em toda consulta de lista.
 *  2. **O AVISO de que o teto foi atingido.** É a parte que costuma faltar, e
 *     é a que importa mais: um DRE calculado sobre as primeiras 5.000 linhas
 *     de 12.000 não parece quebrado — parece um DRE. Truncar em silêncio troca
 *     um travamento visível por um número errado invisível, que é pior.
 *
 * O teto definitivo é do SERVIDOR (`db.max_rows` do PostgREST), porque ele
 * alcança inclusive a consulta escrita amanhã. Este módulo é a camada do
 * cliente, que existe para dar o aviso — o servidor corta, mas não tem como
 * dizer à tela que cortou.
 */

/**
 * ⚠️ **A IMPLEMENTAÇÃO MORA EM `./filtros`** (sem diretiva). Este arquivo é
 * `"use client"`, e um export de módulo `"use client"` importado por um route
 * handler vira uma referência de cliente (um proxy que LANÇA quando chamado) —
 * medido no build. Aqui ficam só os reexports, com nome (`export *` não
 * atravessa a fronteira de cliente). Código de SERVIDOR importa de
 * `@/lib/supabase/filtros`.
 */
import { TETO_LINHAS } from "./filtros";
export { TETO_LINHAS, comTeto, semAmostra } from "./filtros";
export type { IncluirAmostra } from "./filtros";

/**
 * Diz, alto, que a consulta bateu no teto.
 *
 * ⚠️ Não devolve erro nem esvazia a lista de propósito: os dados que vieram são
 * verdadeiros e a tela deve mostrá-los. O que não pode acontecer é a tela (e
 * quem a lê) concluir que aquilo é TUDO.
 */
export function conferirTeto(onde: string, linhas: number, teto: number = TETO_LINHAS): boolean {
  if (linhas < teto) return false;
  console.error(
    `[consulta] "${onde}" atingiu o teto de ${teto} linhas — o que está na tela é uma PARTE dos dados. `
    + "Filtre por período ou use um relatório paginado.",
  );
  return true;
}

/** Atalho: aplica o teto, confere e devolve as linhas. */
export function aplicarTeto<L>(onde: string, linhas: L[] | null, teto: number = TETO_LINHAS): L[] {
  const l = linhas ?? [];
  conferirTeto(onde, l.length, teto);
  return l;
}

/* ========================================================================== */
/* O FILTRO DE AMOSTRA — dado de demonstração fora de todo relatório           */
/* ========================================================================== */

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DADO DE DEMONSTRAÇÃO NÃO ENTRA EM RELATÓRIO — e a regra é por OMISSÃO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **O defeito:** o botão "Carregar amostra" da tela `/upload` e um extrato
 * de banco de verdade produzem a MESMA linha em `movements` — os dois gravam
 * `origem = 'extrato'`. Quem importou a amostra para conhecer o produto ficou
 * com ela dentro do DRE, do fluxo de caixa e dos títulos a receber. Medido em
 * produção: **458 lançamentos, R$ 6,18 milhões**, em 3 organizações reais.
 *
 * ⚠️ **A direção do padrão é a decisão inteira.** Um filtro que precisa ser
 * LEMBRADO em cada consulta é opcional na prática: basta a próxima tela nova
 * esquecer dele e a contaminação volta por uma porta que ninguém revisou — e
 * volta em silêncio, porque um DRE com dado de amostra dentro não parece
 * quebrado, parece um DRE. Por isso `semAmostra` **exclui por padrão** e quem
 * quer o contrário precisa DIZER.
 *
 * ⚠️ **A saída é uma palavra, não um booleano.** `semAmostra(q, true)` seria
 * ilegível no ponto de chamada (`true` o quê?) e, pior, um `true` vindo de uma
 * variável poderia desligar o filtro sem que a revisão percebesse.
 * `"incluir-amostra"` só aparece onde alguém a escreveu de propósito, e é
 * pesquisável: `grep "incluir-amostra"` lista todos os lugares que veem
 * demonstração — que é a pergunta que uma auditoria faz.
 *
 * A guarda `amostra:` (`scripts/consistencia.mts`, teto ZERO) varre as cinco
 * tabelas e reprova toda leitura que não passe por aqui. Sem a guarda isto é
 * uma convenção, e convenção não é regra.
 */

/**
 * As tabelas que carregam dinheiro e por isso têm a coluna `is_sample`
 * (migration `20260813141626`).
 *
 * ⚠️ Cadastro (categoria, centro de custo, conta, contato) NÃO está aqui. A
 * importação da amostra também cria contatos e uma conta "Conta consolidada",
 * e eles continuam aparecendo nas listas — pendência declarada na migration,
 * não esquecimento.
 */
export const TABELAS_COM_AMOSTRA = [
  "movements", "movement_splits", "sales_docs", "sale_items", "recurrences",
] as const;

/**
 * POR QUE a linha está marcada. `is_sample` sozinho significava duas coisas com
 * destinos diferentes, e a purga em lote trataria as duas igual.
 *
 * - **`onboarding_demo`** — veio do botão "Carregar amostra". Não é dado de
 *   ninguém: purga em lote, sem cerimônia.
 * - **`lancamento_teste`** — lixo de teste marcado à mão, pelo id. É um registro
 *   que EXISTIU na operação de uma empresa; o desfecho correto é ser cancelado
 *   com trilha, não sumir.
 *
 * ⚠️ **DÍVIDA TÉCNICA — `lancamento_teste` é provisório.**
 * Origem: prompt **P-01** (isolamento do dado de amostra, 13/08/2026).
 * Vence com: prompt **P-10** (Central Financeira).
 *
 * Ele existe porque hoje não há onde pôr um lançamento que aconteceu e não
 * vale. Quando a Central Financeira tiver o estado **Cancelado** de primeira
 * classe, o lançamento de R$ 500.000 com descrição "Teste" passa a ser um
 * cancelado — com autor, data e motivo — e sai desta flag.
 *
 * Ao fazer P-10: converter a linha para Cancelado, limpar `is_sample` e
 * `sample_reason`, e remover o valor do enum no banco. **Se o valor ainda
 * existir depois de P-10, a dívida não foi paga — só mudou de lugar.**
 */
export type MotivoAmostra = "onboarding_demo" | "lancamento_teste";

/** O rótulo em português de cada motivo — o banner não fala `onboarding_demo`. */
export const ROTULO_MOTIVO: Record<MotivoAmostra, string> = {
  onboarding_demo: "importados pelo botão de amostra",
  lancamento_teste: "lançamentos de teste",
};

/**
 * `semAmostra` (o filtro) é reexportado acima, de `./filtros`: uma implementação
 * só, que o servidor também alcança. A saída explícita é `"incluir-amostra"`.
 */
