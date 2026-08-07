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
 * 5.000 linhas. Acima disso nenhuma tela do produto é usável de qualquer forma:
 * a maior tabela do sistema (extrato) pagina em 50–5.000, e os motores rodam
 * sobre agregados. Quem precisa de mais precisa de um relatório, não de uma
 * lista.
 */
export const TETO_LINHAS = 5000;

/** O contrato mínimo do construtor de consulta — evita depender do tipo gerado. */
interface ComLimite<T> { limit(n: number): T }

/** Aplica o teto. Use em TODA consulta que devolve lista. */
export function comTeto<T extends ComLimite<T>>(q: T, teto: number = TETO_LINHAS): T {
  return q.limit(teto);
}

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
