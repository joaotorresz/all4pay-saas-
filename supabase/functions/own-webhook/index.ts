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

function autenticado(req: Request): boolean {
  const basic = Deno.env.get("OWN_WEBHOOK_BASIC"); // "usuario:senha"
  const segredo = Deno.env.get("OWN_WEBHOOK_SECRET");
  if (basic) {
    const h = req.headers.get("authorization") ?? "";
    if (h.startsWith("Basic ")) {
      try { if (atob(h.slice(6)) === basic) return true; } catch { /* header malformado */ }
    }
  }
  if (segredo && new URL(req.url).searchParams.get("secret") === segredo) return true;
  // Sem nenhum dos dois configurados a função recusa tudo — de propósito.
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
  if (!autenticado(req)) return json(401, { erro: "nao autorizado" });

  let corpo: unknown;
  try { corpo = await req.json(); } catch { return json(400, { erro: "corpo nao e JSON" }); }

  // O webhook de liquidações entrega um ARRAY. O de transação, um objeto.
  const eventos: Record<string, unknown>[] = Array.isArray(corpo)
    ? (corpo as Record<string, unknown>[]) : [corpo as Record<string, unknown>];

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

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
