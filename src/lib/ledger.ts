/**
 * Razão (GL) — camada de persistência (Fase 1). Demo: store local derivado dos
 * movimentos (backfill) + postagem manual. Live: entities/ledger_accounts/
 * journal_entries/journal_lines no Supabase (migration 0010), com a invariante
 * D=C validada pelo trigger ao marcar `posted`. Idempotência por external_key
 * (`mov:<id>` no backfill).
 */
import { isDemo } from "@/lib/demo";
import { createClient } from "@/lib/supabase/client";
import { getRiscoInput } from "@/lib/data";
import {
  lancamentoDeMovimento, saldoPorNatureza, type LedgerEntryInput, type AccountType,
} from "@/core/ledger";
import { PLANO_PADRAO, CAIXA, contaDeMovimento, nomeConta, tipoConta } from "@/core/ledger/chart";
import { categorizarPorRegras, type Categorizacao, type TxParaCategorizar } from "@/core/ledger/categorize";

export interface RazaoLinha { conta: string; nome: string; tipo: AccountType; debito: number; credito: number }
export interface RazaoLancamento { id: string; data: string; descricao: string; origem: string; externalKey?: string; linhas: RazaoLinha[] }
export interface ContaBalancete { conta: string; nome: string; tipo: AccountType; debito: number; credito: number; saldo: number }

const KEY = "a4p_ledger";
const load = (): RazaoLancamento[] => {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) || "[]") as RazaoLancamento[]; } catch { return []; }
};
const save = (l: RazaoLancamento[]) => { if (typeof window !== "undefined") { try { localStorage.setItem(KEY, JSON.stringify(l)); } catch { /* ignore */ } } };

function entryToLanc(e: LedgerEntryInput, id: string): RazaoLancamento {
  return {
    id,
    data: e.entryDate,
    descricao: e.description ?? "Lançamento",
    origem: e.source ?? "manual",
    externalKey: e.externalKey,
    linhas: e.lines.map((l) => ({ conta: l.accountId, nome: nomeConta(l.accountId), tipo: tipoConta(l.accountId), debito: l.debit ?? 0, credito: l.credit ?? 0 })),
  };
}

/** Constrói lançamentos de dupla entrada a partir dos movimentos (ponte). */
async function lancamentosDosMovimentos(): Promise<LedgerEntryInput[]> {
  const input = await getRiscoInput();
  return input.movements
    .filter((m) => m.status !== "cancelado")
    .map((m) => lancamentoDeMovimento({
      tipo: m.type,
      valor: m.amount,
      data: (m.paid_date || m.due_date),
      contaCaixaId: CAIXA,
      contaResultadoId: contaDeMovimento(m),
      descricao: (m.party_id && input.partyNames?.[m.party_id]) || m.category || "Lançamento",
      externalKey: `mov:${m.id}`,
      dimensions: {
        ...(m.party_id ? { contraparte: input.partyNames?.[m.party_id] ?? m.party_id } : {}),
        ...(m.costCenter ? { centro: m.costCenter } : {}),
      },
    }));
}

export const PLANO = PLANO_PADRAO;

export async function getLedgerEntries(): Promise<RazaoLancamento[]> {
  if (isDemo) return load().sort((a, b) => b.data.localeCompare(a.data));
  const { data, error } = await createClient()
    .from("journal_entries")
    .select("id,entry_date,description,source,external_key,journal_lines(debit,credit,dimensions,ledger_accounts(code,name,type))")
    .eq("status", "posted")
    .order("entry_date", { ascending: false })
    .limit(500);
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    data: String(r.entry_date),
    descricao: String(r.description ?? "Lançamento"),
    origem: String(r.source ?? "manual"),
    externalKey: (r.external_key as string) ?? undefined,
    linhas: ((r.journal_lines ?? []) as Array<Record<string, unknown>>).map((l) => {
      const acc = (l.ledger_accounts ?? {}) as { code?: string; name?: string; type?: AccountType };
      return { conta: acc.code ?? "—", nome: acc.name ?? "—", tipo: (acc.type ?? "asset") as AccountType, debito: Number(l.debit ?? 0), credito: Number(l.credit ?? 0) };
    }),
  }));
}

