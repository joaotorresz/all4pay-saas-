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
  lancamentoDeMovimento, saldoPorNatureza, exigirBalanceado, estornar, r4, type LedgerEntryInput, type AccountType,
} from "@/core/ledger";
import { decidirPostagem, mesmaChave, type LancamentoComChave } from "@/core/ledger/idempotencia";
import { formatBRL } from "@/lib/format";
import {
  PLANO_PADRAO, CAIXA, lancamentosDeMovimentos, nomeConta, tipoConta,
} from "@/core/ledger/chart";
import { categorizarPorRegras, type Categorizacao, type TxParaCategorizar } from "@/core/ledger/categorize";
import { TETO_LINHAS, conferirTeto } from "@/lib/supabase/consulta";
import { isPeriodLocked } from "@/lib/close";
import { reportar } from "@/lib/erros";
import { ler as lerOrg, gravar as gravarOrg } from "@/lib/store-org";

export interface RazaoLinha { conta: string; nome: string; tipo: AccountType; debito: number; credito: number; dimensions?: Record<string, string | number> }
export interface RazaoLancamento {
  id: string; data: string; descricao: string; origem: string; externalKey?: string; linhas: RazaoLinha[];
  /** Este lançamento ESTORNA outro (o id do original). Espelha `journal_entries.is_reversal_of`. */
  estornoDe?: string;
}
export interface ContaBalancete { conta: string; nome: string; tipo: AccountType; debito: number; credito: number; saldo: number }

const KEY = "a4p_ledger";
// ⚠️ Só a DEMONSTRAÇÃO grava aqui (em produção o razão mora em `journal_*`);
// a chave está CONGELADA em produção, e passa por `store-org` como as demais.
const load = (): RazaoLancamento[] => lerOrg<RazaoLancamento[]>(KEY, []);
const save = (l: RazaoLancamento[]) => {
  try { gravarOrg(KEY, l); } catch (e) {
    reportar("razao.consulta", e, "o razão abre sem lançamentos e o balancete não fecha", true);
    throw e;
  }
};

