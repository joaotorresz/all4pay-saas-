// Edge Function: pluggy-sync-item (verify_jwt = false no gateway → o preflight
// OPTIONS passa; a auth é validada AQUI no handler via getUser → 401 sem usuário).
// Caminho ATIVO do Open Finance: o front chama com { itemId } no onSuccess do
// widget (o webhook do Pluggy não dispara em sandbox). Valida POSSE do item
// (item.clientUserId === org do chamador) e roda o MESMO ETL do webhook
// (idempotente → não duplica com o caminho passivo). Escreve com service-role.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cors, json, pluggyAuth, processarItem, adminClient } from "../_shared/pluggy-etl.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    // Auth no código — sem usuário → 401.
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
    // service-role p/ escrever com org_id explícito; valida posse (clientUserId === org).
    const resumo = await processarItem(adminClient(), apiKey, itemId, orgId);
    if (resumo === null) return json(403, { error: "item não pertence à organização" });

    return json(200, { ok: true, ...resumo });
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    const timeout = (e as Error)?.name === "AbortError";
    return json(timeout ? 504 : 500, { error: timeout ? "timeout ao falar com a Pluggy" : msg });
  }
});
