import { NextResponse } from "next/server";

/**
 * Provisões / accruals sugeridos por IA (competência) — SERVER-ONLY. Recebe os
 * candidatos (despesas recorrentes ainda não lançadas no mês) com a média e o
 * histórico, e a IA decide quais provisionar, o valor e o porquê. O detector
 * determinístico (`sugerirAccruals`) é o fallback. Gated por ANTHROPIC_API_KEY.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

interface Cand { categoria: string; valor: number; mesesPresentes: number }

export function GET() {
  return NextResponse.json({ configured: !!process.env.ANTHROPIC_API_KEY, model: MODEL });
}

export async function POST(req: Request) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json({ ok: false, reason: "sem ANTHROPIC_API_KEY" });

  const body = (await req.json().catch(() => ({}))) as { mes?: string; candidatos?: Cand[] };
  const cands = (body.candidatos ?? []).slice(0, 40);
  if (!cands.length) return NextResponse.json({ ok: false, reason: "sem candidatos" });

  const prompt = `Você é um contador (regime de competência). Recebe despesas RECORRENTES que ainda NÃO foram lançadas no mês ${body.mes ?? "corrente"}, com a média mensal e em quantos meses recentes apareceram.
Para cada uma, decida se vale PROVISIONAR neste mês (accrual): "provisionar": true/false; "valor" sugerido (normalmente a média; ajuste se houver razão clara); "motivo" curto em pt-BR.
Seja conservador: só provisione o que é claramente recorrente e esperado.

CANDIDATOS (JSON): ${JSON.stringify(cands)}

Responda APENAS JSON, sem markdown:
[{"categoria": string, "provisionar": boolean, "valor": number, "motivo": string}]`;

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
    let sugestoes: unknown;
    try { sugestoes = JSON.parse(limpo); }
    catch { const m = limpo.match(/\[[\s\S]*\]/); sugestoes = m ? JSON.parse(m[0]) : null; }
    if (!Array.isArray(sugestoes)) return NextResponse.json({ ok: false, reason: "resposta não estruturada" });
    return NextResponse.json({ ok: true, sugestoes, model: MODEL });
  } catch (e) {
    return NextResponse.json({ ok: false, reason: e instanceof Error ? e.message : "erro de rede" });
  }
}
