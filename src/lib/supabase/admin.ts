import { createClient } from "@supabase/supabase-js";

/**
 * Supabase admin client (service-role) — SERVER-ONLY. Usado por runners
 * agendados (Cron) que precisam operar entre organizações, sem sessão de
 * usuário. BYPASSA RLS: por isso TODO insert deve passar `org_id` explícito.
 * Nunca importar no cliente.
 */
export function createAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
