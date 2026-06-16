// Edge Function: pluggy-sync-item — ARQUIVO ÚNICO (self-contained, deploy pelo
// editor do dashboard). verify_jwt = OFF no gateway (marque nas Settings) → o
// preflight OPTIONS passa; a auth é validada AQUI no handler (getUser → 401).
// Caminho ATIVO do Open Finance: o front chama com { itemId } no onSuccess do
// widget (o webhook do Pluggy não dispara em sandbox). Valida POSSE do item
// (item.clientUserId === org do chamador) e roda o ETL com service-role.
// Idempotente (ON CONFLICT/23505) → não duplica com o webhook. Secrets só via
// Deno.env — nunca logar.
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
    try {
      const ref = `pluggy:${t.id}`;
      const entrada = (t.amount ?? 0) >= 0;
      const dia = (t.date || "").slice(0, 10);
      // movements NÃO tem unique TOTAL em (org_id, reference_code) — só índice
      // PARCIAL (pluggy:%). Por isso .insert() + trata 23505 (NUNCA .upsert com
      // onConflict aqui → 42P10). A idempotência vem do índice parcial.
      const ins = await db.from("movements").insert({
        org_id: orgId, account_id: finAcc, type: entrada ? "entrada" : "saida", status: "pago",
        category: t.category ?? null, amount: Math.abs(t.amount ?? 0), due_date: dia, paid_date: dia,
        reconciled: true, description: t.description ?? "Open Finance", reference_code: ref,
        review_status: "pendente", // novo de origem OF → entra na fila de confirmação
      }).select("id").single();
      let movId = ins.data?.id as string | undefined;
      if (ins.error) {
        if (ins.error.code !== "23505") { console.error("movements insert", ins.error.message); continue; }
        const { data: ex } = await db.from("movements").select("id").eq("org_id", orgId).eq("reference_code", ref).maybeSingle();
        movId = ex?.id as string | undefined;
      }
      const btId = bankRowByTx.get(t.id);
      if (movId && btId) await db.from("bank_transactions").update({ movement_id: movId }).eq("id", btId);
    } catch (e) {
      // uma transação ruim NÃO derruba o sync inteiro
      console.error("etl tx", t.id, String((e as Error)?.message ?? e));
      continue;
    }
  }
}

