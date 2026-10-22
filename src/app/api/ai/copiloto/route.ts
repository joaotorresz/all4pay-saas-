import { NextResponse } from "next/server";
import { MODELO_CLAUDE, SAIDA_CLAUDE } from "@/lib/ia/claude";
import { GRAFICOS_DA_IA } from "@/core/assistant/engine";
import { telasParaPrompt } from "@/core/assistant/acoes";

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

const MODEL = MODELO_CLAUDE;

export function GET() {
  return NextResponse.json({ configured: !!process.env.ANTHROPIC_API_KEY, model: MODEL });
}

export async function POST(req: Request) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json({ ok: false, reason: "sem ANTHROPIC_API_KEY" });

  const body = (await req.json().catch(() => ({}))) as {
    pergunta?: string; contexto?: unknown; anomalias?: unknown; insights?: unknown;
    historico?: { q?: string; a?: string }[];
    base?: { resposta?: unknown; numeros?: unknown };
  };
  const pergunta = (body.pergunta || "").slice(0, 2000);
  if (!pergunta) return NextResponse.json({ ok: false, reason: "pergunta vazia" });
  // Memória de conversa: os últimos turnos entram como mensagens reais — assim
  // follow-ups ("e no mês passado?", "detalha esse cliente") mantêm o fio.
  const historico = (Array.isArray(body.historico) ? body.historico : [])
    .filter((h) => h && typeof h.q === "string" && typeof h.a === "string")
    .slice(-6)
    .map((h) => ({ q: String(h.q).slice(0, 1000), a: String(h.a).slice(0, 2000) }));

  // Modo REDAÇÃO: o motor nativo já calculou a resposta; aqui o Claude só a
  // reescreve no tom da Quattro AI. Os números da base são os ÚNICOS
  // permitidos, e o cliente confere isso de novo (`numerosInventados`).
  const base = body.base && typeof body.base.resposta === "string"
    ? { resposta: String(body.base.resposta).slice(0, 3000), numeros: Array.isArray(body.base.numeros) ? body.base.numeros.slice(0, 8) : [] }
    : null;

  const graficos = Object.entries(GRAFICOS_DA_IA).map(([id, d]) => `"${id}" (${d})`).join(", ");

  const tom = `Você é a Quattro AI, a assistente financeira desta empresa. Fala como uma pessoa de finanças experiente e gentil conversando com o dono pelo chat: humana, próxima e clara, como um bom contador explicaria a um amigo.

TOM E FORMATO (obrigatório):
- CURTO. No máximo 90 palavras no total. Uma frase de abertura que já responde a pergunta, e, se precisar, até 3 tópicos curtos (linhas começando com "- ").
- Fale com o dono por "você", em português do dia a dia, com frases naturais e completas. Pode começar com uma expressão leve ("Olha,", "Boa notícia:", "Vamos lá:") quando soar natural, sem exagero.
- O dono pode não ser do ramo financeiro. Na PRIMEIRA vez que usar um termo técnico (runway, burn, EBITDA, DRE, margem, inadimplência, competência, conciliação, MRR, churn, liquidez, capital de giro, ponto de equilíbrio…), explique em poucas palavras logo depois, entre parênteses ou com "ou seja". Prefira a palavra simples quando ela existir.
- Diga também o que o número significa para a empresa (é bom, é preocupante, o que fazer), não só o número.
- Coloque em **negrito** (markdown, dois asteriscos) os números que importam e o nome do cliente, categoria ou mês principal. Negrito em 2 a 4 trechos, nunca em frases inteiras.
- Sem emoji, sem clichê ("é importante monitorar", "fique atento", "de modo geral", "no cenário atual"). Nada de saudação longa nem de despedida.
- Valores em BRL no formato brasileiro.`;

  const system = base
    ? `${tom}

TAREFA: reescreva a RESPOSTA CALCULADA abaixo nesse tom, sem mudar o sentido.
- Use SOMENTE os números que aparecem na RESPOSTA CALCULADA ou nos DESTAQUES, escritos EXATAMENTE como lá (mesmos dígitos, mesmas casas). Não arredonde, não abrevie ("82 mil"), não some, não calcule nada novo.
- Não acrescente fato que não esteja lá. Explicar o que um termo quer dizer, sem número, é permitido e desejado.
- Se a RESPOSTA CALCULADA tiver uma lista ("- …"), mantenha TODOS os itens.

RESPOSTA CALCULADA:
${base.resposta}

DESTAQUES (JSON):
${JSON.stringify(base.numeros).slice(0, 2000)}

Responda SEMPRE apenas JSON, sem markdown em volta:
{ "resposta": string }`
    : `${tom}

REGRAS DE CONTEÚDO (obrigatórias):
- Toda frase carrega um número do CONTEXTO (R$, %, dias, meses) ou uma instrução concreta.
- Seja específico: nomeie o cliente, a categoria, a conta ou o mês do contexto.
- Não invente nada fora do CONTEXTO. Se faltar dado, diga qual falta e onde cadastrar.
- Número AUSENTE não é zero: com "runwayMeses" null, não escreva "runway de 0 meses" nem estime prazo — leia "runwayMotivo" ("sem_queima" = a empresa gerou caixa; "caixa_negativo" = o caixa já acabou).
- "probRuptura" é a chance de ruptura em 60 DIAS.
- Projeção fica no condicional ("no ritmo atual, …"), nunca como fato.
- O CONTEXTO traz "titulosAbertos" (o que está a pagar e a receber, vencido e dos próximos 30 dias, com vencimento, valor e contraparte) e "contas" (o saldo de cada conta). Pergunta sobre contas, boletos, vencimentos ou clientes se responde COM eles, listando os títulos. Nunca diga que não tem acesso a esses dados.

O SISTEMA: a pessoa usa o Quattro, um ERP financeiro. Quando faltar dado, nunca pare em "não há": diga o que lançar ou enviar e aponte a tela. As telas que você pode indicar (por id): ${telasParaPrompt()}.

GRÁFICO: se um gráfico ajuda a entender a resposta, escolha UM id desta lista (os dados vêm do sistema, não de você): ${graficos}. Senão, null.

CONTEXTO (JSON):
${JSON.stringify(body.contexto).slice(0, 16000)}

ANOMALIAS (JSON, pode estar vazio):
${JSON.stringify(body.anomalias ?? []).slice(0, 2500)}

INSIGHTS (JSON, pode estar vazio):
${JSON.stringify(body.insights ?? []).slice(0, 2500)}

As mensagens anteriores da conversa (se houver) servem para resolver referências ("esse cliente", "e no mês passado?"). A SUA resposta final deve ser SEMPRE apenas JSON, sem markdown em volta:
{
  "resposta": string,                       // curta, com **negrito**, até 3 tópicos "- "
  "fontes": string[],                       // motores/números do contexto usados
  "numeros": [{ "label": string, "valor": string }],  // 0-4 destaques (valor já formatado, ex.: "R$ 12.500" ou "4,2 meses")
  "grafico": string | null,                 // um id da lista de gráficos, ou null
  "acao": string | null,                    // 1 ação concreta sugerida, curta, ou null
  "telas": string[]                         // 0-2 ids da lista de telas onde a pessoa age sobre a resposta
}`;

  const messages = base ? [{ role: "user" as const, content: pergunta }] : [
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
      body: JSON.stringify({ model: MODEL, ...SAIDA_CLAUDE, system, messages }),
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
