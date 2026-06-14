/**
 * Notas fiscais de serviço (NFS-e) — obrigação fiscal do RECEBER. Demo-safe:
 *  • demo → localStorage; receita/ISS no imported store;
 *  • live → tabela `public.nfse` (RLS) + receita/ISS em `movements`.
 * N2: nota que decorre de fatura de recorrência liga `recurrence_id`/`movement_id`
 * existentes e NÃO cria 2º movement de receita; nota avulsa cria normalmente.
 * Emissão real é assíncrona/externa (provedor + webservice) — aqui simulada.
 */
import { isDemo } from "@/lib/demo";
import { createClient } from "@/lib/supabase/client";
import { isoDay } from "@/lib/aggregations";
import { appendImported, removerImported } from "@/lib/imported";
import type { Movement } from "@/lib/types";

export type StatusNfse = "rascunho" | "processando" | "autorizada" | "rejeitada" | "enviada" | "cancelada";

export interface Nfse {
  id: string;
  tomadorId: string;
  tomadorNome: string;
  discriminacao: string;
  codigoServico: string;
  valorServico: number;
  municipio: string;
  issAliquota: number;
  competencia: string;
  aguardarPagamento: boolean;
  recorrenciaId?: string;       // N2: origem (fatura de recorrência)
  movimentoReceita?: string;    // N2: movement já existente da fatura
  numero?: string;
  codigoVerificacao?: string;
  motivoRejeicao?: string;
  movimentos: string[];
  status: StatusNfse;
  criadoEm: string;
}

const KEY = "a4p_nfse";
let cache: Nfse[] | undefined;
let hydrated = false;
function loadLocal(): Nfse[] {
  if (cache) return cache;
  if (typeof window === "undefined") { cache = []; return cache; }
  try { cache = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { cache = []; }
  return cache!;
}
function saveLocal(list: Nfse[]) {
  cache = list;
  if (typeof window !== "undefined") { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* ignore */ } }
}

export const issDe = (n: Pick<Nfse, "valorServico" | "issAliquota">) => Math.round(n.valorServico * (n.issAliquota / 100) * 100) / 100;
export const liquidoDe = (n: Nfse) => Math.round((n.valorServico - issDe(n)) * 100) / 100;

type StatusDB = "rascunho" | "processando" | "autorizada" | "rejeitada" | "cancelada" | "substituida";
const statusToDB = (s: StatusNfse): StatusDB => (s === "enviada" ? "autorizada" : s);
type Embed = { name: string } | { name: string }[] | null | undefined;
const nomeEmbed = (p: Embed) => (Array.isArray(p) ? (p[0]?.name ?? "—") : (p?.name ?? "—"));
interface NfseRow {
  id: string; tomador_id: string | null; movement_id: string | null; recurrence_id: string | null;
  service_code: string | null; description: string | null; amount: number; iss_rate: number | null;
  municipality: string | null; competence: string | null; await_payment: boolean;
  numero: string | null; codigo_verificacao: string | null; status: StatusDB; created_at: string;
  parties?: Embed;
}
function fromRow(r: NfseRow): Nfse {
  return {
    id: r.id, tomadorId: r.tomador_id ?? "", tomadorNome: nomeEmbed(r.parties),
    discriminacao: r.description ?? "", codigoServico: r.service_code ?? "", valorServico: Number(r.amount),
    municipio: r.municipality ?? "", issAliquota: Number(r.iss_rate ?? 0),
    competencia: r.competence ?? isoDay(new Date()), aguardarPagamento: r.await_payment,
    recorrenciaId: r.recurrence_id ?? undefined, numero: r.numero ?? undefined,
    codigoVerificacao: r.codigo_verificacao ?? undefined,
    movimentos: r.movement_id ? [r.movement_id] : [], status: r.status === "substituida" ? "cancelada" : r.status, criadoEm: r.created_at,
  };
}

export async function hydrateNfse(force = false): Promise<void> {
  if (hydrated && !force) return;
  if (isDemo) { cache = loadLocal(); hydrated = true; return; }
  try {
    const { data } = await createClient().from("nfse")
      .select("id,tomador_id,movement_id,recurrence_id,service_code,description,amount,iss_rate,municipality,competence,await_payment,numero,codigo_verificacao,status,created_at,parties(name)")
      .order("created_at", { ascending: false });
    cache = ((data ?? []) as unknown as NfseRow[]).map(fromRow);
    hydrated = true;
  } catch { cache = cache ?? []; }
}

export function listNfse(): Nfse[] {
  return [...(cache ?? [])].sort((a, b) => (b.criadoEm < a.criadoEm ? -1 : 1));
}

