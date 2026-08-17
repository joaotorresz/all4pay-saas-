/**
 * all4pay — Financial Data Ingestion & Intelligence Platform (FDIP)
 * -----------------------------------------------------------------
 * Não é "importar dados": é fazer o onboarding financeiro AUTOMÁTICO da
 * empresa. Pipeline: ingestão → entendimento → resolução de entidades →
 * descoberta de padrões → grafo → destino inteligente (confiança) →
 * setup automático → aprendizado contínuo. Puro, tipado, demo-safe.
 *
 * Ingestão ativa hoje: texto estruturado (CSV/OFX/extrato colado/amostra).
 * Conectores (Open Finance, API bancária, ERP, OCR de PDF/imagem, e-mail,
 * WhatsApp) entram como fontes na mesma normalização.
 */

export type Tipo = "entrada" | "saida" | "transferencia";

/** Lançamento normalizado (denominador comum de qualquer fonte). */
export interface FinancialRecord {
  id: string;
  data: string; // ISO yyyy-mm-dd
  valor: number; // magnitude positiva; direção em `tipo`
  tipo: Tipo;
  descricao: string;
  contraparte: string; // bruto
  contraparteNorm: string; // normalizado (entity resolution)
  documento?: string;
  fingerprint: string;
}

export type Destino =
  | "Receita"
  | "Despesa"
  | "Transferência"
  | "Imposto"
  | "Tarifa bancária";

export interface Classificacao {
  recordId: string;
  destino: Destino;
  categoria: string;
  contraparteTipo: "cliente" | "fornecedor" | "interno";
  confianca: number; // 0..1
  motivo: string;
  aprendido: boolean; // veio da memória de confirmações
}

export interface Entidade {
  id: string;
  nome: string;
  /** CNPJ/CPF extraído do nome (só dígitos), quando validado. */
  documento?: string | null;
  /**
   * ⚠️ `false` quando o texto não é nome de ninguém — um número de CPF solto,
   * "ANUIDADE DIFERENCIADA", um termo genérico. Estes NÃO viram cadastro de
   * cliente: viram descrição do lançamento. Todo relatório por cliente nasce
   * daqui, e aceitar qualquer coisa contamina tudo o que vem depois.
   */
  ehPessoa?: boolean;
  motivoNaoPessoa?: string;
  aliases: string[];
  tipo: "cliente" | "fornecedor";
  total: number;
  transacoes: number;
  recorrente: boolean;
}

export interface Recorrencia {
  contraparte: string;
  categoria: string;
  periodicidade: "mensal" | "semanal" | "irregular";
  valorMedio: number;
  ocorrencias: number;
  assinatura: boolean;
  /** entrada (receita recorrente) ou saída (custo recorrente) */
  tipo: "entrada" | "saida";
  /** quanto isso representa POR MÊS (total ÷ meses observados) */
  mediaMensal: number;
}

export interface Padroes {
  recorrencias: Recorrencia[];
  assinaturas: Recorrencia[];
  /** os CUSTOS recorrentes (saídas mensais/semanais), maiores primeiro */
  custosMensais: Recorrencia[];
  /** soma da média mensal dos custos recorrentes — o "boleto fixo" do mês */
  custoRecorrenteMensal: number;
  clientesRecorrentes: number;
  fornecedoresRecorrentes: number;
  sazonalidade: { label: string; indice: number }[];
}

export interface GraphResumo {
  clientes: number;
  fornecedores: number;
  fluxoTotal: number;
  topCliente: { nome: string; share: number } | null;
}

export interface SetupPlan {
  clientes: number;
  fornecedores: number;
  produtos: number;
  servicos: number;
  categorias: string[];
  centrosCusto: string[];
  recorrencias: number;
  /**
   * ⚠️ **ESTIMATIVA DA IMPORTAÇÃO — não é o resultado contábil.**
   *
   * Verificado antes de decidir (`docs/auditoria.md`, #14): este motor **não
   * consegue** consumir a `cascataDRE`, e a razão não é de encanamento. Ele roda
   * no ONBOARDING, sobre dado que ainda não foi classificado:
   *
   * - `FinancialRecord` não tem categoria — a empresa ainda não existe, e o
   *   plano de contas dela também não;
   * - a classificação é um PALPITE do próprio FDIP, com confiança declarada
   *   (0.4 no desconhecido), numa taxonomia que não é a `ESTRUTURA_DRE`;
   * - o extrato é caixa bruto, sem conciliação e sem competência.
   *
   * Forçar a cascata aqui produziria um "DRE" montado sobre confiança 0.4 e o
   * apresentaria com a mesma cara do DRE conferido — que é exatamente a
   * indistinguibilidade que este repositório persegue.
   *
   * Então a correção não foi migrar: foi **parar de chamar isto de receita e
   * EBITDA**. Nenhum número muda de significado sem mudar de nome.
   */
  estimativas: {
    /** Entradas ÷ meses observados. NÃO é receita: inclui aporte, empréstimo e transferência. */
    entradaMensalEstimada: number;
    /** Saídas ÷ meses observados. */
    saidaMensalEstimada: number;
    /** Entradas − saídas. NÃO é EBITDA: não há dedução, custo nem linha financeira. */
    resultadoMensalEstimado: number;
    /** Resultado ÷ entradas. NÃO é margem EBITDA. */
    margemEstimada: number;
    burnMensal: number;
    receitaRecorrentePct: number;
  };
  oportunidades: string[];
  riscos: string[];
}

export interface PendenciaResumo {
  tipo: string;
  count: number;
}

export interface ConfidenceCenter {
  total: number;
  lidos: number;
  alta: number; // ≥ 0.9
  media: number; // 0.7..0.9
  baixa: number; // < 0.7
  pendencias: PendenciaResumo[];
}

export interface FDIPReport {
  records: FinancialRecord[];
  classificacoes: Classificacao[];
  entidades: Entidade[];
  padroes: Padroes;
  grafo: GraphResumo;
  confidence: ConfidenceCenter;
  plano: SetupPlan;
  periodoMeses: number;
  versaoModelo: string;
  /**
   * O saldo declarado pelo banco no arquivo (`<LEDGERBAL>` do OFX), quando
   * existe — a fonte "importada" da abertura conferida. Ausente em CSV e em OFX
   * sem o bloco de saldo.
   */
  saldoDeclarado?: { valor: number; data: string };
}

/** Plano enxuto para persistir (auto company setup). */
export interface OnboardingPlan {
  clientes: { nome: string }[];
  fornecedores: { nome: string }[];
  categorias: string[];
  centrosCusto: string[];
}

export const VERSAO_FDIP = "fdip/1.0.0";

let _seq = 0;
export const uid = (p: string) => `${p}_${(_seq++).toString(36)}`;
