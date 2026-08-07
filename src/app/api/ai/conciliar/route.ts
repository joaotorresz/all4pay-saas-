import { NextResponse } from "next/server";

/**
 * Conciliação assistida por IA (Claude) — SERVER-ONLY. Recebe os pares AMBÍGUOS
 * (título previsto × transação do banco, confiança média do matching) e, para
 * cada um, decide se é o MESMO pagamento — recomendação + motivo curto. O
 * matching determinístico continua resolvendo os óbvios; a IA só desempata os
 * cinzentos. Gated por ANTHROPIC_API_KEY (sem chave → só o determinístico).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

interface Par {
  ofId: string; ofDesc: string; ofData: string;
  pendDesc: string; dueDate: string; valor: number; tipo: "entrada" | "saida"; confianca: number;
}

export function GET() {
  return NextResponse.json({ configured: !!process.env.ANTHROPIC_API_KEY, model: MODEL });
}

export async function POST(req: Request) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json({ ok: false, reason: "sem ANTHROPIC_API_KEY" });

  const body = (await req.json().catch(() => ({}))) as { pares?: Par[] };
  const pares = (body.pares ?? []).slice(0, 40);
  if (!pares.length) return NextResponse.json({ ok: false, reason: "sem pares" });

  const prompt = `Você concilia o caixa de uma PME brasileira. Para cada PAR (um TÍTULO previsto a receber/pagar × uma TRANSAÇÃO real do banco), decida se são o MESMO pagamento.
Considere: valor igual/próximo, datas próximas (vencimento × data no banco), e se as descrições/contrapartes batem. Seja conservador: na dúvida, "revisar".

Para cada par responda:
- recomendacao: "conciliar" (é o mesmo — pode dar baixa) | "revisar" (provável, confira) | "rejeitar" (não são o mesmo).
- confiancaIA: 0..1
- motivo: 1 frase curta em pt-BR citando o que pesou (valor/data/contraparte).

PARES (JSON): ${JSON.stringify(pares)}

Responda APENAS JSON, sem markdown:
[{"ofId": string, "recomendacao": "conciliar"|"revisar"|"rejeitar", "confiancaIA": number, "motivo": string}]`;

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
    let avaliacoes: unknown;
    try { avaliacoes = JSON.parse(limpo); }
    catch { const m = limpo.match(/\[[\s\S]*\]/); avaliacoes = m ? JSON.parse(m[0]) : null; }
    if (!Array.isArray(avaliacoes)) return NextResponse.json({ ok: false, reason: "resposta não estruturada" });
    return NextResponse.json({ ok: true, avaliacoes, model: MODEL });
  } catch (e) {
    return NextResponse.json({ ok: false, reason: e instanceof Error ? e.message : "erro de rede" });
  }
}
