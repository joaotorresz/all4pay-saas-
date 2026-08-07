/**
 * Escritor de .xlsx — sem dependência nenhuma.
 *
 * Um .xlsx é um ZIP de XMLs. Bibliotecas de planilha resolvem isso, mas a mais
 * comum (`xlsx` no npm) acumulou CVEs e o próprio projeto passou a distribuir
 * fora do registro — trazer isso para dentro de um ERP financeiro por causa de
 * um botão "Exportar" não se paga.
 *
 * A saída aqui é ZIP **STORED** (sem compressão): o formato permite, o Excel e
 * o Google Sheets abrem normalmente, e o preço é um arquivo maior — irrelevante
 * para as dezenas/centenas de linhas de uma tela de cadastro. Um CSV
 * disfarçado seria mais simples, mas o botão diz XLSX, então entrega XLSX.
 *
 * Puro (só depende de TextEncoder/Blob), demo-safe.
 */

export type CelulaXLSX = string | number | null | undefined;

export interface PlanilhaXLSX {
  /** Nome da aba (o Excel corta em 31 chars e proíbe : \ / ? * [ ]). */
  nome: string;
  /** Primeira linha = cabeçalho. */
  linhas: CelulaXLSX[][];
}

/* ------------------------------ XML / células ------------------------------ */

export const escaparXML = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    // Caracteres de controle são ILEGAIS em XML 1.0 e fazem o Excel recusar o
    // arquivo inteiro — um \t vindo de um campo colado derrubaria a exportação.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

const nomeAba = (s: string) => (s.replace(/[:\\/?*[\]]/g, "-").slice(0, 31) || "Planilha");