async function processarItem(db: SupabaseClient, apiKey: string, itemId: string, expectedOrgId: string) {
  const item = await pluggyGet<PluggyItem>(apiKey, `/items/${itemId}`);
  const orgId = item.clientUserId;
  if (!orgId) throw new Error("item sem clientUserId (org_id)");
  if (orgId !== expectedOrgId) return null; // posse não confere → 403

  let nAccounts = 0, nTx = 0;

  // Estratégia 2A "última conexão vence": remove conexões antigas do MESMO banco
  // (connector) nesta org, exceto o item atual. Cascata limpa contas/transações;
  // os movements ficam (FK movement_id ON DELETE SET NULL) e são re-vinculados.
  const connId = item.connector?.id ?? null;
  if (connId != null) {
    await db.from("pluggy_items").delete().eq("org_id", orgId).eq("connector_id", connId).neq("pluggy_item_id", item.id);
  }

  const { data: itemRow } = await db.from("pluggy_items").upsert({
    org_id: orgId, pluggy_item_id: item.id, connector_id: connId,
    connector_name: item.connector?.name ?? null, client_user_id: orgId,
    status: item.status ?? null, status_detail: item.statusDetail ?? null,
    last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }, { onConflict: "org_id,pluggy_item_id" }).select("id").single();
  const itemUuid = itemRow?.id as string | undefined;

  const accounts = await pluggyGet<Paged<PluggyAccount>>(apiKey, `/accounts?itemId=${itemId}`);
  for (const a of accounts.results ?? []) {
    nAccounts++;
    await db.from("bank_accounts").upsert({
      org_id: orgId, item_id: itemUuid, pluggy_account_id: a.id, type: a.type ?? null, subtype: a.subtype ?? null,
      name: a.name ?? null, number: a.number ?? null, balance: a.balance ?? null,
      currency: a.currencyCode ?? "BRL", raw: a as unknown, updated_at: new Date().toISOString(),
    }, { onConflict: "org_id,pluggy_account_id" });
    const { data: ba } = await db.from("bank_accounts").select("id").eq("org_id", orgId).eq("pluggy_account_id", a.id).single();
    const accId = ba?.id as string | undefined;
    if (!accId) continue;

    try {
      // /v2/transactions — paginação por CURSOR (o legado page-based dá 410 Gone).
      // O cursor vai na query `after`; a resposta traz `next` (token da próxima).
      const allTx: PluggyTx[] = [];
      let after: string | undefined;
      let guard = 0;
      do {
        const qs = new URLSearchParams({ accountId: a.id });
        if (after) qs.set("after", after);
        const tp = await pluggyGet<{ results: PluggyTx[]; next?: string | null }>(apiKey, `/v2/transactions?${qs}`);
        allTx.push(...(tp.results ?? []));
        after = tp.next ?? undefined;
        guard++;
      } while (after && guard < 200);

      const bankRowByTx = new Map<string, string>();
      for (const t of allTx) {
        const { data: bt } = await db.from("bank_transactions").upsert({
          org_id: orgId, account_id: accId, pluggy_transaction_id: t.id, amount: t.amount,
          currency: t.currencyCode ?? "BRL", date: t.date, description: t.description ?? null,
          category: t.category ?? null, type: t.type ?? null, raw: t as unknown,
        }, { onConflict: "org_id,pluggy_transaction_id" }).select("id").single();
        if (bt?.id) bankRowByTx.set(t.id, bt.id as string);
      }
      nTx += allTx.length;
      await etlMovements(db, orgId, allTx, bankRowByTx);
    } catch (e) {
      // falha nas transações de UMA conta não derruba o sync (item + outras contas valem)
      console.error("tx conta", a.id, String((e as Error)?.message ?? e));
      continue;
    }
  }

  await limparOrfaosPluggy(db, orgId);
  return { items: 1, accounts: nAccounts, transactions: nTx };
}

/** Opção 1: apaga movements de Open Finance (reference_code 'pluggy:%') que
 *  ficaram ÓRFÃOS — sem nenhuma bank_transaction viva apontando (a 2A troca os
 *  transaction_id no sandbox e o movement antigo perde o vínculo, inflando saldo/
 *  DRE). Escopo estrito: só 'pluggy:%' da org — nunca lançamentos manuais. */
async function limparOrfaosPluggy(db: SupabaseClient, orgId: string) {
  const { data: cand } = await db.from("movements").select("id").eq("org_id", orgId).like("reference_code", "pluggy:%");
  const ids = ((cand ?? []) as { id: string }[]).map((m) => m.id);
  if (!ids.length) return;
  const { data: vivos } = await db.from("bank_transactions").select("movement_id").eq("org_id", orgId).in("movement_id", ids);
  const vivoSet = new Set(((vivos ?? []) as { movement_id: string | null }[]).map((v) => v.movement_id).filter(Boolean));
  const orfaos = ids.filter((id) => !vivoSet.has(id));
  if (orfaos.length) await db.from("movements").delete().in("id", orfaos);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: uErr } = await userClient.auth.getUser();
    if (uErr || !user) return json(401, { error: "unauthorized" });

    const { data: mem } = await userClient
      .from("organization_members").select("org_id").eq("user_id", user.id).limit(1).maybeSingle();
    const orgId = mem?.org_id as string | undefined;
    if (!orgId) return json(403, { error: "sem organização" });

    const body = await req.json().catch(() => ({}));
    const itemId = body.itemId as string | undefined;
    if (!itemId) return json(400, { error: "itemId obrigatório" });

    const apiKey = await pluggyAuth();
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const resumo = await processarItem(admin, apiKey, itemId, orgId);
    if (resumo === null) return json(403, { error: "item não pertence à organização" });

    return json(200, { ok: true, ...resumo });
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    const timeout = (e as Error)?.name === "AbortError";
    return json(timeout ? 504 : 500, { error: timeout ? "timeout ao falar com a Pluggy" : msg });
  }
});
