import { NextResponse } from "next/server";

/**
 * Cronograma de reconhecimento de receita por IA (CPC 47 / IFRS 15) — SERVER-ONLY.
 * Recebe o contrato (cliente, total, modelo, vigência, descrição) e os períodos
 * mensais, e devolve o VALOR a apropriar em cada período conforme o modelo
 * (assinatura = linear; uso = conforme consumo estimado; milestone = por
 * entregas), com uma justificativa. A soma DEVE bater com o total. Gated por
 * ANTHROPIC_API_KEY (sem chave → o cliente usa o cronograma linear).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

export function GET() {
  return NextResponse.json({ configured: !!process.env.ANTHROPIC_API_KEY, model: MODEL });
}

export async function POST(req: Request) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json({ ok: false, reason: "sem ANTHROPIC_API_KEY" });

  const body = (await req.json().catch(() => ({}))) as { customer?: string; total?: number; model?: string; descricao?: string; periodos?: string[] };
  const total = Number(body.total ?? 0);
  const periodos = (body.periodos ?? []).slice(0, 60);
  if (!total || periodos.length === 0) return NextResponse.json({ ok: false, reason: "payload incompleto" });

  const prompt = `Você é um contador especialista em CPC 47 / IFRS 15 (reconhecimento de receita).
Dado um contrato e os períodos mensais de vigência, distribua o VALOR TOTAL a apropriar em cada período conforme o modelo:
- "subscription": linear (partes iguais ao longo da vigência).
- "usage": conforme consumo estimado (pode crescer/variar; ainda assim some o total).
- "milestone": concentrado em entregas (ex.: marcos no início/meio/fim).
A SOMA das parcelas DEVE ser exatamente ${total.toFixed(2)}. Não invente períodos fora da lista.

CONTRATO: ${JSON.stringify({ customer: body.customer ?? "", total, model: body.model ?? "subscription", descricao: body.descricao ?? "" })}
PERÍODOS (YYYY-MM-01): ${JSON.stringify(periodos)}

Responda APENAS JSON, sem markdown:
{ "parcelas": [{ "period": string, "amount": number }], "racional": string }`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 1600, messages: [{ role: "user", content: [{ type: "text", text: prompt }] }] }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return NextResponse.json({ ok: false, reason: `falha Anthropic ${res.status}`, detalhe: t.slice(0, 200) });
    }
    const j = await res.json();
    const texto: string = (j.content ?? []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("\n");
    const limpo = texto.replace(/```json|```/g, "").trim();
    let out: unknown;
    try { out = JSON.parse(limpo); } catch { const m = limpo.match(/\{[\s\S]*\}/); out = m ? JSON.parse(m[0]) : null; }
    if (!out) return NextResponse.json({ ok: false, reason: "resposta não estruturada" });
    return NextResponse.json({ ok: true, ...(out as object), model: MODEL });
  } catch (e) {
    return NextResponse.json({ ok: false, reason: e instanceof Error ? e.message : "erro de rede" });
  }
}
