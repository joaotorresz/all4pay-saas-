/**
 * OCR local (sem chave, sem servidor) — roda no NAVEGADOR via Tesseract.js (WASM).
 * Alternativa gratuita ao OCR de visão do Claude para imagens de boleto/comprovante/
 * nota. Transcreve o texto cru e um parser de heurísticas (regex pt-BR) monta os
 * campos estruturados no MESMO formato que a rota /api/inbox/ocr devolve.
 *
 * Trade-off honesto: precisão menor que a visão do Claude — não entende layout,
 * então datas/valores podem sair trocados. Por isso a confiança fica capada e o
 * documento entra como "revisão" para o operador confirmar no workbench.
 *
 * Só imagem (PNG/JPG/WebP). PDF precisaria rasterizar — fica para o Claude/manual.
 */

export interface CampoConf { campo: string; confianca: number }
export interface DocExtraido {
  tipo: string;
  beneficiario: string | null;
  pagador: string | null;
  valor: number | null;
  data: string | null;
  vencimento: string | null;
  cnpj: string | null;
  cpf: string | null;
  linhaDigitavel: string | null;
  codigoBarras: string | null;
  chavePix: string | null;
  banco: string | null;
  acaoTipo: "a_pagar" | "a_receber" | "entrada" | "baixa" | "transferencia" | "imposto" | null;
  acao: string | null;
  categoria: string | null;
  confianca: number;
  campos: CampoConf[];
}

const BANCOS = [
  "Itaú", "Itau", "Bradesco", "Santander", "Banco do Brasil", "Caixa",
  "Nubank", "Inter", "BTG", "Sicoob", "Sicredi", "Safra", "Banrisul",
  "Original", "C6", "PagBank", "Mercado Pago", "Stone", "PicPay",
];

