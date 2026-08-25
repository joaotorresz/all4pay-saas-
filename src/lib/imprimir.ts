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
 * ⚠️ **O MODO ESCURO É TRATADO AQUI, NÃO NO CSS, e por uma razão de tinta.**
 * A impressão do navegador descarta FUNDO por padrão ("Background graphics"
 * desligado) e mantém a COR DO TEXTO. No tema escuro o texto é quase branco:
 * o fundo preto some, a letra branca fica, e a folha sai **em branco**. Não dá
 * para consertar por `@media print` sem reescrever a paleta inteira dentro do
 * bloco — e reescrever hex no CSS é justamente o que a guarda da paleta
 * proíbe. Então o tema é forçado a CLARO durante a impressão e devolvido
 * depois, no `afterprint`.
 *
 * ⚠️ **A devolução é no evento, não depois do `print()`.** `window.print()` é
 * síncrono em alguns navegadores e assíncrono em outros (no Safari e no Chrome
 * com a pré-visualização, ele retorna ANTES de a pessoa decidir). Restaurar na
 * linha seguinte devolveria o tema escuro no meio da pré-visualização, e a
 * pessoa veria o relatório escurecer enquanto escolhe a impressora.
 */

/** Marca posta na raiz enquanto a impressão acontece — o CSS pendura nela. */
const ATRIBUTO = "data-imprimindo";

export function imprimirRelatorio(): void {
  if (typeof window === "undefined") return;
  const html = document.documentElement;
  const eraEscuro = html.classList.contains("dark");

  const restaurar = () => {
    if (eraEscuro) html.classList.add("dark");
    html.removeAttribute(ATRIBUTO);
    window.removeEventListener("afterprint", restaurar);
  };

  if (eraEscuro) html.classList.remove("dark");
  html.setAttribute(ATRIBUTO, "1");
  window.addEventListener("afterprint", restaurar);

  try {
    window.print();
  } catch {
    // Impressão recusada/indisponível: desfaz na hora, senão o app fica preso
    // no tema claro sem nada explicando por quê.
    restaurar();
  }
}