export function balancete(entries: RazaoLancamento[]): ContaBalancete[] {
  const map = new Map<string, ContaBalancete>();
  for (const e of entries) {
    for (const l of e.linhas) {
      let c = map.get(l.conta);
      if (!c) { c = { conta: l.conta, nome: l.nome, tipo: l.tipo, debito: 0, credito: 0, saldo: 0 }; map.set(l.conta, c); }
      c.debito += l.debito; c.credito += l.credito;
    }
  }
  return Array.from(map.values())
    .map((c) => ({ ...c, saldo: saldoPorNatureza(c.tipo, c.debito, c.credito) }))
    .sort((a, b) => a.conta.localeCompare(b.conta));
}

/** Backfill: deriva o razão dos movimentos (idempotente por external_key). */
export async function backfillRazao(): Promise<number> {
  const entries = await lancamentosDosMovimentos();
  if (isDemo) {
    const existing = load();
    const keys = new Set(existing.map((x) => x.externalKey));
    const novos = entries.filter((e) => !keys.has(e.externalKey)).map((e) => entryToLanc(e, e.externalKey!));
    save([...existing, ...novos]);
    return novos.length;
  }
  await seedPlanoLive();
  return postarLiveLote(entries);
}

export function clearRazao(): void { if (typeof window !== "undefined") { try { localStorage.removeItem(KEY); } catch { /* ignore */ } } }

/** Postagem manual de um lançamento já balanceado (demo: store; live: GL). */
export async function postarLancamento(e: LedgerEntryInput): Promise<void> {
  if (isDemo) { save([entryToLanc(e, e.externalKey ?? `man:${Date.now()}`), ...load()]); return; }
  await seedPlanoLive();
  await postarLiveLote([e]);
}

/* ----------------------------- categorização (regras + IA) ----------------------------- */

async function iaConfigurada(): Promise<boolean> {
  try { const r = await fetch("/api/ledger/categorize"); return !!(await r.json())?.configured; } catch { return false; }
}

/** Categoriza um lote: regras para todos; Claude reforça as de baixa confiança (se houver chave). */
export async function categorizarLote(txs: TxParaCategorizar[]): Promise<Record<string, Categorizacao>> {
  const out: Record<string, Categorizacao> = {};
  for (const t of txs) out[t.id] = categorizarPorRegras(t);
  const baixa = txs.filter((t) => out[t.id].confianca < 0.7);
  if (baixa.length && (await iaConfigurada())) {
    try {
      const r = await fetch("/api/ledger/categorize", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ transactions: baixa, accounts: PLANO_PADRAO }),
      });
      const j = await r.json();
      if (j?.ok && Array.isArray(j.categorias)) {
        const valid = new Set(PLANO_PADRAO.map((c) => c.code));
        for (const c of j.categorias as Array<{ id?: string; code?: string; confianca?: number }>) {
          if (c?.id && c.code && valid.has(c.code)) out[c.id] = { id: c.id, code: c.code, confianca: Math.max(0.7, Number(c.confianca) || 0.8), motivo: "IA (Claude)" };
        }
      }
    } catch { /* mantém as regras */ }
  }
  return out;
}

/**
 * Ponte Open Finance → razão (live): transações do Pluggy (bank_transactions)
 * ainda não processadas → categorização (regras+IA) → lançamento de dupla
 * entrada postado (idempotente por external_key `pluggy:<txid>`) + raw_events.
 */
