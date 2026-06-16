/**
 * Onboarding inteligente — Business Maturity Score + Financial DNA.
 * A IA avalia governança, diversificação, concentração, organização,
 * controles, estrutura bancária, recorrência e qualidade dos dados, e
 * gera o DNA financeiro a partir das respostas + da importação (FDIP).
 * Puro, demo-safe.
 */
import type { FDIPReport } from "@/core/fdip/types";

export interface PerfilEmpresa {
  setor: string;
  modelo: string;
  receitaPrincipal: string;
  frequencia: string;
  funcionarios: string;
  faturamento: string;
  bancos: string[];
  meiosRecebimento: string[];
  despesas: string[];
}
export type PapelUsuario = "administrador" | "gestor" | "operador" | "visualizador";
export interface PermissoesUsuario { visualizar: boolean; editar: boolean; autonomia: boolean }
export interface Participante {
  nome: string;
  funcao: string;
  email: string;
  aprovaPagamentos: boolean;
  limite: string;
  /** Hierarquia + o que o usuário pode fazer (governança). Opcionais p/ não
   *  quebrar o onboarding antigo — default tratado na UI de Configurações. */
  papel?: PapelUsuario;
  permissoes?: PermissoesUsuario;
}
export interface Estrutura {
  contas: { banco: string; tipo: string }[];
  centrosCusto: string[];
  unidades: string[];
  dre: string[];
  fluxoCaixa: string;
}

export interface Pilar {
  nome: string;
  valor: number; // 0..1
}
export interface Maturidade {
  score: number; // 0..100
  pilares: Pilar[];
  fortes: string[];
  atencao: string[];
  recomendacoes: string[];
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

const PESOS: Record<string, number> = {
  Governança: 0.18,
  "Diversificação de receita": 0.12,
  "Concentração de clientes": 0.15,
  "Organização financeira": 0.12,
  Controles: 0.13,
  "Estrutura bancária": 0.1,
  Recorrência: 0.12,
  "Qualidade dos dados": 0.08,
};

export function calcularMaturidade(
  perfil: PerfilEmpresa,
  participantes: Participante[],
  estrutura: Estrutura,
  report: FDIPReport | null,
): Maturidade {
  const topShare = report?.grafo.topCliente?.share ?? 0.5;
  const recorrente = report?.plano.estimativas.receitaRecorrentePct ?? (/mensal|recorr/i.test(perfil.frequencia) ? 0.6 : 0.3);
  const qualidade = report ? report.confidence.alta / Math.max(1, report.confidence.lidos) : 0.25;
  const aprovadores = participantes.filter((p) => p.aprovaPagamentos);

  const pilares: Pilar[] = [
    { nome: "Governança", valor: aprovadores.some((p) => p.limite) ? 1 : participantes.length > 0 ? 0.5 : 0.15 },
    { nome: "Diversificação de receita", valor: clamp01(perfil.meiosRecebimento.length / 4) },
    { nome: "Concentração de clientes", valor: clamp01(1 - topShare) },
    { nome: "Organização financeira", valor: (estrutura.contas.length > 0 ? 0.5 : 0) + (estrutura.centrosCusto.length > 0 || report ? 0.5 : 0) },
    { nome: "Controles", valor: aprovadores.length >= 2 ? 1 : aprovadores.length === 1 ? 0.6 : 0.3 },
    { nome: "Estrutura bancária", valor: perfil.bancos.length > 1 ? 0.9 : perfil.bancos.length === 1 ? 0.5 : 0.3 },
    { nome: "Recorrência", valor: clamp01(recorrente) },
    { nome: "Qualidade dos dados", valor: clamp01(qualidade) },
  ];

  const score = Math.round(pilares.reduce((s, p) => s + p.valor * (PESOS[p.nome] ?? 0), 0) * 100);

  const fortes: string[] = [];
  const atencao: string[] = [];
  if (pilares[2].valor >= 0.7) fortes.push("Baixa concentração de clientes");
  if (pilares[6].valor >= 0.6) fortes.push("Receita recorrente relevante");
  if (pilares[7].valor >= 0.7) fortes.push("Boa qualidade dos dados importados");
  if (pilares[3].valor >= 0.7) fortes.push("Organização financeira estruturada");
  if (pilares[0].valor <= 0.5) atencao.push("Ausência de política de aprovação");
  if (pilares[2].valor <= 0.5) atencao.push("Dependência de poucos clientes");
  if (pilares[5].valor <= 0.5) atencao.push("Concentração bancária");
  if (pilares[1].valor <= 0.4) atencao.push("Poucos meios de recebimento");

  const recomendacoes: string[] = [];
  if (estrutura.centrosCusto.length < 3) recomendacoes.push("Criar ao menos 3 centros de custo.");
  if (aprovadores.length < 2) recomendacoes.push("Implementar aprovação em dois níveis.");
  if (perfil.meiosRecebimento.length < 3) recomendacoes.push("Diversificar meios de recebimento.");
  if (perfil.bancos.length < 2) recomendacoes.push("Distribuir caixa em mais de um banco.");
  if (!report) recomendacoes.push("Importar extratos para a IA mapear clientes, despesas e DRE.");

  return { score, pilares, fortes, atencao, recomendacoes };
}

export interface DnaLinha {
  label: string;
  valor: string;
}
export function montarDNA(
  perfil: PerfilEmpresa,
  dadosBasicos: { fantasia: string; razaoSocial: string; porte: string },
  report: FDIPReport | null,
): DnaLinha[] {
  const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
  const top = report?.grafo.topCliente?.share ?? 0;
  const saz = report?.padroes.sazonalidade ?? [];
  const amp = saz.length ? Math.max(...saz.map((s) => s.indice)) - Math.min(...saz.map((s) => s.indice)) : 0;
  const recorrente = (report?.plano.estimativas.receitaRecorrentePct ?? 0) > 0.5;
  const ebitda = report?.plano.estimativas.ebitda ?? 0;

  return [
    { label: "Empresa", valor: dadosBasicos.fantasia || dadosBasicos.razaoSocial || "Sua empresa" },
    { label: "Setor", valor: perfil.setor || "—" },
    { label: "Modelo", valor: perfil.modelo || "—" },
    { label: "Receita", valor: recorrente || /mensal|recorr/i.test(perfil.frequencia) ? "Recorrente" : "Pontual" },
    { label: "Clientes", valor: String(report?.plano.clientes ?? 0) },
    { label: "Fornecedores", valor: String(report?.plano.fornecedores ?? 0) },
    { label: "Dependência maior cliente", valor: `${Math.round(top * 100)}%` },
    { label: "EBITDA estimado", valor: report ? `${fmt(ebitda)}/mês` : "—" },
    { label: "Sazonalidade", valor: amp > 0.6 ? "Alta" : amp > 0.3 ? "Média" : "Baixa" },
    { label: "Liquidez", valor: ebitda >= 0 ? "Boa" : "Atenção" },
    { label: "Concentração bancária", valor: perfil.bancos.length > 1 ? "Distribuída" : "Elevada" },
    { label: "Estrutura recomendada", valor: /sa|holding|spe/i.test(dadosBasicos.porte) ? "Holding operacional" : "Operação única" },
    { label: "DRE recomendado", valor: "Gerencial + por centro de custo" },
    { label: "Centros de custo sugeridos", valor: String(report?.plano.centrosCusto.length ?? 0) },
  ];
}
