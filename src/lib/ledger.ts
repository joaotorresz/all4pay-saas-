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
import {
  PLANO_PADRAO, CAIXA, lancamentosDeMovimentos, nomeConta, tipoConta,
} from "@/core/ledger/chart";
import { categorizarPorRegras, type Categorizacao, type TxParaCategorizar } from "@/core/ledger/categorize";

export interface RazaoLinha { conta: string; nome: string; tipo: AccountType; debito: number; credito: number; dimensions?: Record<string, string | number> }
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
    linhas: e.lines.map((l) => ({ conta: l.accountId, nome: nomeConta(l.accountId), tipo: tipoConta(l.accountId), debito: l.debit ?? 0, credito: l.credit ?? 0, dimensions: l.dimensions })),
  };
}

/** Constrói lançamentos de dupla entrada a partir dos movimentos (ponte). */
/**
 * Os lançamentos derivados dos movimentos.
 *
 * A regra vive em `core/ledger/chart.lancamentosDeMovimentos` (pura, testada
 * pela matriz de consistência); aqui só se busca o input. Antes a regra morava
 * nesta função e postava TODO movimento não cancelado no caixa — incluindo os
 * títulos em aberto, que é o que descolava o balancete do extrato.
 */
async function lancamentosDosMovimentos(): Promise<LedgerEntryInput[]> {
  const input = await getRiscoInput();
  return lancamentosDeMovimentos(input, (m) =>
    (m.party_id && input.partyNames?.[m.party_id]) || undefined);
}

export const PLANO = PLANO_PADRAO;

async function lerJournalLive(): Promise<RazaoLancamento[]> {
  const { data, error } = await createClient()
    .from("journal_entries")
    .select("id,entry_date,description,source,external_key,journal_lines(debit,credit,dimensions,ledger_accounts(code,name,type))")
    .eq("status", "posted")
    .order("entry_date", { ascending: false })
    .limit(1000);
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    data: String(r.entry_date),
    descricao: String(r.description ?? "Lançamento"),
    origem: String(r.source ?? "manual"),
    externalKey: (r.external_key as string) ?? undefined,
    linhas: ((r.journal_lines ?? []) as Array<Record<string, unknown>>).map((l) => {
      const acc = (l.ledger_accounts ?? {}) as { code?: string; name?: string; type?: AccountType };
      return { conta: acc.code ?? "—", nome: acc.name ?? "—", tipo: (acc.type ?? "asset") as AccountType, debito: Number(l.debit ?? 0), credito: Number(l.credit ?? 0), dimensions: (l.dimensions ?? {}) as Record<string, string | number> };
    }),
  }));
}

/**
 * Razão = PROJEÇÃO determinística dos movimentos (sempre em sincronia, sem
 * divergência) + lançamentos NATIVOS do GL (manual/cronograma/provisão/receita,
 * external_key sem prefixo `mov:`). Fonte de verdade única.
 */