function entryToLanc(e: LedgerEntryInput, id: string, estornoDe?: string): RazaoLancamento {
  return {
    id,
    ...(estornoDe ? { estornoDe } : {}),
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
    .select("id,entry_date,description,source,external_key,is_reversal_of,journal_lines(debit,credit,dimensions,ledger_accounts(code,name,type))")
    .eq("status", "posted")
    .order("entry_date", { ascending: false })
    .limit(TETO_LINHAS);
  if (error) throw error;
  // ⚠️ Era `.limit(1000)` calado: o 1001º lançamento próprio simplesmente não
  // existia no razão nem no balancete, que continuava "balanceado" — um razão
  // a que faltam linhas não parece quebrado, parece um razão.
  conferirTeto("razão · lançamentos próprios", (data ?? []).length);
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    data: String(r.entry_date),
    descricao: String(r.description ?? "Lançamento"),
    origem: String(r.source ?? "manual"),
    externalKey: (r.external_key as string) ?? undefined,
    ...(r.is_reversal_of ? { estornoDe: String(r.is_reversal_of) } : {}),
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

const fmtBRL = (v: number) => "R$" + Math.round(v).toLocaleString("pt-BR");

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

/**
 * BALANÇO COMPARATIVO — a mesma foto em duas datas, conta a conta.
 *
 * ⚠️ Um balanço sozinho diz ONDE a empresa está; quem decide quer saber o que
 * MUDOU (o caixa caiu porque o estoque subiu? a dívida cresceu?). A comparação
 * sai das DUAS execuções do mesmo `balancoDoRazao` — nenhuma soma paralela —, e
 * a variação é `atual − anterior` linha a linha, com as contas que só existem
 * de um lado entrando com zero do outro (sumir do balanço é informação, não
 * ruído). A invariante que a guarda cobra: a soma das variações de um grupo é
 * a variação do total do grupo.
 */
export interface LinhaComparativa { grupo: string; conta: string; nome: string; atual: number; anterior: number; variacao: number }
export interface BalancoComparativo { atual: BalancoRazao; anterior: BalancoRazao; linhas: LinhaComparativa[] }

export function balancoComparativo(entries: RazaoLancamento[], ate: string, base: string): BalancoComparativo {
  const atual = balancoDoRazao(entries, ate);
  const anterior = balancoDoRazao(entries, base);
  const linhas: LinhaComparativa[] = [];
  for (const g of atual.grupos) {
    const ga = anterior.grupos.find((x) => x.titulo === g.titulo);
    const chaves = new Map<string, { nome: string; atual: number; anterior: number }>();
    for (const c of g.contas) chaves.set(`${c.conta}|${c.nome}`, { nome: c.nome, atual: c.valor, anterior: 0 });
    for (const c of ga?.contas ?? []) {
      const k = `${c.conta}|${c.nome}`;
      const cur = chaves.get(k) ?? { nome: c.nome, atual: 0, anterior: 0 };
      cur.anterior = c.valor;
      chaves.set(k, cur);
    }
    for (const [k, v] of Array.from(chaves)) {
      linhas.push({ grupo: g.titulo, conta: k.split("|")[0], nome: v.nome, atual: v.atual, anterior: v.anterior, variacao: v.atual - v.anterior });
    }
  }
  return { atual, anterior, linhas };
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
  const r = await postarLiveLote(entries);
  if (r.falhas.length) {
    throw new Error(`${r.falhas.length} lançamento(s) recusado(s) pelo banco — o primeiro: ${r.falhas[0].erro}`);
  }
  return r.postadas.length;
}

export function clearRazao(): void { save([]); }

/**
 * ⚠️ **A MESMA REGRA NOS DOIS CAMINHOS — espelho dos gatilhos do banco.**
 *
 * Em produção o banco recusa o desbalanceado (`check_entry_balanced`) e o
 * período travado (`check_period_open`). Na demonstração não há banco, e o
 * `postarLancamento` gravava QUALQUER coisa no navegador — inclusive o
 * rascunho da IA com débito ≠ crédito, que entrava no balancete e o
 * desbalanceava sem ninguém ter recusado nada. Uma regra que só vale onde há
 * banco é uma regra que a demonstração ensina a ignorar.
 *
 * Conta fora do plano também é recusada aqui: em produção ela virava
 * `account_id: undefined` no insert e o banco devolvia um erro que não nomeia
 * conta nenhuma.
 */
export function validarPostagem(e: LedgerEntryInput): void {
  exigirBalanceado(e.lines);
  const conhecidas = new Set(PLANO_PADRAO.map((c) => c.code));
  const fora = e.lines.map((l) => l.accountId).filter((c) => !conhecidas.has(c));
  if (fora.length) throw new Error(`Conta fora do plano de contas do razão: ${Array.from(new Set(fora)).join(", ")}.`);
  if (!/^\d{4}-\d{2}-\d{2}/.test(e.entryDate ?? "")) throw new Error("Lançamento sem data.");
  if (isPeriodLocked(e.entryDate)) {
    throw new Error(`O mês ${e.entryDate.slice(5, 7)}/${e.entryDate.slice(0, 4)} está fechado: lance no mês aberto ou reabra o período em Fechamento.`);
  }
}

/**
 * Postagem de um lançamento de dupla entrada (demo: store; live: GL).
 *
 * ⚠️ **LANÇA quando não grava.** Em produção, `postarLiveLote` fazia
 * `continue` em TODA falha — o cabeçalho recusado, as linhas recusadas, o
 * gatilho do desbalanceado ou do período travado — e esta função devolvia
 * `void`. A tela anunciava "Lançamento postado." sobre um lançamento que o
 * banco tinha recusado: o escritor que engole erro, indistinguível de um que
 * funciona.
 */
export async function postarLancamento(e: LedgerEntryInput): Promise<"postado" | "ja_existia"> {
  validarPostagem(e);
  const total = r4(e.lines.reduce((s, l) => s + (l.debit ?? 0), 0));
  // ⚠️ A idempotência DIZ o que fez (ver `core/ledger/idempotencia`): voltar
  // calado fazia a tela anunciar "Lançado" sobre um razão que manteve o valor
  // antigo.
  const decidir = (existentes: LancamentoComChave[]) => {
    const d = decidirPostagem(e.externalKey, total, existentes);
    if (d.acao === "conflito") {
      throw new Error(`Já existe no razão "${e.description ?? "este lançamento"}" com outro valor (${formatBRL(d.valorExistente)}). Estorne o existente no Razão contábil e lance de novo.`);
    }
    return d;
  };
  if (isDemo) {
    const atual = load();
    const d = decidir(atual.filter((x) => x.externalKey).map((x) => ({
      chave: x.externalKey!, total: r4(x.linhas.reduce((s, l) => s + l.debito, 0)),
      estornado: atual.some((y) => y.estornoDe === x.id),
    })));
    if (d.acao === "ja_existia") return "ja_existia";
    const chave = d.chave ?? e.externalKey;
    save([entryToLanc({ ...e, externalKey: chave }, chave ?? `man:${Date.now()}`), ...atual]);
    return "postado";
  }
  await seedPlanoLive();
  const d = decidir(e.externalKey ? await existentesDaChaveLive(e.externalKey) : []);
  if (d.acao === "ja_existia") return "ja_existia";
  const r = await postarLiveLote([{ ...e, externalKey: d.chave ?? e.externalKey }]);
  if (r.falhas.length) throw new Error(r.falhas[0].erro);
  return r.jaExistiam.length ? "ja_existia" : "postado";
}

/** Os lançamentos POSTADOS com a chave (e as versões dela), com total e se já foram estornados. */
async function existentesDaChaveLive(chave: string): Promise<LancamentoComChave[]> {
  const s = createClient();
  const { data, error } = await s.from("journal_entries")
    .select("id,external_key,journal_lines(debit)")
    .eq("status", "posted")
    .like("external_key", `${chave}%`)
    .limit(TETO_LINHAS);
  if (error) throw new Error(`Não foi possível conferir se o lançamento já existe: ${error.message}`);
  const linhas = ((data ?? []) as Array<{ id: string; external_key: string | null; journal_lines?: Array<{ debit: number | null }> }>)
    .filter((r) => r.external_key && mesmaChave(chave, r.external_key));
  if (!linhas.length) return [];
  const { data: rev, error: e2 } = await s.from("journal_entries").select("is_reversal_of")
    .in("is_reversal_of", linhas.map((r) => r.id)).limit(TETO_LINHAS);
  if (e2) throw new Error(`Não foi possível conferir os estornos: ${e2.message}`);
  const estornados = new Set(((rev ?? []) as Array<{ is_reversal_of: string }>).map((r) => r.is_reversal_of));
  return linhas.map((r) => ({
    chave: r.external_key!,
    total: r4((r.journal_lines ?? []).reduce((acc, l) => acc + Number(l.debit ?? 0), 0)),
    estornado: estornados.has(r.id),
  }));
}

/**
 * ESTORNO — partida invertida, nunca edição nem exclusão.
 *
 * Só lançamento PRÓPRIO do razão se estorna aqui. O que é projeção de um
 * movimento (`mov:`) não existe como lançamento no banco: ele se corrige no
 * próprio movimento (estornar/cancelar o título), e o razão acompanha sozinho.
 *
 * Em produção é a função do banco `estornar_lancamento_contabil` (motivo
 * obrigatório, recusa estorno duplo, data de HOJE, ligada ao original por
 * `is_reversal_of`); ela existia desde a ONDA 3 e nenhuma tela a chamava. Na
 * demonstração, o mesmo contrato sobre o store local.
 */
export async function estornarLancamento(original: RazaoLancamento, motivo: string, todos: RazaoLancamento[]): Promise<void> {
  const m = (motivo ?? "").trim();
  if (!m) throw new Error("Informe o motivo do estorno.");
  if ((original.externalKey ?? "").startsWith("mov:")) {
    throw new Error("Este lançamento é a projeção de um movimento: estorne ou cancele o próprio movimento, e o razão acompanha.");
  }
  if (todos.some((x) => x.estornoDe === original.id)) throw new Error("Este lançamento já foi estornado.");
  if (isDemo) {
    const hoje = new Date();
    const data = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
    const base: LedgerEntryInput = {
      entryDate: original.data, description: original.descricao, source: original.origem,
      lines: original.linhas.map((l) => ({ accountId: l.conta, debit: l.debito, credit: l.credito, dimensions: l.dimensions })),
    };
    const inv = estornar(base);
    const [d, mm, a] = [original.data.slice(8, 10), original.data.slice(5, 7), original.data.slice(0, 4)];
    const novo: LedgerEntryInput = { ...inv, entryDate: data, source: "estorno", description: `Estorno de ${original.descricao} (${d}/${mm}/${a}) — ${m}` };
    validarPostagem(novo);
    save([entryToLanc(novo, `est:${original.id}`, original.id), ...load()]);
    return;
  }
  const { error } = await createClient().rpc("estornar_lancamento_contabil", { p_id: original.id, p_motivo: m });
  if (error) throw new Error(error.message);
}

/** Trava/destrava o período no banco (live) — o trigger passa a rejeitar postagens. */
/** Meses (YYYY-MM) travados no banco (live) — fonte para hidratar o cache de fechamento. */
export async function lockedPeriodsLive(): Promise<string[]> {
  if (isDemo) return [];
  try {
    const s = createClient();
    // ⚠️ Sem filtro de entidade: `fechar_periodo` (a porta que trava) grava o
    // período da ORGANIZAÇÃO, e é por organização que o gatilho de
    // `movements` decide se o mês está fechado (`periodo_fechado`).
    const { data } = await s.from("accounting_periods").select("period,status").eq("status", "locked").limit(TETO_LINHAS);
    return ((data ?? []) as Array<{ period: string }>).map((r) => String(r.period).slice(0, 7));
  } catch (e) {
    reportar("razao.consulta", e, "o razão abre sem lançamentos e o balancete não fecha", true); return []; }
}

/* ----------------------------- categorização (regras + IA) ----------------------------- */

async function iaConfigurada(): Promise<boolean> {
  try { const r = await fetch("/api/ledger/categorize"); return !!(await r.json())?.configured; } catch (e) {
    reportar("razao.consulta", e, "o razão abre sem lançamentos e o balancete não fecha", true); return false; }
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
    } catch (e) {
    reportar("razao.consulta", e, "o razão abre sem lançamentos e o balancete não fecha", true); /* mantém as regras */ }
  }
  return out;
}

