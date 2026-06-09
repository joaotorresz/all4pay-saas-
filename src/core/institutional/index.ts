/**
 * Camada institucional — barril público.
 * Governança operacional: auditoria imutável (hash-chain), RBAC +
 * policy engine, e approval flow. Pura, tipada, auditável, demo-safe.
 */
export * from "./types";
export { sha256 } from "./sha256";
export {
  TrilhaAuditoria,
  hashEvento,
  analisarMudanca,
} from "./audit";
export {
  temPermissao,
  pode,
  permissoesDe,
  todosOsPapeis,
  avaliarPolitica,
} from "./rbac";
export {
  REGRAS_PADRAO,
  regraParaValor,
  sugerirIA,
  iniciarAprovacao,
  assinar,
  aprovarPasso,
  executarEmergencia,
  slaPorEtapa,
} from "./approval-flow";
