// Edge Function: pluggy-webhook — ARQUIVO ÚNICO (self-contained, deploy pelo
// dashboard). verify_jwt = false (o Pluggy não manda JWT Supabase; auth por
// segredo na query). Caminho PASSIVO (produção): recebe item/created|updated e
// roda o ETL (item→contas→transações→movements, idempotente). Em sandbox o
// Pluggy não dispara o webhook — por isso existe o sync ATIVO (pluggy-sync-item),
// que usa o MESMO ETL. Secrets só via Deno.env — nunca logar.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const PLUGGY_API = "https://api.pluggy.ai";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function fetchTimeout(url: string, init: RequestInit, ms = 10000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...init, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

async function pluggyAuth(): Promise<string> {
  const clientId = Deno.env.get("PLUGGY_CLIENT_ID");
  const clientSecret = Deno.env.get("PLUGGY_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("PLUGGY_CLIENT_ID/SECRET ausentes");
  const r = await fetchTimeout(`${PLUGGY_API}/auth`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, clientSecret }),
  });
  if (!r.ok) throw new Error(`pluggy /auth ${r.status}`);
  return (await r.json()).apiKey as string;
}
async function pluggyGet<T = unknown>(apiKey: string, path: string): Promise<T> {
  const r = await fetchTimeout(`${PLUGGY_API}${path}`, { headers: { "X-API-KEY": apiKey } });
  if (!r.ok) throw new Error(`pluggy GET ${path} ${r.status}`);
  return r.json() as Promise<T>;
}

interface PluggyItem { id: string; connector?: { id?: number; name?: string }; clientUserId?: string; status?: string; statusDetail?: unknown }
interface PluggyAccount { id: string; type?: string; subtype?: string; name?: string; number?: string; balance?: number; currencyCode?: string }
interface PluggyTx { id: string; amount: number; currencyCode?: string; date: string; description?: string; category?: string; type?: string }
interface Paged<T> { results: T[]; totalPages?: number; page?: number }

async function etlMovements(db: SupabaseClient, orgId: string, txs: PluggyTx[], bankRowByTx: Map<string, string>) {
  const { data: accs } = await db.from("financial_accounts").select("id").eq("org_id", orgId).limit(1);
  const finAcc = (accs as { id: string }[] | null)?.[0]?.id;
  if (!finAcc) return;
  for (const t of txs) {
    const ref = `pluggy:${t.id}`;
    const entrada = (t.amount ?? 0) >= 0;
    const dia = (t.date || "").slice(0, 10);
    const ins = await db.from("movements").insert({
      org_id: orgId, account_id: finAcc, type: entrada ? "entrada" : "saida", status: "pago",
      category: t.category ?? null, amount: Math.abs(t.amount ?? 0), due_date: dia, paid_date: dia,
      reconciled: true, description: t.description ?? "Open Finance", reference_code: ref,
    }).select("id").single();
    let movId = ins.data?.id as string | undefined;
    if (ins.error) {
      if (ins.error.code !== "23505") continue;
      const { data: ex } = await db.from("movements").select("id").eq("org_id", orgId).eq("reference_code", ref).maybeSingle();
      movId = ex?.id as string | undefined;
    }
    const btId = bankRowByTx.get(t.id);
    if (movId && btId) await db.from("bank_transactions").update({ movement_id: movId }).eq("id", btId);
  }
}

async function processarItem(db: SupabaseClient, apiKey: string, itemId: string) {
  const item = await pluggyGet<PluggyItem>(apiKey, `/items/${itemId}`);
  const orgId = item.clientUserId;
  if (!orgId) throw new Error("item sem clientUserId (org_id)");

  await db.from("pluggy_items").upsert({
    org_id: orgId, pluggy_item_id: item.id, connector_id: item.connector?.id ?? null,
    connector_name: item.connector?.name ?? null, client_user_id: orgId,
    status: item.status ?? null, status_detail: item.statusDetail ?? null,
    last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }, { onConflict: "org_id,pluggy_item_id" });

  const accounts = await pluggyGet<Paged<PluggyAccount>>(apiKey, `/accounts?itemId=${itemId}`);
  for (const a of accounts.results ?? []) {
    await db.from("bank_accounts").upsert({
      org_id: orgId, pluggy_account_id: a.id, type: a.type ?? null, subtype: a.subtype ?? null,
      name: a.name ?? null, number: a.number ?? null, balance: a.balance ?? null,
      currency: a.currencyCode ?? "BRL", raw: a as unknown, updated_at: new Date().toISOString(),
    }, { onConflict: "org_id,pluggy_account_id" });
    const { data: ba } = await db.from("bank_accounts").select("id").eq("org_id", orgId).eq("pluggy_account_id", a.id).single();
    const accId = ba?.id as string | undefined;
    if (!accId) continue;

    const allTx: PluggyTx[] = [];
    let page = 1, totalPages = 1;
    do {
      const tp = await pluggyGet<Paged<PluggyTx>>(apiKey, `/transactions?accountId=${a.id}&page=${page}&pageSize=500`);
      allTx.push(...(tp.results ?? []));
      totalPages = tp.totalPages ?? 1;
      page++;
    } while (page <= totalPages && page < 50);

    const bankRowByTx = new Map<string, string>();
    for (const t of allTx) {
      const { data: bt } = await db.from("bank_transactions").upsert({
        org_id: orgId, account_id: accId, pluggy_transaction_id: t.id, amount: t.amount,
        currency: t.currencyCode ?? "BRL", date: t.date, description: t.description ?? null,
        category: t.category ?? null, type: t.type ?? null, raw: t as unknown,
      }, { onConflict: "org_id,pluggy_transaction_id" }).select("id").single();
      if (bt?.id) bankRowByTx.set(t.id, bt.id as string);
    }
    // TODO(produto): hoje TODA transação OF vira movement. Confirmar com o usuário
    // se deve ser só de contas marcadas (a origem já fica em reference_code='pluggy:').
    await etlMovements(db, orgId, allTx, bankRowByTx);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const secret = Deno.env.get("PLUGGY_WEBHOOK_SECRET");
    if (secret) {
      const url = new URL(req.url);
      if (url.searchParams.get("secret") !== secret) return json(401, { error: "bad secret" });
    }
    const body = await req.json().catch(() => ({}));
    const event = body.event as string | undefined;
    const itemId = (body.itemId ?? body.id) as string | undefined;
    if (!event || !itemId) return json(200, { ok: true, ignored: "sem event/itemId" });

    if (event === "item/created" || event === "item/updated") {
      const apiKey = await pluggyAuth();
      const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      await processarItem(admin, apiKey, itemId);
      return json(200, { ok: true, event, itemId });
    }
    return json(200, { ok: true, ignored: event });
  } catch (e) {
    return json(500, { error: String((e as Error)?.message ?? e) });
  }
});
