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
  { id: "pty-northwind", type: "pj", name: "Northwind Logística", is_customer: true },
  { id: "pty-atlas", type: "pj", name: "Atlas Cloud Ltda", is_customer: true },
  { id: "pty-meridian", type: "pj", name: "Meridian Design", is_customer: true },
  { id: "pty-aurora", type: "pj", name: "Aurora Varejo", is_customer: true },
  { id: "pty-costa", type: "pf", name: "Costa & Filhos", is_customer: true },
  { id: "pty-energia", type: "pj", name: "Energia Sudeste", is_supplier: true },
  { id: "pty-textil", type: "pj", name: "Fornecedor Têxtil SA", is_supplier: true },
  { id: "pty-telecom", type: "pj", name: "Telecom Brasil", is_supplier: true },
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
  { id: "prd-1", name: "Notebook Pro 14" },
  { id: "prd-2", name: "Monitor 27 4K" },
  { id: "prd-3", name: "Teclado mecânico" },
  { id: "prd-4", name: "Cadeira ergonômica" },
];

export const DEMO_SERVICES: Service[] = [
  { id: "srv-1", name: "Consultoria (hora)" },
  { id: "srv-2", name: "Implantação" },
  { id: "srv-3", name: "Suporte mensal" },
];
