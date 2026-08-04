/**
 * all4pay — Camada Institucional (governança operacional)
 * --------------------------------------------------------
 * O que separa "software financeiro bonito" de infraestrutura
 * financeira usável por bancos, holdings, fundos e auditorias.
 * Três pilares, puros e auditáveis:
 *   1. Trilha de auditoria imutável (hash-chain + before/after + replay)
 *   2. Permissões granulares (RBAC + policy engine)
 *   3. Approval flow (multinível, SLA, IA, assinatura, exceção)
 *
 * Valores em REAIS (number), pt-BR. Demo-safe.
 */

/* ============================================================
 *  1. Auditoria
 * ============================================================ */

export type EntityType =
  | "payment"
  | "invoice"
  | "pix"
  | "user"
  | "rule"
  | "movement"
  | "account"
  /**
   * ⚠️ **`state`** — a gravação de um estado da organização (`org_state`), o
   * evento que o gatilho da migration 0026 emite. Sem um tipo próprio, toda
   * gravação de orçamento, aprovação ou fechamento entrava na trilha rotulada
   * como "Lançamento", que é o tipo que o acessor usava por falta de outro: a
   * auditoria ficaria dizendo que houve um lançamento onde não houve nenhum.
   */
  | "state"
  /**
   * ⚠️ **`security`** — trocar de organização e verificar o isolamento. São
   * eventos de SEGURANÇA, e cair no tipo de lançamento os esconderia entre
   * centenas de movimentos de dinheiro — que é onde ninguém procura por eles.
   */
  | "security";

export type AuditAction =
  | "created"
  | "updated"
  | "deleted"
  | "approved"
  | "rejected"
  | "executed"
  | "reconciled";

/** De onde a ação partiu (forense). */
export interface AuditContext {
  userId: string;
  userName: string;
  companyId: string;
  ip: string;
  device: string;
  browser: string;
  os: string;
}

export interface AuditFlag {
  nivel: "info" | "atencao" | "critico";
  campo: string;
  descricao: string;
}

/** Evento imutável, encadeado por hash. */
export interface AuditEvent {
  id: string;
  seq: number; // posição na cadeia (0..n)
  entityType: EntityType;
  entityId: string;
  action: AuditAction;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ctx: AuditContext;
  timestamp: string; // ISO
  previousHash: string;
  hash: string; // SHA256(previousHash + action + timestamp + payload)
  flags: AuditFlag[]; // before/after intelligence
}

export interface IntegridadeResult {
  intacta: boolean;
  total: number;
  verificados: number;
  problema?: { seq: number; id: string; motivo: string };
}

/* ============================================================
 *  2. RBAC + Policy Engine
 * ============================================================ */

export type Role =
  | "admin"
  | "cfo"
  | "financeiro"
  | "tesouraria"
  | "auditor"
  | "operador"
  | "aprovador"
  | "visualizador";

export type Permission =
  | "payment.create"
  | "payment.approve"
  | "payment.execute"
  | "audit.view"
  | "audit.export"
  | "rules.edit"
  | "report.export"
  | "credit.manage"
  | "antifraud.view";

export type ModuloApp =
  | "contas_pagar"
  | "pix"
  | "dashboard"
  | "credito"
  | "antifraude"
  | "auditoria";

/** Usuário institucional com escopo contextual. */
export interface Usuario {
  id: string;
  nome: string;
  role: Role;
  companyIds: string[];
  limiteAprovacao?: number; // R$ que pode aprovar sozinho
  metodos?: ("pix" | "ted")[]; // métodos que pode aprovar
  modulos?: ModuloApp[]; // módulos liberados
  pais?: string; // país de operação
  apenasHorarioComercial?: boolean;
}

/** Contexto de uma transação a ser avaliada. */
export interface TransacaoContexto {
  valor: number;
  metodo: "pix" | "ted";
  contraparte: string;
  jaAprovado?: boolean;
}

/** Contexto ambiental da requisição. */
export interface AmbienteContexto {
  pais: string;
  horaLocal: number; // 0..23
  ipSuspeito?: boolean;
  mfaPresente?: boolean;
}

export type DecisaoPolitica =
  | "aprovar"
  | "rejeitar"
  | "exigir_mfa"
  | "escalar"
  | "bloquear";

export interface ResultadoPolitica {
  decisao: DecisaoPolitica;
  motivos: string[];
  aprovadoresNecessarios: Role[];
}

/* ============================================================
 *  3. Approval Flow
 * ============================================================ */

export interface ApprovalStepDef {
  ordem: number;
  rotulo: string;
  aprovadores: Role[];
  modo: "sequencial" | "paralelo";
}

/** Regra de fluxo por faixa de valor (configurável por empresa). */
export interface ApprovalRule {
  ateValor: number; // teto da faixa (Infinity = sem teto)
  auto: boolean; // aprovação automática
  exigeBiometria?: boolean;
  passos: ApprovalStepDef[];
}

export interface AssinaturaEletronica {
  userId: string;
  userName: string;
  role: Role;
  timestamp: string;
  device: string;
  hash: string; // assinatura = SHA256(userId+timestamp+device+payload)
}

export type StepStatus = "pendente" | "aprovado" | "rejeitado" | "ignorado";

export interface ApprovalStepEstado {
  def: ApprovalStepDef;
  status: StepStatus;
  assinaturas: AssinaturaEletronica[];
  iniciadoEm?: string;
  concluidoEm?: string;
}

export interface SugestaoIA {
  risco: "baixo" | "medio" | "alto";
  texto: string;
}

export interface ApprovalRequest {
  id: string;
  entityId: string;
  transacao: TransacaoContexto;
  criadoEm: string;
  passos: ApprovalStepEstado[];
  status: "em_aprovacao" | "aprovado" | "rejeitado" | "auto_aprovado" | "emergencia";
  sugestaoIA: SugestaoIA;
  emergencia?: { por: string; justificativa: string };
}

export interface SLAInfo {
  etapa: string;
  tempoMedioMin: number;
}

/* ---- helpers ---- */
let _seq = 0;
export const uid = (p: string) => `${p}_${Date.now().toString(36)}_${(_seq++).toString(36)}`;

export const VERSAO_INSTITUCIONAL = "institucional/1.0.0";

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrador",
  cfo: "CFO",
  financeiro: "Financeiro",
  tesouraria: "Tesouraria",
  auditor: "Auditor",
  operador: "Operador",
  aprovador: "Aprovador",
  visualizador: "Visualizador",
};
