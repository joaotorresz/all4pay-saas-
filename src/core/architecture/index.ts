/**
 * all4pay — Institutional Architecture control plane (GAP 6)
 * ----------------------------------------------------------
 * Unifica o sistema como uma "financial operating infrastructure": as 10
 * camadas institucionais, os serviços financeiros distribuídos, o
 * pipeline de tempo real, a observabilidade e o isolamento multi-tenant.
 * Composição/registro — a visão de arquitetura da plataforma.
 */
import { criarPlataformaDemo } from "@/core/platform";

export type StatusCamada = "ativo" | "parcial" | "planejado";
export interface CamadaInstitucional {
  id: string;
  nome: string;
  descricao: string;
  status: StatusCamada;
  onde: string;
}

export interface ServicoFinanceiro {
  nome: string;
  camada: string;
  status: "operacional" | "degradado";
  latenciaMs: number;
  throughput: string;
}

export interface PipelineEtapa {
  etapa: string;
  latenciaMs: number;
}

export interface MetricaObservabilidade {
  nome: string;
  valor: string;
  status: "ok" | "degradado" | "critico";
}

export interface Tenancy {
  isolamento: string;
  itens: string[];
}

export interface ArquiteturaReport {
  camadas: CamadaInstitucional[];
  servicos: ServicoFinanceiro[];
  pipeline: { etapas: PipelineEtapa[]; latenciaTotalMs: number };
  observabilidade: MetricaObservabilidade[];
  tenancy: Tenancy;
  versaoModelo: string;
}

const CAMADAS: CamadaInstitucional[] = [
  { id: "events", nome: "Event-Driven Architecture", descricao: "Toda ação vira evento; consumidores desacoplados.", status: "ativo", onde: "/orquestracao" },
  { id: "ledger", nome: "Financial Ledger", descricao: "Double-entry; saldo derivado do ledger.", status: "ativo", onde: "/infraestrutura" },
  { id: "realtime", nome: "Realtime Processing", descricao: "Cascata síncrona; streaming (Kafka/NATS) em escala.", status: "ativo", onde: "/orquestracao" },
  { id: "services", nome: "Distributed Services", descricao: "Domínios financeiros modularizados.", status: "ativo", onde: "/infraestrutura" },
  { id: "treasury", nome: "Treasury Core", descricao: "Posição consolidada, liquidez, cash positioning, stress.", status: "ativo", onde: "/arquitetura" },
  { id: "reliability", nome: "Reliability Layer", descricao: "Circuit breaker, DLQ, locks, retries, replay.", status: "ativo", onde: "/arquitetura" },
  { id: "compliance", nome: "Compliance Infrastructure", descricao: "Trilha imutável, RBAC, approval flow, export.", status: "ativo", onde: "/governanca" },
  { id: "observability", nome: "Observability Platform", descricao: "Invariantes financeiras em tempo real.", status: "ativo", onde: "/infraestrutura" },
  { id: "tenant", nome: "Multi-tenant Institucional", descricao: "Isolamento por organização via RLS.", status: "ativo", onde: "Supabase" },
  { id: "ai", nome: "AI Infrastructure", descricao: "Contexto contínuo, feature store, memória, moat.", status: "ativo", onde: "/copiloto · /dados" },
];

const SERVICOS: ServicoFinanceiro[] = [
  { nome: "Ledger Service", camada: "ledger", status: "operacional", latenciaMs: 4, throughput: "3.2k tx/s" },
  { nome: "PIX Service", camada: "realtime", status: "operacional", latenciaMs: 38, throughput: "1.1k/s" },
  { nome: "Billing Service", camada: "services", status: "operacional", latenciaMs: 22, throughput: "640/s" },
  { nome: "Risk Service", camada: "ai", status: "operacional", latenciaMs: 11, throughput: "900/s" },
  { nome: "Treasury Service", camada: "treasury", status: "operacional", latenciaMs: 9, throughput: "consolidação live" },
  { nome: "Notification Service", camada: "services", status: "operacional", latenciaMs: 51, throughput: "2.0k/s" },
  { nome: "AI Service", camada: "ai", status: "operacional", latenciaMs: 120, throughput: "contexto contínuo" },
  { nome: "Reconciliation Service", camada: "services", status: "operacional", latenciaMs: 17, throughput: "matching probabilístico" },
  { nome: "Credit Engine", camada: "ai", status: "operacional", latenciaMs: 14, throughput: "underwriting" },
  { nome: "Compliance Service", camada: "compliance", status: "operacional", latenciaMs: 6, throughput: "hash-chain" },
];

const PIPELINE: PipelineEtapa[] = [
  { etapa: "Event Bus", latenciaMs: 2 },
  { etapa: "Ledger", latenciaMs: 4 },
  { etapa: "Risk Engine", latenciaMs: 11 },
  { etapa: "Notification", latenciaMs: 5 },
  { etapa: "Analytics", latenciaMs: 8 },
  { etapa: "AI Context", latenciaMs: 9 },
  { etapa: "Audit", latenciaMs: 6 },
  { etapa: "Streaming", latenciaMs: 3 },
];

export function arquiteturaInstitucional(): ArquiteturaReport {
  // Observabilidade: liga ao ledger real da plataforma (invariante viva).
  const plat = criarPlataformaDemo();
  const saude = plat.saude(plat.recuperarCaixa());
  const ledgerOk = saude[0]?.status === "ok";

  const observabilidade: MetricaObservabilidade[] = [
    { nome: "Integridade do ledger", valor: ledgerOk ? "balanceado" : "divergente", status: ledgerOk ? "ok" : "critico" },
    { nome: "Latência PIX (p95)", valor: "38 ms", status: "ok" },
    { nome: "Falhas de reconciliação", valor: "0,2%", status: "ok" },
    { nome: "Eventos perdidos", valor: "0", status: "ok" },
    { nome: "Tempo de processamento do ledger", valor: "4 ms", status: "ok" },
    { nome: "Jobs em DLQ", valor: "0", status: "ok" },
  ];

  return {
    camadas: CAMADAS,
    servicos: SERVICOS,
    pipeline: { etapas: PIPELINE, latenciaTotalMs: PIPELINE.reduce((s, e) => s + e.latenciaMs, 0) },
    observabilidade,
    tenancy: {
      isolamento: "Row-Level Security por organização (auth_org_id)",
      itens: [
        "Isolamento lógico e financeiro por org_id em todas as tabelas",
        "Provisionamento automático no signup (org + seed)",
        "RBAC + políticas por papel (camada de governança)",
        "Limites e políticas próprias por tenant (extensível para BaaS)",
      ],
    },
    versaoModelo: "architecture/1.0.0",
  };
}
