/**
 * Recorrências — motor de receita previsível (MRR) do funil RECEBER.
 * Contrato (cliente + itens do catálogo + ciclo) projeta as próximas faturas
 * como `movements` de entrada PREVISTOS no hub. Demo-safe (padrão cache+hydrate
 * da Onda 1.2):
 *  • demo → localStorage + roll-forward client-side (rolarRecorrencias);
 *  • live → tabela `public.recurrences` (com `itens jsonb` + `freq` 7 ciclos);
 *    o Cron `/api/recorrencias/run` materializa as faturas (idempotente).
 */
import { isDemo } from "@/lib/demo";
import { createClient } from "@/lib/supabase/client";
import { isoDay } from "@/lib/aggregations";
import { primeiraContaAtiva } from "@/lib/conta-padrao";
import { appendImported, removerImported, importedMovements } from "@/lib/imported";
import {
  datasFaturaCron, cicloParaFreq, refFatura, HORIZONTE_ATIVACAO_DIAS, faturasARemoverAoEncerrar,
} from "@/lib/recorrencias-sched";
import { mrr as mrrCanonico } from "@/core/indicadores";
import type { Movement } from "@/lib/types";
import { TETO_LINHAS, semAmostra } from "@/lib/supabase/consulta";
import { reportar } from "@/lib/erros";
import { ler as lerOrg, gravar as gravarOrg } from "@/lib/store-org";

export type Ciclo = "semanal" | "mensal" | "bimestral" | "trimestral" | "quadrimestral" | "semestral" | "anual";
export const CICLOS: { id: Ciclo; label: string; meses: number }[] = [
  { id: "semanal", label: "Semanal", meses: 0.25 },
  { id: "mensal", label: "Mensal", meses: 1 },
  { id: "bimestral", label: "Bimestral", meses: 2 },
  { id: "trimestral", label: "Trimestral", meses: 3 },
  { id: "quadrimestral", label: "Quadrimestral", meses: 4 },
  { id: "semestral", label: "Semestral", meses: 6 },
  { id: "anual", label: "Anual", meses: 12 },
];
const mesesDe = (c: Ciclo) => CICLOS.find((x) => x.id === c)?.meses ?? 1;
const cicloValido = (f: string): Ciclo => (CICLOS.some((c) => c.id === f) ? (f as Ciclo) : "mensal");

export interface ItemRec { nome: string; valor: number; qtd: number; categoria?: string }
export type StatusRec = "rascunho" | "ativa" | "pausada" | "cancelada";

export interface Recorrencia {
  id: string;
  titulo: string;
  clienteId: string;
  clienteNome: string;
  itens: ItemRec[];
  ciclo: Ciclo;
  diaFaturamento: number;
  classificacao?: string;
  centro?: string;
  status: StatusRec;
  movimentos: string[];
  projetadas?: number;
  /** Demonstração: o dia em que foi ativada — a fase do ciclo do roll-forward. */
  inicio?: string;
  criadoEm: string;
}

const KEY = "a4p_recorrencias";
let cache: Recorrencia[] | undefined;
let hydrated = false;
function loadLocal(): Recorrencia[] {
  if (cache) return cache;
  if (typeof window === "undefined") { cache = []; return cache; }
  cache = [...lerOrg<Recorrencia[]>(KEY, [])];
  return cache!;
}
// ⚠️ Só a DEMONSTRAÇÃO grava aqui (produção: `recurrences`; chave CONGELADA).
function saveLocal(list: Recorrencia[]) {
  cache = list;
  gravarOrg(KEY, list);
}

export const totalFatura = (r: Pick<Recorrencia, "itens">) => r.itens.reduce((s, it) => s + it.valor * it.qtd, 0);

// ---------- live ↔ tabela recurrences ----------
type Embed = { name: string } | { name: string }[] | null | undefined;
const nomeEmbed = (p: Embed) => (Array.isArray(p) ? (p[0]?.name ?? "Cliente") : (p?.name ?? "Cliente"));
interface RecRow {
  id: string; party_id: string | null; description: string; amount: number; freq: string;
  start_date: string; due_day: number | null; active: boolean; itens: ItemRec[]; created_at: string;
  parties?: Embed;
}
function fromRow(r: RecRow): Recorrencia {
  const itens: ItemRec[] = Array.isArray(r.itens) && r.itens.length
    ? r.itens
    : [{ nome: r.description, valor: Number(r.amount), qtd: 1, categoria: r.description }];
  return {
    id: r.id, titulo: r.description, clienteId: r.party_id ?? "", clienteNome: nomeEmbed(r.parties),
    itens, ciclo: cicloValido(r.freq), diaFaturamento: r.due_day ?? 1, classificacao: itens[0]?.categoria,
    status: r.active ? "ativa" : "pausada", movimentos: [], projetadas: 0, criadoEm: r.created_at,
  };
}

