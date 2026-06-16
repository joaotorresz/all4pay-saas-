/**
 * Data access for cadastros (produtos, serviços, marcas, unidades,
 * vendedores) and vendas/compras/transferências/contratos.
 * Demo-safe: in demo mode reads the seed / no-ops writes; live mode
 * hits Supabase. New tables live in migrations 0002/0003.
 */
import { createClient } from "@/lib/supabase/client";
import { isDemo } from "@/lib/demo";
import { importedParties, updateImportedParty } from "@/lib/imported";
import {
  DEMO_BRANDS,
  DEMO_UNITS,
  DEMO_SALESPEOPLE,
  DEMO_PRODUCTS,
  DEMO_SERVICES,
  DEMO_PARTIES,
  DEMO_SALES,
} from "@/lib/demo/seed";
import { isoDay } from "@/lib/aggregations";
import type {
  Brand,
  Unit,
  Salesperson,
  Product,
  Service,
  Party,
  SaleDocRow,
  TransferenciaInput,
  SaleDocInput,
  ContratoInput,
  PartyInput,
  ProductInput,
  ServiceInput,
  BrandInput,
  UnitInput,
} from "@/lib/types";

const delay = () => new Promise((r) => setTimeout(r, 450));
const uuid = () => globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}`;

/* ---- selects ---- */
export async function getBrands(): Promise<Brand[]> {
  if (isDemo) return DEMO_BRANDS;
  const s = createClient();
  const { data, error } = await s.from("brands").select("id,name").order("name");
  if (error) throw error;
  return (data ?? []) as Brand[];
}
export async function getUnits(): Promise<Unit[]> {
  if (isDemo) return DEMO_UNITS;
  const s = createClient();
  const { data, error } = await s.from("units").select("id,name,abbrev").order("name");
  if (error) throw error;
  return (data ?? []) as Unit[];
}
export async function getSalespeople(): Promise<Salesperson[]> {
  if (isDemo) return DEMO_SALESPEOPLE;
  const s = createClient();
  const { data, error } = await s
    .from("salespeople")
    .select("id,name")
    .eq("active", true)
    .order("name");
  if (error) throw error;
  return (data ?? []) as Salesperson[];
}
export async function getProducts(): Promise<Product[]> {
  if (isDemo) return DEMO_PRODUCTS;
  const s = createClient();
  const { data, error } = await s.from("products").select("id,name,sale_price").order("name");
  if (error) throw error;
  return (data ?? []) as Product[];
}
export async function getServices(): Promise<Service[]> {
  if (isDemo) return DEMO_SERVICES;
  const s = createClient();
  const { data, error } = await s.from("services").select("id,name,price").order("name");
  if (error) throw error;
  return (data ?? []) as Service[];
}

/* ---- listings ---- */
export async function listProducts(): Promise<Product[]> {
  if (isDemo) return DEMO_PRODUCTS;
  const s = createClient();
  const { data, error } = await s
    .from("products")
    .select("id,name,sku,sale_price")
    .order("name");
  if (error) throw error;
  return (data ?? []) as Product[];
}
export async function listServices(): Promise<Service[]> {
  if (isDemo) return DEMO_SERVICES;
  const s = createClient();
  const { data, error } = await s
    .from("services")
    .select("id,name,price")
    .order("name");
  if (error) throw error;
  return (data ?? []) as Service[];
}
/** All clientes + fornecedores, for the Contatos screen. */
export async function listParties(): Promise<Party[]> {
  if (isDemo) return importedParties() ?? DEMO_PARTIES;
  const s = createClient();
  const { data, error } = await s
    .from("parties")
    .select("id,type,name,doc,phone,email,is_customer,is_supplier,is_carrier")
    .order("name");
  if (error) throw error;
  return (data ?? []) as Party[];
}
export async function listSales(): Promise<SaleDocRow[]> {
  if (isDemo) return DEMO_SALES;
  const s = createClient();
  const { data, error } = await s
    .from("sales_docs")
    .select("id,kind,item_kind,doc_date,total,status,parties(name)")
    .order("doc_date", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    const party = row.parties as { name?: string } | null;
    return {
      id: String(row.id),
      kind: row.kind as SaleDocRow["kind"],
      item_kind: row.item_kind as SaleDocRow["item_kind"],
      party_name: party?.name ?? "—",
      doc_date: String(row.doc_date),
      total: Number(row.total ?? 0),
      status: String(row.status),
    };
  });
}

/* ---- writes ---- */

export async function createTransferencia(input: TransferenciaInput): Promise<void> {
  if (isDemo) return void (await delay());
  const s = createClient();
  const groupId = uuid();
  const common = {
    status: "pago" as const,
    category: null,
    amount: input.amount,
    due_date: input.date,
    paid_date: input.date,
    reconciled: false,
    description: input.description,
    group_id: groupId,
  };
  const { error } = await s.from("movements").insert([
    { ...common, account_id: input.from_account_id, type: "saida" },
    { ...common, account_id: input.to_account_id, type: "entrada" },
  ]);
  if (error) throw error;
}

export async function createSaleDoc(input: SaleDocInput): Promise<void> {
  if (isDemo) return void (await delay());
  const s = createClient();
  const subtotal = input.items.reduce(
    (sum, it) => sum + (it.qty * it.unit_price - it.discount),
    0,
  );
  const total = Math.max(0, subtotal - input.discount);
  const status = input.kind === "orcamento" ? "orcamento" : "aberto";

  const { data: doc, error } = await s
    .from("sales_docs")
    .insert({
      kind: input.kind,
      item_kind: input.item_kind,
      party_id: input.party_id,
      salesperson_id: input.salesperson_id,
      cost_center_id: input.cost_center_id,
      doc_date: input.doc_date,
      validity: input.validity,
      subtotal,
      discount: input.discount,
      total,
      status,
      notes: input.notes,
    })
    .select("id")
    .single();
  if (error) throw error;

  if (input.items.length) {
    const refCol = input.item_kind === "produto" ? "product_id" : "service_id";
    const { error: ie } = await s.from("sale_items").insert(
      input.items.map((it) => ({
        doc_id: doc!.id,
        [refCol]: it.ref_id,
        description: it.description,
        qty: it.qty,
        unit_price: it.unit_price,
        discount: it.discount,
        total: it.qty * it.unit_price - it.discount,
      })),
    );
    if (ie) throw ie;
  }

  // Orçamento não gera lançamento financeiro.
  if (input.kind !== "orcamento" && input.account_id) {
    const tipo = input.kind === "venda" ? "entrada" : "saida";
    const baseDue = input.due_date ?? input.doc_date;
    const rotulo = input.kind === "venda" ? "Venda" : "Compra";
    const n = input.installments && input.installments > 1 ? input.installments : 1;

    if (n > 1) {
      // Parcelado: N lançamentos A RECEBER, um por mês, ligados pelo group_id (doc).
      const parcela = Math.round((total / n) * 100) / 100;
      const rows = Array.from({ length: n }, (_, i) => ({
        account_id: input.account_id,
        type: tipo,
        status: "pendente",
        amount: i === n - 1 ? Math.round((total - parcela * (n - 1)) * 100) / 100 : parcela,
        due_date: addMonthsISO(baseDue, i),
        paid_date: null,
        reconciled: false,
        description: `${rotulo} · ${input.item_kind} · ${i + 1}/${n}`,
        party_id: input.party_id,
        cost_center_id: input.cost_center_id,
        payment_method: input.payment_method,
        installment_no: i + 1,
        installment_total: n,
        group_id: doc!.id,
      }));
      const { error: me } = await s.from("movements").insert(rows);
      if (me) throw me;
    } else {
      const settled = input.settled;
      const { error: me } = await s.from("movements").insert({
        account_id: input.account_id,
        type: tipo,
        status: settled ? "pago" : "pendente",
        amount: total,
        due_date: baseDue,
        paid_date: settled ? isoDay(new Date()) : null,
        reconciled: false,
        description: `${rotulo} · ${input.item_kind}`,
        party_id: input.party_id,
        cost_center_id: input.cost_center_id,
        payment_method: input.payment_method,
        group_id: doc!.id,
      });
      if (me) throw me;
    }
  }
}

/** Soma `m` meses a uma data ISO (yyyy-mm-dd), preservando o dia quando possível. */
function addMonthsISO(iso: string, m: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setMonth(d.getMonth() + m);
  return d.toISOString().slice(0, 10);
}

export async function createContrato(input: ContratoInput): Promise<void> {
  if (isDemo) return void (await delay());
  const s = createClient();
  const { error } = await s.from("recurrences").insert({
    party_id: input.party_id,
    type: input.type,
    description: input.description,
    amount: input.amount,
    freq: input.freq,
    start_date: input.start_date,
    end_date: input.end_date,
    category_id: input.category_id,
    cost_center_id: input.cost_center_id,
    due_day: input.due_day,
  });
  if (error) throw error;
}

export async function createParty(input: PartyInput): Promise<void> {
  if (isDemo) return void (await delay());
  const s = createClient();
  const { error } = await s.from("parties").insert(input);
  if (error) throw error;
}

/** Atualiza um contato existente (ex.: adicionar telefone para cobrança). */
export async function updateParty(id: string, patch: Partial<PartyInput>): Promise<void> {
  if (isDemo) {
    await delay();
    // Em demo, reflete no dataset importado (quando o contato veio do FDIP).
    updateImportedParty(id, patch as Partial<Party>);
    return;
  }
  const s = createClient();
  const { error } = await s.from("parties").update(patch).eq("id", id);
  if (error) throw error;
}

export async function createProduct(input: ProductInput): Promise<void> {
  if (isDemo) return void (await delay());
  const s = createClient();
  const { error } = await s.from("products").insert(input);
  if (error) throw error;
}

export interface ProductFull extends ProductInput { id: string }

/** Produto completo para edição (todos os campos). Demo: do seed (campos limitados). */
export async function getProduct(id: string): Promise<ProductFull | null> {
  if (isDemo) {
    const p = DEMO_PRODUCTS.find((x) => x.id === id);
    return p ? { id: p.id, name: p.name, sku: p.sku ?? null, category_id: null, unit_id: null, brand_id: null, sale_price: p.sale_price ?? 0, cost_price: null, track_stock: false, stock_initial: null } : null;
  }
  const s = createClient();
  const { data, error } = await s.from("products")
    .select("id,name,sku,category_id,unit_id,brand_id,sale_price,cost_price,track_stock,stock_initial")
    .eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as ProductFull) ?? null;
}

export async function updateProduct(id: string, input: ProductInput): Promise<void> {
  if (isDemo) return void (await delay());
  const s = createClient();
  const { error } = await s.from("products").update(input).eq("id", id);
  if (error) throw error;
}

export async function deleteProduct(id: string): Promise<void> {
  if (isDemo) return void (await delay());
  const s = createClient();
  const { error } = await s.from("products").delete().eq("id", id);
  if (error) throw error;
}

export async function createService(input: ServiceInput): Promise<void> {
  if (isDemo) return void (await delay());
  const s = createClient();
  const { error } = await s.from("services").insert(input);
  if (error) throw error;
}

export async function createBrand(input: BrandInput): Promise<void> {
  if (isDemo) return void (await delay());
  const s = createClient();
  const { error } = await s.from("brands").insert(input);
  if (error) throw error;
}

export async function createUnit(input: UnitInput): Promise<void> {
  if (isDemo) return void (await delay());
  const s = createClient();
  const { error } = await s.from("units").insert(input);
  if (error) throw error;
}
