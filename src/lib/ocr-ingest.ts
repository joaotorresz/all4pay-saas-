/**
 * Leitor de documento único para o fluxo de upload (home + página).
 * Roteia o arquivo: OFX/CSV/TXT → FDIP (lote); PDF COM CAMADA DE TEXTO → tabela
 * reconstruída → o MESMO pipeline de lote; imagem e PDF escaneado → OCR (visão
 * do Claude se houver chave, senão Tesseract/pdf.js local). Devolve campos
 * normalizados (`DocFields`) para um documento, ou um relatório FDIP para o lote.
 */
import { analisarImportacao, csvDeLinhas } from "@/core/fdip";
import { agruparEmLinhas, temCamadaDeTexto, type ItemPdf } from "@/core/fdip/pdf-tabela";
import { refinarDocumento } from "@/core/compras/refino";
import { ocrLocalImagem, ocrLocalPdf, itensDoPdf, paginasDoPdf, type DocExtraido } from "@/lib/ocr-local";
import { csvDasPaginas, TETO_PAGINAS_IA, type PaginaIA } from "@/core/fdip/extrato-ia";
import type { DocFields } from "@/lib/upload-doc";
import type { FDIPReport } from "@/core/fdip/types";

export type LeituraDocumento =
  | { kind: "doc"; fields: DocFields; modo: "ia" | "local" }
  /**
   * `texto` é o extrato já em texto tabulado — quem junta vários arquivos numa
   * análise só (a aba Enviar) precisa dele; o relatório sozinho não se soma.
   */
  | { kind: "bulk"; report: FDIPReport; texto: string; ia?: LeituraIA }
  | { kind: "erro"; motivo: string };

/**
 * Como foi a leitura do extrato escaneado pela IA — para a tela dizer o que
 * foi lido e, sobretudo, o que NÃO foi: página que falhou e páginas além do
 * teto não podem sumir caladas, senão o mês não fecha com o banco.
 */
export interface LeituraIA {
  tipo: "extrato" | "fatura";
  /** Páginas do arquivo. */
  paginas: number;
  /** Páginas enviadas (até o teto). */
  lidas: number;
  /** Números das páginas que a IA não conseguiu ler. */
  falhas: number[];
  /** Linhas que vieram e foram recusadas na conferência. */
  recusadas: number;
}

/** O que a tela mostra enquanto lê. */
export type EtapaLeitura =
  | { fase: "arquivo" }
  | { fase: "pagina"; pagina: number; total: number };

async function paginaPorIA(imagemBase64: string, pagina: number, total: number): Promise<PaginaIA | null> {
  try {
    const r = await fetch("/api/inbox/extrato", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imagemBase64, pagina, total }),
    }).then((x) => x.json());
    return r?.ok && r.pagina ? (r.pagina as PaginaIA) : null;
  } catch {
    return null;
  }
}

/**
 * Lê um extrato/fatura página a página pela IA. A PRIMEIRA página decide: se
 * ela não é lista de lançamentos (boleto, nota), devolve `null` e o arquivo
 * segue como documento. As outras vão em paralelo, três por vez.
 */
async function extratoPorIA(
  imagem: (p: number) => Promise<string>,
  total: number,
  onEtapa?: (e: EtapaLeitura) => void,
): Promise<{ report: FDIPReport; texto: string; ia: LeituraIA } | null> {
  const lidas = Math.min(total, TETO_PAGINAS_IA);
  onEtapa?.({ fase: "pagina", pagina: 1, total: lidas });
  const primeira = await paginaPorIA(await imagem(1), 1, total);
  if (!primeira || primeira.tipo === "documento") return null;

  const paginas: (PaginaIA | null)[] = [primeira];
  let feitas = 1;
  let proxima = 2;
  const trabalhador = async () => {
    while (proxima <= lidas) {
      const p = proxima++;
      const lida = await paginaPorIA(await imagem(p), p, total).catch(() => null);
      paginas[p - 1] = lida;
      feitas++;
      onEtapa?.({ fase: "pagina", pagina: feitas, total: lidas });
    }
  };
  await Promise.all([trabalhador(), trabalhador(), trabalhador()]);

  const boas = paginas.filter((p): p is PaginaIA => !!p);
  const texto = csvDasPaginas(boas);
  if (!texto) return null;
  const report = analisarImportacao(texto);
  if (!report.records.length) return null;
  return {
    report, texto,
    ia: {
      tipo: boas.some((p) => p.tipo === "fatura") ? "fatura" : "extrato",
      paginas: total, lidas,
      falhas: paginas.map((p, i) => (p ? 0 : i + 1)).filter(Boolean),
      recusadas: boas.reduce((s, p) => s + p.recusadas, 0),
    },
  };
}

