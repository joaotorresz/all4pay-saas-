/**
 * Demo data + accessors for the Financial OS surfaces.
 * In demo mode these illustrate the engines end-to-end; in live mode the
 * feed/rules would come from real integrations (bank API, OFX, OCR) and a
 * rules table — out of scope here, so live returns empty with a notice.
 */
import { isDemo } from "@/lib/demo";
import { isoDay } from "@/lib/aggregations";
import {
  normalizar,
  reconciliarAutomaticamente,
  operarFinanceiroOS,
  sugerirRegras,
  type FinancialTransaction,
  type FinancialRule,
  type ReconciliationResult,
  type OperacaoTrace,
  type RuleSuggestion,
} from "@/core/financial-os";

const hoje = () => isoDay(new Date());
const maisDias = (d: number) => isoDay(new Date(Date.now() + d * 864e5));

/** Lançamentos registrados (ledger) que aguardam conciliação. */
function ledger(): FinancialTransaction[] {
  return [
    normalizar("erp", { valor: 48200, data: hoje(), contraparte: "Energia Sudeste", documento: "FT-2041", tipo: "saida", categoria: "energia" }),
    normalizar("erp", { valor: 12640.5, data: hoje(), contraparte: "Fornecedor Têxtil SA", tipo: "saida", categoria: "fornecedor" }),
    normalizar("erp", { valor: 7900, data: hoje(), contraparte: "Meridian Design", tipo: "entrada", categoria: "venda" }),
    normalizar("erp", { valor: 21050, data: hoje(), contraparte: "Telecom Brasil", documento: "FT-2031", tipo: "saida", categoria: "telecom" }),
  ];
}

/** Entradas de múltiplas fontes financeiras (bank feed / OCR / NF). */
function feed(): FinancialTransaction[] {
  return [
    normalizar("pix", { valor: 48200, data: hoje(), descricao: "PIX ENERGIA SUDESTE LTDA", autenticacao: "FT-2041", tipo: "saida" }),
    normalizar("ofx", { amount: -12640.5, date: maisDias(1), memo: "TED FORNECEDOR TEXTIL", tipo: "saida" }),
    normalizar("nota_fiscal", { total: 7900, data: hoje(), fornecedor: "MERIDIAN DESIGN", nf: "NF-9001", tipo: "entrada" }),
    normalizar("comprovante", { valor: 21050, dataHora: hoje(), destinatario: "TELECOM BRASIL SA", autenticacao: "FT-2031", tipo: "saida" }),
    normalizar("pix", { valor: 9800, data: maisDias(-1), descricao: "PIX POSTO SHELL COMBUSTIVEIS", tipo: "saida" }),
  ];
}

export const DEMO_RULES: FinancialRule[] = [
  {
    id: "rule-saldo",
    nome: "Saldo crítico → alerta imediato",
    trigger: "saldo_critico",
    conditions: [],
    actions: [
      { tipo: "enviar_whatsapp", destino: "Financeiro" },
      { tipo: "notificar_time", destino: "Diretoria" },
    ],
    prioridade: "critica",
    ativo: true,
  },
  {
    id: "rule-inad",
    nome: "Atraso > 5 dias e ticket > 20k → cobrança + risco",
    trigger: "cliente_inadimplente",
    conditions: [
      { campo: "diasAtraso", operador: ">", valor: 5 },
      { campo: "ticket", operador: ">", valor: 20000 },
    ],
    actions: [
      { tipo: "gerar_cobranca" },
      { tipo: "marcar_risco" },
      { tipo: "notificar_time", destino: "Financeiro" },
    ],
    prioridade: "alta",
    ativo: true,
  },
  {
    id: "rule-aprov",
    nome: "Pagamento > 80k → aprovação dupla",
    trigger: "pagamento_criado",
    conditions: [{ campo: "valor", operador: ">", valor: 80000 }],
    actions: [{ tipo: "pedir_aprovacao_dupla" }],
    prioridade: "alta",
    ativo: true,
  },
  {
    id: "rule-anomalia",
    nome: "Fornecedor +20% → anomalia",
    trigger: "custo_variou",
    conditions: [{ campo: "variacaoPct", operador: ">", valor: 20 }],
    actions: [
      { tipo: "marcar_risco" },
      { tipo: "notificar_time", destino: "Compras" },
    ],
    prioridade: "media",
    ativo: true,
  },
];

const DEMO_EVENTS: Parameters<typeof operarFinanceiroOS>[1] = [
  { tipo: "saldo_critico", entidadeId: "acc-itau", payload: { conta: "Itaú", saldo: 38000, limite: 50000 }, prioridade: "critica" },
  { tipo: "cliente_inadimplente", entidadeId: "pty-aurora", payload: { cliente: "Aurora Varejo", diasAtraso: 7, ticket: 48200 }, prioridade: "alta" },
  { tipo: "pagamento_criado", entidadeId: "mov-9001", payload: { fornecedor: "Fornecedor Têxtil", valor: 92000 }, prioridade: "alta" },
  { tipo: "custo_variou", entidadeId: "combustivel", payload: { item: "Combustível", variacaoPct: 18 }, prioridade: "media" },
  { tipo: "pagamento_recebido", entidadeId: "mov-7700", payload: { cliente: "Meridian Design", valor: 7900 }, prioridade: "baixa" },
];

export function getReconciliation(): ReconciliationResult | null {
  if (!isDemo) return null;
  return reconciliarAutomaticamente(feed(), ledger());
}

export function getRules(): FinancialRule[] {
  return isDemo ? DEMO_RULES : [];
}

export function getOsTrace(rules: FinancialRule[] = DEMO_RULES): OperacaoTrace {
  return operarFinanceiroOS(rules, DEMO_EVENTS);
}

export function getRuleSuggestions(): RuleSuggestion[] {
  return isDemo ? sugerirRegras(ledger()) : [];
}