export async function getLedgerEntries(): Promise<RazaoLancamento[]> {
  const derivados = (await lancamentosDosMovimentos()).map((e) => entryToLanc(e, e.externalKey!));
  const todosNativos = isDemo ? load() : await lerJournalLive();
  const nativos = todosNativos.filter((x) => !(x.externalKey ?? "").startsWith("mov:"));
  return [...derivados, ...nativos].sort((a, b) => b.data.localeCompare(a.data));
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

/* ----------------------------- assistente sobre o razão (Fase 6) ----------------------------- */

export interface ContextoRazao {
  de: string; ate: string;
  balanceado: boolean; totalDebito: number; totalCredito: number;
  receita: number; despesa: number; resultado: number;
  lancamentos: number;
  contas: { code: string; nome: string; tipo: AccountType; saldo: number }[];
  plano: { code: string; name: string; type: AccountType }[];
}

/** Contexto numérico do razão (últimos 12 meses) — o que o assistente recebe (não o banco cru). */
export async function contextoRazao(): Promise<ContextoRazao> {
  const entries = await getLedgerEntries();
  const ate = new Date().toISOString().slice(0, 10);
  const d = new Date(); d.setMonth(d.getMonth() - 11); d.setDate(1);
  const de = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  const bal = balancete(entries);
  const dre = dreDoRazao(entries, de, ate);
  const totalDebito = bal.reduce((s, c) => s + c.debito, 0);
  const totalCredito = bal.reduce((s, c) => s + c.credito, 0);
  return {
    de, ate,
    balanceado: Math.round((totalDebito - totalCredito) * 100) === 0,
    totalDebito, totalCredito,
    receita: dre.receita, despesa: dre.despesa, resultado: dre.resultado,
    lancamentos: entries.length,
    contas: bal.map((c) => ({ code: c.conta, nome: c.nome, tipo: c.tipo, saldo: c.saldo })),
    plano: PLANO_PADRAO.map((c) => ({ code: c.code, name: c.name, type: c.type })),
  };
}

/** Trilha de auditoria do assistente (demo + live) — delega ao logger do copiloto. */
export async function registrarAcaoIA(kind: string, prompt: string, result: unknown): Promise<void> {
  const r = (result ?? {}) as Record<string, unknown>;
  const detalhe = typeof r.resposta === "string" ? r.resposta : typeof r.description === "string" ? r.description : undefined;
  const { logAcaoIA } = await import("@/lib/ai-copilot");
  await logAcaoIA({ kind, titulo: prompt, detalhe, status: kind === "draft_entry" ? "executada" : "lida" });
}

const fmtBRL = (v: number) => "R$ " + Math.round(v).toLocaleString("pt-BR");

/** Resposta determinística (sem ANTHROPIC_API_KEY) — leitura básica do razão. */
export function responderBasico(pergunta: string, ctx: ContextoRazao): string {
  const p = pergunta.toLowerCase();
  if (/balanc|fecha|d[eé]bito|cr[eé]dito/.test(p))
    return ctx.balanceado ? "O razão está balanceado (débitos = créditos)." : "Atenção: o razão NÃO está balanceado.";
  if (/resultado|lucro|preju[ií]z/.test(p))
    return `Resultado do período: ${fmtBRL(ctx.resultado)} (receita ${fmtBRL(ctx.receita)} − despesa ${fmtBRL(ctx.despesa)}).`;
  if (/receita|faturamento|vend/.test(p)) return `Receita do período: ${fmtBRL(ctx.receita)}.`;
  if (/despesa|gasto|custo/.test(p)) {
    const maior = ctx.contas.filter((c) => c.tipo === "expense").sort((a, b) => b.saldo - a.saldo)[0];
    return `Despesa do período: ${fmtBRL(ctx.despesa)}.${maior ? ` Maior conta: ${maior.nome} (${fmtBRL(maior.saldo)}).` : ""}`;
  }
  if (/saldo|caixa|banco/.test(p)) {
    const caixa = ctx.contas.find((c) => c.code === "1.1.01");
    return caixa ? `Saldo de ${caixa.nome}: ${fmtBRL(caixa.saldo)}.` : "Ainda não há saldo de caixa no razão (faça o backfill).";
  }
  return "Modo básico: posso responder sobre resultado, receita, despesa, saldo de contas e se o razão está balanceado. Para conversa livre e rascunho de lançamentos, configure ANTHROPIC_API_KEY.";
}

/* ----------------------------- relatórios sobre o razão (Fase 2) ----------------------------- */

export interface ContaValor { conta: string; nome: string; valor: number }
export interface DRERazao { de: string; ate: string; receita: number; despesa: number; resultado: number; receitas: ContaValor[]; despesas: ContaValor[] }
export interface BalancoGrupo { titulo: string; total: number; contas: ContaValor[] }
export interface BalancoRazao { ate: string; ativo: number; passivoPL: number; fecha: boolean; grupos: BalancoGrupo[] }
export interface PivotRazaoLinha { chave: string; receita: number; despesa: number; resultado: number }

const noPeriodo = (e: RazaoLancamento, de: string, ate: string) => e.data >= de && e.data <= ate;

/** DRE gerencial direto do razão (contas de receita − despesa) no período. */
export function dreDoRazao(entries: RazaoLancamento[], de: string, ate: string): DRERazao {
  const acc = new Map<string, { nome: string; tipo: AccountType; deb: number; cred: number }>();
  for (const e of entries) {
    if (!noPeriodo(e, de, ate)) continue;
    for (const l of e.linhas) {
      if (l.tipo !== "revenue" && l.tipo !== "expense") continue;
      const a = acc.get(l.conta) ?? { nome: l.nome, tipo: l.tipo, deb: 0, cred: 0 };
      a.deb += l.debito; a.cred += l.credito; acc.set(l.conta, a);
    }
  }
  const receitas: ContaValor[] = [], despesas: ContaValor[] = [];
  for (const [conta, a] of Array.from(acc.entries())) {
    const valor = saldoPorNatureza(a.tipo, a.deb, a.cred);
    (a.tipo === "revenue" ? receitas : despesas).push({ conta, nome: a.nome, valor });
  }
  receitas.sort((x, y) => x.conta.localeCompare(y.conta));
  despesas.sort((x, y) => x.conta.localeCompare(y.conta));
  const receita = receitas.reduce((s, c) => s + c.valor, 0);
  const despesa = despesas.reduce((s, c) => s + c.valor, 0);
  return { de, ate, receita, despesa, resultado: receita - despesa, receitas, despesas };
}

/** Balanço patrimonial (saldos acumulados até `ate`): Ativo = Passivo + PL + Resultado. */
export function balancoDoRazao(entries: RazaoLancamento[], ate: string): BalancoRazao {
  const porTipo: Record<AccountType, Map<string, { nome: string; deb: number; cred: number }>> = {
    asset: new Map(), liability: new Map(), equity: new Map(), revenue: new Map(), expense: new Map(),
  };
  for (const e of entries) {
    if (e.data > ate) continue;
    for (const l of e.linhas) {
      const m = porTipo[l.tipo];
      const a = m.get(l.conta) ?? { nome: l.nome, deb: 0, cred: 0 };
      a.deb += l.debito; a.cred += l.credito; m.set(l.conta, a);
    }
  }
  const contasDe = (t: AccountType): ContaValor[] =>
    Array.from(porTipo[t].entries()).map(([conta, a]) => ({ conta, nome: a.nome, valor: saldoPorNatureza(t, a.deb, a.cred) })).sort((x, y) => x.conta.localeCompare(y.conta));
  const soma = (cv: ContaValor[]) => cv.reduce((s, c) => s + c.valor, 0);
  const ativos = contasDe("asset"), passivos = contasDe("liability"), pl = contasDe("equity");
  const receita = soma(contasDe("revenue")), despesa = soma(contasDe("expense"));
  const resultado = receita - despesa;
  const ativo = soma(ativos);
  const passivoPL = soma(passivos) + soma(pl) + resultado;
  return {
    ate, ativo, passivoPL, fecha: Math.round((ativo - passivoPL) * 100) === 0,
    grupos: [
      { titulo: "Ativo", total: ativo, contas: ativos },
      { titulo: "Passivo", total: soma(passivos), contas: passivos },
      { titulo: "Patrimônio líquido", total: soma(pl) + resultado, contas: [...pl, { conta: "—", nome: "Resultado acumulado", valor: resultado }] },
    ],
  };
}

/** Pivot do resultado por dimensão (ex.: contraparte, centro) no período. */
export function pivotDoRazao(entries: RazaoLancamento[], key: string, de: string, ate: string): PivotRazaoLinha[] {
  const map = new Map<string, { receita: number; despesa: number }>();
  for (const e of entries) {
    if (!noPeriodo(e, de, ate)) continue;
    for (const l of e.linhas) {
      if (l.tipo !== "revenue" && l.tipo !== "expense") continue;
      const chave = String(l.dimensions?.[key] ?? "—");
      const v = map.get(chave) ?? { receita: 0, despesa: 0 };
      if (l.tipo === "revenue") v.receita += saldoPorNatureza("revenue", l.debito, l.credito);
      else v.despesa += saldoPorNatureza("expense", l.debito, l.credito);
      map.set(chave, v);
    }
  }
  return Array.from(map.entries())
    .map(([chave, v]) => ({ chave, receita: v.receita, despesa: v.despesa, resultado: v.receita - v.despesa }))
    .sort((a, b) => Math.abs(b.resultado) - Math.abs(a.resultado));
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
  if (isDemo) {
    const atual = load();
    if (e.externalKey && atual.some((x) => x.externalKey === e.externalKey)) return; // idempotente
    save([entryToLanc(e, e.externalKey ?? `man:${Date.now()}`), ...atual]);
    return;
  }
  await seedPlanoLive();
  await postarLiveLote([e]);
}

/** Trava/destrava o período no banco (live) — o trigger passa a rejeitar postagens. */
export async function travarPeriodoLive(mesISO: string, locked: boolean): Promise<void> {
  if (isDemo) return;
  const s = createClient();
  const period = `${mesISO.slice(0, 7)}-01`;
  const { entityId } = await seedPlanoLive();
  const { data: ja } = await s.from("accounting_periods").select("id").eq("entity_id", entityId).eq("period", period).maybeSingle();
  if (ja) await s.from("accounting_periods").update({ status: locked ? "locked" : "open" }).eq("id", (ja as { id: string }).id);
  else await s.from("accounting_periods").insert({ entity_id: entityId, period, status: locked ? "locked" : "open" });
}

/** Meses (YYYY-MM) travados no banco (live) — fonte para hidratar o cache de fechamento. */
export async function lockedPeriodsLive(): Promise<string[]> {
  if (isDemo) return [];
  try {
    const s = createClient();
    const { entityId } = await seedPlanoLive();
    const { data } = await s.from("accounting_periods").select("period,status").eq("entity_id", entityId).eq("status", "locked");
    return ((data ?? []) as Array<{ period: string }>).map((r) => String(r.period).slice(0, 7));
  } catch { return []; }
}

/** Get-or-create do período (accounting_periods) → id. */
async function periodoIdLive(s: ReturnType<typeof createClient>, entityId: string, period: string): Promise<string> {
  const { data: ja } = await s.from("accounting_periods").select("id").eq("entity_id", entityId).eq("period", period).maybeSingle();
  if (ja) return (ja as { id: string }).id;
  const { data } = await s.from("accounting_periods").insert({ entity_id: entityId, period, status: "open" }).select("id").single();
  return (data as { id: string }).id;
}

/** Tarefas do checklist (live) por mês: { "2026-05": { conciliacao: true, … } }. */
export async function closeTasksLive(): Promise<Record<string, Record<string, boolean>>> {
  if (isDemo) return {};
  try {
    const s = createClient();
    const { data } = await s.from("close_tasks").select("title,status,accounting_periods(period)");
    const out: Record<string, Record<string, boolean>> = {};
    for (const r of (data ?? []) as Array<{ title: string; status: string; accounting_periods?: { period?: string } }>) {
      const mes = String(r.accounting_periods?.period ?? "").slice(0, 7);
      if (!mes) continue;
      (out[mes] ??= {})[r.title] = r.status === "done";
    }
    return out;
  } catch { return {}; }
}

/** Persiste uma tarefa do checklist (live) — upsert por (período, título). */
export async function saveCloseTaskLive(mesISO: string, taskId: string, done: boolean): Promise<void> {
  if (isDemo) return;
  try {
    const s = createClient();
    const { entityId } = await seedPlanoLive();
    const periodId = await periodoIdLive(s, entityId, `${mesISO.slice(0, 7)}-01`);
    const status = done ? "done" : "pending";
    const { data: ja } = await s.from("close_tasks").select("id").eq("period_id", periodId).eq("title", taskId).maybeSingle();
    if (ja) await s.from("close_tasks").update({ status }).eq("id", (ja as { id: string }).id);
    else await s.from("close_tasks").insert({ period_id: periodId, title: taskId, kind: "standard", status });
  } catch { /* best-effort */ }
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