/** O servidor tem ANTHROPIC_API_KEY? (OCR por IA disponível.) */
export async function ocrConfigurado(): Promise<boolean> {
  try {
    const j = await fetch("/api/inbox/ocr").then((r) => r.json());
    return !!j.configured;
  } catch {
    return false;
  }
}

function fieldsFrom(ex: Partial<DocExtraido> & Record<string, unknown>, confDefault = 0.8): DocFields {
  // ⚠️ **O CALCULADO VENCE O ADIVINHADO.** O OCR já capturava a linha digitável
  // e a entregava como texto; `lerBoleto` sabia tirar dela valor, vencimento e
  // banco com os dígitos verificadores conferidos — e não era chamado de lugar
  // nenhum. O mesmo com a chave da NF-e e o CNPJ do emitente. Aqui os dois
  // parsers exatos entram no caminho, e um DV que não confere NÃO substitui
  // nada: um dígito lido errado produz um valor plausível e falso, que é pior
  // que o palpite honesto do OCR (medido na guarda: 1.234,57 no lugar de
  // 1.234,56, com confiança 1).
  const refinado = refinarDocumento({
    valor: ex.valor != null ? Number(ex.valor) : null,
    vencimento: (ex.vencimento as string) ?? null,
    cnpj: (ex.cnpj as string) ?? null,
    linhaDigitavel: (ex.linhaDigitavel as string) ?? null,
    chaveNFe: (ex.chaveNFe as string) ?? null,
    confianca: typeof ex.confianca === "number" ? ex.confianca : confDefault,
  });
  return {
    tipo: (ex.tipo as string) || "Documento",
    beneficiario: (ex.beneficiario as string) ?? null,
    pagador: (ex.pagador as string) ?? null,
    valor: refinado.valor.valor,
    data: (ex.data as string) ?? null,
    vencimento: refinado.vencimento.valor ?? ((ex.vencimento as string) ?? null),
    cnpj: refinado.cnpj.valor,
    cpf: (ex.cpf as string) ?? null,
    acaoTipo: (ex.acaoTipo as DocFields["acaoTipo"]) ?? null,
    acao: (ex.acao as string) ?? null,
    categoria: (ex.categoria as string) ?? null,
    // ⚠️ A confiança do CONJUNTO é a do campo mais fraco, não a média: média
    // esconde um campo ruim atrás de três bons, e é o ruim que vira lançamento.
    confianca: refinado.confiancaGeral > 0
      ? refinado.confiancaGeral
      : (typeof ex.confianca === "number" ? ex.confianca : confDefault),
  };
}

/** Reduz a imagem (max 1600px, JPEG) p/ caber no POST; ou base64 cru. */
async function lerArquivo(file: File, downscale: boolean): Promise<{ data: string; mediaType: string }> {
  if (downscale) {
    try {
      const url = URL.createObjectURL(file);
      const img = await new Promise<HTMLImageElement>((res, rej) => {
        const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url;
      });
      const max = 1600;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      c.getContext("2d")?.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      return { data: c.toDataURL("image/jpeg", 0.82), mediaType: "image/jpeg" };
    } catch { /* cai no FileReader */ }
  }
  const data: string = await new Promise((res, rej) => {
    const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(file);
  });
  return { data, mediaType: file.type || "application/octet-stream" };
}

