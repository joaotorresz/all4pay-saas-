// Edge Function: pluggy-connect-token
// Exige usuário logado (verify_jwt on). Resolve o org_id do chamador e devolve
// um connect token Pluggy (vale ~30min). NUNCA devolve a apiKey nem os secrets.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PLUGGY_API = "https://api.pluggy.ai";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

/** /auth → apiKey (válido ~2h). Secrets só via Deno.env — nunca logar. */
async function pluggyAuth(): Promise<string> {
  const clientId = Deno.env.get("PLUGGY_CLIENT_ID");
  const clientSecret = Deno.env.get("PLUGGY_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("PLUGGY_CLIENT_ID/SECRET ausentes");
  const r = await fetch(`${PLUGGY_API}/auth`, {
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

    const r = await fetch(`${PLUGGY_API}/connect_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": apiKey },
      // clientUserId = org_id → casa a conexão com a RLS no webhook depois. Crítico.
      body: JSON.stringify({ clientUserId: orgId, webhookUrl, avoidDuplicates: true }),
    });
    if (!r.ok) return json(502, { error: `pluggy connect_token ${r.status}` });
    return json(200, { connectToken: (await r.json()).accessToken });
  } catch (e) {
    return json(500, { error: String((e as Error)?.message ?? e) });
  }
});