/** Coluna 1 → "A", 27 → "AA". */
function letraColuna(n: number): string {
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function celula(ref: string, v: CelulaXLSX): string {
  if (v == null || v === "") return "";
  if (typeof v === "number" && Number.isFinite(v)) {
    return `<c r="${ref}"><v>${v}</v></c>`;
  }
  // Texto vai como inlineStr: dispensa a tabela de strings compartilhadas.
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escaparXML(String(v))}</t></is></c>`;
}

function folhaXML(linhas: CelulaXLSX[][]): string {
  const corpo = linhas.map((linha, i) => {
    const r = i + 1;
    const cs = linha.map((v, k) => celula(`${letraColuna(k + 1)}${r}`, v)).join("");
    return `<row r="${r}">${cs}</row>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${corpo}</sheetData></worksheet>`;
}

/* --------------------------------- ZIP --------------------------------- */

const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = TABELA_CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface Entrada { nome: string; dados: Uint8Array; crc: number }

/**
 * Monta o ZIP. Data/hora ficam fixas em 1980-01-01 (o zero do formato MS-DOS):
 * a mesma tabela sempre gera bytes idênticos, o que torna a saída testável.
 */
export function zipar(entradas: Entrada[]): Uint8Array {
  const locais: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  const u16 = (v: number) => [v & 0xff, (v >>> 8) & 0xff];
  const u32 = (v: number) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
  const enc = new TextEncoder();

  for (const e of entradas) {
    const nome = enc.encode(e.nome);
    const cab = new Uint8Array([
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), // versão, flags, método STORED
      ...u16(0), ...u16(0x21),                              // hora, data (1980-01-01)
      ...u32(e.crc), ...u32(e.dados.length), ...u32(e.dados.length),
      ...u16(nome.length), ...u16(0),
    ]);
    const bloco = new Uint8Array(cab.length + nome.length + e.dados.length);
    bloco.set(cab, 0);
    bloco.set(nome, cab.length);
    bloco.set(e.dados, cab.length + nome.length);
    locais.push(bloco);

    const cd = new Uint8Array([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0x21),
      ...u32(e.crc), ...u32(e.dados.length), ...u32(e.dados.length),
      ...u16(nome.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(0), ...u32(offset),
    ]);
    const blocoCd = new Uint8Array(cd.length + nome.length);
    blocoCd.set(cd, 0);
    blocoCd.set(nome, cd.length);
    central.push(blocoCd);

    offset += bloco.length;
  }

  const tamCentral = central.reduce((s, b) => s + b.length, 0);
  const fim = new Uint8Array([
    ...u32(0x06054b50), ...u16(0), ...u16(0),
    ...u16(entradas.length), ...u16(entradas.length),
    ...u32(tamCentral), ...u32(offset), ...u16(0),
  ]);

  const total = offset + tamCentral + fim.length;
  const out = new Uint8Array(total);
  let p = 0;
  for (const b of [...locais, ...central, fim]) { out.set(b, p); p += b.length; }
  return out;
}

/* -------------------------------- pública -------------------------------- */

/** Gera os bytes de um .xlsx com uma aba por planilha. */
export function gerarXLSX(planilhas: PlanilhaXLSX[]): Uint8Array {
  const abas = planilhas.length > 0 ? planilhas : [{ nome: "Planilha1", linhas: [] }];
  const enc = new TextEncoder();

  const arquivos: { nome: string; texto: string }[] = [
    {
      nome: "[Content_Types].xml",
      texto: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${
        abas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")
      }</Types>`,
    },
    {
      nome: "_rels/.rels",
      texto: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      nome: "xl/workbook.xml",
      texto: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${
        abas.map((a, i) => `<sheet name="${escaparXML(nomeAba(a.nome))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")
      }</sheets></workbook>`,
    },
    {
      nome: "xl/_rels/workbook.xml.rels",
      texto: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${
        abas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")
      }</Relationships>`,
    },
    ...abas.map((a, i) => ({ nome: `xl/worksheets/sheet${i + 1}.xml`, texto: folhaXML(a.linhas) })),
  ];

  return zipar(arquivos.map((f) => {
    const dados = enc.encode(f.texto);
    return { nome: f.nome, dados, crc: crc32(dados) };
  }));
}

/** Gera e dispara o download no navegador. */
export function baixarXLSX(nomeArquivo: string, planilhas: PlanilhaXLSX[]): void {
  if (typeof window === "undefined") return;
  const bytes = gerarXLSX(planilhas);
  const blob = new Blob([bytes as unknown as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo.endsWith(".xlsx") ? nomeArquivo : `${nomeArquivo}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revogar na hora cancelaria o download em alguns navegadores.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ================================= leitura ================================= */

/**
 * LER um .xlsx — o outro lado da importação em lote.
 *
 * Escrever era fácil (ZIP STORED); ler é mais duro, porque planilhas reais vêm
 * com as entradas em DEFLATE. A saída é a `DecompressionStream("deflate-raw")`,
 * que TODO navegador moderno traz: descomprime sem uma linha de inflate
 * própria e sem dependência. Onde a API não existe, só as entradas STORED são
 * lidas — e a tela diz que o arquivo precisa ser salvo de novo.
 */
interface EntradaLida { nome: string; dados: Uint8Array }

async function descomprimir(bytes: Uint8Array): Promise<Uint8Array> {
  const DS = (globalThis as { DecompressionStream?: typeof DecompressionStream }).DecompressionStream;
  if (!DS) throw new Error("sem-decompression-stream");
  const stream = new Blob([bytes as unknown as BlobPart]).stream().pipeThrough(new DS("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Percorre o diretório central do ZIP — a fonte confiável dos offsets. */
async function lerZip(buf: ArrayBuffer): Promise<EntradaLida[]> {
  const b = new Uint8Array(buf);
  const dv = new DataView(buf);
  // O EOCD fica no fim; o comentário pode empurrá-lo até 64 KB para trás.
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 66_000); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("zip-invalido");
  const nEntradas = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);

  const out: EntradaLida[] = [];
  for (let k = 0; k < nEntradas; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const metodo = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const nomeLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const comentLen = dv.getUint16(p + 32, true);
    const offset = dv.getUint32(p + 42, true);
    const nome = new TextDecoder().decode(b.subarray(p + 46, p + 46 + nomeLen));
    p += 46 + nomeLen + extraLen + comentLen;

    // No cabeçalho local, nome e extra têm tamanhos PRÓPRIOS — reaproveitar os
    // do diretório central desalinharia o início dos dados.
    const nomeLocal = dv.getUint16(offset + 26, true);
    const extraLocal = dv.getUint16(offset + 28, true);
    const inicio = offset + 30 + nomeLocal + extraLocal;
    const cru = b.subarray(inicio, inicio + compSize);
    if (metodo === 0) out.push({ nome, dados: cru });
    else if (metodo === 8) out.push({ nome, dados: await descomprimir(cru) });
    // Outros métodos (bzip2, lzma) não aparecem em .xlsx de planilha real.
  }
  return out;
}

const semTags = (s: string) => s.replace(/<[^>]*>/g, "");
/**
 * Desescapa o XML da planilha.
 *
 * ⚠️ As referências NUMÉRICAS (`&#231;`) não são opcionais: o Excel e o
 * openpyxl gravam os acentos assim, então sem elas "Descrição" chega
 * "Descri&#231;&#227;o" — toda importação com português vem quebrada.
 * O `&amp;` fica por ÚLTIMO: desfazê-lo antes transformaria "&amp;lt;" em "<".
 */
const desescapar = (s: string) =>
  s.replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, "&");

/** Coluna "AB12" → índice 27 (0-based). */
function indiceDaColuna(ref: string): number {
  const letras = ref.replace(/[0-9]/g, "");
  let n = 0;
  for (const c of letras) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

/**
 * Lê a primeira aba de um .xlsx numa matriz de strings.
 *
 * Strings podem vir inline (`t="inlineStr"`) ou da tabela compartilhada
 * (`sharedStrings.xml`) — planilhas do Excel/Sheets usam a segunda quase
 * sempre, então ignorá-la devolveria uma matriz só de números.
 */
export async function lerXLSX(arquivo: Blob): Promise<string[][]> {
  const entradas = await lerZip(await arquivo.arrayBuffer());
  const dec = new TextDecoder();
  const acha = (n: string) => entradas.find((e) => e.nome === n);

  const compartilhadas: string[] = [];
  const ss = acha("xl/sharedStrings.xml");
  if (ss) {
    for (const si of dec.decode(ss.dados).split("<si>").slice(1)) {
      // Um <si> pode ter vários <t> (texto com formatação partida no meio).
      const partes = Array.from(si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)).map((m) => m[1]);
      compartilhadas.push(desescapar(partes.join("")));
    }
  }

  const folha = entradas.find((e) => /^xl\/worksheets\/sheet\d+\.xml$/.test(e.nome));
  if (!folha) return [];
  const xml = dec.decode(folha.dados);

  const linhas: string[][] = [];
  for (const row of xml.split("<row").slice(1)) {
    const celulas: string[] = [];
    const cs = Array.from(row.matchAll(/<c([^>]*)>([\s\S]*?)<\/c>|<c([^>]*)\/>/g));
    for (const m of cs) {
      const attrs = m[1] ?? m[3] ?? "";
      const corpo = m[2] ?? "";
      const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const tipo = /t="([^"]+)"/.exec(attrs)?.[1];
      const bruto = /<v>([\s\S]*?)<\/v>/.exec(corpo)?.[1]
        ?? /<t[^>]*>([\s\S]*?)<\/t>/.exec(corpo)?.[1] ?? "";
      const valor = tipo === "s" ? (compartilhadas[Number(bruto)] ?? "") : desescapar(semTags(bruto));
      const i = ref ? indiceDaColuna(ref) : celulas.length;
      while (celulas.length < i) celulas.push("");
      celulas[i] = valor;
    }
    linhas.push(celulas);
  }
  // Linhas totalmente vazias no fim da planilha são ruído do editor.
  while (linhas.length && linhas[linhas.length - 1].every((c) => !c.trim())) linhas.pop();
  return linhas;
}
