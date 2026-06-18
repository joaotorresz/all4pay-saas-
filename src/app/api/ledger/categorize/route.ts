import { NextResponse } from "next/server";

/**
 * Categorização de transações no plano de contas pela IA (Claude) — SERVER-ONLY.
 * Reforça a camada de regras nas transações de baixa confiança. Gated por
 * ANTHROPIC_API_KEY (sem chave → configured:false; o cliente fica nas regras).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

interface Conta { code: string; name: string; type: string }
interface Tx { id: string; descricao: string; valor: number; tipo: "entrada" | "saida" }

export function GET() {
  return NextResponse.json({ configured: !!process.env.ANTHROPIC_API_KEY, model: MODEL });
}

export async function POST(req: Request) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json({ ok: false, reason: "sem ANTHROPIC_API_KEY" });

  const body = (await req.json().catch(() => ({}))) as { transactions?: Tx[]; accounts?: Conta[] };
  const txs = (body.transactions ?? []).slice(0, 60);
  const accounts = body.accounts ?? [];
  if (!txs.length || !accounts.length) return NextResponse.json({ ok: false, reason: "payload incompleto" });

  const prompt = `Você é um contador que classifica transações no plano de contas brasileiro.
CONTAS (code · name · type):
${accounts.map((a) => `${a.code} · ${a.name} · ${a.type}`).join("\n")}

REGRAS:
- Para transação tipo "entrada" escolha uma conta type "revenue".
- Para transação tipo "saida" escolha uma conta type "expense".
- Use o code EXATO de uma das contas acima.

TRANSAÇÕES (JSON): ${JSON.stringify(txs)}

Responda APENAS JSON, sem markdown, no formato:
[{"id": string, "code": string, "confianca": number}]  // confianca 0..1`;

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
    let categorias: unknown;
    try { categorias = JSON.parse(limpo); }
    catch { const m = limpo.match(/\[[\s\S]*\]/); categorias = m ? JSON.parse(m[0]) : null; }
    if (!Array.isArray(categorias)) return NextResponse.json({ ok: false, reason: "resposta não estruturada" });
    return NextResponse.json({ ok: true, categorias, model: MODEL });
  } catch (e) {
    return NextResponse.json({ ok: false, reason: e instanceof Error ? e.message : "erro de rede" });
  }
}
