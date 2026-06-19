import { NextResponse } from "next/server";

/**
 * Cobrança adaptativa por IA (Claude) — SERVER-ONLY. Recebe os inadimplentes
 * (nome, valor em aberto, estratégia/tom da segmentação do all4pay) e devolve UMA
 * mensagem de WhatsApp por cliente, no tom certo (amigável/proativo/firme), em
 * pt-BR, sóbria e sem emoji. A segmentação é do motor; a IA só escreve a mensagem.
 * Gated por ANTHROPIC_API_KEY (sem chave → fallback template no cliente).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

interface Alvo { cliente: string; exposicao: number; estrategia?: string; tom?: string }

export function GET() {
  return NextResponse.json({ configured: !!process.env.ANTHROPIC_API_KEY, model: MODEL });
}

export async function POST(req: Request) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json({ ok: false, reason: "sem ANTHROPIC_API_KEY" });

  const body = (await req.json().catch(() => ({}))) as { alvos?: Alvo[] };
  const alvos = (body.alvos ?? []).slice(0, 40);
  if (!alvos.length) return NextResponse.json({ ok: false, reason: "sem alvos" });

  const prompt = `Você escreve mensagens de cobrança por WhatsApp para a empresa all4pay (B2B, pt-BR).
Para cada cliente, escreva UMA mensagem curta (1-3 frases), profissional, sóbria e SEM emoji, citando o valor em aberto (formato R$). Ajuste o tom pela estratégia:
- "amigavel": cordial, lembrete leve.
- "proativa": objetivo, propõe regularizar para evitar encargos.
- "agressiva_precoce": firme e direto, sem ser hostil; reforça urgência.
Comece com "all4pay ·". Não invente dados além do valor e do nome.

CLIENTES (JSON): ${JSON.stringify(alvos.map((a) => ({ cliente: a.cliente, valor: a.exposicao, estrategia: a.estrategia ?? "proativa" })))}

Responda APENAS JSON, sem markdown:
[{"cliente": string, "mensagem": string}]`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 1500, messages: [{ role: "user", content: [{ type: "text", text: prompt }] }] }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return NextResponse.json({ ok: false, reason: `falha Anthropic ${res.status}`, detalhe: t.slice(0, 200) });
    }
    const j = await res.json();
    const texto: string = (j.content ?? []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("\n");
    const limpo = texto.replace(/```json|```/g, "").trim();
    let mensagens: unknown;
    try { mensagens = JSON.parse(limpo); }
    catch { const m = limpo.match(/\[[\s\S]*\]/); mensagens = m ? JSON.parse(m[0]) : null; }
    if (!Array.isArray(mensagens)) return NextResponse.json({ ok: false, reason: "resposta não estruturada" });
    return NextResponse.json({ ok: true, mensagens, model: MODEL });
  } catch (e) {
    return NextResponse.json({ ok: false, reason: e instanceof Error ? e.message : "erro de rede" });
  }
}
