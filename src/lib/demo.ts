/**
 * Global demonstration flag.
 *
 * When `isDemo` is true, the data hooks return deterministic seed data
 * (and the UI shows a "Demonstração" badge) instead of querying Supabase.
 *
 * It is true when EITHER:
 *  - `NEXT_PUBLIC_ALL4PAY_DEMO` is explicitly "true", OR
 *  - the Supabase env vars are absent (so the deployed preview still
 *    renders real-looking data instead of erroring).
 *
 * Set `NEXT_PUBLIC_ALL4PAY_DEMO=false` AND provide the Supabase env vars
 * to run against live data.
 */
const explicit = process.env.NEXT_PUBLIC_ALL4PAY_DEMO;
const hasSupabaseEnv =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isDemo: boolean =
  explicit === "true" || (explicit !== "false" && !hasSupabaseEnv);
