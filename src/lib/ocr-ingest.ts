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
import { ocrLocalImagem, ocrLocalPdf, itensDoPdf, type DocExtraido } from "@/lib/ocr-local";
import type { DocFields } from "@/lib/upload-doc";
import type { FDIPReport } from "@/core/fdip/types";

export type LeituraDocumento =
  | { kind: "doc"; fields: DocFields; modo: "ia" | "local" }
  | { kind: "bulk"; report: FDIPReport }
  | { kind: "erro"; motivo: string };

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

export async function lerDocumento(file: File, ocrOn: boolean): Promise<LeituraDocumento> {
  const isText = /\.(ofx|csv|txt)$/i.test(file.name);
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  const isImg = /^image\//.test(file.type) || /\.(png|jpe?g|webp)$/i.test(file.name);

  try {
    if (isText) {
      const report = analisarImportacao(await file.text());
      return { kind: "bulk", report };
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
          if (report.records.length > 0) return { kind: "bulk", report };
        }
      }
    }
    if ((isImg || isPdf) && ocrOn) {
      // OCR por IA (visão do Claude).
      const { data, mediaType } = await lerArquivo(file, isImg && !isPdf);
      const r = await fetch("/api/inbox/ocr", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileBase64: data, mediaType: isPdf ? "application/pdf" : mediaType }),
      }).then((x) => x.json());
      if (r.ok && r.doc) return { kind: "doc", fields: fieldsFrom(r.doc), modo: "ia" };
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