/**
 * Ponte Open Finance → razão (live): transações do Pluggy (bank_transactions)
 * ainda não processadas → categorização (regras+IA) → lançamento de dupla
 * entrada postado (idempotente por external_key `pluggy:<txid>`) + raw_events.
 */
/** Get-or-create do período (accounting_periods) → id. */
async function periodoIdLive(s: ReturnType<typeof createClient>, entityId: string, period: string): Promise<string> {
  const { data: ja } = await s.from("accounting_periods").select("id").eq("entity_id", entityId).eq("period", period).maybeSingle();
  if (ja) return (ja as { id: string }).id;
  // ⚠️ A recusa do banco sobe com a mensagem dele — era `(data).id` sobre um
  // `null`, e a tela lia "Cannot read properties of null" no lugar do motivo.
  const { data, error } = await s.from("accounting_periods").insert({ entity_id: entityId, period, status: "open" }).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "O banco não devolveu o período criado.");
  return (data as { id: string }).id;
}

export async function ingerirOpenFinanceRazao(): Promise<{ lidas: number; postadas: number; jaNoRazao: number; falhas: number; primeiraFalha?: string }> {
  if (isDemo) return { lidas: 0, postadas: 0, jaNoRazao: 0, falhas: 0 }; // Open Finance não existe em demo
  const s = createClient();
  const { data: txs, error } = await s
    .from("bank_transactions")
    .select("id,pluggy_transaction_id,amount,date,description,movement_id")
    .order("date", { ascending: false })
    .limit(500);
  if (error) throw error;
  const linhas = (txs ?? []) as Array<{ id: string; pluggy_transaction_id: string; amount: number; date: string; description: string | null; movement_id: string | null }>;
  if (!linhas.length) return { lidas: 0, postadas: 0, jaNoRazao: 0, falhas: 0 };

  /*
   * ⚠️ **DUAS PORTAS PARA O MESMO DINHEIRO.** A sincronização do Pluggy já
   * transforma cada transação num MOVIMENTO (`bank_transactions.movement_id`),
   * e o razão projeta todo movimento liquidado (`mov:<id>`). Postar a mesma
   * transação de novo aqui, como lançamento próprio (`pluggy:<id>`), contava o
   * caixa DUAS vezes no balancete. Medido em produção (01/10/2026): 52 de 52
   * transações já têm movimento — o botão dobraria as 52.
   *
   * Só a transação que ainda NÃO virou movimento entra direto; a que já virou
   * está no razão pela projeção e é contada como tal.
   */
  const jaNoRazao = linhas.filter((t) => t.movement_id).length;
  const { data: jaProc } = await s.from("raw_events").select("external_id").eq("provider", "pluggy").limit(TETO_LINHAS);
  const feitas = new Set(((jaProc ?? []) as Array<{ external_id: string }>).map((r) => r.external_id));
  const novas = linhas.filter((t) => !t.movement_id && !feitas.has(t.pluggy_transaction_id));
  if (!novas.length) return { lidas: linhas.length, postadas: 0, jaNoRazao, falhas: 0 };

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
  const r = await postarLiveLote(entries);
  // ⚠️ Só vira "processada" a transação que ENTROU no razão (ou já estava). Era
  // marcar todas as `novas` depois do lote, inclusive as recusadas: uma
  // transação recusada uma vez nunca mais era tentada, e sumia do razão sem
  // deixar rastro.
  const ok = new Set([...r.postadas, ...r.jaExistiam].map((k) => k.replace(/^pluggy:/, "")));
  const processadas = novas.filter((t) => ok.has(t.pluggy_transaction_id));
  if (processadas.length) {
    const { error: eRaw } = await s.from("raw_events").insert(
      processadas.map((t) => ({ provider: "pluggy", external_id: t.pluggy_transaction_id, payload: { amount: t.amount, date: t.date, description: t.description } })),
    );
    if (eRaw) reportar("razao.consulta", eRaw, "a transação entrou no razão e não ficou marcada como processada", true);
  }
  return { lidas: linhas.length, postadas: r.postadas.length, jaNoRazao, falhas: r.falhas.length, primeiraFalha: r.falhas[0]?.erro };
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
  const { data: contas } = await s.from("ledger_accounts").select("id,code").eq("entity_id", entityCache).limit(TETO_LINHAS);
  const map: Record<string, string> = {};
  for (const c of (contas ?? []) as Array<{ id: string; code: string }>) map[c.code] = c.id;
  const faltam = PLANO_PADRAO.filter((p) => !map[p.code]);
  if (faltam.length) {
    const { data: criadas, error } = await s
      .from("ledger_accounts")
      .insert(faltam.map((p) => ({ entity_id: entityCache, code: p.code, name: p.name, type: p.type })))
      .select("id,code").limit(TETO_LINHAS);
    if (error) throw error;
    for (const c of (criadas ?? []) as Array<{ id: string; code: string }>) map[c.code] = c.id;
  }
  codeMapCache = map;
  return { entityId: entityCache, codeMap: map };
}

