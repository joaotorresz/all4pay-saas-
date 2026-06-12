/**
 * all4pay — Motor de Risco de Caixa (scoreRiscoCaixa)
 * ----------------------------------------------------
 * Tipos do motor proprietário de risco operacional financeiro.
 * Arquitetura em camadas: Dados → Normalização → Métricas →
 * Probabilística → Cenários → Score → Narrativa → Alertas.
 *
 * Valores em REAIS (number), pt-BR, consistente com o resto do app.
 */

export type Nivel = "baixo" | "medio" | "alto" | "critico";

/** Evento financeiro normalizado consumido pelo motor. */
export interface RiskMovement {
  id: string;
  type: "entrada" | "saida";
  status: "pendente" | "pago" | "cancelado";
  amount: number;
  due_date: string; // ISO
  paid_date?: string | null;
  party_id?: string | null;
  category?: string | null;
  /** Conta financeira de origem (quando houver) — escopa filtros por conta. */
  accountId?: string | null;
  /** Nome do centro de custo (resolvido do cadastro), quando houver. */
  costCenter?: string | null;
}

export interface RiskInput {
  hoje: string; // ISO
  saldoAtual: number;
  movements: RiskMovement[];
  partyNames?: Record<string, string>;
  horizonDias?: number; // padrão 60
}

/** Recebível com probabilidade (camada probabilística). */
export interface RecebivelProb {
  id: string;
  party_id?: string | null;
  valor: number;
  due_date: string;
  probabilidadeRecebimento: number; // 0..1
  valorEsperado: number;
}

export type PilarId =
  | "liquidez"
  | "previsibilidade"
  | "concentracao"
  | "tendencia"
  | "burn"
  | "inadimplencia"
  | "sazonalidade"
  | "compromissos";

/** Resultado de um pilar — explicável e auditável. */
export interface PilarResult {
  id: PilarId;
  label: string;
  peso: number; // 0..1
  score: number; // 0..100 (saúde; 100 = melhor)
  valor: number; // métrica bruta do pilar
  detalhe: string;
}

export interface RunwayCenarios {
  otimista: number;
  base: number;
  pessimista: number;
}

export interface LiquidezPonto {
  date: string;
  label: string;
  saldo: number;
  ruptura: boolean;
}

export interface StressCenario {
  id: string;
  label: string;
  descricao: string;
  impactoSaldo: number; // R$ no fim do horizonte vs base
  runwayDias: number;
}

export interface ConcentracaoResult {
  topShare: number; // 0..1 (maior cliente)
  hhi: number; // 0..10000 (Herfindahl-Hirschman)
  top: { id: string; name: string; share: number; receita: number }[];
}

export interface BurnResult {
  receitaMensal: number;
  despesaMensal: number;
  liquidoMensal: number; // receita - despesa
  burnMensal: number; // max(0, -liquido)
}

export interface InadimplenciaResult {
  overdueAmount: number;
  overdueRatio: number; // 0..1 do total a receber em aberto
  clientesEmAtraso: number;
}

export interface SazonalidadeResult {
  indiceMesAtual: number; // 1 = média; <1 mês fraco
  mesesBaixos: string[];
  indicePorMes: { label: string; indice: number }[];
}

export interface Alerta {
  nivel: "info" | "atencao" | "critico";
  titulo: string;
  detalhe: string;
}

/** Resultado enxuto pedido na spec. */
export interface ScoreRisco {
  score: number; // 0..100
  nivel: Nivel;
  probabilidadeRuptura: number; // 0..1
  runwayDias: number;
  fatoresCriticos: string[];
}

/** Resultado completo — rastreável, explicável, auditável. */
export interface ScoreDetalhado extends ScoreRisco {
  componentes: PilarResult[];
  runway: RunwayCenarios;
  liquidez: LiquidezPonto[];
  rupturaDia: number | null; // dias até a ruptura no cenário base
  concentracao: ConcentracaoResult;
  burn: BurnResult;
  inadimplencia: InadimplenciaResult;
  sazonalidade: SazonalidadeResult;
  stress: StressCenario[];
  narrativa: string;
  alertas: Alerta[];
  explicacoes: string[];
  versaoModelo: string;
}

/* ---- helpers ---- */
export const clamp = (n: number, min = 0, max = 100) =>
  Math.max(min, Math.min(max, n));

export const diasEntre = (aISO: string, bISO: string) =>
  Math.round(
    (new Date(bISO).getTime() - new Date(aISO).getTime()) / 86_400_000,
  );

export const VERSAO_MODELO = "risco-caixa/1.0.0";
