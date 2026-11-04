/**
 * ═══════════════════════════════════════════════════════════════════════════
 * IMPRIMIR UM RELATÓRIO — o botão que prometia PDF e entregava uma fotografia
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **MEDIDO: o projeto inteiro não tinha UMA regra `@media print`.** O botão
 * "Exportar PDF" chamava `window.print()` cru sobre um app cuja raiz é
 * `.a4p-canvas { position: fixed; inset: 0; overflow: hidden }`, com a área de
 * conteúdo em `overflow-y-auto`. Imprimir isso não produz um relatório de N
 * páginas: produz **UMA página com o que coubesse na tela**, moldura escura,
 * menu lateral e o botão flutuante da IA por cima — e o resto do DRE
 * simplesmente não existe no papel. Um DRE de 12 meses saía com as três ou
 * quatro primeiras linhas.
 *
 * ⚠️ **É a pior forma de defeito de saída: o arquivo ABRE.** O contador recebe
 * um PDF legível, com números certos, e não tem como saber que faltam oito
 * linhas — não há erro, não há aviso, e o total do rodapé nem chegou à folha.
 * Comparar com o XLSX (que sempre esteve correto) é o único jeito de perceber,
 * e ninguém compara.
 *
 * O sistema tem um tema só, o claro (04/11/2026): o ajudante não mexe mais em
 * tema. Antes ele forçava o claro durante a impressão, porque no escuro a
 * folha saía em branco (o navegador descarta o fundo e mantém o texto claro).
 *
 * ⚠️ **As marcas saem no evento, não depois do `print()`.** `window.print()` é
 * síncrono em alguns navegadores e assíncrono em outros (no Safari e no Chrome
 * com a pré-visualização, ele retorna ANTES de a pessoa decidir). Tirar as
 * marcas na linha seguinte mudaria a pré-visualização enquanto a pessoa
 * escolhe a impressora.
 */

/** Marca posta na raiz enquanto a impressão acontece — o CSS pendura nela. */
const ATRIBUTO = "data-imprimindo";

/**
 * Marca do modo DOCUMENTO (CAMP-B): em vez de imprimir a tela, imprime SÓ o
 * elemento `[data-documento-impressao]` montado no `<body>` — o extrato do
 * cliente, que é um documento para o outro lado, não um pedaço do app. O CSS
 * esconde todo o resto do `<body>` quando esta marca está presente.
 */
const ATRIBUTO_DOCUMENTO = "data-imprimindo-documento";

export function imprimirRelatorio(): void {
  imprimir(false);
}

/** Imprime SÓ o `[data-documento-impressao]` montado no `<body>` (o extrato do cliente). */
export function imprimirDocumento(): void {
  imprimir(true);
}

function imprimir(documento: boolean): void {
  if (typeof window === "undefined") return;
  const html = document.documentElement;

  const restaurar = () => {
    html.removeAttribute(ATRIBUTO);
    html.removeAttribute(ATRIBUTO_DOCUMENTO);
    window.removeEventListener("afterprint", restaurar);
  };

  html.setAttribute(ATRIBUTO, "1");
  if (documento) html.setAttribute(ATRIBUTO_DOCUMENTO, "1");
  window.addEventListener("afterprint", restaurar);

  try {
    window.print();
  } catch {
    // Impressão recusada/indisponível: desfaz na hora, senão o app fica preso
    // no tema claro sem nada explicando por quê.
    restaurar();
  }
}