export interface NovaNfse {
  tomadorId: string; tomadorNome: string; discriminacao: string; codigoServico: string;
  valorServico: number; municipio: string; issAliquota: number; aguardarPagamento: boolean;
  recorrenciaId?: string; movimentoReceita?: string; // N2 (quando vem de recorrência)
}
export async function criarNfse(n: NovaNfse): Promise<Nfse> {
  await hydrateNfse();
  const nf: Nfse = {
    id: `nfse-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    ...n, competencia: isoDay(new Date()), movimentos: [], status: "rascunho", criadoEm: new Date().toISOString(),
  };
  if (isDemo) { saveLocal([nf, ...loadLocal()]); return nf; }
  const isUuid = (v?: string) => !!v && /^[0-9a-f-]{36}$/i.test(v);
  const { data } = await createClient().from("nfse").insert({
    tomador_id: isUuid(n.tomadorId) ? n.tomadorId : null, recurrence_id: isUuid(n.recorrenciaId) ? n.recorrenciaId : null,
    service_code: n.codigoServico, description: n.discriminacao, amount: n.valorServico, iss_rate: n.issAliquota,
    taxes: { iss: Math.round(n.valorServico * (n.issAliquota / 100) * 100) / 100 }, municipality: n.municipio,
    competence: isoDay(new Date()), await_payment: n.aguardarPagamento, status: "rascunho",
  }).select("id,tomador_id,movement_id,recurrence_id,service_code,description,amount,iss_rate,municipality,competence,await_payment,numero,codigo_verificacao,status,created_at").single();
  const saved = data ? fromRow({ ...(data as NfseRow), parties: { name: n.tomadorNome } }) : nf;
  cache = [saved, ...(cache ?? [])];
  return saved;
}

export async function transmitirNfse(id: string): Promise<Nfse | null> {
  await hydrateNfse();
  const list = cache ?? [];
  let i = list.findIndex((x) => x.id === id);
  if (i < 0) return null;
  list[i] = { ...list[i], status: "processando" };
  cache = [...list];
  if (isDemo) saveLocal(cache); else await createClient().from("nfse").update({ status: "processando" }).eq("id", id);

  await new Promise((r) => setTimeout(r, 1200)); // prefeitura (simulada)

  i = (cache ?? []).findIndex((x) => x.id === id);
  const nf = { ...(cache as Nfse[])[i] };
  if (!nf.tomadorId) {
    nf.status = "rejeitada";
    nf.motivoRejeicao = "Tomador incompleto — a prefeitura exige CNPJ/CPF e endereço.";
  } else {
    nf.status = "autorizada";
    nf.numero = String(100000 + (list.length + 1));
    nf.codigoVerificacao = Math.random().toString(36).slice(2, 10).toUpperCase();
    nf.movimentos = await refletirNaDRE(nf);
  }
  const next = [...(cache as Nfse[])]; next[i] = nf; cache = next;
  if (isDemo) saveLocal(next);
  else await createClient().from("nfse").update({
    status: statusToDB(nf.status), numero: nf.numero ?? null, codigo_verificacao: nf.codigoVerificacao ?? null,
    movement_id: nf.movimentos[0] ?? nf.movimentoReceita ?? null,
  }).eq("id", id);
  return nf;
}

/** Liga a NFS-e ao hub. N2: se já há receita (recorrência), reaproveita e só
 *  cria o ISS; senão cria receita + ISS. */
async function refletirNaDRE(nf: Nfse): Promise<string[]> {
  const hoje = isoDay(new Date());
  const iss = issDe(nf);
  const ids: string[] = [];
  const temReceita = !!nf.movimentoReceita; // veio de fatura de recorrência (N2)
  if (temReceita) ids.push(nf.movimentoReceita as string);

  const receita: Movement = {
    id: `${nf.id}-rec`, account_id: "", type: "entrada", status: "pendente", category: "Serviços",
    amount: nf.valorServico, party_id: nf.tomadorId, due_date: hoje, paid_date: null, reconciled: false,
    description: `NFS-e ${nf.numero} · ${nf.tomadorNome}`,
  } as Movement;
  const issMov: Movement = {
    id: `${nf.id}-iss`, account_id: "", type: "saida", status: "pendente", category: "Impostos · ISS",
    amount: iss, party_id: null, due_date: hoje, paid_date: null, reconciled: false,
    description: `ISS NFS-e ${nf.numero}`,
  } as Movement;

  if (isDemo) {
    if (!temReceita) { appendImported({ movement: receita }); ids.push(receita.id); }
    if (iss > 0) { appendImported({ movement: issMov }); ids.push(issMov.id); }
    return ids;
  }
  const supabase = createClient();
  const { data: accs } = await supabase.from("financial_accounts").select("id").limit(1);
  const accId = (accs as { id: string }[] | null)?.[0]?.id;
  if (!accId) return ids;
  const rows = [...(temReceita ? [] : [receita]), ...(iss > 0 ? [issMov] : [])].map((m) => ({
    account_id: accId, type: m.type, status: m.status, category: m.category, amount: m.amount,
    party_id: m.party_id, due_date: m.due_date, paid_date: null, reconciled: false, description: m.description,
  }));
  if (rows.length) {
    const { data } = await supabase.from("movements").insert(rows).select("id");
    for (const row of (data ?? []) as { id: string }[]) ids.push(row.id);
  }
  return ids;
}

export async function enviarAoTomador(id: string): Promise<void> {
  const list = cache ?? []; const i = list.findIndex((x) => x.id === id);
  if (i < 0 || list[i].status !== "autorizada") return;
  list[i] = { ...list[i], status: "enviada" }; cache = [...list];
  if (isDemo) saveLocal(cache); // live: "enviada" é sub-estado de UI; mantém autorizada no banco
}

export async function cancelarNfse(id: string): Promise<void> {
  const list = cache ?? []; const i = list.findIndex((x) => x.id === id);
  if (i < 0) return;
  const nf = list[i];
  // N2: não remove a receita reaproveitada de uma recorrência.
  const remover = nf.movimentos.filter((m) => m !== nf.movimentoReceita);
  if (remover.length) {
    if (isDemo) removerImported(remover);
    else { const s = createClient(); await s.from("movements").delete().in("id", remover); }
  }
  list[i] = { ...nf, movimentos: [], status: "cancelada" }; cache = [...list];
  if (isDemo) saveLocal([...list]); else await createClient().from("nfse").update({ status: "cancelada" }).eq("id", id);
}

export function clearNfse(): void { saveLocal([]); }
