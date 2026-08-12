/**
 * Deterministic demonstration dataset.
 * Anchored on "today" so the receivables / cashflow / sales widgets always
 * look current. Same raw shape as the Supabase tables, so the aggregation
 * functions run identically over demo and live data.
 */
import type {
  FinancialAccount,
  Movement,
  Category,
  CostCenter,
  Party,
  Product,
  Service,
  Brand,
  Unit,
  Salesperson,
  SaleDocRow,
} from "../types";
import { isoDay } from "../aggregations";

/** Small seeded PRNG (mulberry32) — reproducible "random" amounts. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DEMO_ACCOUNTS: FinancialAccount[] = [
  { id: "acc-itau", name: "Itaú · Conta Movimento", bank: "itau", balance: 1284900.0 },
  { id: "acc-bradesco", name: "Bradesco · Conta Empresa", bank: "bradesco", balance: 612300.5 },
  { id: "acc-nubank", name: "Nubank PJ", bank: "nubank", balance: 262250.0 },
  { id: "acc-inter", name: "Inter Empresas", bank: "inter", balance: 89400.0 },
];

const ACC_IDS = DEMO_ACCOUNTS.map((a) => a.id);

const RECEIVABLE_PAYEES = [
  "Northwind Logística", "Atlas Cloud Ltda", "Meridian Design",
  "Brightwell Suprimentos", "Veridian Foods", "Lumen Tecnologia",
  "Costa & Filhos", "Aurora Varejo",
];
const PAYABLE_VENDORS = [
  "Energia Sudeste", "Aluguel Sede", "Folha de Pagamento",
  "Fornecedor Têxtil SA", "Marketing Digital", "Impostos · DAS",
  "Telecom Brasil", "Seguro Frota",
];

function buildMovements(): Movement[] {
  const rand = rng(42);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const out: Movement[] = [];
  let n = 0;
  const id = () => `mov-${(++n).toString().padStart(4, "0")}`;
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  const amt = (min: number, max: number) =>
    Math.round((min + rand() * (max - min)) * 100) / 100;

  const addDays = (base: Date, d: number) => {
    const x = new Date(base);
    x.setDate(base.getDate() + d);
    return x;
  };

  // ---- Open receivables (entrada · pendente): overdue / today / rest of month
  const recvOffsets = [-9, -4, -1, 0, 0, 2, 5, 8, 12, 18];
  for (const off of recvOffsets) {
    out.push({
      id: id(),
      account_id: pick(ACC_IDS),
      type: "entrada",
      status: "pendente",
      category: "venda",
      amount: amt(4200, 64000),
      due_date: isoDay(addDays(today, off)),
      paid_date: null,
      reconciled: rand() > 0.5,
      description: pick(RECEIVABLE_PAYEES),
    });
  }

  // ---- Open payables (saida · pendente)
  const payOffsets = [-6, -2, 0, 1, 4, 7, 10, 15, 22];
  for (const off of payOffsets) {
    out.push({
      id: id(),
      account_id: pick(ACC_IDS),
      type: "saida",
      status: "pendente",
      category: pick(["fornecedor", "despesa", "imposto", "folha"]),
      amount: amt(1800, 42000),
      due_date: isoDay(addDays(today, off)),
      paid_date: null,
      reconciled: rand() > 0.45,
      description: pick(PAYABLE_VENDORS),
    });
  }

  // ---- Settled flow over the last 14 days (entradas + saídas, status=pago)
  for (let d = 13; d >= 0; d--) {
    const day = addDays(today, -d);
    const dayISO = isoDay(day);
    const nIn = 1 + Math.floor(rand() * 3);
    for (let i = 0; i < nIn; i++) {
      out.push({
        id: id(),
        account_id: pick(ACC_IDS),
        type: "entrada",
        status: "pago",
        category: rand() > 0.3 ? "venda" : "outros",
        amount: amt(3000, 38000),
        due_date: dayISO,
        paid_date: dayISO,
        reconciled: rand() > 0.4,
        description: pick(RECEIVABLE_PAYEES),
      });
    }
    const nOut = 1 + Math.floor(rand() * 2);
    for (let i = 0; i < nOut; i++) {
      out.push({
        id: id(),
        account_id: pick(ACC_IDS),
        type: "saida",
        status: "pago",
        category: pick(["fornecedor", "despesa", "imposto"]),
        amount: amt(2000, 30000),
        due_date: dayISO,
        paid_date: dayISO,
        reconciled: rand() > 0.5,
        description: pick(PAYABLE_VENDORS),
      });
    }
  }

  // ---- Monthly sales over the last 12 months (entrada · venda · pago)
  for (let m = 11; m >= 0; m--) {
    const monthDate = new Date(today.getFullYear(), today.getMonth() - m, 15);
    const base = 180000 + rand() * 140000;
    const seasonal = 1 + 0.18 * Math.sin((monthDate.getMonth() / 12) * Math.PI * 2);
    const sales = 2 + Math.floor(rand() * 3);
    let remaining = Math.round(base * seasonal);
    for (let i = 0; i < sales; i++) {
      const slice =
        i === sales - 1
          ? remaining
          : Math.round(remaining * (0.3 + rand() * 0.4));
      remaining -= slice;
      out.push({
        id: id(),
        account_id: pick(ACC_IDS),
        type: "entrada",
        status: "pago",
        category: "venda",
        amount: Math.max(slice, 0),
        due_date: isoDay(monthDate),
        paid_date: isoDay(monthDate),
        reconciled: true,
        description: pick(RECEIVABLE_PAYEES),
      });
    }
  }

  return out;
}

export const DEMO_MOVEMENTS: Movement[] = buildMovements();

/**
 * As REGRAS de recorrência da demonstração — a fonte da projeção de contas
 * recorrentes.
 *
 * ⚠️ Existem porque, sem elas, o gráfico de "próximos meses" abre vazio na
 * demonstração e a função inteira fica invisível para quem está avaliando o
 * produto. Não são lançamentos: são o CADASTRO da repetição, o equivalente à
 * tabela `recurrences` em live.
 *
 * Ancoradas em `hoje` como o resto do seed, e escolhidas para cobrir os três
 * casos que a tela precisa saber mostrar: o contrato que ACABA dentro da
 * janela, o que não tem prazo, e o de ciclo mais longo que o mensal (que não
 * aparece em todo mês).
 */
