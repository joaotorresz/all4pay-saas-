/**
 * Seed determinístico da camada institucional (demo). Constrói uma
 * trilha de auditoria real (hash encadeado), usuários por papel e
 * solicitações de aprovação para alimentar SLA e a UI de governança.
 */
import { TrilhaAuditoria } from "./audit";
import { iniciarAprovacao, aprovarPasso, sugerirIA } from "./approval-flow";
import type { AuditContext, Usuario, ApprovalRequest } from "./types";

const ctx = (over: Partial<AuditContext>): AuditContext => ({
  userId: "u_fin",
  userName: "Marina (Financeiro)",
  companyId: "co_1",
  ip: "189.40.12.7",
  device: "MacBook Pro",
  browser: "Chrome 124",
  os: "macOS 14",
  ...over,
});

export const DEMO_USUARIOS: Usuario[] = [
  { id: "u_op", nome: "João (Operador)", role: "operador", companyIds: ["co_1"] },
  { id: "u_fin", nome: "Marina (Financeiro)", role: "financeiro", companyIds: ["co_1"], limiteAprovacao: 50000, metodos: ["pix", "ted"] },
  { id: "u_tes", nome: "Rafael (Tesouraria)", role: "tesouraria", companyIds: ["co_1"], limiteAprovacao: 250000, metodos: ["pix", "ted"] },
  { id: "u_cfo", nome: "Helena (CFO)", role: "cfo", companyIds: ["co_1"], apenasHorarioComercial: true },
  { id: "u_aud", nome: "Auditoria Externa", role: "auditor", companyIds: ["co_1"] },
];

/** Trilha de auditoria demo — sequência realista de um pagamento. */
export function trilhaDemo(): TrilhaAuditoria {
  const t = new TrilhaAuditoria();
  t.registrar({
    entityType: "payment",
    entityId: "pay_8842",
    action: "created",
    after: { valor: 25000, favorecido: "Fornecedor XPTO", metodo: "ted", status: "rascunho" },
    ctx: ctx({}),
    timestamp: "2026-03-14T09:12:00.000Z",
  });
  t.registrar({
    entityType: "payment",
    entityId: "pay_8842",
    action: "updated",
    before: { valor: 25000, favorecido: "Fornecedor XPTO", metodo: "ted", status: "rascunho" },
    after: { valor: 78000, favorecido: "Fornecedor XPTO", metodo: "ted", status: "rascunho" },
    ctx: ctx({ userId: "u_op", userName: "João (Operador)", ip: "201.55.9.130" }),
    timestamp: "2026-03-14T17:48:00.000Z",
  });
  t.registrar({
    entityType: "payment",
    entityId: "pay_8842",
    action: "approved",
    before: { status: "rascunho" },
    after: { status: "aprovado", aprovado: true, aprovador: "Helena (CFO)" },
    ctx: ctx({ userId: "u_cfo", userName: "Helena (CFO)", device: "iPhone 15", os: "iOS 18" }),
    timestamp: "2026-03-15T11:02:00.000Z",
  });
  // Alteração de dado bancário APÓS aprovação — sinal antifraude crítico
  t.registrar({
    entityType: "payment",
    entityId: "pay_8842",
    action: "updated",
    before: { status: "aprovado", aprovado: true, favorecido: "Fornecedor XPTO" },
    after: { status: "aprovado", aprovado: true, favorecido: "Conta Terceiro LTDA" },
    ctx: ctx({ userId: "u_op", userName: "João (Operador)", ip: "45.231.8.2" }),
    timestamp: "2026-03-15T22:31:00.000Z",
  });
  t.registrar({
    entityType: "rule",
    entityId: "rule_pix_limit",
    action: "updated",
    before: { limite: 50000 },
    after: { limite: 120000 },
    ctx: ctx({ userId: "u_cfo", userName: "Helena (CFO)" }),
    timestamp: "2026-03-16T08:00:00.000Z",
  });
  return t;
}

export const HISTORICO_FORNECEDOR = {
  contraparte: "Fornecedor XPTO",
  maxRecebido: 80000,
  aprovacoes: 14,
};

/** SLA médio por etapa (ilustrativo) — inteligência operacional. */
export const SLA_DEMO = [
  { etapa: "Gerente financeiro", tempoMedioMin: 23 },
  { etapa: "Diretoria", tempoMedioMin: 412 },
  { etapa: "Tesouraria", tempoMedioMin: 88 },
  { etapa: "Compliance + Jurídico", tempoMedioMin: 126 },
];

/** Solicitações de aprovação demo — algumas concluídas (alimentam SLA). */
export function requestsDemo(): ApprovalRequest[] {
  const [, marina, rafael, helena] = DEMO_USUARIOS;

  // 1) Aprovado em duas etapas (gera SLA)
  let r1 = iniciarAprovacao(
    "pay_9001",
    { valor: 180000, metodo: "ted", contraparte: "Fornecedor XPTO" },
    sugerirIA({ valor: 180000, metodo: "ted", contraparte: "Fornecedor XPTO" }, HISTORICO_FORNECEDOR),
  );
  r1 = aprovarPasso(r1, helena);
  r1 = aprovarPasso(r1, rafael);

  // 2) Em aprovação (pendente)
  const r2 = iniciarAprovacao(
    "pay_9002",
    { valor: 42000, metodo: "pix", contraparte: "Energia Sul" },
    sugerirIA({ valor: 42000, metodo: "pix", contraparte: "Energia Sul" }, { contraparte: "Energia Sul", maxRecebido: 38000, aprovacoes: 6 }),
  );

  // 3) Auto-aprovado (faixa baixa)
  const r3 = iniciarAprovacao(
    "pay_9003",
    { valor: 3200, metodo: "pix", contraparte: "Material de escritório" },
    sugerirIA({ valor: 3200, metodo: "pix", contraparte: "Material de escritório" }, { contraparte: "Material de escritório", maxRecebido: 5000, aprovacoes: 30 }),
  );

  void marina;
  return [r2, r1, r3];
}
