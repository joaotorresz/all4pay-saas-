// Edge Function: own-webhook — receptor dos WebHooks da OWN/Agilli.
// Arquivo único, self-contained. verify_jwt = false (a OWN não manda JWT do
// Supabase; a proteção é Basic Auth e/ou segredo na URL).
//
// A regra que define o desenho: a OWN reentrega até receber 200 ou 204 e,
// esgotadas as tentativas, DESISTE do evento para sempre. Duas consequências:
//   1. Responder rápido vale mais que processar bem. Grava cru, responde 204,
//      processa depois. Um parser lento vira evento perdido.
//   2. Responder 200 para um payload que não conseguimos processar é melhor
//      que responder 500 — o evento fica salvo em own_webhook_eventos e pode
//      ser reprocessado por nós. Um 500 gasta uma das tentativas da OWN.
// Só devolvemos erro quando a autenticação falha ou o corpo não é JSON.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A4P-077 — a autenticação do webhook, endurecida no que NÃO depende da OWN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **O que continua sendo verdade, e é o P0:** sem assinatura do corpo, quem
 * tiver o segredo FORJA qualquer evento — uma transação, uma liquidação, um
 * cadastro. O `chaveIdempotencia` barra o replay de um payload IDÊNTICO (índice
 * único → 23505), mas não um evento novo e inventado. O conserto de verdade é
 * HMAC, e ele depende de a OWN assinar. Enquanto a resposta não vem, o caminho
 * está PRONTO e DESLIGADO abaixo (`OWN_WEBHOOK_HMAC_SECRET`).
 *
 * O que dá para fazer sem a OWN, e está feito:
 *   1. o segredo saiu da URL (query string vaza em log de acesso, proxy e
 *      Referer — é a pior das duas portas, e era a única sem cabeçalho);
 *   2. comparação em TEMPO CONSTANTE (a comparação de string curto-circuita no
 *      primeiro byte diferente, o que vaza o prefixo correto por tempo);
 *   3. limite de tentativas por origem, cobrado só de quem FALHA;
 *   4. o caminho HMAC pronto atrás de flag.
 */

/** Compara em tempo constante — o `===` de string vaza o prefixo por tempo. */
function igualEmTempoConstante(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  // ⚠️ O tamanho vaza de qualquer jeito (não dá para esconder sem padding), mas
  // o CONTEÚDO não pode: percorre o maior dos dois sempre, sem sair no meio.
  const n = Math.max(ea.length, eb.length);
  let dif = ea.length ^ eb.length;
  for (let i = 0; i < n; i++) dif |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return dif === 0;
}

/**
 * Tentativas FALHAS por origem, numa janela curta.
 *
 * ⚠️ **É por isolate, e isso está dito de propósito.** Deno Deploy roda vários
 * isolates, então quem distribuir a força bruta entre eles contorna. Não é a
 * defesa final — é o que encarece o ataque de UMA origem sem custar nada ao
 * tráfego legítimo, porque **só quem FALHA é contado**. A OWN autenticada nunca
 * toca neste mapa. A defesa final é o HMAC.
 */
const JANELA_MS = 60_000;
const MAX_FALHAS = 10;
const falhas = new Map<string, number[]>();

function origemBloqueada(ip: string): boolean {
  const agora = Date.now();
  const recentes = (falhas.get(ip) ?? []).filter((t) => agora - t < JANELA_MS);
  falhas.set(ip, recentes);
  return recentes.length >= MAX_FALHAS;
}

function registrarFalha(ip: string): void {
  const agora = Date.now();
  const recentes = (falhas.get(ip) ?? []).filter((t) => agora - t < JANELA_MS);
  recentes.push(agora);
  falhas.set(ip, recentes);
  // ⚠️ Sem teto, o mapa vira vazamento de memória sob ataque distribuído — o
  // remédio virando doença. 5.000 origens é folga larga para tráfego real.
  if (falhas.size > 5_000) falhas.clear();
}

/**
 * O caminho HMAC — PRONTO e DESLIGADO até a OWN confirmar que assina.
 *
 * ⚠️ Ele fica desligado por AUSÊNCIA de segredo, não por um booleano: um flag
 * separado poderia ser ligado sem que o segredo existisse, e aí toda entrega
 * seria recusada em produção. Sem `OWN_WEBHOOK_HMAC_SECRET` o corpo não é
 * verificado e a autenticação cai no Basic — o comportamento de hoje.
 */
async function assinaturaConfere(req: Request, corpo: string): Promise<boolean | null> {
  const segredo = Deno.env.get("OWN_WEBHOOK_HMAC_SECRET");
  if (!segredo) return null; // desligado: não opina
  const enviada = req.headers.get("x-own-signature") ?? "";
  const ts = req.headers.get("x-own-timestamp") ?? "";
  if (!enviada || !ts) return false;
  // ⚠️ Janela de replay: uma assinatura válida capturada não pode valer para
  // sempre. ±5 min cobre relógio dessincronizado sem virar eternidade.
  const idade = Math.abs(Date.now() - Number(ts) * 1000);
  if (!Number.isFinite(idade) || idade > 5 * 60_000) return false;
  const chave = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(segredo),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(`${ts}.${corpo}`));
  const hex = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return igualEmTempoConstante(hex, enviada.replace(/^sha256=/, ""));
}