export async function lerDocumento(
  file: File,
  ocrOn: boolean,
  onEtapa?: (e: EtapaLeitura) => void,
): Promise<LeituraDocumento> {
  const isText = /\.(ofx|csv|txt)$/i.test(file.name);
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  const isImg = /^image\//.test(file.type) || /\.(png|jpe?g|webp)$/i.test(file.name);

  try {
    if (isText) {
      const texto = await file.text();
      return { kind: "bulk", report: analisarImportacao(texto), texto };
    }
    // ⚠️ **PDF COM CAMADA DE TEXTO É LOTE, NÃO DOCUMENTO.** Antes, TODO PDF caía
    // no OCR e virava UM lançamento: um extrato de 200 transações entrava como
    // uma linha só, e o `ocrLocalPdf` ainda por cima lê apenas a 1ª página.
    // Aqui a tabela é reconstruída da camada de texto e segue pelo pipeline que
    // já existe (o mesmo do .xlsx) — sem caminho próprio que divirja depois.
    if (isPdf) {
      // ⚠️ Falha de leitura NÃO derruba o upload: cai no OCR, que é o caminho
      // que já existia. Um PDF protegido ou corrompido continua tendo chance.
      const itens: ItemPdf[] = await itensDoPdf(file).catch(() => []);
      if (temCamadaDeTexto(itens)) {
        const csv = csvDeLinhas(agruparEmLinhas(itens));
        if (csv.trim()) {
          const report = analisarImportacao(csv);
          // ⚠️ **Ter texto não é ser extrato.** Um boleto em PDF tem camada de
          // texto e nenhuma tabela de lançamentos: o parser devolve zero linhas
          // e o arquivo segue para o OCR, que é quem sabe ler um documento.
          // Sem esta condição, o boleto viraria um lote vazio "bem-sucedido".
          if (report.records.length > 0) return { kind: "bulk", report, texto: csv };
        }
      }
    }
    // ⚠️ **PDF ESCANEADO PODE SER EXTRATO.** Sem camada de texto (ou com um
    // layout que a reconstrução não entende), ele ia direto ao OCR de
    // DOCUMENTO e virava UM lançamento — um extrato de 40 linhas lido como
    // "Documento, R$ 0". Agora a IA lê página a página; se a 1ª não for lista
    // de lançamentos, o arquivo segue como documento, como antes.
    if (isPdf && ocrOn) {
      const pdf = await paginasDoPdf(file).catch(() => null);
      if (pdf && pdf.total > 0) {
        const lido = await extratoPorIA(pdf.imagem, pdf.total, onEtapa);
        if (lido) return { kind: "bulk", ...lido };
      }
    }
    if ((isImg || isPdf) && ocrOn) {
      // OCR por IA (visão do Claude).
      const { data, mediaType } = await lerArquivo(file, isImg && !isPdf);
      const r = await fetch("/api/inbox/ocr", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileBase64: data, mediaType: isPdf ? "application/pdf" : mediaType }),
      }).then((x) => x.json());
      if (r.ok && r.doc) {
        // A FOTO de um extrato ou de uma fatura também é lista de lançamentos:
        // lida como documento, a página inteira viraria um lançamento só.
        if (isImg && /extrato|fatura/i.test(String(r.doc.tipo ?? ""))) {
          const lido = await extratoPorIA(async () => data, 1, onEtapa);
          if (lido) return { kind: "bulk", ...lido };
        }
        return { kind: "doc", fields: fieldsFrom(r.doc), modo: "ia" };
      }
      // Falhou a IA → tenta local.
    }
    if (isImg || isPdf) {
      const ex = isPdf ? await ocrLocalPdf(file) : await ocrLocalImagem(file);
      return { kind: "doc", fields: fieldsFrom(ex as unknown as Record<string, unknown>, ex.confianca), modo: "local" };
    }
    return { kind: "erro", motivo: "Formato não suportado para leitura automática." };
  } catch (e) {
    return { kind: "erro", motivo: e instanceof Error ? e.message : "Falha ao ler o documento." };
  }
}
