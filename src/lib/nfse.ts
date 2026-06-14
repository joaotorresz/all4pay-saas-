/**
 * Notas fiscais de serviço (NFS-e) — obrigação fiscal do RECEBER.
 * Tela de operador demo-safe. A emissão real é ASSÍNCRONA e EXTERNA (provedor +
 * webservice municipal + certificado A1) — aqui a transmissão é simulada e o
 * estado `processando` é de primeira classe. A correlação que importa: nota
 * AUTORIZADA reflete na DRE (receita de serviço + ISS dedução) ligada a um
 * `movement` de entrada no hub. Store local (localStorage).
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
  issAliquota: number; // %
  competencia: string; // ISO
  aguardarPagamento: boolean;
  numero?: string;
  codigoVerificacao?: string;
  motivoRejeicao?: string;
  movimentos: string[]; // receita + ISS no hub (quando autorizada)
  status: StatusNfse;
  criadoEm: string;
}

const KEY = "a4p_nfse";
let cache: Nfse[] | undefined;
function load(): Nfse[] {
  if (cache) return cache;
  if (typeof window === "undefined") { cache = []; return cache; }
  try { cache = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { cache = []; }
  return cache!;
}
function save(list: Nfse[]) {
  cache = list;
  if (typeof window !== "undefined") { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* ignore */ } }
}

export const issDe = (n: Pick<Nfse, "valorServico" | "issAliquota">) => Math.round(n.valorServico * (n.issAliquota / 100) * 100) / 100;
export const liquidoDe = (n: Nfse) => Math.round((n.valorServico - issDe(n)) * 100) / 100;

export function listNfse(): Nfse[] {
  return [...load()].sort((a, b) => (b.criadoEm < a.criadoEm ? -1 : 1));
}

export interface NovaNfse {
  tomadorId: string; tomadorNome: string; discriminacao: string; codigoServico: string;
  valorServico: number; municipio: string; issAliquota: number; aguardarPagamento: boolean;
}
export function criarNfse(n: NovaNfse): Nfse {
  const nf: Nfse = {
    id: `nfse-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    ...n, competencia: isoDay(new Date()), movimentos: [], status: "rascunho",
    criadoEm: new Date().toISOString(),
  };
  save([nf, ...load()]);
  return nf;
}

/**
 * Transmite ao "município" (simulado/assíncrono). `processando` → `autorizada`
 * (com número + código) ou `rejeitada` (tomador incompleto). Ao autorizar, liga
 * a receita ao hub (entrada) + ISS como dedução (saída · imposto) → DRE fiel.
 */
export async function transmitirNfse(id: string): Promise<Nfse | null> {
  let list = load();
  let i = list.findIndex((x) => x.id === id);
  if (i < 0) return null;
  // marca processando (estado de 1ª classe)
  list[i] = { ...list[i], status: "processando" };
  save([...list]);

  await new Promise((r) => setTimeout(r, 1200)); // resposta da prefeitura (simulada)

  list = load(); i = list.findIndex((x) => x.id === id);
  const nf = { ...list[i] };
  if (!nf.tomadorId) {
    nf.status = "rejeitada";
    nf.motivoRejeicao = "Tomador incompleto — a prefeitura exige CNPJ/CPF e endereço.";
  } else {
    nf.status = "autorizada";
    nf.numero = String(100000 + (list.length + 1));
    nf.codigoVerificacao = Math.random().toString(36).slice(2, 10).toUpperCase();
    nf.movimentos = await refletirNaDRE(nf);
  }
  const next = [...list]; next[i] = nf; save(next);
  return nf;
}

/** Liga a NFS-e ao hub: receita de serviço (entrada) + ISS (saída · imposto). */
async function refletirNaDRE(nf: Nfse): Promise<string[]> {
  const hoje = isoDay(new Date());
  const iss = issDe(nf);
  const ids: string[] = [];
  const receita: Movement = {
    id: `${nf.id}-rec`, account_id: "", type: "entrada", status: "pendente",
    category: "Serviços", amount: nf.valorServico, party_id: nf.tomadorId,
    due_date: hoje, paid_date: null, reconciled: false,
    description: `NFS-e ${nf.numero} · ${nf.tomadorNome}`,
  } as Movement;
  const issMov: Movement = {
    id: `${nf.id}-iss`, account_id: "", type: "saida", status: "pendente",
    category: "Impostos · ISS", amount: iss, party_id: null,
    due_date: hoje, paid_date: null, reconciled: false,
    description: `ISS NFS-e ${nf.numero}`,
  } as Movement;
  if (isDemo) {
    appendImported({ movement: receita }); ids.push(receita.id);
    if (iss > 0) { appendImported({ movement: issMov }); ids.push(issMov.id); }
    return ids;
  }
  const supabase = createClient();
  const { data: accs } = await supabase.from("financial_accounts").select("id").limit(1);
  const accId = (accs as { id: string }[] | null)?.[0]?.id;
  if (!accId) return ids;
  const rows = [receita, ...(iss > 0 ? [issMov] : [])].map((m) => ({
    account_id: accId, type: m.type, status: m.status, category: m.category,
    amount: m.amount, due_date: m.due_date, paid_date: null, reconciled: false,
    description: m.description, party_id: m.party_id,
  }));
  const { data } = await supabase.from("movements").insert(rows).select("id");
  for (const row of (data ?? []) as { id: string }[]) ids.push(row.id);
  return ids;
}

export function enviarAoTomador(id: string): void {
  const list = load(); const i = list.findIndex((x) => x.id === id);
  if (i < 0 || list[i].status !== "autorizada") return;
  list[i] = { ...list[i], status: "enviada" }; save([...list]);
}

export async function cancelarNfse(id: string): Promise<void> {
  const list = load(); const i = list.findIndex((x) => x.id === id);
  if (i < 0) return;
  const nf = list[i];
  if (nf.movimentos.length) {
    if (isDemo) removerImported(nf.movimentos);
    else { const s = createClient(); await s.from("movements").delete().in("id", nf.movimentos); }
  }
  list[i] = { ...nf, movimentos: [], status: "cancelada" }; save([...list]);
}

export function clearNfse(): void { save([]); }
