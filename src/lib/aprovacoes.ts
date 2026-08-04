/**
 * Solicitações & aprovações — gate de alçada do funil PAGAR.
 * UI de operador sobre o motor `core/institutional` (approval/rbac): NÃO
 * reimplementa a alçada, só orquestra. Demo-safe:
 *  • demo  → fila em localStorage (idêntico ao original);
 *  • live  → tabela `public.approvals` (RLS org_id), hidratada em cache p/ leitura
 *    síncrona (a Central consulta `estaAutorizado` no render).
 * Expõe `requerAlcada`/`estaAutorizado` para a Central.
 */
import { isDemo } from "@/lib/demo";
import { createClient } from "@/lib/supabase/client";
import {
  iniciarAprovacao, aprovarPasso, regraParaValor, sugerirIA, REGRAS_PADRAO,
} from "@/core/institutional/approval-flow";
import type { ApprovalRequest, Usuario, Role, TransacaoContexto } from "@/core/institutional/types";
import { ler, gravar as gravarOrg } from "@/lib/store-org";
import { TETO_LINHAS } from "@/lib/supabase/consulta";
import { reportar } from "@/lib/erros";

export type StatusSolic = "em_analise" | "aprovada" | "rejeitada" | "devolvida";

/** Teto de auto-aprovação: títulos até este valor passam direto (dentro da
 *  alçada), sem exigir aprovação. Derivado das REGRAS_PADRAO (faixa auto). */
export const LIMITE_ALCADA = Math.max(0, ...REGRAS_PADRAO.filter((r) => r.auto).map((r) => r.ateValor));
export type TipoSolic = "pagamento" | "reembolso";

export interface PassoHist { quando: string; quem: string; acao: string; comentario?: string }

export interface Solicitacao {
  id: string;
  objetoRef: string; // movement id / reembolso id
  tipo: TipoSolic;
  solicitante: string;
  beneficiario: string;
  valor: number;
  categoria?: string;
  centroCusto?: string;
  justificativa?: string;
  regra: string;
  req: ApprovalRequest;
  historico: PassoHist[];
  statusFinal: StatusSolic;
  criadoEm: string;
}

const KEY = "a4p_aprovacoes";
let cache: Solicitacao[] | undefined;
let hydrated = false;

function loadLocal(): Solicitacao[] {
  if (cache) return cache;
  if (typeof window === "undefined") { cache = []; return cache; }
  cache = ler<Solicitacao[]>(KEY, []);
  return cache!;
}
function saveLocal(list: Solicitacao[]) {
  cache = list;
  gravarOrg(KEY, list);
}

export const SOLICITANTE_DEMO = "Operador (Financeiro)";

export function requerAlcada(valor: number): boolean { return !regraParaValor(valor).auto; }
export function rotuloRegra(valor: number): string {
  const r = regraParaValor(valor);
  return r.auto ? "Automática (dentro da alçada)" : r.passos.map((p) => p.rotulo).join(" → ");
}

// ---- mapeamento status local ↔ enum approval_status do banco ----
type ApprovalStatusDB = "pending" | "approved" | "rejected" | "returned";
const toDB: Record<StatusSolic, ApprovalStatusDB> = { em_analise: "pending", aprovada: "approved", rejeitada: "rejected", devolvida: "returned" };
const fromDB: Record<ApprovalStatusDB, StatusSolic> = { pending: "em_analise", approved: "aprovada", rejected: "rejected" as never, returned: "devolvida" } as Record<ApprovalStatusDB, StatusSolic>;
fromDB.rejected = "rejeitada";

/** Reconstrói um ApprovalRequest a partir de (valor, nível, status) — live não
 *  guarda os passos, então derivamos da regra de valor. */
function reconstruirReq(valor: number, level: number, status: StatusSolic): ApprovalRequest {
  const req = iniciarAprovacao("db", { valor, metodo: "pix", contraparte: "" }, { risco: "baixo", texto: "" });
  req.passos.forEach((p, i) => {
    if (status === "aprovada") p.status = "aprovado";
    else if (i < level - 1) p.status = "aprovado";
  });
  req.status = status === "aprovada" ? "aprovado" : status === "rejeitada" ? "rejeitado" : "em_aprovacao";
  return req;
}

