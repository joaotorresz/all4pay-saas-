// Edge Function: pluggy-webhook (verify_jwt = false — o Pluggy não manda JWT)
// Caminho PASSIVO (produção): recebe item/created|updated e roda o ETL
// compartilhado (item→contas→transações→movements, idempotente). Em sandbox o
// Pluggy não dispara o webhook — por isso existe também o sync ATIVO
// (pluggy-sync-item), que usa o MESMO ETL. Auth por segredo na query.
import { cors, json, pluggyAuth, processarItem, adminClient } from "../_shared/pluggy-etl.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    // valida origem por segredo na query, se configurado
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
      const resumo = await processarItem(adminClient(), apiKey, itemId);
      return json(200, { ok: true, event, itemId, resumo });
    }
    return json(200, { ok: true, ignored: event });
  } catch (e) {
    return json(500, { error: String((e as Error)?.message ?? e) });
  }
});
