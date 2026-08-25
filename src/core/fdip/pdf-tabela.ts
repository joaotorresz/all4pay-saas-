/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A TABELA DENTRO DO PDF — reconstruída da CAMADA DE TEXTO, não do desenho
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **O defeito que isto conserta (medido):** todo PDF caía em `kind:"doc"` e
 * virava **UM lançamento** — um valor, um vencimento, um CNPJ. O caminho de
 * lote (`kind:"bulk"`) só era alcançado por OFX/CSV/TXT. Um extrato em PDF com
 * 200 transações entrava no sistema como uma linha só, e o resto sumia sem
 * nada avisar. Pior: `ocrLocalPdf` rasteriza **só a 1ª página**, então mesmo o
 * OCR não via o extrato inteiro.
 *
 * ⚠️ **PDF não tem tabela.** Ele tem pedaços de texto com coordenadas; a
 * "tabela" é uma inferência nossa. Por isso a reconstrução mora aqui, PURA e
 * testável: a parte que decide o que é linha e o que é coluna não pode
 * depender do navegador, senão a única forma de conferi-la é abrindo um PDF na
 * mão.
 *
 * O contrato: `string[][]` — a MESMA forma que `lerXLSX` devolve. Assim o PDF
 * entra no pipeline que já existe (`csvDeLinhas` → `analisarImportacao` →
 * detecção de colunas → classificação) em vez de ganhar um caminho próprio que
 * divergiria do primeiro no dia em que um banco mudasse de layout.
 */

/** Um pedaço de texto do PDF, com onde ele está na página. */
export type ItemPdf = {
  texto: string;
  /** Canto esquerdo, em pontos. Cresce para a DIREITA. */
  x: number;
  /** Linha de base, em pontos. ⚠️ No PDF o y cresce para CIMA. */
  y: number;
  /** Largura do pedaço, em pontos. */
  largura: number;
  /** Altura da fonte, em pontos — a escala natural das tolerâncias. */
  altura?: number;
};

export type OpcoesTabela = {
  /**
   * Quanto dois itens podem diferir em `y` e ainda serem a MESMA linha.
   * ⚠️ Em múltiplos da altura da fonte, não em pontos fixos: um extrato em
   * corpo 6 e um em corpo 12 têm a mesma tolerância relativa, e um valor fixo
   * grudaria duas linhas no primeiro ou partiria uma no segundo.
   */
  toleranciaLinha?: number;
  /**
   * Vão horizontal, em múltiplos da largura média de caractere, a partir do
   * qual dois itens vizinhos são CÉLULAS diferentes em vez de pedaços da mesma.
   */
  vaoDeColuna?: number;
};

const PADRAO: Required<OpcoesTabela> = { toleranciaLinha: 0.5, vaoDeColuna: 1.6 };

/** Largura média de um caractere no conjunto — a régua para o vão de coluna. */
function larguraPorCaractere(itens: ItemPdf[]): number {
  let soma = 0;
  let chars = 0;
  for (const it of itens) {
    const n = it.texto.length;
    if (n > 0 && it.largura > 0) { soma += it.largura; chars += n; }
  }
  // Sem base, 5pt é a largura típica de um dígito em corpo 10 — só evita 0.
  return chars > 0 ? soma / chars : 5;
}

/** Altura de fonte representativa (mediana) — a régua para a tolerância de linha. */
function alturaTipica(itens: ItemPdf[]): number {
  const hs = itens.map((i) => i.altura ?? 0).filter((h) => h > 0).sort((a, b) => a - b);
  return hs.length > 0 ? hs[Math.floor(hs.length / 2)] : 10;
}

/**
 * Reconstrói as linhas da página a partir dos pedaços posicionados.
 *
 * ⚠️ **A ordem de leitura é `y` DECRESCENTE.** No sistema de coordenadas do
 * PDF a origem fica embaixo à esquerda, então ordenar por `y` crescente
 * devolveria o extrato de trás para a frente — e um extrato invertido não
 * parece quebrado, parece um extrato: a soma bate, o saldo acumulado não.
 */
export function agruparEmLinhas(itens: ItemPdf[], opcoes: OpcoesTabela = {}): string[][] {
  const { toleranciaLinha, vaoDeColuna } = { ...PADRAO, ...opcoes };
  const vivos = itens.filter((i) => i.texto.trim() !== "");
  if (vivos.length === 0) return [];

  const tolY = alturaTipica(vivos) * toleranciaLinha;
  const larguraChar = larguraPorCaractere(vivos);
  const vao = larguraChar * vaoDeColuna;
  const meioCaractere = larguraChar * 0.5;

  // 1. Agrupa por linha de base. Percorre do topo para baixo (y decrescente).
  const porY = [...vivos].sort((a, b) => b.y - a.y || a.x - b.x);
  const linhas: ItemPdf[][] = [];
  let atual: ItemPdf[] = [];
  let refY = Number.NaN;
  for (const it of porY) {
    if (atual.length === 0 || Math.abs(it.y - refY) <= tolY) {
      if (atual.length === 0) refY = it.y;
      atual.push(it);
    } else {
      linhas.push(atual);
      atual = [it];
      refY = it.y;
    }
  }
  if (atual.length > 0) linhas.push(atual);

  // 2. Dentro da linha: ordena por x e FUNDE o que está colado.
  // ⚠️ pdf.js quebra o texto em pedaços por mudança de fonte ou de kerning —
  // "MERCADO" e "LIVRE" chegam separados. Emitir um pedaço por célula partiria
  // uma descrição em três colunas e desalinharia a tabela inteira.
  return linhas.map((linha) => {
    const ordenada = [...linha].sort((a, b) => a.x - b.x);
    const celulas: string[] = [];
    let buffer = "";
    let fimAnterior = Number.NaN;
    for (const it of ordenada) {
      const t = it.texto.trim();
      if (t === "") continue;
      if (buffer === "") { buffer = t; fimAnterior = it.x + it.largura; continue; }
      const gap = it.x - fimAnterior;
      // ⚠️ TRÊS casos, e o do meio é o que se erra: vão largo é COLUNA nova;
      // vão de meia letra para cima é ESPAÇO (duas palavras); e vão perto de
      // zero é a MESMA palavra partida por kerning — aí juntar com espaço
      // escreveria "MERCA DO" onde está escrito "MERCADO".
      if (gap > vao) { celulas.push(buffer); buffer = t; }
      else buffer += (gap >= meioCaractere ? " " : "") + t;
      fimAnterior = it.x + it.largura;
    }
    if (buffer !== "") celulas.push(buffer);
    return celulas;
  });
}

/**
 * O PDF tem camada de texto utilizável, ou é imagem escaneada?
 *
 * ⚠️ **A decisão precisa ser explícita e conservadora.** Um PDF escaneado
 * quase sempre traz ALGUM texto — número de página, marca d'água do software
 * que gerou o scan, um cabeçalho vetorial. Tratar "tem algum texto" como "tem
 * camada de texto" mandaria um extrato escaneado para o parser de tabela, que
 * devolveria duas linhas de lixo em vez de acionar o OCR. O erro é silencioso:
 * o import "funciona" e traz quase nada.
 */
export function temCamadaDeTexto(itens: ItemPdf[], minimo = 40): boolean {
  const uteis = itens.filter((i) => i.texto.trim() !== "");
  return uteis.length >= minimo;
}