/** "1.234,56" / "1234,56" / "R$590,00" → 1234.56 */
function parseBRL(raw: string): number | null {
  const limpo = raw.replace(/[^\d.,]/g, "");
  if (!limpo) return null;
  // pt-BR: ponto = milhar, vírgula = decimal.
  const norm = limpo.replace(/\./g, "").replace(",", ".");
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

/** dd/mm/aaaa | dd/mm/aa | aaaa-mm-dd → ISO yyyy-mm-dd */
function parseData(raw: string): string | null {
  const br = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (br) {
    const [, d, m, y] = br;
    const ano = y.length === 2 ? `20${y}` : y;
    return `${ano}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const iso = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  return null;
}

/**
 * Parser de heurísticas: do texto cru do OCR aos campos estruturados.
 * Cada campo carrega sua confiança (regex limpo = alta; só presença = média).
 */
export function extrairCampos(texto: string, confOcr: number): DocExtraido {
  const t = texto.replace(/ /g, " ");
  const linhas = t.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const baixo = t.toLowerCase();
  const campos: CampoConf[] = [];

  // --- Tipo ---
  let tipo = "Documento";
  let acaoTipo: DocExtraido["acaoTipo"] = "a_pagar";
  if (/boleto|linha digit|ficha de compensa/i.test(t)) { tipo = "Boleto"; acaoTipo = "a_pagar"; }
  else if (/pix/i.test(t)) { tipo = "Comprovante PIX"; acaoTipo = "entrada"; }
  else if (/nota fiscal|danfe|nfe|nf-e|nfs-e/i.test(t)) { tipo = "Nota fiscal"; acaoTipo = "a_pagar"; }
  else if (/darf|gps|gnre|gru/i.test(t)) { tipo = "Guia de imposto"; acaoTipo = "imposto"; }
  else if (/comprovante|transfer|ted|doc\b/i.test(t)) { tipo = "Comprovante"; acaoTipo = "entrada"; }
  else if (/recibo/i.test(t)) { tipo = "Recibo"; }

  // --- Valor: prioriza linha com "valor", senão o maior R$ encontrado ---
  let valor: number | null = null;
  const linhaValor = linhas.find((l) => /valor.*(documento|cobrado|total|pago|a pagar)/i.test(l) || /^valor[:\s]/i.test(l));
  if (linhaValor) {
    const m = linhaValor.match(/[\d.]+,\d{2}/);
    if (m) valor = parseBRL(m[0]);
  }
  if (valor == null) {
    const todos = Array.from(t.matchAll(/R?\$?\s*([\d.]+,\d{2})/g)).map((m) => parseBRL(m[1])).filter((n): n is number => n != null);
    if (todos.length) valor = Math.max(...todos);
  }
  if (valor != null) campos.push({ campo: "Valor", confianca: linhaValor ? 0.7 : 0.5 });

  // --- Vencimento e data ---
  let vencimento: string | null = null;
  const linhaVenc = linhas.find((l) => /vencimento|vence em|data de venc/i.test(l));
  if (linhaVenc) vencimento = parseData(linhaVenc);
  if (vencimento) campos.push({ campo: "Vencimento", confianca: 0.65 });

  let data: string | null = null;
  const linhaData = linhas.find((l) => /(data|emiss|documento|pagamento|opera)/i.test(l) && /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(l));
  if (linhaData) data = parseData(linhaData);
  if (!data) {
    const qualquer = t.match(/\d{1,2}\/\d{1,2}\/\d{2,4}/);
    if (qualquer) data = parseData(qualquer[0]);
  }
  if (data) campos.push({ campo: "Data", confianca: 0.55 });

  // --- CNPJ / CPF ---
  const cnpjM = t.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
  const cnpj = cnpjM ? cnpjM[0] : null;
  if (cnpj) campos.push({ campo: "CNPJ", confianca: 0.9 });
  const cpfM = !cnpj ? t.match(/\d{3}\.\d{3}\.\d{3}-\d{2}/) : null;
  const cpf = cpfM ? cpfM[0] : null;
  if (cpf) campos.push({ campo: "CPF", confianca: 0.9 });

  // --- Linha digitável (boleto): 47-48 dígitos, normalmente com pontos/espaços ---
  let linhaDigitavel: string | null = null;
  for (const l of linhas) {
    const so = l.replace(/[^\d]/g, "");
    if (so.length >= 44 && so.length <= 48 && /[\d.\s]{40,}/.test(l)) { linhaDigitavel = l.replace(/\s+/g, " ").trim(); break; }
  }
  if (linhaDigitavel) campos.push({ campo: "Linha digitável", confianca: 0.8 });

  // --- Chave PIX (heurística: e-mail, ou rótulo "chave") ---
  let chavePix: string | null = null;
  const pixLinha = linhas.find((l) => /chave\s*pix|chave[:\s]/i.test(l));
  if (pixLinha) {
    const email = pixLinha.match(/[\w.+-]+@[\w.-]+\.\w+/);
    chavePix = email ? email[0] : pixLinha.replace(/.*chave\s*(pix)?[:\s]*/i, "").trim() || null;
    if (chavePix) campos.push({ campo: "Chave PIX", confianca: 0.55 });
  }

  // --- Banco ---
  const banco = BANCOS.find((b) => new RegExp(`\\b${b}\\b`, "i").test(t)) ?? null;
  if (banco) campos.push({ campo: "Banco", confianca: 0.7 });

  // --- Beneficiário (heurística: linha após "beneficiário/cedente/favorecido") ---
  let beneficiario: string | null = null;
  const idxBenef = linhas.findIndex((l) => /benefici|cedente|favorecido|recebedor|raz[aã]o social/i.test(l));
  if (idxBenef >= 0) {
    const mesmaLinha = linhas[idxBenef].replace(/.*(benefici[aá]rio|cedente|favorecido|recebedor|raz[aã]o social)[:\s]*/i, "").trim();
    beneficiario = mesmaLinha.length > 2 ? mesmaLinha : (linhas[idxBenef + 1] || null);
    if (beneficiario) campos.push({ campo: "Beneficiário", confianca: 0.45 });
  }

  if (campos.length === 0) campos.push({ campo: "Texto lido", confianca: confOcr });

  // Confiança geral: média dos campos × qualidade do OCR, capada (sinaliza revisão).
  const mediaCampos = campos.reduce((s, c) => s + c.confianca, 0) / campos.length;
  const confianca = Math.min(0.82, Math.round(mediaCampos * confOcr * 100) / 100);

  return {
    tipo, beneficiario, pagador: null, valor, data, vencimento, cnpj, cpf,
    linhaDigitavel, codigoBarras: null, chavePix, banco, acaoTipo,
    acao: acaoTipo === "imposto" ? "Agendar pagamento de imposto" : acaoTipo === "entrada" ? "Confirmar recebimento" : "Revisar e classificar",
    categoria: null, confianca, campos,
  };
}

/**
 * Roda o OCR local sobre uma imagem (File) e devolve os campos estruturados.
 * Importa o Tesseract dinamicamente (só quando usado) — não pesa o bundle inicial.
 */
export async function ocrLocalImagem(file: File): Promise<DocExtraido> {
  const Tesseract = (await import("tesseract.js")).default;
  const { data } = await Tesseract.recognize(file, "por");
  const confOcr = Math.max(0.4, Math.min(1, (data.confidence ?? 60) / 100));
  return extrairCampos(data.text || "", confOcr);
}

/**
 * Rasteriza a 1ª página de um PDF num canvas (PNG) via pdf.js — import dinâmico,
 * worker do CDN na versão exata. Escala mirando ~2000px de largura para o OCR ler.
 * Retorna o canvas (que o Tesseract aceita direto).
 */
async function rasterizarPdf(file: File): Promise<HTMLCanvasElement> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const page = await pdf.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(3, Math.max(1.5, 2000 / base.width));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d indisponível");
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  return canvas;
}

/**
 * OCR local de um PDF: rasteriza a 1ª página → Tesseract → campos.
 * (Multipágina futuramente; a 1ª página cobre boleto/nota/comprovante.)
 */
export async function ocrLocalPdf(file: File): Promise<DocExtraido> {
  const canvas = await rasterizarPdf(file);
  const Tesseract = (await import("tesseract.js")).default;
  const { data } = await Tesseract.recognize(canvas, "por");
  const confOcr = Math.max(0.4, Math.min(1, (data.confidence ?? 60) / 100));
  return extrairCampos(data.text || "", confOcr);
}