export interface ResultadoLote {
  /** externalKey (ou índice) de cada lançamento que ficou POSTADO nesta chamada. */
  postadas: string[];
  /** Já existia postado com a mesma chave — idempotência, não é falha. */
  jaExistiam: string[];
  falhas: { chave: string; descricao: string; erro: string }[];
}

/**
 * Posta lançamentos no GL (insert draft → linhas → status posted dispara a invariante).
 *
 * ⚠️ **Toda falha é DEVOLVIDA, com a mensagem do banco.** Era `continue` em
 * cada uma das três recusas possíveis, e quem chamava recebia um número que não
 * distinguia "postei 0 porque não havia nada" de "postei 0 porque o banco
 * recusou tudo".
 *
 * ⚠️ **O período vai junto (`period_id`).** O gatilho `check_period_open` só
 * olha para `new.period_id` — e nenhum lançamento o preenchia, então "travar o
 * mês" no Fechamento não impedia postagem nenhuma no razão em produção. A trava
 * existia no banco e a chave nunca chegava à fechadura.
 *
 * ⚠️ **Rascunho recusado libera a chave.** O rascunho que o banco recusou fica
 * na lixeira (a tentativa também é fato), mas com a `external_key` marcada:
 * sem isso o índice único `(org_id, external_key)` tornava a nova tentativa
 * impossível depois de consertado o motivo — e a checagem de idempotência,
 * que não enxerga a lixeira, a trataria como "já postado".
 */
