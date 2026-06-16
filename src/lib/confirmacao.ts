/**
 * Fila de Confirmação (Open Finance / import) — movements review_status='pendente'.
 * O usuário revisa, classifica e CRIA/VINCULA um contato (parties). Live-only:
 * em demo a fila fica vazia (Open Finance não existe em demo).
 */
import { isDemo } from "@/lib/demo";
import { createClient } from "@/lib/supabase/client";

export interface PendingMovement {
  id: string;
  type: "entrada" | "saida";
  amount: number;
  due_date: string;
  paid_date: string | null;
  description: string | null;
  category: string | null;
  party_id: string | null;
}

export async function getPendingMovements(): Promise<PendingMovement[]> {
  if (isDemo) return [];
  const { data, error } = await createClient()
    .from("movements")
    .select("id,type,amount,due_date,paid_date,description,category,party_id")
    .eq("review_status", "pendente")
    .order("due_date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PendingMovement[];
}

export async function confirmMovement(
  id: string,
  patch: { party_id?: string | null; category_id?: string | null; cost_center_id?: string | null; nsu?: string | null },
): Promise<void> {
  if (isDemo) return;
  const upd: Record<string, unknown> = { review_status: "confirmado" };
  if (patch.party_id !== undefined) upd.party_id = patch.party_id;
  if (patch.category_id) upd.category_id = patch.category_id;
  if (patch.cost_center_id) upd.cost_center_id = patch.cost_center_id;
  if (patch.nsu) upd.nsu = patch.nsu; // código de referência (não toca o reference_code do OF)
  const { error } = await createClient().from("movements").update(upd).eq("id", id);
  if (error) throw error;
}

/** Cria uma recorrência de DESPESA (saída) a partir da revisão — quando o usuário
 *  marca "repete o pagamento". Live-only. */
export async function criarRecorrenciaSaida(input: {
  partyId: string | null; amount: number; description: string; freq: string; vencimentoISO: string;
}): Promise<void> {
  if (isDemo) return;
  const dueDay = Number(input.vencimentoISO.slice(8, 10)) || 1;
  const { error } = await createClient().from("recurrences").insert({
    party_id: input.partyId, type: "saida", description: input.description,
    amount: input.amount, freq: input.freq, start_date: input.vencimentoISO,
    due_day: dueDay, active: true,
  });
  if (error) throw error;
}

export async function ignoreMovement(id: string): Promise<void> {
  if (isDemo) return;
  const { error } = await createClient().from("movements").update({ review_status: "ignorado" }).eq("id", id);
  if (error) throw error;
}

/**
 * Enriquecimento de contraparte a partir do dado bruto — STUB.
 * HOJE (sandbox): só há `description` (paymentData/merchant = null) → nome do texto.
 * TODO(produção): quando `raw.paymentData` existir, extrair payer/receiver (conforme
 * entrada/saída) → name + CPF/CNPJ e normalizar docDigits (só números). O fluxo da
 * fila funciona sem isso (o usuário confirma manualmente no sandbox).
 */
export function parseCounterpartyFromRaw(
  raw: { description?: string | null; paymentData?: unknown } | null | undefined,
): { name: string | null; doc: string | null; docDigits: string | null } {
  return { name: raw?.description ?? null, doc: null, docDigits: null };
}

export const normalizarNome = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export interface ResolveContato { id: string; name: string; reused: boolean }

/**
 * Acha (por doc_digits exato ou nome normalizado) ou CRIA um contato em parties.
 * Trata 23505 (parties_doc_unique) reaproveitando o existente — anti-duplicação.
 * org_id é resolvido pela RLS (auth_org_id()).
 */
export async function findOrCreateParty(input: {
  name: string; type: "pf" | "pj"; docDigits?: string; isCustomer: boolean; isSupplier: boolean;
}): Promise<ResolveContato> {
  if (isDemo) return { id: `demo-${Date.now()}`, name: input.name, reused: false };
  const supabase = createClient();
  const docDigits = (input.docDigits ?? "").replace(/\D/g, "");

  if (docDigits) {
    const { data } = await supabase.from("parties").select("id,name").eq("doc_digits", docDigits).maybeSingle();
    if (data) return { id: data.id, name: data.name, reused: true };
  } else {
    const { data } = await supabase.from("parties").select("id,name").ilike("name", input.name);
    const hit = (data ?? []).find((p) => normalizarNome(p.name) === normalizarNome(input.name));
    if (hit) return { id: hit.id, name: hit.name, reused: true };
  }

  // doc_digits é coluna GERADA (de `doc`) — NÃO inserir nela; só `doc`.
  const { data: created, error } = await supabase.from("parties").insert({
    type: input.type, name: input.name, doc: docDigits || null,
    is_customer: input.isCustomer, is_supplier: input.isSupplier, is_carrier: false,
  }).select("id,name").single();
  if (!error && created) return { id: created.id, name: created.name, reused: false };

  if ((error as { code?: string } | null)?.code === "23505" && docDigits) {
    const { data } = await supabase.from("parties").select("id,name").eq("doc_digits", docDigits).maybeSingle();
    if (data) return { id: data.id, name: data.name, reused: true };
  }
  throw error;
}