export async function hydrateRecorrencias(force = false): Promise<void> {
  if (hydrated && !force) return;
  if (isDemo) { cache = loadLocal(); hydrated = true; return; }
  try {
    const { data } = await semAmostra(createClient().from("recurrences")
      .select("id,party_id,description,amount,freq,start_date,due_day,active,itens,created_at,parties(name)"))
      .eq("type", "entrada").order("created_at", { ascending: false }).limit(TETO_LINHAS);
    cache = ((data ?? []) as unknown as RecRow[]).map(fromRow);
    hydrated = true;
  } catch (e) {
    reportar("financeiro.recorrencias", e, "as assinaturas não aparecem e o MRR fica sem base", true); cache = cache ?? []; }
}

export function listRecorrencias(): Recorrencia[] {
  return [...(cache ?? [])].sort((a, b) => (b.criadoEm < a.criadoEm ? -1 : 1));
}

// ---------- KPIs ----------
export interface KpisRecorrencia { mrr: number; ativas: number; ticketMedio: number; churn: number; total: number }
export function kpisRecorrencia(): KpisRecorrencia {
  const list = cache ?? [];
  const ativas = list.filter((r) => r.status === "ativa");
  // MRR pelo indicador canônico (`core/indicadores.mrr`): a normalização do
  // ciclo é a regra e vive num lugar só.
  const mrr = mrrCanonico(
    { hoje: "1970-01-01", saldoAtual: 0, movements: [] },
    ativas.map((r) => ({ ativo: true, valorCiclo: totalFatura(r), mesesCiclo: mesesDe(r.ciclo) })),
  ).valor;
  const ticketMedio = ativas.length ? ativas.reduce((s, r) => s + totalFatura(r), 0) / ativas.length : 0;
  const churn = list.length ? list.filter((r) => r.status === "cancelada").length / list.length : 0;
  return { mrr, ativas: ativas.length, ticketMedio, churn, total: list.length };
}

// ---------- Projeção (UI preview) ----------
export interface FaturaPrevista { data: string; vencimento: string; valor: number; periodo: string }
const periodoDe = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleString("pt-BR", { month: "short", year: "2-digit" });
/**
 * As faturas que a ativação lança — as MESMAS datas (`datasFaturaCron`, o
 * horizonte de `HORIZONTE_ATIVACAO_DIAS`) na demonstração, em produção e na
 * prévia da tela. A prévia antiga contava "6 faturas" e vencia 5 dias depois:
 * mostrava datas que nenhum dos dois caminhos criava.
 */
export function projetarProximasFaturas(r: Recorrencia, n = 6, inicioISO?: string): FaturaPrevista[] {
  const valor = totalFatura(r);
  const hoje = isoDay(new Date());
  return datasFaturaCron(inicioISO ?? r.inicio ?? hoje, cicloParaFreq(r.ciclo), r.diaFaturamento, hoje, HORIZONTE_ATIVACAO_DIAS)
    .slice(0, n)
    .map((d) => ({ data: d, vencimento: d, valor, periodo: periodoDe(d) }));
}

// ---------- Ações ----------
export interface NovaRecorrencia {
  titulo: string; clienteId: string; clienteNome: string; itens: ItemRec[];
  ciclo: Ciclo; diaFaturamento: number; classificacao?: string; centro?: string;
}
export async function criarRecorrencia(n: NovaRecorrencia): Promise<Recorrencia> {
  await hydrateRecorrencias();
  const itens = n.itens.map((it) => ({ ...it, categoria: it.categoria ?? n.classificacao }));
  if (isDemo) {
    const r: Recorrencia = {
      id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      ...n, itens, status: "rascunho", movimentos: [], criadoEm: new Date().toISOString(),
    };
    saveLocal([r, ...loadLocal()]);
    return r;
  }
  // live: persiste o rascunho com itens jsonb + freq REAL (7 ciclos).
  // ⚠️ A recusa do banco SOBE com a mensagem dele. Antes ela era ignorada e a
  // função devolvia um `rec-<agora>` local: a tela dizia "criada como
  // rascunho" sem nada gravado, e ativar esse id não achava linha nenhuma.
  const { data, error } = await createClient().from("recurrences").insert({
    party_id: /^[0-9a-f-]{36}$/i.test(n.clienteId) ? n.clienteId : null, type: "entrada",
    description: n.titulo, amount: totalFatura({ itens }), freq: cicloParaFreq(n.ciclo),
    start_date: isoDay(new Date()), due_day: n.diaFaturamento, active: false, itens,
  }).select("id,party_id,description,amount,freq,start_date,due_day,active,itens,created_at").single();
  if (error) throw new Error(`O banco recusou a assinatura: ${error.message}`);
  if (!data) throw new Error("O banco não devolveu a assinatura gravada.");
  const r = fromRow({ ...(data as RecRow), parties: { name: n.clienteNome } });
  r.clienteNome = n.clienteNome; r.status = "rascunho";
  cache = [r, ...(cache ?? [])];
  return r;
}