async function postarLiveLote(entries: LedgerEntryInput[]): Promise<ResultadoLote> {
  const s = createClient();
  const { entityId, codeMap } = codeMapCache && entityCache
    ? { entityId: entityCache, codeMap: codeMapCache }
    : await seedPlanoLive();
  const out: ResultadoLote = { postadas: [], jaExistiam: [], falhas: [] };
  const periodos = new Map<string, string>();
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const chave = e.externalKey ?? `#${i}`;
    const falhar = (erro: string) => out.falhas.push({ chave, descricao: e.description ?? "Lançamento", erro });
    try { validarPostagem(e); } catch (err) { falhar((err as Error).message); continue; }
    // Idempotência: pula se external_key já existe POSTADO.
    if (e.externalKey) {
      const { data: ja } = await s.from("journal_entries").select("id,status").eq("external_key", e.externalKey).maybeSingle();
      if (ja && (ja as { status?: string }).status === "posted") { out.jaExistiam.push(chave); continue; }
    }
    const per = `${e.entryDate.slice(0, 7)}-01`;
    let periodId = periodos.get(per);
    if (!periodId) {
      try { periodId = await periodoIdLive(s, entityId, per); periodos.set(per, periodId); }
      catch (err) { falhar(`Não foi possível abrir o período ${per.slice(0, 7)}: ${(err as Error).message}`); continue; }
    }
    const { data: cab, error: e1 } = await s.from("journal_entries")
      .insert({ entity_id: entityId, period_id: periodId, entry_date: e.entryDate, description: e.description, source: e.source ?? "manual", external_key: e.externalKey ?? null, status: "draft" })
      .select("id").maybeSingle();
    if (e1 || !cab) { falhar(e1?.message ?? "O banco não devolveu o lançamento criado."); continue; }
    const entryId = (cab as { id: string }).id;
    const descartar = async (motivo: string) => {
      // A chave é liberada ANTES de ir para a lixeira (ver o comentário da função).
      if (e.externalKey) await s.from("journal_entries").update({ external_key: `${e.externalKey}#recusado:${entryId}` }).eq("id", entryId);
      const { excluirLogico } = await import("@/lib/exclusao");
      await excluirLogico("journal_entries", entryId, motivo).catch((err) =>
        reportar("razao.consulta", err, "um rascunho recusado ficou fora da lixeira", true));
    };
    const linhas = e.lines.map((l) => ({ journal_entry_id: entryId, account_id: codeMap[l.accountId], debit: l.debit ?? 0, credit: l.credit ?? 0, dimensions: l.dimensions ?? {} }));
    const { error: e2 } = await s.from("journal_lines").insert(linhas);
    if (e2) { await descartar("Linhas do lançamento não foram aceitas"); falhar(e2.message); continue; }
    const { error: e3 } = await s.from("journal_entries").update({ status: "posted", posted_at: new Date().toISOString() }).eq("id", entryId);
    if (e3) { await descartar("Postagem recusada pelo banco"); falhar(e3.message); continue; }
    out.postadas.push(chave);
  }
  return out;
}
