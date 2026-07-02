import { NextResponse } from "next/server";

/**
 * Assistente conversacional sobre o RAZÃO (Fase 6) — SERVER-ONLY.
 * Recebe a pergunta + um CONTEXTO numérico do GL (não o banco cru) e responde
 * (leitura) citando os números; pode propor um RASCUNHO de lançamento balanceado
 * (nunca posta — a UI exige aprovação humana). Gated por ANTHROPIC_API_KEY.
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

  const body = (await req.json().catch(() => ({}))) as { pergunta?: string; contexto?: unknown };
  const pergunta = (body.pergunta || "").slice(0, 2000);
  if (!pergunta) return NextResponse.json({ ok: false, reason: "pergunta vazia" });

  const prompt = `Você é o assistente financeiro do all4pay, operando SOBRE O RAZÃO (general ledger) de dupla entrada.
Você recebe um CONTEXTO numérico já filtrado (não o banco cru). Responda em pt-BR, citando os números do contexto. Seja conciso e objetivo.

Se — e somente se — o usuário pedir para CRIAR/RASCUNHAR um lançamento, proponha um rascunho BALANCEADO (∑débito = ∑crédito) usando SOMENTE os "code" do plano de contas do contexto. NUNCA afirme que postou — o rascunho depende de aprovação humana.

CONTEXTO (JSON):
${JSON.stringify(body.contexto).slice(0, 12000)}

PERGUNTA: ${pergunta}

Responda APENAS JSON, sem markdown:
{
  "resposta": string,
  "fontes": string[],            // números/contas do contexto que embasam a resposta
  "rascunho": null | { "entryDate": "YYYY-MM-DD", "description": string, "lines": [{"accountId": string, "debit"?: number, "credit"?: number}] }
}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 1200, messages: [{ role: "user", content: [{ type: "text", text: prompt }] }] }),
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
    if (!out) return NextResponse.json({ ok: false, reason: "resposta não estruturada", detalhe: limpo.slice(0, 200) });
    return NextResponse.json({ ok: true, ...(out as object), model: MODEL });
  } catch (e) {
    return NextResponse.json({ ok: false, reason: e instanceof Error ? e.message : "erro de rede" });
  }
}