interface ApprovalRow {
  id: string; movement_id: string | null; amount: number; reason: string | null;
  justification: string | null; status: ApprovalStatusDB; level: number; levels_required: number; created_at: string;
}
function fromRow(r: ApprovalRow): Solicitacao {
  const statusFinal = fromDB[r.status];
  return {
    id: r.id, objetoRef: r.movement_id ?? r.id, tipo: "pagamento",
    solicitante: SOLICITANTE_DEMO, beneficiario: r.reason ?? "—", valor: Number(r.amount),
    justificativa: r.justification ?? undefined, regra: rotuloRegra(Number(r.amount)),
    req: reconstruirReq(Number(r.amount), r.level, statusFinal),
    historico: [], statusFinal, criadoEm: r.created_at,
  };
}

/** Carrega a fila (demo: localStorage; live: Supabase) para o cache síncrono. */
export async function hydrateAprovacoes(force = false): Promise<void> {
  if (hydrated && !force) return;
  if (isDemo) { cache = loadLocal(); hydrated = true; return; }
  try {
    const { data } = await createClient().from("approvals").select("id,movement_id,amount,reason,justification,status,level,levels_required,created_at").order("created_at", { ascending: false }).limit(TETO_LINHAS);
    cache = ((data ?? []) as ApprovalRow[]).map(fromRow);
    hydrated = true;
  } catch (e) {
    reportar("financeiro.aprovacoes", e, "a fila de aprovação abre vazia, como se nada esperasse decisão", true); cache = cache ?? []; }
}

export function listSolicitacoes(): Solicitacao[] {
  return [...(cache ?? [])].sort((a, b) => (b.criadoEm < a.criadoEm ? -1 : 1));
}

/** Existe autorização para executar este objeto? (sync — lê o cache hidratado.) */
export function estaAutorizado(objetoRef: string, valor: number): boolean {
  if (!requerAlcada(valor)) return true;
  const s = (cache ?? []).find((x) => x.objetoRef === objetoRef);
  return !!s && s.statusFinal === "aprovada";
}

/**
 * N7 — pré-autoriza um `movement` que JÁ passou pela alçada noutro fluxo (ex.:
 * reembolso aprovado). Evita que a Central exija aprovação de novo. Idempotente.
 */
