/**
 * Gerador de QR Code — sem dependência.
 *
 * O link de pagamento precisa de um QR para o cliente apontar a câmera. Trazer
 * uma biblioteca para desenhar quadradinhos num ERP financeiro não se paga, e a
 * especificação (ISO/IEC 18004) cabe num arquivo: modo byte, correção de erro,
 * Reed-Solomon sobre GF(256) e as máscaras.
 *
 * Escopo deliberado: **modo byte, versões 1–10, nível M**. Cobre com folga uma
 * URL de link de pagamento (até ~270 bytes). Acima disso a função avisa em vez
 * de gerar um código que o leitor recusaria.
 *
 * Puro (só faz contas), testável, sem I/O.
 */

/* ------------------------------- GF(256) ------------------------------- */

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    // Polinômio primitivo do QR: x^8 + x^4 + x^3 + x^2 + 1 (0x11d).
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

const mul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

/** Polinômio gerador de grau `n` — a base da correção de erro. */
function gerador(n: number): Uint8Array {
  let g = new Uint8Array([1]);
  for (let i = 0; i < n; i++) {
    const novo = new Uint8Array(g.length + 1);
    for (let j = 0; j < g.length; j++) {
      novo[j] ^= g[j];
      novo[j + 1] ^= mul(g[j], EXP[i]);
    }
    g = novo;
  }
  return g;
}

/** Os bytes de correção de erro de um bloco (divisão polinomial). */
function correcao(dados: Uint8Array, nEC: number): Uint8Array {
  const g = gerador(nEC);
  const resto = new Uint8Array(dados.length + nEC);
  resto.set(dados);
  for (let i = 0; i < dados.length; i++) {
    const c = resto[i];
    if (c === 0) continue;
    for (let j = 0; j < g.length; j++) resto[i + j] ^= mul(g[j], c);
  }
  return resto.slice(dados.length);
}

/* ------------------------- tabelas da especificação ------------------------- */

/** Por versão (1–10), nível M: [total de codewords de dados, EC por bloco, blocos g1, dados g1, blocos g2, dados g2]. */
const VERSOES_M: Record<number, [number, number, number, number, number, number]> = {
  1: [16, 10, 1, 16, 0, 0],
  2: [28, 16, 1, 28, 0, 0],
  3: [44, 26, 1, 44, 0, 0],
  4: [64, 18, 2, 32, 0, 0],
  5: [86, 24, 2, 43, 0, 0],
  6: [108, 16, 4, 27, 0, 0],
  7: [124, 18, 4, 31, 0, 0],
  8: [154, 22, 2, 38, 2, 39],
  9: [182, 22, 3, 36, 2, 37],
  10: [216, 26, 4, 43, 1, 44],
};

/** Centros dos padrões de alinhamento por versão. */
const ALINHAMENTO: Record<number, number[]> = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
  6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
};

/** Bits de formato já prontos (nível M + máscara 0..7), com a máscara XOR aplicada. */
const FORMATO_M = [
  0x5412, 0x5125, 0x5e7c, 0x5b4b, 0x45f9, 0x40ce, 0x4f97, 0x4aa0,
];

/* ------------------------------- a matriz ------------------------------- */

type Matriz = (0 | 1 | null)[][];

function novaMatriz(n: number): Matriz {
  return Array.from({ length: n }, () => Array<0 | 1 | null>(n).fill(null));
}

function porFinder(m: Matriz, linha: number, coluna: number): void {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const y = linha + r, x = coluna + c;
      if (y < 0 || y >= m.length || x < 0 || x >= m.length) continue;
      const dentro = r >= 0 && r <= 6 && c >= 0 && c <= 6;
      const borda = r === 0 || r === 6 || c === 0 || c === 6;
      const nucleo = r >= 2 && r <= 4 && c >= 2 && c <= 4;
      m[y][x] = dentro && (borda || nucleo) ? 1 : 0;
    }
  }
}

/** Marca os módulos de função (não recebem dados nem máscara). */
function funcoes(versao: number, n: number): boolean[][] {
  const f = Array.from({ length: n }, () => Array<boolean>(n).fill(false));
  const marcar = (y: number, x: number, h: number, w: number) => {
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
      if (y + r >= 0 && y + r < n && x + c >= 0 && x + c < n) f[y + r][x + c] = true;
    }
  };
  marcar(0, 0, 9, 9);
  marcar(0, n - 8, 9, 8);
  marcar(n - 8, 0, 8, 9);
  for (let i = 0; i < n; i++) { f[6][i] = true; f[i][6] = true; }
  const cs = ALINHAMENTO[versao];
  for (const y of cs) for (const x of cs) {
    // O alinhamento não é desenhado sobre os finders.
    if ((y <= 8 && x <= 8) || (y <= 8 && x >= n - 9) || (y >= n - 9 && x <= 8)) continue;
    marcar(y - 2, x - 2, 5, 5);
  }
  return f;
}