function autenticado(req: Request): boolean {
  const basic = Deno.env.get("OWN_WEBHOOK_BASIC"); // "usuario:senha"
  if (basic) {
    const h = req.headers.get("authorization") ?? "";
    if (h.startsWith("Basic ")) {
      try { if (igualEmTempoConstante(atob(h.slice(6)), basic)) return true; } catch { /* header malformado */ }
    }
  }
  // ⚠️ **O `?secret=` FOI REMOVIDO (A4P-077).** Query string entra em log de
  // acesso, em proxy e em `Referer` — o segredo vazava para lugares que ninguém
  // audita, e bastava um print de URL. `OWN_WEBHOOK_SECRET` deixou de ser lido;
  // quem ainda o usa tem de migrar para o Basic (mesmo segredo, no cabeçalho).
  // Sem Basic configurado a função recusa tudo — de propósito.
  return false;
}

type Tipo = "transacao" | "liquidacao" | "cadastro" | "desconhecido";

function classificar(p: Record<string, unknown>): Tipo {
  if ("tipoTransacao" in p && "identificadorTransacao" in p) return "transacao";
  if ("lancamentoId" in p || "statusPagamento" in p) return "liquidacao";
  if ("protocoloCore" in p || p.tipo === "CREDENCIAMENTO") return "cadastro";
  return "desconhecido";
}

/**
 * Chave de idempotência. NÃO é o identificadorTransacao sozinho: a venda
 * confirmada e o estorno da mesma venda compartilham esse identificador, e
 * deduplicar por ele apagaria o estorno.
 */
