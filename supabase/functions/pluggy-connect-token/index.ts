// Edge Function: pluggy-connect-token
// verify_jwt = FALSE no gateway (senão o preflight OPTIONS — que não carrega
// Authorization — é barrado pelo gateway e o CORS pendura pra sempre). A auth
// NÃO regride: o JWT é validado AQUI no handler (getUser → 401 sem usuário).
// Resolve o org_id do chamador e devolve um connect token Pluggy (vale ~30min).
// NUNCA devolve a apiKey nem os secrets.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PLUGGY_API = "https://api.pluggy.ai";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

/** fetch com timeout defensivo (evita "pending eterno" se a Pluggy travar). */
async function fetchTimeout(url: string, init: RequestInit, ms = 10000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/** /auth → apiKey (válido ~2h). Secrets só via Deno.env — nunca logar. */
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    // Auth no código (o gateway não verifica mais) — sem usuário → 401.
    const { data: { user }, error: uErr } = await supabase.auth.getUser();
    if (uErr || !user) return json(401, { error: "unauthorized" });

    // org_id do chamador (RLS deixa o usuário ler a própria membership)
    const { data: mem } = await supabase
      .from("organization_members").select("org_id").eq("user_id", user.id).limit(1).maybeSingle();
    const orgId = mem?.org_id as string | undefined;
    if (!orgId) return json(403, { error: "sem organização" });

    const apiKey = await pluggyAuth();
    const base = `${Deno.env.get("SUPABASE_URL")}/functions/v1/pluggy-webhook`;
    const secret = Deno.env.get("PLUGGY_WEBHOOK_SECRET");
    const webhookUrl = secret ? `${base}?secret=${encodeURIComponent(secret)}` : base;

    const r = await fetchTimeout(`${PLUGGY_API}/connect_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": apiKey },
      // Os parâmetros precisam ir DENTRO de `options` (docs.pluggy.ai) — no nível
      // raiz o Pluggy os ignora e o item nasce SEM clientUserId (posse não valida).
      // clientUserId = org_id → casa a conexão com a RLS no webhook/sync. Crítico.
      body: JSON.stringify({
        options: { clientUserId: orgId, webhookUrl, avoidDuplicates: true },
      }),
    });
    if (!r.ok) return json(502, { error: `pluggy connect_token ${r.status}` });
    return json(200, { connectToken: (await r.json()).accessToken });
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    const timeout = (e as Error)?.name === "AbortError";
    return json(timeout ? 504 : 500, { error: timeout ? "timeout ao falar com a Pluggy" : msg });
  }
});
