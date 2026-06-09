/**
 * Domain Financial Architecture — cada domínio financeiro como um
 * sistema independente (regras, eventos, escala próprios), em vez de um
 * "sistema gigante" acoplado. Mapa do que já existe no produto.
 */
import type { FinancialDomain } from "./types";

export const DOMINIOS: FinancialDomain[] = [
  { id: "ledger", nome: "Ledger Core", descricao: "Dupla partida; saldo = estado derivado.", status: "ativo", modulo: "/orquestracao · /infraestrutura" },
  { id: "payments", nome: "Payments", descricao: "Orquestra PIX/boleto/TED/cartão com fila e retry.", status: "ativo", modulo: "/infraestrutura" },
  { id: "treasury", nome: "Treasury", descricao: "Caixa, liquidez, runway, projeção.", status: "ativo", modulo: "/risco · /inteligencia" },
  { id: "collections", nome: "Collections", descricao: "Cobrança adaptativa e recuperação.", status: "ativo", modulo: "/inadimplencia" },
  { id: "risk", nome: "Risk", descricao: "Risco de caixa + inteligência de crédito.", status: "ativo", modulo: "/risco · /inadimplencia" },
  { id: "compliance", nome: "Compliance", descricao: "Auditoria imutável, RBAC, approval flow.", status: "ativo", modulo: "/governanca" },
  { id: "analytics", nome: "Analytics", descricao: "KPIs, score de saúde, benchmark, forecast.", status: "ativo", modulo: "/inteligencia" },
  { id: "identity", nome: "Identity", descricao: "Auth + multi-tenant por organização (RLS).", status: "ativo", modulo: "Supabase" },
  { id: "ai", nome: "AI Intelligence", descricao: "Copiloto, insights, anomalias, decisão.", status: "ativo", modulo: "/copiloto" },
  { id: "events", nome: "Event Infrastructure", descricao: "Event store (hash-chain), bus, idempotência, fila.", status: "ativo", modulo: "/orquestracao · /infraestrutura" },
];
