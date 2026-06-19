import { NextResponse } from "next/server";

/**
 * Copiloto financeiro "Ember-style" (Campfire) — SERVER-ONLY. Recebe o CONTEXTO
 * numérico estruturado da empresa (do centroInteligencia: saldo, runway, burn,
 * inadimplência, concentração, score, anomalias, insights — NÃO o banco cru) e
 * responde em linguagem natural ANCORADO nesses números, citando fontes e
 * sugerindo uma ação. Determinístico (`copilotoFinanceiro`) é o fallback no
 * cliente quando não há ANTHROPIC_API_KEY. Gated por chave.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

export function GET() {
  return NextResponse.json({ configured: !!process.env.ANTHROPIC_API_KEY, model: MODEL });
}

export async function POST(req: Request) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json({ ok: false, reason: "sem ANTHROPIC_API_KEY" });

  const body = (await req.json().catch(() => ({}))) as { pergunta?: string; contexto?: unknown; anomalias?: unknown; insights?: unknown };
  const pergunta = (body.pergunta || "").slice(0, 2000);
  if (!pergunta) return NextResponse.json({ ok: false, reason: "pergunta vazia" });

  const prompt = `Você é o copiloto financeiro do all4pay — opera como analista + FP&A + tesouraria de um CFO.
Você recebe um CONTEXTO numérico já calculado (não o banco cru). Responda em pt-BR, objetivo e direto ao ponto, SEMPRE citando os números do contexto que embasam a resposta. Use o tom de um operador financeiro experiente (sóbrio, confiante), nunca genérico. Valores em BRL (R$).
Quando relevante, conecte a resposta a riscos/anomalias do contexto e sugira UMA ação concreta e priorizada. Não invente números fora do contexto; se faltar dado, diga o que falta.

CONTEXTO (JSON):
${JSON.stringify(body.contexto).slice(0, 9000)}

ANOMALIAS (JSON, pode estar vazio):
${JSON.stringify(body.anomalias ?? []).slice(0, 2500)}

INSIGHTS (JSON, pode estar vazio):
${JSON.stringify(body.insights ?? []).slice(0, 2500)}

PERGUNTA: ${pergunta}

Responda APENAS JSON, sem markdown:
{
  "resposta": string,                       // 1-4 frases, com os números citados
  "fontes": string[],                       // motores/números do contexto usados
  "numeros": [{ "label": string, "valor": string }],  // 0-4 destaques (valor já formatado, ex.: "R$ 12.500" ou "4,2 meses")
  "acao": string | null                     // 1 ação concreta sugerida, ou null
}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 1000, messages: [{ role: "user", content: [{ type: "text", text: prompt }] }] }),
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