export const DEMO_RECORRENCIAS: {
  id: string; descricao: string; contraparte: string; categoria: string;
  valor: number; frequencia: "mensal" | "trimestral" | "anual";
  inicio: string; fim: string | null; diaVencimento: number; ativa: boolean;
}[] = (() => {
  const hoje = new Date();
  const mesAtras = (n: number) => {
    const d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - n, 1));
    return d.toISOString().slice(0, 10);
  };
  const mesAFrente = (n: number) => {
    const d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() + n + 1, 0));
    return d.toISOString().slice(0, 10);
  };
  return [
    { id: "dr1", descricao: "Aluguel do escritório", contraparte: "Imobiliária Centro", categoria: "Aluguel", valor: 8_400, frequencia: "mensal", inicio: mesAtras(14), fim: null, diaVencimento: 5, ativa: true },
    { id: "dr2", descricao: "Plano de saúde da equipe", contraparte: "Saúde Empresarial", categoria: "Folha de pagamento", valor: 5_260, frequencia: "mensal", inicio: mesAtras(9), fim: null, diaVencimento: 10, ativa: true },
    { id: "dr3", descricao: "Software de gestão", contraparte: "Nuvem Sistemas", categoria: "Software e assinaturas", valor: 1_890, frequencia: "mensal", inicio: mesAtras(6), fim: null, diaVencimento: 20, ativa: true },
    // ⚠️ ACABA dentro da janela de 12 meses — é este que prova que a projeção
    // para de cobrar um contrato encerrado.
    { id: "dr4", descricao: "Consultoria contábil", contraparte: "Contabilidade Prisma", categoria: "Serviços profissionais", valor: 2_300, frequencia: "mensal", inicio: mesAtras(4), fim: mesAFrente(3), diaVencimento: 15, ativa: true },
    // Ciclo mais longo: não aparece em todo mês, e o mês sem ele vale R$ 0,00.
    { id: "dr5", descricao: "Seguro predial", contraparte: "Seguradora União", categoria: "Seguros", valor: 4_100, frequencia: "trimestral", inicio: mesAtras(5), fim: null, diaVencimento: 25, ativa: true },
    // Cancelada: não projeta nada, e a tela não a conta.
    { id: "dr6", descricao: "Coworking (encerrado)", contraparte: "Estação Coworking", categoria: "Aluguel", valor: 1_200, frequencia: "mensal", inicio: mesAtras(12), fim: null, diaVencimento: 8, ativa: false },
  ];
})();

