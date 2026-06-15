/**
 * Open Finance (Pluggy) — lado cliente. Pede o connect token à Edge Function
 * `pluggy-connect-token` (que resolve o org_id do JWT e nunca expõe os secrets).
 * Demo-safe: em demo não chama a função.
 */
import { isDemo } from "@/lib/demo";
import { createClient } from "@/lib/supabase/client";

export async function getPluggyConnectToken(): Promise<string> {
  if (isDemo) throw new Error("Open Finance indisponível em modo demonstração");
  const { data, error } = await createClient().functions.invoke("pluggy-connect-token", { body: {} });
  if (error) throw new Error(error.message);
  const token = (data as { connectToken?: string } | null)?.connectToken;
  if (!token) throw new Error("connect token vazio");
  return token;
}

export interface SyncResumo { items: number; accounts: number; transactions: number }

/** Sync ATIVO: busca item/contas/transações na hora (o webhook não dispara em
 *  sandbox). Idempotente no servidor — não duplica com o caminho passivo. */
export async function syncPluggyItem(itemId: string): Promise<SyncResumo> {
  if (isDemo) throw new Error("Open Finance indisponível em modo demonstração");
  const { data, error } = await createClient().functions.invoke("pluggy-sync-item", { body: { itemId } });
  if (error) throw new Error(error.message);
  const r = data as (SyncResumo & { ok?: boolean }) | null;
  if (!r?.ok) throw new Error("sync falhou");
  return { items: r.items, accounts: r.accounts, transactions: r.transactions };
}
