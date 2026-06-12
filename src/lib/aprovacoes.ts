/**
 * Solicitações & aprovações — gate de alçada do funil PAGAR.
 * UI de operador sobre o motor `core/institutional` (approval/rbac/audit): NÃO
 * reimplementa a alçada, só orquestra. A fila vive em localStorage (demo-safe;
 * persistência em audit_log/tabela é roadmap). Expõe `requerAlcada`/`estaAutorizado`
 * que a Central de Pagamentos consulta antes de executar.
 */
import {
  iniciarAprovacao, aprovarPasso, regraParaValor, sugerirIA,
} from "@/core/institutional/approval-flow";
import type { ApprovalRequest, Usuario, Role, TransacaoContexto } from "@/core/institutional/types";

export type StatusSolic = "em_analise" | "aprovada" | "rejeitada" | "devolvida";
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
  regra: string; // rótulo da faixa de alçada acionada
  req: ApprovalRequest;
  historico: PassoHist[];
  statusFinal: StatusSolic;
  criadoEm: string;
}

const KEY = "a4p_aprovacoes";
let cache: Solicitacao[] | undefined;

function load(): Solicitacao[] {
  if (cache) return cache;
  if (typeof window === "undefined") { cache = []; return cache; }
  try { cache = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { cache = []; }
  return cache!;
}
function save(list: Solicitacao[]) {
  cache = list;
  if (typeof window !== "undefined") { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* ignore */ } }
}

/** Solicitante demo (quem pede) — distinto do aprovador (segregação de funções). */
export const SOLICITANTE_DEMO = "Operador (Financeiro)";

/** A alçada exige aprovação? (auto só até a 1ª faixa.) */
export function requerAlcada(valor: number): boolean {
  return !regraParaValor(valor).auto;
}
export function rotuloRegra(valor: number): string {
  const r = regraParaValor(valor);
  if (r.auto) return "Automática (dentro da alçada)";
  return r.passos.map((p) => p.rotulo).join(" → ");
}

/** Existe autorização para executar este objeto? (auto-aprovado ou aprovada.) */
export function estaAutorizado(objetoRef: string, valor: number): boolean {
  if (!requerAlcada(valor)) return true; // dentro da alçada automática
  const s = load().find((x) => x.objetoRef === objetoRef);
  return !!s && s.statusFinal === "aprovada";
}

export function listSolicitacoes(): Solicitacao[] {
  return [...load()].sort((a, b) => (b.criadoEm < a.criadoEm ? -1 : 1));
}

export interface NovaSolicitacao {
  objetoRef: string; tipo: TipoSolic; beneficiario: string; valor: number;
  categoria?: string; centroCusto?: string; justificativa?: string; solicitante?: string;
}

/** Cria a solicitação (roteia pela regra de valor). Idempotente por objetoRef. */
export function criarSolicitacao(n: NovaSolicitacao): Solicitacao {
  const list = load();
  const existe = list.find((x) => x.objetoRef === n.objetoRef);
  if (existe) return existe;
  const transacao: TransacaoContexto = { valor: n.valor, metodo: "pix", contraparte: n.beneficiario };
  const sugestao = sugerirIA(transacao, { contraparte: n.beneficiario, maxRecebido: n.valor, aprovacoes: 0 });
  const req = iniciarAprovacao(n.objetoRef, transacao, sugestao);
  const s: Solicitacao = {
    id: `sol-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    objetoRef: n.objetoRef, tipo: n.tipo, solicitante: n.solicitante ?? SOLICITANTE_DEMO,
    beneficiario: n.beneficiario, valor: n.valor, categoria: n.categoria, centroCusto: n.centroCusto,
    justificativa: n.justificativa, regra: rotuloRegra(n.valor), req,
    historico: [{ quando: new Date().toISOString(), quem: n.solicitante ?? SOLICITANTE_DEMO, acao: req.status === "auto_aprovado" ? "Auto-aprovada (dentro da alçada)" : "Solicitação criada" }],
    statusFinal: req.status === "auto_aprovado" ? "aprovada" : "em_analise",
    criadoEm: new Date().toISOString(),
  };
  save([s, ...list]);
  return s;
}

/** Papel exigido pelo passo pendente atual (para montar o aprovador da vez). */
export function papelDoPassoAtual(s: Solicitacao): { rotulo: string; role: Role } | null {
  const passo = s.req.passos.find((p) => p.status === "pendente");
  if (!passo) return null;
  return { rotulo: passo.def.rotulo, role: passo.def.aprovadores[0] };
}

export type AcaoDecisao = "aprovar" | "rejeitar" | "devolver";

/** Decide o passo atual. `aprovar` reusa `aprovarPasso` do core. */
export function decidir(id: string, acao: AcaoDecisao, comentario?: string): Solicitacao | null {
  const list = load();
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) return null;
  const s = { ...list[i] };
  const passo = papelDoPassoAtual(s);
  const aprovador: Usuario = passo
    ? { id: `u-${passo.role}`, nome: `${passo.rotulo}`, role: passo.role, companyIds: ["demo"] }
    : { id: "u-cfo", nome: "CFO", role: "cfo", companyIds: ["demo"] };

  // Segregação de funções: quem solicita não aprova a própria.
  if (acao === "aprovar" && aprovador.nome === s.solicitante) return s;

  const hist: PassoHist = { quando: new Date().toISOString(), quem: aprovador.nome, acao: rotuloAcao(acao), comentario };
  if (acao === "aprovar") {
    s.req = aprovarPasso(s.req, aprovador);
    s.statusFinal = s.req.status === "aprovado" ? "aprovada" : "em_analise";
  } else if (acao === "rejeitar") {
    s.req = { ...s.req, status: "rejeitado" };
    s.statusFinal = "rejeitada";
  } else {
    s.statusFinal = "devolvida";
  }
  s.historico = [...s.historico, hist];
  const next = [...list]; next[i] = s; save(next);
  return s;
}

function rotuloAcao(a: AcaoDecisao): string {
  return a === "aprovar" ? "Aprovou" : a === "rejeitar" ? "Rejeitou" : "Devolveu para ajuste";
}

export function clearAprovacoes(): void { save([]); }
