import { NextResponse } from "next/server";

/**
 * Document Intelligence (OCR real) — SERVER-ONLY.
 * Lê um documento financeiro (imagem ou PDF, base64) com a VISÃO do Claude
 * (Anthropic API) e devolve os campos estruturados + confiança por campo.
 * Gated por ANTHROPIC_API_KEY (sem a chave → ok:false, a UI cai no manual).
 *
 * Variáveis (Vercel, server-side):
 *   ANTHROPIC_API_KEY   — chave da Anthropic
 *   ANTHROPIC_MODEL     — opcional (default claude-sonnet-4-6)
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

const PROMPT = `Você é um extrator de documentos financeiros brasileiros (boleto, comprovante PIX/TED, nota fiscal, DARF/GPS/GNRE, fatura, extrato, recibo, contrato, folha).
Extraia os campos e responda APENAS com JSON válido, sem markdown, no formato exato:
{
 "tipo": string,                // ex.: "Boleto", "Comprovante PIX", "Nota fiscal", "DARF"
 "beneficiario": string|null,   // quem recebe
 "pagador": string|null,
 "valor": number|null,          // em reais, só o número (ex.: 590.00)
 "data": string|null,           // emissão/operação, ISO yyyy-mm-dd
 "vencimento": string|null,     // ISO yyyy-mm-dd
 "cnpj": string|null, "cpf": string|null,
 "linhaDigitavel": string|null, "codigoBarras": string|null, "chavePix": string|null,
 "banco": string|null,
 "acaoTipo": "a_pagar"|"a_receber"|"entrada"|"baixa"|"transferencia"|"imposto"|null,
 "acao": string|null,           // ex.: "Agendar pagamento", "Confirmar recebimento"
 "categoria": string|null,
 "confianca": number,           // 0..1 geral
 "campos": [{"campo": string, "confianca": number}]  // confiança 0..1 por campo extraído
}
Use null quando não encontrar. Não invente valores.`;

interface OcrReq { fileBase64?: string; mediaType?: string }

export function GET() {
  return NextResponse.json({ configured: !!process.env.ANTHROPIC_API_KEY, model: MODEL });
}

export async function POST(req: Request) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json({ ok: false, reason: "sem ANTHROPIC_API_KEY no servidor" });

  const body = (await req.json().catch(() => ({}))) as OcrReq;
  const data = (body.fileBase64 || "").replace(/^data:[^;]+;base64,/, "");
  const mediaType = body.mediaType || "image/jpeg";
  if (!data) return NextResponse.json({ ok: false, reason: "arquivo ausente" });

  // Bloco de conteúdo: imagem ou documento (PDF).
  const isPdf = mediaType === "application/pdf";
  const fileBlock = isPdf
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
    : { type: "image", source: { type: "base64", media_type: mediaType, data } };

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        messages: [{ role: "user", content: [fileBlock, { type: "text", text: PROMPT }] }],
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return NextResponse.json({ ok: false, reason: `falha Anthropic ${res.status}`, detalhe: t.slice(0, 200) });
    }
    const j = await res.json();
    const texto: string = (j.content ?? []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("\n");
    const limpo = texto.replace(/```json|```/g, "").trim();
    let extraido: unknown;
    try { extraido = JSON.parse(limpo); }
    catch {
      const m = limpo.match(/\{[\s\S]*\}/);
      extraido = m ? JSON.parse(m[0]) : null;
    }
    if (!extraido) return NextResponse.json({ ok: false, reason: "resposta não estruturada", detalhe: limpo.slice(0, 200) });
    return NextResponse.json({ ok: true, doc: extraido, model: MODEL });
  } catch (e) {
    return NextResponse.json({ ok: false, reason: e instanceof Error ? e.message : "erro de rede" });
  }
}
