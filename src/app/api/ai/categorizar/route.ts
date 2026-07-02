import { NextResponse } from "next/server";

/**
 * Auto-categorização "Puzzlebot-style" (Puzzle) — SERVER-ONLY. Recebe transações
 * de baixa confiança da importação (FDIP) + o vocabulário de categorias e
 * devolve a melhor categoria por transação, com confiança. O cliente memoriza a
 * escolha (self-learning) e re-analisa → na próxima vez a regra já acerta.
 * Gated por ANTHROPIC_API_KEY (sem chave → configured:false; fica nas regras).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

interface Tx { id: string; descricao: string; valor: number; tipo: "entrada" | "saida" }

export function GET() {
  return NextResponse.json({ configured: !!process.env.ANTHROPIC_API_KEY, model: MODEL });
}

export async function POST(req: Request) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json({ ok: false, reason: "sem ANTHROPIC_API_KEY" });

  const body = (await req.json().catch(() => ({}))) as { transactions?: Tx[]; categoriasDespesa?: string[]; categoriasReceita?: string[] };
  const txs = (body.transactions ?? []).slice(0, 80);
  const cDesp = body.categoriasDespesa ?? [];
  const cRec = body.categoriasReceita ?? [];
  if (!txs.length || (!cDesp.length && !cRec.length)) return NextResponse.json({ ok: false, reason: "payload incompleto" });

  const prompt = `Você é um contador brasileiro que categoriza transações financeiras de uma PME.
Para cada transação, escolha a MELHOR categoria da lista do tipo correspondente. Use EXATAMENTE um dos rótulos fornecidos (não invente). Em dúvida, escolha "Outras despesas" (saída) ou "Vendas" (entrada).

CATEGORIAS DE DESPESA (para tipo "saida"): ${JSON.stringify(cDesp)}
CATEGORIAS DE RECEITA (para tipo "entrada"): ${JSON.stringify(cRec)}

TRANSAÇÕES (JSON): ${JSON.stringify(txs)}

Responda APENAS JSON, sem markdown:
[{"id": string, "categoria": string, "confianca": number}]  // confianca 0..1`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 1800, messages: [{ role: "user", content: [{ type: "text", text: prompt }] }] }),
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