export const DEMO_CATEGORIES: Category[] = [
  { id: "cat-venda", kind: "receita", name: "Venda de produtos" },
  { id: "cat-servico", kind: "receita", name: "Prestação de serviços" },
  { id: "cat-juros", kind: "receita", name: "Juros e rendimentos" },
  { id: "cat-outras-rec", kind: "receita", name: "Outras receitas" },
  { id: "cat-fornecedor", kind: "despesa", name: "Fornecedores" },
  { id: "cat-folha", kind: "despesa", name: "Folha de pagamento" },
  { id: "cat-aluguel", kind: "despesa", name: "Aluguel e ocupação" },
  { id: "cat-impostos", kind: "despesa", name: "Impostos e taxas" },
  { id: "cat-marketing", kind: "despesa", name: "Marketing" },
];

export const DEMO_COST_CENTERS: CostCenter[] = [
  { id: "cc-comercial", name: "Comercial" },
  { id: "cc-operacoes", name: "Operações" },
  { id: "cc-administrativo", name: "Administrativo" },
  { id: "cc-ti", name: "Tecnologia" },
];

export const DEMO_PARTIES: Party[] = [
  { id: "pty-northwind", type: "pj", name: "Northwind Logística", doc: "12.345.678/0001-90", phone: "+5511980000001", is_customer: true },
  { id: "pty-atlas", type: "pj", name: "Atlas Cloud Ltda", doc: "23.456.789/0001-01", phone: "+5511980000002", is_customer: true },
  { id: "pty-meridian", type: "pj", name: "Meridian Design", doc: "34.567.890/0001-12", phone: "+5511980000003", is_customer: true },
  { id: "pty-aurora", type: "pj", name: "Aurora Varejo", doc: "45.678.901/0001-23", phone: "+5511980000004", is_customer: true },
  { id: "pty-costa", type: "pf", name: "Costa & Filhos", doc: "123.456.789-09", is_customer: true },
  { id: "pty-energia", type: "pj", name: "Energia Sudeste", doc: "56.789.012/0001-34", is_supplier: true },
  { id: "pty-textil", type: "pj", name: "Fornecedor Têxtil SA", doc: "67.890.123/0001-45", is_supplier: true },
  { id: "pty-telecom", type: "pj", name: "Telecom Brasil", doc: "78.901.234/0001-56", is_supplier: true },
];

export const DEMO_BRANDS: Brand[] = [
  { id: "brd-acme", name: "Acme" },
  { id: "brd-lumen", name: "Lumen" },
  { id: "brd-vertex", name: "Vertex" },
];

export const DEMO_UNITS: Unit[] = [
  { id: "un-un", name: "Unidade", abbrev: "un" },
  { id: "un-kg", name: "Quilograma", abbrev: "kg" },
  { id: "un-cx", name: "Caixa", abbrev: "cx" },
  { id: "un-h", name: "Hora", abbrev: "h" },
];

export const DEMO_SALESPEOPLE: Salesperson[] = [
  { id: "sp-1", name: "Ana Vendas" },
  { id: "sp-2", name: "Bruno Comercial" },
  { id: "sp-3", name: "Carla Contas" },
];

export const DEMO_PRODUCTS: Product[] = [
  { id: "prd-1", name: "Notebook Pro 14", sku: "NB-14", sale_price: 7499.0 },
  { id: "prd-2", name: "Monitor 27 4K", sku: "MN-27", sale_price: 2190.0 },
  { id: "prd-3", name: "Teclado mecânico", sku: "TC-01", sale_price: 459.9 },
  { id: "prd-4", name: "Cadeira ergonômica", sku: "CAD-ER", sale_price: 1899.0 },
];

export const DEMO_SERVICES: Service[] = [
  { id: "srv-1", name: "Consultoria (hora)", price: 320.0 },
  { id: "srv-2", name: "Implantação", price: 8500.0 },
  { id: "srv-3", name: "Suporte mensal", price: 1200.0 },
];

export const DEMO_SALES: SaleDocRow[] = [
  { id: "vd-1041", kind: "venda", item_kind: "produto", party_name: "Aurora Varejo", doc_date: isoDay(new Date()), total: 18990.0, status: "aberto" },
  { id: "vd-1040", kind: "venda", item_kind: "servico", party_name: "Atlas Cloud Ltda", doc_date: isoDay(new Date(Date.now() - 2 * 864e5)), total: 8500.0, status: "faturado" },
  { id: "or-0210", kind: "orcamento", item_kind: "produto", party_name: "Meridian Design", doc_date: isoDay(new Date(Date.now() - 3 * 864e5)), total: 4590.0, status: "orcamento" },
  { id: "cp-0339", kind: "compra", item_kind: "produto", party_name: "Fornecedor Têxtil SA", doc_date: isoDay(new Date(Date.now() - 5 * 864e5)), total: 12300.5, status: "aberto" },
];
