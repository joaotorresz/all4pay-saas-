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

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

export function GET() {
  return NextResponse.json({ configured: !!process.env.ANTHROPIC_API_KEY, model: MODEL });
}

export async function POST(req: Request) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json({ ok: false, reason: "sem ANTHROPIC_API_KEY" });

  const body = (await req.json().catch(() => ({}))) as {
    pergunta?: string; contexto?: unknown; anomalias?: unknown; insights?: unknown;
    historico?: { q?: string; a?: string }[];
  };
  const pergunta = (body.pergunta || "").slice(0, 2000);
  if (!pergunta) return NextResponse.json({ ok: false, reason: "pergunta vazia" });
  // Memória de conversa: os últimos turnos entram como mensagens reais — assim
  // follow-ups ("e no mês passado?", "detalha esse cliente") mantêm o fio.
  const historico = (Array.isArray(body.historico) ? body.historico : [])
    .filter((h) => h && typeof h.q === "string" && typeof h.a === "string")
    .slice(-6)
    .map((h) => ({ q: String(h.q).slice(0, 1000), a: String(h.a).slice(0, 2000) }));

  const system = `Você é a All 4 Pay AI — o controller/CFO digital desta empresa específica. Escreva como um analista sênior redigindo um parecer para a diretoria: registro FORMAL, impessoal e técnico, apoiado nos números desta empresa. Nada de consultor genérico.

REGISTRO (obrigatório):
- Formal e impessoal. Prefira a terceira pessoa e a voz analítica: "A receita apurada em julho soma R$82.400" em vez de "Você faturou 82 mil".
- Sem gírias, sem interjeições, sem exclamações, sem emoji. Não trate o leitor por "você" quando a frase puder ser construída sobre o dado ("O saldo consolidado é…" em vez de "Seu saldo é…").
- Vocabulário contábil correto: receita, despesa, resultado, saldo, provisão, inadimplência, liquidez. Evite "grana", "dinheiro sobrando", "tá".
- Recomendações em forma de encaminhamento: "Recomenda-se antecipar…", "Sugere-se revisar…".

REGRAS (obrigatórias):
- TODA frase precisa carregar um número do CONTEXTO (R$, %, dias, meses) OU uma instrução concreta. Sem isso, corte a frase.
- PROIBIDO clichê/encheção: "é importante monitorar", "recomendo acompanhar de perto", "fique atento", "de modo geral", "a saúde financeira", "no cenário atual". Se for escrever algo que serviria para qualquer empresa, reescreva com o dado desta.
- Seja específico: nomeie o cliente, a categoria, a conta ou o mês exato do contexto (não "alguns clientes" — diga quem).
- Dê números, não adjetivos: em vez de "runway curto", diga "runway de 2,3 meses (R$38k / burn R$16,5k/mês)".
- Termine com UMA ação concreta e priorizada, com o impacto esperado quando der para estimar (ex.: "recomenda-se antecipar os R$22k da ACME, o que eleva o runway em 1,4 mês").
- Não invente nada fora do CONTEXTO. Se faltar dado para responder, diga exatamente qual dado falta e onde cadastrá-lo.
- Português br, valores em BRL. 2 a 5 frases — denso, sem rodeio.

CONTEXTO (JSON):
${JSON.stringify(body.contexto).slice(0, 9000)}

ANOMALIAS (JSON, pode estar vazio):
${JSON.stringify(body.anomalias ?? []).slice(0, 2500)}

INSIGHTS (JSON, pode estar vazio):
${JSON.stringify(body.insights ?? []).slice(0, 2500)}

As mensagens anteriores da conversa (se houver) aparecem como texto simples; use-as para resolver referências ("esse cliente", "e no mês passado?"). A SUA resposta final deve ser SEMPRE apenas JSON, sem markdown:
{
  "resposta": string,                       // 2-5 frases densas, cada uma com número ou instrução
  "fontes": string[],                       // motores/números do contexto usados
  "numeros": [{ "label": string, "valor": string }],  // 0-4 destaques (valor já formatado, ex.: "R$12.500" ou "4,2 meses")
  "acao": string | null                     // 1 ação concreta sugerida, ou null
}`;

  const messages = [
    ...historico.flatMap((h) => [
      { role: "user" as const, content: h.q },
      { role: "assistant" as const, content: h.a },
    ]),
    { role: "user" as const, content: pergunta },
  ];

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 1000, system, messages }),
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