export async function ingerirOpenFinanceRazao(): Promise<{ lidas: number; postadas: number }> {
  if (isDemo) return { lidas: 0, postadas: 0 }; // Open Finance não existe em demo
  const s = createClient();
  const { data: txs, error } = await s
    .from("bank_transactions")
    .select("id,pluggy_transaction_id,amount,date,description")
    .order("date", { ascending: false })
    .limit(500);
  if (error) throw error;
  const linhas = (txs ?? []) as Array<{ id: string; pluggy_transaction_id: string; amount: number; date: string; description: string | null }>;
  if (!linhas.length) return { lidas: 0, postadas: 0 };

  // pula as já ingeridas (raw_events)
  const { data: jaProc } = await s.from("raw_events").select("external_id").eq("provider", "pluggy");
  const feitas = new Set(((jaProc ?? []) as Array<{ external_id: string }>).map((r) => r.external_id));
  const novas = linhas.filter((t) => !feitas.has(t.pluggy_transaction_id));
  if (!novas.length) return { lidas: linhas.length, postadas: 0 };

  const paraCat: TxParaCategorizar[] = novas.map((t) => ({
    id: t.pluggy_transaction_id,
    descricao: t.description ?? "",
    valor: Math.abs(Number(t.amount) || 0),
    tipo: Number(t.amount) >= 0 ? "entrada" : "saida",
  }));
  const cats = await categorizarLote(paraCat);

  const entries: LedgerEntryInput[] = novas.map((t) => {
    const tipo: "entrada" | "saida" = Number(t.amount) >= 0 ? "entrada" : "saida";
    const cat = cats[t.pluggy_transaction_id];
    return lancamentoDeMovimento({
      tipo, valor: Math.abs(Number(t.amount) || 0), data: t.date,
      contaCaixaId: CAIXA, contaResultadoId: cat.code,
      descricao: t.description ?? "Open Finance", externalKey: `pluggy:${t.pluggy_transaction_id}`,
    });
  });

  await seedPlanoLive();
  const postadas = await postarLiveLote(entries);
  // registra os eventos brutos (idempotente por unique org,provider,external_id)
  await s.from("raw_events").insert(
    novas.map((t) => ({ provider: "pluggy", external_id: t.pluggy_transaction_id, payload: { amount: t.amount, date: t.date, description: t.description } })),
  );
  return { lidas: linhas.length, postadas };
}

/* ----------------------------- live helpers ----------------------------- */

let entityCache: string | null = null;
let codeMapCache: Record<string, string> | null = null;

/** Garante 1 entidade + o plano de contas na org (live). Idempotente por code. */
async function seedPlanoLive(): Promise<{ entityId: string; codeMap: Record<string, string> }> {
  const s = createClient();
  if (!entityCache) {
    const { data: ents } = await s.from("entities").select("id").limit(1);
    entityCache = (ents?.[0] as { id?: string } | undefined)?.id ?? null;
    if (!entityCache) {
      const { data: novo, error } = await s.from("entities").insert({ name: "Empresa" }).select("id").maybeSingle();
      if (error) throw error;
      entityCache = (novo as { id: string }).id;
    }
  }
  const { data: contas } = await s.from("ledger_accounts").select("id,code").eq("entity_id", entityCache);
  const map: Record<string, string> = {};
  for (const c of (contas ?? []) as Array<{ id: string; code: string }>) map[c.code] = c.id;
  const faltam = PLANO_PADRAO.filter((p) => !map[p.code]);
  if (faltam.length) {
    const { data: criadas, error } = await s
      .from("ledger_accounts")
      .insert(faltam.map((p) => ({ entity_id: entityCache, code: p.code, name: p.name, type: p.type })))
      .select("id,code");
    if (error) throw error;
    for (const c of (criadas ?? []) as Array<{ id: string; code: string }>) map[c.code] = c.id;
  }
  codeMapCache = map;
  return { entityId: entityCache, codeMap: map };
}

/** Posta lançamentos no GL (insert draft → linhas → status posted dispara a invariante). */
async function postarLiveLote(entries: LedgerEntryInput[]): Promise<number> {
  const s = createClient();
  const { entityId, codeMap } = codeMapCache && entityCache
    ? { entityId: entityCache, codeMap: codeMapCache }
    : await seedPlanoLive();
  let n = 0;
  for (const e of entries) {
    // Idempotência: pula se external_key já existe.
    if (e.externalKey) {
      const { data: ja } = await s.from("journal_entries").select("id").eq("external_key", e.externalKey).maybeSingle();
      if (ja) continue;
    }
    const { data: cab, error: e1 } = await s.from("journal_entries")
      .insert({ entity_id: entityId, entry_date: e.entryDate, description: e.description, source: e.source ?? "manual", external_key: e.externalKey ?? null, status: "draft" })
      .select("id").maybeSingle();
    if (e1 || !cab) continue;
    const entryId = (cab as { id: string }).id;
    const linhas = e.lines.map((l) => ({ journal_entry_id: entryId, account_id: codeMap[l.accountId], debit: l.debit ?? 0, credit: l.credit ?? 0, dimensions: l.dimensions ?? {} }));
    const { error: e2 } = await s.from("journal_lines").insert(linhas);
    if (e2) { await s.from("journal_entries").delete().eq("id", entryId); continue; }
    const { error: e3 } = await s.from("journal_entries").update({ status: "posted", posted_at: new Date().toISOString() }).eq("id", entryId);
    if (e3) continue; // trigger rejeitou (desbalanceado) — não conta
    n++;
  }
  return n;
}