function desenharBase(m: Matriz, versao: number): void {
  const n = m.length;
  porFinder(m, 0, 0);
  porFinder(m, 0, n - 7);
  porFinder(m, n - 7, 0);
  // Timing.
  for (let i = 8; i < n - 8; i++) {
    const v: 0 | 1 = i % 2 === 0 ? 1 : 0;
    m[6][i] = v;
    m[i][6] = v;
  }
  // Alinhamento.
  const cs = ALINHAMENTO[versao];
  for (const y of cs) for (const x of cs) {
    if ((y <= 8 && x <= 8) || (y <= 8 && x >= n - 9) || (y >= n - 9 && x <= 8)) continue;
    for (let r = -2; r <= 2; r++) for (let c = -2; c <= 2; c++) {
      m[y + r][x + c] = (Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0)) ? 1 : 0;
    }
  }
  // Módulo escuro fixo.
  m[n - 8][8] = 1;
}

const MASCARAS: ((y: number, x: number) => boolean)[] = [
  (y, x) => (y + x) % 2 === 0,
  (y) => y % 2 === 0,
  (_, x) => x % 3 === 0,
  (y, x) => (y + x) % 3 === 0,
  (y, x) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
  (y, x) => ((y * x) % 2) + ((y * x) % 3) === 0,
  (y, x) => (((y * x) % 2) + ((y * x) % 3)) % 2 === 0,
  (y, x) => (((y + x) % 2) + ((y * x) % 3)) % 2 === 0,
];

/* -------------------------------- pública -------------------------------- */

export interface QRCode {
  /** Matriz de módulos: `true` = escuro. */
  modulos: boolean[][];
  tamanho: number;
  versao: number;
}

/**
 * Gera a matriz do QR (modo byte, nível M).
 *
 * A máscara é escolhida por PENALIDADE, como manda a especificação: uma máscara
 * ruim deixa o código com blocos grandes de uma cor só, e leitor nenhum acha os
 * padrões. Sem essa escolha o QR funciona "às vezes", que é pior que não gerar.
 */
export function gerarQR(texto: string): QRCode {
  const bytes = new TextEncoder().encode(texto);

  // Menor versão que comporta o conteúdo (4 bits de modo + 8/16 de tamanho).
  let versao = 0;
  for (let v = 1; v <= 10; v++) {
    const capacidade = VERSOES_M[v][0] - 2 - (v >= 10 ? 1 : 0);
    if (bytes.length <= capacidade) { versao = v; break; }
  }
  if (!versao) {
    throw new Error(`Conteúdo de ${bytes.length} bytes não cabe num QR versão 10 (nível M).`);
  }

  const [totalDados, ecPorBloco, b1, d1, b2, d2] = VERSOES_M[versao];
  const bitsTamanho = versao >= 10 ? 16 : 8;

  // --- bitstream ---
  const bits: number[] = [];
  const push = (valor: number, n: number) => {
    for (let i = n - 1; i >= 0; i--) bits.push((valor >> i) & 1);
  };
  push(0b0100, 4);            // modo byte
  push(bytes.length, bitsTamanho);
  bytes.forEach((b) => push(b, 8));
  // Terminador + preenchimento até fechar o byte.
  for (let i = 0; i < 4 && bits.length < totalDados * 8; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);
  const dados: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    dados.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  }
  // Bytes de preenchimento alternados, como manda a norma.
  const PAD = [0xec, 0x11];
  for (let i = 0; dados.length < totalDados; i++) dados.push(PAD[i % 2]);

  // --- blocos + correção de erro ---
  const blocos: Uint8Array[] = [];
  const ecs: Uint8Array[] = [];
  let p = 0;
  for (let i = 0; i < b1; i++) { const b = new Uint8Array(dados.slice(p, p + d1)); p += d1; blocos.push(b); ecs.push(correcao(b, ecPorBloco)); }
  for (let i = 0; i < b2; i++) { const b = new Uint8Array(dados.slice(p, p + d2)); p += d2; blocos.push(b); ecs.push(correcao(b, ecPorBloco)); }

  // Intercalação: byte 0 de cada bloco, byte 1 de cada bloco, …
  const finais: number[] = [];
  const maxD = Math.max(d1, d2);
  for (let i = 0; i < maxD; i++) for (const b of blocos) if (i < b.length) finais.push(b[i]);
  for (let i = 0; i < ecPorBloco; i++) for (const e of ecs) finais.push(e[i]);

  // --- matriz ---
  const n = versao * 4 + 17;
  const base = novaMatriz(n);
  desenharBase(base, versao);
  const fixos = funcoes(versao, n);

  // Zigue-zague da direita para a esquerda, pulando a coluna 6 (timing).
  const bitsFinais: number[] = [];
  for (const b of finais) for (let i = 7; i >= 0; i--) bitsFinais.push((b >> i) & 1);

  const posicoes: [number, number][] = [];
  let subindo = true;
  for (let col = n - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (let i = 0; i < n; i++) {
      const y = subindo ? n - 1 - i : i;
      for (const x of [col, col - 1]) {
        if (!fixos[y][x]) posicoes.push([y, x]);
      }
    }
    subindo = !subindo;
  }
  posicoes.forEach(([y, x], i) => {
    base[y][x] = (i < bitsFinais.length ? bitsFinais[i] : 0) as 0 | 1;
  });

  // --- máscara por penalidade ---
  let melhor = 0, melhorPen = Infinity, melhorM: boolean[][] = [];
  for (let k = 0; k < 8; k++) {
    const m = base.map((linha, y) => linha.map((v, x) =>
      (fixos[y][x] ? v === 1 : ((v === 1) !== MASCARAS[k](y, x)))) as boolean[]);
    porFormatoBool(m, k, n);
    const pen = penalidade(m);
    if (pen < melhorPen) { melhorPen = pen; melhor = k; melhorM = m; }
  }
  void melhor;

  return { modulos: melhorM, tamanho: n, versao };
}