/** O que a ativação lançou — a tela diz o número, não "entram no previsto". */
export interface ResultadoAtivacao { faturas: number; horizonteDias: number }

/**
 * Ativa o contrato → materializa as faturas (mesmas datas do Cron, dedup
 * garantido).
 *
 * ⚠️ Em produção cada passo LANÇA com a mensagem do banco. Antes: o `update`
 * de `active` ignorava o erro; sem conta bancária nenhuma fatura era criada,
 * calado; e qualquer recusa de fatura que não fosse a duplicata (23505) caía
 * num `continue` — a tela dizia "Ativada — próximas faturas entram no
 * previsto" com ZERO faturas.
 */
export async function ativarRecorrencia(id: string): Promise<ResultadoAtivacao> {
  await hydrateRecorrencias();
  const list = cache ?? [];
  const r = list.find((x) => x.id === id);
  if (!r) throw new Error("Assinatura não encontrada — recarregue a tela.");
  if (r.status === "ativa") return { faturas: 0, horizonteDias: HORIZONTE_ATIVACAO_DIAS };
  const hoje = isoDay(new Date());

  if (isDemo) {
    const ja = new Set((importedMovements() ?? []).filter((m) => m.id.startsWith(`${r.id}-fat`)).map((m) => m.due_date));
    const ids: string[] = [];
    for (const f of projetarProximasFaturas(r, Number.MAX_SAFE_INTEGER, hoje)) {
      if (ja.has(f.vencimento)) continue;
      const mid = `${r.id}-fat-${f.vencimento}`;
      appendImported({ movement: {
        id: mid, account_id: "", type: "entrada", status: "pendente",
        category: r.classificacao || r.itens[0]?.nome || "Receita recorrente",
        amount: f.valor, party_id: r.clienteId, due_date: f.vencimento, paid_date: null,
        reconciled: false, description: `${r.titulo} · ${f.periodo}`,
        reference_code: refFatura(r.id, f.vencimento),
      } as Movement });
      ids.push(mid);
    }
    r.movimentos = [...r.movimentos, ...ids]; r.projetadas = r.movimentos.length;
    r.inicio = hoje; r.status = "ativa";
    saveLocal([...list]);
    return { faturas: ids.length, horizonteDias: HORIZONTE_ATIVACAO_DIAS };
  }

  const supabase = createClient();
  // Sem conta a fatura não tem onde cair: RECUSA a ativação dizendo por quê,
  // antes de marcar a assinatura como ativa.
  const accId = await primeiraContaAtiva(supabase);
  if (!accId) {
    throw new Error("Não há conta bancária ativa: as faturas não têm onde cair. Cadastre uma conta e ative de novo.");
  }
  const { error: eAtiva } = await supabase.from("recurrences").update({ active: true }).eq("id", r.id);
  if (eAtiva) throw new Error(`O banco recusou ativar a assinatura: ${eAtiva.message}`);

  // Faturas nas MESMAS datas do Cron; idempotência GARANTIDA pelo índice único
  // parcial (a duplicata 23505 é a única recusa que significa "já existe").
  const datas = datasFaturaCron(hoje, cicloParaFreq(r.ciclo), r.diaFaturamento, hoje, HORIZONTE_ATIVACAO_DIAS);
  let gravadas = 0;
  for (const d of datas) {
    const { error } = await supabase.from("movements").insert({
      // ⚠️ ONDA 5: fatura de recorrência vem de CONTRATO.
      origem: "contrato" as const,
      account_id: accId, type: "entrada", situacao: "previsto",
      category: r.classificacao || r.itens[0]?.nome || "Receita recorrente",
      amount: totalFatura(r), party_id: r.clienteId || null, due_date: d, paid_date: null,
      reconciled: false, description: r.titulo, reference_code: refFatura(r.id, d),
    });
    if (!error) { gravadas++; continue; }
    if (error.code === "23505") continue;
    // Desfaz a marca de ativa: uma assinatura "ativa" sem as faturas dela é o
    // estado que a tela não sabe explicar. As já gravadas ficam (o índice
    // único impede que a próxima tentativa as duplique).
    const { error: eVolta } = await supabase.from("recurrences").update({ active: false }).eq("id", r.id);
    if (eVolta) reportar("financeiro.recorrencias", eVolta, "assinatura ficou ativa sem todas as faturas", true);
    throw new Error(
      `O banco recusou a fatura de ${d.split("-").reverse().join("/")}: ${error.message}. A assinatura não foi ativada`
      + (gravadas ? ` (${gravadas} fatura${gravadas === 1 ? "" : "s"} já gravada${gravadas === 1 ? "" : "s"} não se repete${gravadas === 1 ? "" : "m"} ao tentar de novo).` : "."),
    );
  }
  r.status = "ativa";
  cache = [...list];
  return { faturas: gravadas, horizonteDias: HORIZONTE_ATIVACAO_DIAS };
}

