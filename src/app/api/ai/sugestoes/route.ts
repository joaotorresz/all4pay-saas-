import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isDemo } from "@/lib/demo";

/**
 * A ordem das sugestões da caixa da Quattro AI na Home (etapa 2) — SERVER-ONLY.
 * Recebe os SINAIS da Home (`contextoParaIA`) e as candidatas que as regras já
 * deixaram de pé (`candidatasParaIA`) e devolve até quatro ids, na ordem.
 *
 * ⚠️ A IA só ESCOLHE entre as candidatas: o id que não veio na lista é
 * descartado aqui, e o cliente ainda valida tudo de novo contra o catálogo
 * (`recomendarSugestoes`). Sem chave, com erro ou com resposta torta, a Home
 * fica com a ordem das regras — a falha é silenciosa para quem usa, de
 * propósito: a ordem de quatro perguntas não vale um aviso na tela.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
const QUANTAS = 4;
const TETO_CANDIDATAS = 20;

type Candidata = { id: string; texto: string; tema: string; motivo: string };

export async function POST(req: Request) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json({ ok: false, reason: "sem_chave" });

  // `/api` é público no middleware: sem esta porta, qualquer um gastaria a
  // chave da IA chamando a rota em laço. Em demonstração não há sessão.
  if (!isDemo) {
    const { data: auth } = await createClient().auth.getUser();
    if (!auth?.user) return NextResponse.json({ ok: false, reason: "sem_sessao" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { contexto?: unknown; candidatas?: unknown };
  const candidatas: Candidata[] = (Array.isArray(body.candidatas) ? body.candidatas : [])
    .filter((c): c is Candidata =>
      !!c && typeof (c as Candidata).id === "string" && typeof (c as Candidata).texto === "string")
    .slice(0, TETO_CANDIDATAS)
    .map((c) => ({
      id: c.id.slice(0, 40),
      texto: c.texto.slice(0, 160),
      tema: String(c.tema ?? "").slice(0, 30),
      motivo: String(c.motivo ?? "").slice(0, 160),
    }));
  if (candidatas.length === 0) return NextResponse.json({ ok: false, reason: "sem_candidatas" });

  const system = `Você escolhe quais perguntas a Quattro AI sugere na tela inicial de um ERP financeiro, para ESTA empresa, HOJE.

Escolha ${QUANTAS} perguntas da lista CANDIDATAS, na ordem do que mais ajuda a pessoa agora.

Critérios, nesta ordem:
1. Urgência nos números: caixa negativo, runway curto, valores vencidos, pendências acumuladas, fechamento do mês em aberto nos primeiros dias.
2. As prioridades que a pessoa marcou ("prioridades") e o que ela costuma perguntar ("cliques").
3. O perfil do onboarding (setor, modelo, de onde vem a receita, despesas típicas).
4. Variedade: não escolha duas perguntas que digam a mesma coisa.

Regras:
- Use SOMENTE ids da lista CANDIDATAS. Nunca invente id nem reescreva pergunta.
- Campo null é dado AUSENTE, não zero: não conclua nada a partir dele.
- Responda APENAS com JSON, sem markdown: {"ids": ["id1", "id2", "id3", "id4"]}

CONTEXTO (JSON):
${JSON.stringify(body.contexto ?? {}).slice(0, 4000)}

CANDIDATAS (JSON):
${JSON.stringify(candidatas)}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 200,
        system,
        messages: [{ role: "user", content: "Quais quatro perguntas, em ordem?" }],
      }),
    });
    if (!res.ok) return NextResponse.json({ ok: false, reason: `anthropic_${res.status}` });
    const j = await res.json();
    const texto: string = (j.content ?? [])
      .filter((c: { type: string }) => c.type === "text")
      .map((c: { text: string }) => c.text)
      .join("\n");
    const m = texto.replace(/```json|```/g, "").match(/\{[\s\S]*\}/);
    const out = m ? (JSON.parse(m[0]) as { ids?: unknown }) : null;
    const validos = new Set(candidatas.map((c) => c.id));
    const ids = (Array.isArray(out?.ids) ? out.ids : [])
      .filter((id): id is string => typeof id === "string" && validos.has(id))
      .filter((id, i, a) => a.indexOf(id) === i)
      .slice(0, QUANTAS);
    if (ids.length === 0) return NextResponse.json({ ok: false, reason: "sem_ids_validos" });
    return NextResponse.json({ ok: true, ids });
  } catch {
    return NextResponse.json({ ok: false, reason: "erro" });
  }
}
