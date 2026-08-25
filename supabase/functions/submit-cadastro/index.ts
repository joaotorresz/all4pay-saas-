// ALL4PAY · submit-cadastro (v1)
// Recebe o lead do form /cadastro-maquininha, grava em maq_leads,
// e dispara WhatsApp em background (nao bloqueia a resposta pro cliente).
// POST { nome, telefone, email?, cnpj?, consentimento_whatsapp }

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WHATSAPP_TOKEN = Deno.env.get("WHATSAPP_TOKEN");
const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
const WHATSAPP_TEMPLATE_NAME = Deno.env.get("WHATSAPP_TEMPLATE_NAME") ?? "confirmacao_cadastro_maquininha";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });

async function db(path: string) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!r.ok) throw new Error(`db ${path} -> ${r.status}`);
  return r.json();
}

async function dbInsert(path: string, body: unknown, prefer = "return=representation") {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: prefer,
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`insert ${path} -> ${r.status} ${await r.text()}`);
  return r.json();
}

// Formata numero BR pro padrao E.164 que a Meta exige (ex: 5511999998888)
function toE164BR(telefone: string) {
  let d = telefone.replace(/\D/g, "");
  if (d.length <= 11 && !d.startsWith("55")) d = "55" + d;
  return d;
}

async function logWhatsapp(leadId: string, status: "enviado" | "falhou", meta_message_id?: string, erro_detalhe?: string) {
  try {
    await dbInsert("maq_whatsapp_log", {
      lead_id: leadId,
      template_name: WHATSAPP_TEMPLATE_NAME,
      status,
      meta_message_id: meta_message_id ?? null,
      erro_detalhe: erro_detalhe ?? null,
    }, "return=minimal");
  } catch (_) { /* log e best-effort, nunca derruba o fluxo principal */ }
}

async function sendWhatsapp(leadId: string, telefone: string, nome: string) {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    await logWhatsapp(leadId, "falhou", undefined, "credenciais WHATSAPP_TOKEN/WHATSAPP_PHONE_NUMBER_ID nao configuradas nos secrets");
    return;
  }
  const to = toE164BR(telefone);
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: WHATSAPP_TEMPLATE_NAME,
      language: { code: "pt_BR" },
      components: [
        { type: "body", parameters: [{ type: "text", text: nome || "cliente" }] },
      ],
    },
  };
  try {
    const r = await fetch(`https://graph.facebook.com/v22.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const data = await r.json().catch(() => ({}));
    if (r.ok) {
      const messageId = data?.messages?.[0]?.id;
      await logWhatsapp(leadId, "enviado", messageId);
    } else {
      await logWhatsapp(leadId, "falhou", undefined, JSON.stringify(data));
    }
  } catch (e) {
    await logWhatsapp(leadId, "falhou", undefined, String(e));
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const nome = String(body?.nome ?? "").trim();
    const telefone = String(body?.telefone ?? "").trim();
    const email = body?.email ? String(body.email).trim() : null;
    const cnpjDigits = body?.cnpj ? String(body.cnpj).replace(/\D/g, "") : null;
    const consentimento = Boolean(body?.consentimento_whatsapp);

    if (!nome || !telefone) {
      return json({ ok: false, error: "nome_e_telefone_obrigatorios" }, 400);
    }

    // Enriquece com dados de empresa se ja tivermos no cache (populado pelo get-rate)
    let razao_social: string | null = null;
    let nome_fantasia: string | null = null;
    if (cnpjDigits && cnpjDigits.length === 14) {
      try {
        const cached = await db(`maq_cnpj_cache?cnpj=eq.${cnpjDigits}&select=razao_social,nome_fantasia`);
        if (cached?.length) {
          razao_social = cached[0].razao_social;
          nome_fantasia = cached[0].nome_fantasia;
        }
      } catch (_) { /* segue sem enriquecer */ }
    }

    const inserted = await dbInsert("maq_leads", {
      nome,
      telefone,
      email,
      cnpj: cnpjDigits,
      razao_social,
      nome_fantasia,
      consentimento_whatsapp: consentimento,
    });
    const lead = inserted?.[0];

    if (consentimento && lead?.id) {
      // @ts-ignore - EdgeRuntime existe no runtime do Supabase Edge Functions
      EdgeRuntime.waitUntil(sendWhatsapp(lead.id, telefone, nome));
    }

    return json({ ok: true, lead_id: lead?.id ?? null });
  } catch (e) {
    return json({ ok: false, error: "erro_interno", detalhe: String(e) }, 500);
  }
});
