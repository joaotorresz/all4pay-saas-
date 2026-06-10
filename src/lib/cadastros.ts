/**
 * Data access for cadastros (produtos, serviços, marcas, unidades,
 * vendedores) and vendas/compras/transferências/contratos.
 * Demo-safe: in demo mode reads the seed / no-ops writes; live mode
 * hits Supabase. New tables live in migrations 0002/0003.
 */
import { createClient } from "@/lib/supabase/client";
import { isDemo } from "@/lib/demo";
import { importedParties } from "@/lib/imported";
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
  const { data, error } = await s.from("products").select("id,name").order("name");
  if (error) throw error;
  return (data ?? []) as Product[];
}
export async function getServices(): Promise<Service[]> {
  if (isDemo) return DEMO_SERVICES;
  const s = createClient();
  const { data, error } = await s.from("services").select("id,name").order("name");
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
    .select("id,type,name,doc,is_customer,is_supplier,is_carrier")
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
    const settled = input.settled;
    const { error: me } = await s.from("movements").insert({
      account_id: input.account_id,
      type: input.kind === "venda" ? "entrada" : "saida",
      status: settled ? "pago" : "pendente",
      amount: total,
      due_date: input.due_date ?? input.doc_date,
      paid_date: settled ? isoDay(new Date()) : null,
      reconciled: false,
      description:
        (input.kind === "venda" ? "Venda" : "Compra") +
        ` · ${input.item_kind}`,
      party_id: input.party_id,
      cost_center_id: input.cost_center_id,
      payment_method: input.payment_method,
    });
    if (me) throw me;
  }
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

export async function createProduct(input: ProductInput): Promise<void> {
  if (isDemo) return void (await delay());
  const s = createClient();
  const { error } = await s.from("products").insert(input);
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