/**
 * Grava os 15 bits de formato nas DUAS cópias.
 *
 * ⚠️ Os bits entram do MAIS significativo para o menos (`14 - i`). Escrevê-los
 * na ordem natural produz um QR que parece perfeito — finders, timing e dados
 * todos certos — e que NENHUM leitor decodifica, porque a primeira coisa que
 * ele lê é o formato. Foi assim que este arquivo nasceu quebrado.
 *
 * A cópia 2 divide em 7 + 8: os sete primeiros descem pela coluna 8 e os oito
 * últimos correm pela linha 8. Um split em 8+7 deixa (8, n-8) sem escrever.
 */
function porFormatoBool(m: boolean[][], mascara: number, n: number): void {
  const bits = FORMATO_M[mascara];
  for (let i = 0; i < 15; i++) {
    const b = ((bits >> (14 - i)) & 1) === 1;
    // Cópia 1 — em volta do finder superior esquerdo.
    if (i < 6) m[8][i] = b;
    else if (i === 6) m[8][7] = b;
    else if (i === 7) m[8][8] = b;
    else if (i === 8) m[7][8] = b;
    else m[14 - i][8] = b;
    // Cópia 2 — 7 na vertical (inferior esquerdo) + 8 na horizontal (superior direito).
    if (i < 7) m[n - 1 - i][8] = b;
    else m[8][n - 15 + i] = b;
  }
  // Módulo escuro fixo — sempre 1, em qualquer versão.
  m[n - 8][8] = true;
}

/** Penalidade da especificação (regras N1..N4) — quanto menor, melhor a leitura. */
function penalidade(m: boolean[][]): number {
  const n = m.length;
  let p = 0;
  // N1: cinco ou mais módulos iguais em sequência.
  const linhaOuColuna = (get: (i: number, j: number) => boolean) => {
    for (let i = 0; i < n; i++) {
      let run = 1;
      for (let j = 1; j < n; j++) {
        if (get(i, j) === get(i, j - 1)) run++;
        else { if (run >= 5) p += 3 + (run - 5); run = 1; }
      }
      if (run >= 5) p += 3 + (run - 5);
    }
  };
  linhaOuColuna((i, j) => m[i][j]);
  linhaOuColuna((i, j) => m[j][i]);
  // N2: blocos 2×2 da mesma cor.
  for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) {
    const v = m[y][x];
    if (m[y][x + 1] === v && m[y + 1][x] === v && m[y + 1][x + 1] === v) p += 3;
  }
  // N3: o padrão 1:1:3:1:1 que imita um finder.
  const alvo = [true, false, true, true, true, false, true, false, false, false, false];
  const alvoInv = [...alvo].reverse();
  const casa = (get: (k: number) => boolean, len: number) => {
    for (let i = 0; i + 11 <= len; i++) {
      let a = true, b = true;
      for (let k = 0; k < 11; k++) {
        if (get(i + k) !== alvo[k]) a = false;
        if (get(i + k) !== alvoInv[k]) b = false;
      }
      if (a || b) p += 40;
    }
  };
  for (let i = 0; i < n; i++) {
    casa((k) => m[i][k], n);
    casa((k) => m[k][i], n);
  }
  // N4: desequilíbrio entre claros e escuros.
  const escuros = m.flat().filter(Boolean).length;
  const pct = (escuros * 100) / (n * n);
  p += Math.floor(Math.abs(pct - 50) / 5) * 10;
  return p;
}

/** SVG do QR — string pronta para `dangerouslySetInnerHTML` ou download. */
export function qrParaSVG(qr: QRCode, tamanhoPx = 220, cor = "#11190C"): string {
  const quiet = 4; // zona silenciosa exigida pela norma
  const total = qr.tamanho + quiet * 2;
  const partes: string[] = [];
  for (let y = 0; y < qr.tamanho; y++) {
    for (let x = 0; x < qr.tamanho; x++) {
      if (qr.modulos[y][x]) partes.push(`M${x + quiet} ${y + quiet}h1v1h-1z`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${tamanhoPx}" height="${tamanhoPx}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges" role="img" aria-label="QR code do link de pagamento"><rect width="${total}" height="${total}" fill="#fff"/><path d="${partes.join("")}" fill="${cor}"/></svg>`;
}
