import { NextResponse } from "next/server";

/**
 * Narrativa executiva por LLM (Claude) — SERVER-ONLY. Recebe o contexto numérico
 * + o briefing/insights/anomalias já calculados (determinísticos) e devolve a
 * PROSA: um resumo executivo ancorado nos números e uma releitura curta de cada
 * insight/anomalia. Os números/fatos seguem do motor (explicável); o LLM só dá a
 * "voz". Sem ANTHROPIC_API_KEY → configured:false e o cliente usa o texto do motor.
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

  const body = (await req.json().catch(() => ({}))) as { contexto?: unknown; briefing?: unknown; insights?: unknown; anomalias?: unknown };

  const prompt = `Você é a All4Pay IA — o CFO digital DESTA empresa. Escreva em pt-BR como um controller sênior que conhece estes números: afiado, com opinião, específico. Nunca genérico.

REGRAS (obrigatórias):
- TODA frase carrega um número do CONTEXTO (R$, %, dias, meses) ou uma instrução concreta.
- PROIBIDO clichê: "é importante monitorar", "fique atento", "de modo geral", "a saúde financeira", "no cenário atual". Se a frase serviria para qualquer empresa, reescreva com o dado desta.
- Nomeie o específico: o cliente, a categoria, a conta, o mês exato (não "alguns clientes" — diga quem/qual).
- Números, não adjetivos. Sem rodeio, sem encheção.

Tarefas:
1. "resumo": 2-3 frases de leitura executiva do dia — saldo, runway (em meses), o que está fora do padrão e O QUE FAZER primeiro, tudo com os números.
2. "insights": para CADA insight, reescreva a explicação em 1 frase específica e acionável (mantenha o mesmo "id").
3. "anomalias": idem para cada anomalia (mantenha o "id") — diga o desvio em R$/% e o provável motivo.

CONTEXTO (JSON): ${JSON.stringify(body.contexto).slice(0, 6000)}
BRIEFING (JSON): ${JSON.stringify(body.briefing).slice(0, 2500)}
INSIGHTS (JSON): ${JSON.stringify(body.insights ?? []).slice(0, 3000)}
ANOMALIAS (JSON): ${JSON.stringify(body.anomalias ?? []).slice(0, 2500)}

Responda APENAS JSON, sem markdown:
{
  "resumo": string,
  "insights": [{ "id": string, "texto": string }],
  "anomalias": [{ "id": string, "texto": string }]
}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 1400, messages: [{ role: "user", content: [{ type: "text", text: prompt }] }] }),
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