async function chaveIdempotencia(tipo: Tipo, p: Record<string, unknown>): Promise<string> {
  const partes =
    tipo === "transacao" ? [p.identificadorTransacao, p.tipoTransacao, p.data, p.valor]
    : tipo === "liquidacao" ? [p.lancamentoId, p.statusPagamento, p.dataPagamentoReal, p.valor]
    : tipo === "cadastro" ? [p.protocoloCore, p.status, p.contrato, p.motivo]
    : [JSON.stringify(p)];
  const texto = `${tipo}|${partes.map((x) => String(x ?? "")).join("|")}`;
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// A OWN usa três formatos de data no mesmo produto. "06/01/2025 20:57:25" é
// 6 de janeiro, não 1 de junho — e "10/04/25" tem ano de dois dígitos.
function dataBr(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const m = v.trim().match(/^(\d{2})\/(\d{2})\/(\d{2,4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return /^\d{4}-\d{2}-\d{2}/.test(v) ? v : null;
  const [, d, mes, a, hh = "00", mm = "00", ss = "00"] = m;
  const ano = a.length === 2 ? `20${a}` : a;
  return `${ano}-${mes}-${d}T${hh}:${mm}:${ss}-03:00`;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const sn = (v: unknown): boolean | null =>
  v === "S" || v === "s" ? true : v === "N" || v === "n" ? false : null;
const dig = (v: unknown): string | null => {
  const s = String(v ?? "").replace(/\D/g, "");
  return s || null;
};

async function lojistaDe(db: SupabaseClient, doc: string | null) {
  if (!doc) return { id: null as string | null, org_id: null as string | null };
  const { data } = await db.from("own_lojistas").select("id, org_id").eq("doc_parceiro", doc).maybeSingle();
  return { id: data?.id ?? null, org_id: data?.org_id ?? null };
}

async function gravarTransacao(db: SupabaseClient, p: Record<string, unknown>) {
  const doc = dig(p.docParceiro);
  const { id: lojistaId, org_id } = await lojistaDe(db, doc);
  // Sem lojista cadastrado não há org_id — o evento fica no log, não vira
  // transação órfã. O job de reconciliação recupera depois do cadastro.
  if (!org_id) return { ok: false, motivo: `lojista ${doc} nao cadastrado em own_lojistas` };

  const { error } = await db.from("own_transacoes").upsert({
    org_id, lojista_id: lojistaId,
    identificador_transacao: String(p.identificadorTransacao),
    doc_parceiro: doc,
    cnpj_cliente: dig(p.cnpjCliente),
    data_transacao: dataBr(p.data),
    numero_serie: p.numeroSerie ?? null,
    terminal: p.terminal ?? null,
    valor: num(p.valor),
    quantidade_parcelas: num(p.quantidadeParcela) ?? 1,
    mdr: num(p.mdr),
    status_transacao: String(p.tipoTransacao ?? "").trim(),
    bandeira: p.bandeira ?? null,
    // "modalide" está escrito assim no payload da OWN. Aceitar os dois.
    modalidade: (p.modalidade ?? p.modalide ?? null) as string | null,
    numero_cartao: p.cartao ?? null,
    mcc: p.mcc ?? null,
    nome_portador: p.nomePortador ?? null,
    origem: "webhook",
    visto_em_webhook_em: new Date().toISOString(),
    raw: p,
  }, { onConflict: "org_id,identificador_transacao" });
  return error ? { ok: false, motivo: error.message } : { ok: true };
}

async function gravarLiquidacao(db: SupabaseClient, p: Record<string, unknown>) {
  const doc = dig(p.docParceiro);
  const { id: lojistaId, org_id } = await lojistaDe(db, doc);
  if (!org_id) return { ok: false, motivo: `lojista ${doc} nao cadastrado em own_lojistas` };

  const { error } = await db.from("own_liquidacoes").upsert({
    org_id, lojista_id: lojistaId,
    lancamento_id: num(p.lancamentoId),
    identificador_transacao: p.identificadorTransacao ? String(p.identificadorTransacao) : null,
    doc_parceiro: doc,
    codigo_cliente: dig(p.codigoCliente),
    numero_parcela: num(p.numeroParcela),
    numero_titulo: p.numeroTitulo != null ? String(p.numeroTitulo) : null,
    nsu_transacao: p.nsuTransacao ?? null,
    status_pagamento: p.statusPagamento ?? null,
    valor: num(p.valor), mdr: num(p.mdr),
    valor_antecipado: num(p.valorAntecipado),
    taxa_antecipacao: num(p.taxaAntecipacao),
    antecipada: sn(p.antecipada),
    data_pagamento_prevista: dataBr(p.dataPagamentoPrevista)?.slice(0, 10) ?? null,
    data_pagamento_real: dataBr(p.dataPagamentoReal)?.slice(0, 10) ?? null,
    origem: "webhook", raw: p,
  }, { onConflict: "org_id,lancamento_id" });
  return error ? { ok: false, motivo: error.message } : { ok: true };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { erro: "somente POST" });

  const origem = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "sem-ip";
  // ⚠️ O limite é cobrado ANTES de qualquer trabalho — inclusive antes de ler o
  // corpo. Um limite que só age depois de processar não protege de nada.
  if (origemBloqueada(origem)) return json(429, { erro: "muitas tentativas" });

  // ⚠️ O corpo é lido como TEXTO porque o HMAC assina os BYTES. Reserializar um
  // objeto já parseado muda espaços e ordem de chaves, e a assinatura passa a
  // não bater por um motivo que ninguém encontra olhando o payload.
  let bruto: string;
  try { bruto = await req.text(); } catch { return json(400, { erro: "corpo ilegivel" }); }

  // O HMAC, quando LIGADO, é a autoridade — ele prova que o corpo veio da OWN,
  // que é o que o Basic (segredo compartilhado) não consegue provar.
  const assinado = await assinaturaConfere(req, bruto);
  const passou = assinado === null ? autenticado(req) : assinado;
  if (!passou) {
    registrarFalha(origem);
    return json(401, { erro: "nao autorizado" });
  }

  let corpo: unknown;
  try { corpo = JSON.parse(bruto); } catch { return json(400, { erro: "corpo nao e JSON" }); }

  // O webhook de liquidações entrega um ARRAY. O de transação, um objeto.
  const eventos: Record<string, unknown>[] = Array.isArray(corpo)
    ? (corpo as Record<string, unknown>[]) : [corpo as Record<string, unknown>];

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const ip = origem === "sem-ip" ? null : origem;

  let gravados = 0, duplicados = 0;

  for (const p of eventos) {
    const tipo = classificar(p);
    const chave = await chaveIdempotencia(tipo, p);

    const ins = await db.from("own_webhook_eventos").insert({
      tipo, chave_idempotencia: chave, payload: p,
      identificador_transacao: p.identificadorTransacao ? String(p.identificadorTransacao) : null,
      doc_parceiro: dig(p.docParceiro), ip_origem: ip,
    }).select("id").single();

    if (ins.error) {
      // 23505 = já recebemos este evento. Reentrega da OWN, não é problema.
      if (ins.error.code === "23505") { duplicados++; continue; }
      console.error("insert evento", ins.error.message);
      continue; // 204 mesmo assim: o evento se perde aqui, o pull recupera.
    }
    gravados++;

    try {
      const r = tipo === "transacao" ? await gravarTransacao(db, p)
        : tipo === "liquidacao" ? await gravarLiquidacao(db, p)
        : { ok: true as const };
      await db.from("own_webhook_eventos").update({
        processado_em: r.ok ? new Date().toISOString() : null,
        erro: r.ok ? null : (r as { motivo: string }).motivo,
        tentativas: 1,
      }).eq("id", ins.data.id);
    } catch (e) {
      await db.from("own_webhook_eventos")
        .update({ erro: String((e as Error)?.message ?? e), tentativas: 1 })
        .eq("id", ins.data.id);
    }
  }

  console.log(`[own-webhook] ${eventos.length} evento(s): ${gravados} novos, ${duplicados} duplicados`);
  // 204 sem corpo: a OWN só quer saber que chegou.
  return new Response(null, { status: 204 });
});