/** Roll-forward demo (o Cron cobre o live). Mesmo horizonte e mesmas datas da ativação. */
export async function rolarRecorrencias(): Promise<number> {
  if (!isDemo) { await hydrateRecorrencias(); return 0; } // live: Cron /api/recorrencias/run
  const list = loadLocal();
  const movs = importedMovements() ?? [];
  let novas = 0;
  for (const r of list) {
    if (r.status !== "ativa") continue;
    // Dedup por vencimento contra TODAS as faturas da assinatura (inclusive as
    // recebidas): um mês já recebido não ganha uma segunda fatura.
    const jaTem = new Set(movs.filter((m) => m.id.startsWith(`${r.id}-fat`)).map((m) => m.due_date));
    for (const f of projetarProximasFaturas(r, Number.MAX_SAFE_INTEGER)) {
      if (jaTem.has(f.vencimento)) continue;
      const mid = `${r.id}-fat-${f.vencimento}`;
      appendImported({ movement: {
        id: mid, account_id: "", type: "entrada", status: "pendente",
        category: r.classificacao || r.itens[0]?.nome || "Receita recorrente",
        amount: f.valor, party_id: r.clienteId, due_date: f.vencimento, paid_date: null,
        reconciled: false, description: `${r.titulo} · ${f.periodo}`,
        reference_code: refFatura(r.id, f.vencimento),
      } as Movement });
      r.movimentos.push(mid); novas++;
      jaTem.add(f.vencimento);
    }
    r.projetadas = r.movimentos.length;
  }
  if (novas) saveLocal([...list]);
  return novas;
}

/** Pausa ou cancela (churn) → remove as faturas previstas do fluxo. */
export async function encerrarRecorrencia(id: string, status: "pausada" | "cancelada"): Promise<void> {
  const list = cache ?? [];
  const r = list.find((x) => x.id === id);
  if (!r) return;
  const hoje = isoDay(new Date());
  if (isDemo) {
    // ⚠️ Só as pendentes de hoje em diante — a MESMA regra da consulta de
    // produção. Antes saíam TODAS, inclusive as já recebidas: pausar desfazia
    // caixa que entrou.
    const doDataset = (importedMovements() ?? []).filter((m) => r.movimentos.includes(m.id));
    const sair = faturasARemoverAoEncerrar(doDataset, hoje);
    if (sair.length) removerImported(sair);
    r.movimentos = r.movimentos.filter((mid) => !sair.includes(mid)); r.status = status;
    saveLocal([...list]);
    return;
  }
  const s = createClient();
  const { error: eInativa } = await s.from("recurrences").update({ active: false }).eq("id", r.id);
  if (eInativa) throw new Error(`O banco recusou ${status === "cancelada" ? "cancelar" : "pausar"} a assinatura: ${eInativa.message}`);
  // remove faturas FUTURAS pendentes desta recorrência (não toca o já realizado)
  // ⚠️ Precisa dos ids: a exclusão lógica é por registro, porque é ela que
  // grava o "antes" de cada fatura. Um update em massa deixaria uma trilha
  // dizendo "algo mudou em N linhas", que não responde nada sobre UMA delas.
  const { data: futuras, error: eFuturas } = await semAmostra(s.from("movements").select("id"))
    .like("reference_code", `rec:${r.id}:%`).eq("status", "pendente")
    .gte("due_date", hoje).limit(TETO_LINHAS);
  if (eFuturas) throw new Error(`A assinatura foi ${status}, mas as faturas futuras não puderam ser lidas: ${eFuturas.message}`);
  const { excluirLogicoEmLote } = await import("@/lib/exclusao");
  const { falhas } = await excluirLogicoEmLote("movements", (futuras ?? []).map((x: { id: string }) => String(x.id)),
    `Recorrência ${status === "cancelada" ? "cancelada" : "pausada"}`);
  r.status = status;
  cache = [...list];
  // A assinatura já está inativa; o que falhou foi tirar faturas do previsto.
  // Calar isso deixaria receita prevista de um contrato encerrado no fluxo.
  if (falhas.length) {
    throw new Error(`A assinatura foi ${status}, mas ${falhas.length} fatura${falhas.length === 1 ? "" : "s"} futura${falhas.length === 1 ? "" : "s"} não saíram do previsto: ${falhas[0].erro}`);
  }
}

export function clearRecorrencias(): void { saveLocal([]); }
