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