export async function autorizarMovimento(movementId: string, valor: number, beneficiario: string): Promise<void> {
  await hydrateAprovacoes();
  if ((cache ?? []).some((x) => x.objetoRef === movementId && x.statusFinal === "aprovada")) return;
  const req = iniciarAprovacao(movementId, { valor, metodo: "pix", contraparte: beneficiario }, { risco: "baixo", texto: "" });
  req.passos.forEach((p) => (p.status = "aprovado")); req.status = "aprovado";
  const s: Solicitacao = {
    id: `sol-auto-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, objetoRef: movementId,
    tipo: "pagamento", solicitante: "Sistema", beneficiario, valor, regra: rotuloRegra(valor), req,
    historico: [{ quando: new Date().toISOString(), quem: "Sistema", acao: "Pré-autorizada (já aprovada no reembolso)" }],
    statusFinal: "aprovada", criadoEm: new Date().toISOString(),
  };
  if (isDemo) saveLocal([s, ...loadLocal()]);
  else await createClient().from("approvals").insert({
    movement_id: /^[0-9a-f-]{36}$/i.test(movementId) ? movementId : null, amount: valor, reason: beneficiario,
    status: "approved", level: 1, levels_required: 1, decided_at: new Date().toISOString(),
  });
  cache = [s, ...(cache ?? [])];
}

export interface NovaSolicitacao {
  objetoRef: string; tipo: TipoSolic; beneficiario: string; valor: number;
  categoria?: string; centroCusto?: string; justificativa?: string; solicitante?: string;
}

/** Cria a solicitação (idempotente por objetoRef). */
export async function criarSolicitacao(n: NovaSolicitacao): Promise<Solicitacao> {
  await hydrateAprovacoes();
  const existe = (cache ?? []).find((x) => x.objetoRef === n.objetoRef);
  if (existe) return existe;

  const transacao: TransacaoContexto = { valor: n.valor, metodo: "pix", contraparte: n.beneficiario };
  const req = iniciarAprovacao(n.objetoRef, transacao, sugerirIA(transacao, { contraparte: n.beneficiario, maxRecebido: n.valor, aprovacoes: 0 }));
  const statusFinal: StatusSolic = req.status === "auto_aprovado" ? "aprovada" : "em_analise";
  const s: Solicitacao = {
    id: `sol-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    objetoRef: n.objetoRef, tipo: n.tipo, solicitante: n.solicitante ?? SOLICITANTE_DEMO,
    beneficiario: n.beneficiario, valor: n.valor, categoria: n.categoria, centroCusto: n.centroCusto,
    justificativa: n.justificativa, regra: rotuloRegra(n.valor), req,
    historico: [{ quando: new Date().toISOString(), quem: n.solicitante ?? SOLICITANTE_DEMO, acao: statusFinal === "aprovada" ? "Auto-aprovada (dentro da alçada)" : "Solicitação criada" }],
    statusFinal, criadoEm: new Date().toISOString(),
  };

  if (isDemo) { saveLocal([s, ...loadLocal()]); return s; }
  // live: grava em approvals; o id real vem do banco.
  const isUuid = /^[0-9a-f-]{36}$/i.test(n.objetoRef);
  const { data } = await createClient().from("approvals").insert({
    movement_id: isUuid ? n.objetoRef : null, amount: n.valor, reason: n.beneficiario,
    justification: n.justificativa ?? null, status: toDB[statusFinal],
    level: 1, levels_required: req.passos.length || 1,
  }).select("id,movement_id,amount,reason,justification,status,level,levels_required,created_at").single();
  const saved = data ? fromRow(data as ApprovalRow) : s;
  saved.objetoRef = n.objetoRef; // preserva a ref local mesmo se movement_id veio null
  cache = [saved, ...(cache ?? [])];
  return saved;
}

export function papelDoPassoAtual(s: Solicitacao): { rotulo: string; role: Role } | null {
  const passo = s.req.passos.find((p) => p.status === "pendente");
  return passo ? { rotulo: passo.def.rotulo, role: passo.def.aprovadores[0] } : null;
}

export type AcaoDecisao = "aprovar" | "rejeitar" | "devolver";

export async function decidir(id: string, acao: AcaoDecisao, comentario?: string): Promise<Solicitacao | null> {
  const list = cache ?? [];
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) return null;
  const s = { ...list[i] };
  const passo = papelDoPassoAtual(s);
  const aprovador: Usuario = passo
    ? { id: `u-${passo.role}`, nome: passo.rotulo, role: passo.role, companyIds: ["demo"] }
    : { id: "u-cfo", nome: "CFO", role: "cfo", companyIds: ["demo"] };
  if (acao === "aprovar" && aprovador.nome === s.solicitante) return s; // segregação

  s.historico = [...s.historico, { quando: new Date().toISOString(), quem: aprovador.nome, acao: rotuloAcao(acao), comentario }];
  if (acao === "aprovar") {
    s.req = aprovarPasso(s.req, aprovador);
    s.statusFinal = s.req.status === "aprovado" ? "aprovada" : "em_analise";
  } else if (acao === "rejeitar") { s.req = { ...s.req, status: "rejeitado" }; s.statusFinal = "rejeitada"; }
  else { s.statusFinal = "devolvida"; }

  const next = [...list]; next[i] = s;
  if (isDemo) { saveLocal(next); return s; }
  cache = next;
  const nivelAprovados = s.req.passos.filter((p) => p.status === "aprovado").length;
  await createClient().from("approvals").update({
    status: toDB[s.statusFinal], level: Math.max(1, nivelAprovados + (s.statusFinal === "aprovada" ? 0 : 1)),
    decided_at: new Date().toISOString(),
  }).eq("id", id);
  return s;
}

function rotuloAcao(a: AcaoDecisao): string {
  return a === "aprovar" ? "Aprovou" : a === "rejeitar" ? "Rejeitou" : "Devolveu para ajuste";
}

export function clearAprovacoes(): void { saveLocal([]); }
