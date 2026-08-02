/**
 * Escritor de .docx — reusa o ZIP do `lib/xlsx`.
 *
 * O fechamento mensal exporta em DOCX porque quem assina o relatório ajusta o
 * texto no Word antes de mandar. E um `.docx`, como o `.xlsx`, é um ZIP de
 * XMLs (OOXML) — o mesmo `zipar`/`crc32` serve, então a exportação sai sem
 * nenhuma dependência nova.
 *
 * O escopo é deliberadamente pequeno: título, parágrafo, lista e tabela — o que
 * um relatório financeiro precisa. Estilo rico é trabalho do Word.
 */
import { zipar, crc32, escaparXML } from "@/lib/xlsx";

export type BlocoDocx =
  | { tipo: "titulo"; texto: string; nivel?: 1 | 2 | 3 }
  | { tipo: "paragrafo"; texto: string; negrito?: boolean }
  | { tipo: "lista"; itens: string[] }
  | { tipo: "tabela"; cabecalho: string[]; linhas: string[][] }
  | { tipo: "quebra" };

/** Um parágrafo do OOXML. `estilo` casa com os estilos declarados abaixo. */
function paragrafo(texto: string, estilo?: string, negrito?: boolean): string {
  const props = [
    estilo ? `<w:pStyle w:val="${estilo}"/>` : "",
  ].join("");
  const run = `<w:r>${negrito ? "<w:rPr><w:b/></w:rPr>" : ""}<w:t xml:space="preserve">${escaparXML(texto)}</w:t></w:r>`;
  return `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ""}${run}</w:p>`;
}

function tabela(cabecalho: string[], linhas: string[][]): string {
  const celula = (t: string, negrito: boolean, direita: boolean) =>
    `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr><w:p><w:pPr>${
      direita ? '<w:jc w:val="right"/>' : ""
    }</w:pPr><w:r>${negrito ? "<w:rPr><w:b/></w:rPr>" : ""}<w:t xml:space="preserve">${escaparXML(t)}</w:t></w:r></w:p></w:tc>`;
  // A primeira coluna é rótulo (esquerda); as demais são número (direita).
  const linha = (cs: string[], negrito: boolean) =>
    `<w:tr>${cs.map((c, i) => celula(c, negrito, i > 0)).join("")}</w:tr>`;
  return `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${
    ["top", "left", "bottom", "right", "insideH", "insideV"]
      .map((b) => `<w:${b} w:val="single" w:sz="4" w:space="0" w:color="DDDDDD"/>`).join("")
  }</w:tblBorders></w:tblPr>${linha(cabecalho, true)}${linhas.map((l) => linha(l, false)).join("")}</w:tbl>`;
}

function corpo(blocos: BlocoDocx[]): string {
  return blocos.map((b) => {
    switch (b.tipo) {
      case "titulo": return paragrafo(b.texto, `Heading${b.nivel ?? 1}`);
      case "paragrafo": return paragrafo(b.texto, undefined, b.negrito);
      case "lista": return b.itens.map((i) => paragrafo(`• ${i}`)).join("");
      case "tabela": return tabela(b.cabecalho, b.linhas) + "<w:p/>";
      default: return "<w:p/>";
    }
  }).join("");
}

const ARQUIVO_TIPOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`;

const ARQUIVO_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

/**
 * Estilos mínimos: sem eles os títulos saem do mesmo tamanho do corpo.
 *
 * `docDefaults` + o estilo **Normal** são obrigatórios, não decoração: sem eles
 * um parágrafo sem `pStyle` fica sem estilo nenhum, e leitores que seguem a
 * especificação à risca (o `python-docx`, por exemplo) devolvem `None` ao
 * perguntar o estilo do parágrafo. O Word tolera; um pipeline que consuma o
 * arquivo, não.
 */
const ESTILOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="360" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="280" w:after="100"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="220" w:after="80"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style>
<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/></w:style>
</w:styles>`;

export function gerarDOCX(blocos: BlocoDocx[]): Uint8Array {
  const documento = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${corpo(blocos)}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`;

  const enc = new TextEncoder();
  const partes: { nome: string; texto: string }[] = [
    { nome: "[Content_Types].xml", texto: ARQUIVO_TIPOS },
    { nome: "_rels/.rels", texto: ARQUIVO_RELS },
    { nome: "word/document.xml", texto: documento },
    { nome: "word/_rels/document.xml.rels", texto: DOC_RELS },
    { nome: "word/styles.xml", texto: ESTILOS },
  ];
  return zipar(partes.map((p) => {
    const dados = enc.encode(p.texto);
    return { nome: p.nome, dados, crc: crc32(dados) };
  }));
}

export function baixarDOCX(nomeArquivo: string, blocos: BlocoDocx[]): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([gerarDOCX(blocos) as unknown as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo.endsWith(".docx") ? nomeArquivo : `${nomeArquivo}.docx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
