/**
 * OS FILTROS OBRIGATÓRIOS DE LEITURA — o teto de linhas e o filtro de amostra,
 * num módulo SEM diretiva, que serve ao navegador e ao servidor.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ POR QUE ESTE ARQUIVO EXISTE: a armadilha do `"use client"` no servidor
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * As implementações moravam em `consulta.ts`, que começa com `"use client"`.
 * Num componente de tela isso não muda nada; num ROUTE HANDLER muda tudo: o
 * Next transforma cada export de um módulo `"use client"` importado pelo
 * servidor numa REFERÊNCIA DE CLIENTE — um proxy. Medido no build, em
 * `.next/server/app/api/recorrencias/run/route.js`:
 *
 *     createProxy(String.raw`…/src/lib/supabase/consulta.ts#semAmostra`)
 *     createProxy(String.raw`…/src/lib/supabase/consulta.ts#TETO_LINHAS`)
 *
 * Ou seja: no servidor, `semAmostra()` LANÇA quando chamada e `TETO_LINHAS` é
 * uma função, não 5000. Typecheck, lint e as duas guardas de texto (amostra e
 * teto) passam assim mesmo — o texto está certo, o que muda é o que o
 * empacotador faz com ele.
 *
 * Por isso a implementação é UMA e mora aqui, sem diretiva. `consulta.ts`
 * continua `"use client"` e só REEXPORTA estes nomes (com nome, nunca
 * `export *`, que não atravessa a fronteira de cliente). Código de servidor
 * importa DESTE arquivo.
 *
 * ⚠️ Não se resolve apagando o `"use client"` de `consulta.ts`: isso LIGARIA em
 * silêncio as rotas que hoje caem nesse proxy (o materializador de
 * recorrências, o runner do financial-os, as ações da Central) — caminhos que
 * ainda devem a prova de carga da sétima regra. É tarefa separada, com prova.
 */

/* ========================================================================== */
/* O TETO DE LINHAS                                                            */
/* ========================================================================== */

/**
 * 5.000 linhas. Acima disso nenhuma tela do produto é usável de qualquer forma:
 * a maior tabela do sistema (extrato) pagina em 50–5.000, e os motores rodam
 * sobre agregados. Quem precisa de mais precisa de um relatório, não de uma
 * lista.
 */
export const TETO_LINHAS = 5000;

/** O contrato mínimo do construtor de consulta — evita depender do tipo gerado. */
export interface ComLimite<T> { limit(n: number): T }

/** Aplica o teto. Use em TODA consulta que devolve lista. */
export function comTeto<T extends ComLimite<T>>(q: T, teto: number = TETO_LINHAS): T {
  return q.limit(teto);
}

/* ========================================================================== */
/* O FILTRO DE AMOSTRA — dado de demonstração fora de todo relatório           */
/* ========================================================================== */

/** A única forma de ver dado de demonstração. Escrita à mão, sempre. */
export type IncluirAmostra = "incluir-amostra";

/**
 * O contrato mínimo do construtor.
 *
 * ⚠️ **Sem restrição recursiva** (`T extends ComIgual<T>`, como faz `comTeto`).
 * O construtor do PostgREST carrega os tipos das colunas no genérico, e casar
 * `T` contra uma interface que se refere a `T` faz o compilador desenrolar a
 * cadeia inteira — `TS2589: type instantiation is excessively deep`, medido no
 * primeiro ponto de chamada. Aqui `T` atravessa intacto e só a chamada de `eq`
 * é afirmada, que é o suficiente para o encadeamento continuar tipado.
 */
export interface ComIgual<T> { eq(coluna: string, valor: unknown): T }

/**
 * Tira o dado de demonstração da consulta. **Chame em TODA leitura** das
 * tabelas que carregam dinheiro (`TABELAS_COM_AMOSTRA`, em `consulta.ts`).
 *
 * ⚠️ A direção do padrão é a decisão inteira: este filtro EXCLUI por omissão e
 * quem quer ver a amostra precisa DIZER (`"incluir-amostra"`, uma palavra
 * pesquisável, nunca um booleano). A explicação completa está em `consulta.ts`.
 *
 * ⚠️ A coluna é `not null default false`, então `eq("is_sample", false)` alcança
 * toda linha real — inclusive as gravadas antes da migration, que o `default`
 * preencheu. Fosse anulável, este filtro esconderia lançamento verdadeiro, que
 * é um defeito pior do que a contaminação que ele conserta.
 */
export function semAmostra<T>(q: T, incluir?: IncluirAmostra): T {
  if (incluir === "incluir-amostra") return q;
  return (q as unknown as ComIgual<T>).eq("is_sample", false);
}
