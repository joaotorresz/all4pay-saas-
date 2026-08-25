// ALL4PAY · Edge Function send-lead-email
// Dispara e-mail de CONFIRMAÇÃO para o cliente que preencheu o formulário da maquininha.
// Provedor: Resend. Requer secrets: RESEND_API_KEY (obrigatório), RESEND_FROM (opcional).
// POST { email, nome?, cnpj? }

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM = Deno.env.get("RESEND_FROM") || "All4Pay <no-reply@all4pay.com.br>";
const REPLY_TO = Deno.env.get("RESEND_REPLY_TO") || "";
const SITE_URL = Deno.env.get("SITE_URL") || "https://all4pay.com.br";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: cors });
const esc = (v: string) => String(v ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] as string));

function emailHtml(nome: string) {
  const ola = nome ? `Olá, ${esc(nome)}!` : "Olá!";
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;padding:0;background:#F3F1EE;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F1EE;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border-radius:20px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
          <tr><td style="padding:32px 32px 0;">
            <img src="https://framerusercontent.com/images/264kIJwaRzb5w0s1HY1hA22ZFGg.png" alt="All4Pay" height="26" style="height:26px;display:block;">
          </td></tr>
          <tr><td style="padding:24px 32px 8px;">
            <div style="display:inline-block;background:#E1FF00;color:#11190C;font-size:12px;font-weight:700;padding:6px 12px;border-radius:100px;letter-spacing:-0.02em;">Pedido recebido</div>
          </td></tr>
          <tr><td style="padding:8px 32px 0;">
            <h1 style="margin:0;font-size:26px;line-height:1.15;font-weight:800;color:#11190C;letter-spacing:-0.02em;">${ola}</h1>
          </td></tr>
          <tr><td style="padding:14px 32px 0;">
            <p style="margin:0;font-size:15px;line-height:1.6;color:#3d4436;">Recebemos o seu cadastro da <strong style="color:#11190C;">Maquininha All4Pay</strong>. Nossa equipe já vai analisar e entrar em contato pelo WhatsApp para finalizar o seu pedido — sem burocracia.</p>
          </td></tr>
          <tr><td style="padding:20px 32px 0;">
            <div style="background:#F3F1EE;border-radius:14px;padding:16px 18px;">
              <p style="margin:0;font-size:14px;line-height:1.6;color:#3d4436;">Enquanto isso, se tiver qualquer dúvida é só responder este e-mail. A gente resolve com você.</p>
            </div>
          </td></tr>
          <tr><td style="padding:24px 32px 4px;">
            <a href="${esc(SITE_URL)}" style="display:inline-block;background:#11190C;color:#E1FF00;text-decoration:none;font-size:15px;font-weight:700;padding:14px 26px;border-radius:100px;letter-spacing:-0.02em;">Voltar ao site</a>
          </td></tr>
          <tr><td style="padding:24px 32px 32px;">
            <hr style="border:none;border-top:1px solid rgba(17,25,12,0.08);margin:0 0 16px;">
            <p style="margin:0;font-size:12px;line-height:1.5;color:#8a8f84;">All4Pay · Você recebeu este e-mail porque solicitou uma maquininha no nosso site. Se não foi você, pode ignorar esta mensagem.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email ?? "").trim();
    const nome = String(body?.nome ?? "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ ok: false, error: "email_invalido" }, 400);

    // Sem API key ainda: não quebra o fluxo do site, só sinaliza.
    if (!RESEND_API_KEY) return json({ ok: false, error: "sem_api_key", hint: "Defina o secret RESEND_API_KEY no Supabase." }, 200);

    const payload: Record<string, unknown> = {
      from: FROM,
      to: [email],
      subject: "Recebemos o seu pedido — All4Pay",
      html: emailHtml(nome),
    };
    if (REPLY_TO) payload.reply_to = REPLY_TO;

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return json({ ok: false, error: "resend_falhou", status: r.status, detalhe: data }, 502);
    return json({ ok: true, id: data?.id ?? null });
  } catch (e) {
    return json({ ok: false, error: "erro_interno", detalhe: String(e) }, 500);
  }
});
