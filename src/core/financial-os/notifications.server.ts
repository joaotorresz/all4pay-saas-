/**
 * Envio REAL de notificações — SERVER-ONLY (lê segredos de ambiente).
 * Importado apenas pelo runner (`/api/financial-os/run`), nunca no cliente.
 *
 * WhatsApp via Twilio (sandbox/produção) e e-mail via Resend — escolhidos
 * por exigirem só chaves (sem SMTP/infra). Sem credenciais → no-op seguro.
 *
 * Variáveis (definir na Vercel, server-side):
 *   WhatsApp (Twilio):
 *     TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM
 *     ALERTS_WHATSAPP_TO  (destino padrão dos alertas, ex.: +55119...)
 *   E-mail (Resend):
 *     RESEND_API_KEY, ALERTS_EMAIL_FROM, ALERTS_EMAIL_TO
 */
import type { ExecucaoAcao } from "./types";

export interface EnvioResultado {
  canal: "whatsapp" | "email";
  para: string;
  ok: boolean;
  detalhe: string;
}

export function statusNotificacoes() {
  return {
    whatsapp: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM),
    email: !!process.env.RESEND_API_KEY,
  };
}

const waAddr = (n: string) => (n.startsWith("whatsapp:") ? n : `whatsapp:${n.replace(/[^\d+]/g, "")}`);
const ehEmail = (s?: string) => !!s && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
const ehTelefone = (s?: string) => !!s && s.replace(/\D/g, "").length >= 10;

async function enviarWhatsapp(to: string, msg: string): Promise<EnvioResultado> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const tok = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!sid || !tok || !from || !to) return { canal: "whatsapp", para: to, ok: false, detalhe: "config/destino ausente" };
  try {
    const body = new URLSearchParams({ From: waAddr(from), To: waAddr(to), Body: msg });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${sid}:${tok}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    return { canal: "whatsapp", para: to, ok: res.ok, detalhe: res.ok ? "enviado via Twilio" : `falha Twilio ${res.status}` };
  } catch (e) {
    return { canal: "whatsapp", para: to, ok: false, detalhe: e instanceof Error ? e.message : "erro de rede" };
  }
}

async function enviarEmail(to: string, subject: string, texto: string): Promise<EnvioResultado> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.ALERTS_EMAIL_FROM || "all4pay <alertas@all4pay.app>";
  if (!key || !to) return { canal: "email", para: to, ok: false, detalhe: "config/destino ausente" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, text: texto }),
    });
    return { canal: "email", para: to, ok: res.ok, detalhe: res.ok ? "enviado via Resend" : `falha Resend ${res.status}` };
  } catch (e) {
    return { canal: "email", para: to, ok: false, detalhe: e instanceof Error ? e.message : "erro de rede" };
  }
}

export interface AlvoCobranca {
  cliente: string;
  telefone: string;
  mensagem: string;
}
/**
 * Cobrança por cliente — envia uma mensagem de WhatsApp para cada alvo
 * (cliente + telefone + mensagem). Com credenciais Twilio, envia de verdade;
 * sem elas, retorna "simulado" (a UI mostra o fluxo). Server-side.
 */
export async function dispararCobrancas(alvos: AlvoCobranca[]): Promise<{ cliente: string; resultado: EnvioResultado }[]> {
  const ativo = statusNotificacoes().whatsapp;
  const out: { cliente: string; resultado: EnvioResultado }[] = [];
  for (const a of alvos) {
    if (!a.telefone) {
      out.push({ cliente: a.cliente, resultado: { canal: "whatsapp", para: "", ok: false, detalhe: "sem telefone" } });
      continue;
    }
    const resultado = ativo
      ? await enviarWhatsapp(a.telefone, a.mensagem)
      : { canal: "whatsapp" as const, para: a.telefone, ok: true, detalhe: "simulado (sem credenciais Twilio)" };
    out.push({ cliente: a.cliente, resultado });
  }
  return out;
}

/**
 * Dispara os envios reais para as execuções de WhatsApp/e-mail. Usa o
 * destino da regra quando for um telefone/e-mail válido; senão cai no
 * destinatário padrão de alertas (ALERTS_*). No-op por canal sem credencial.
 */
export async function dispararNotificacoes(execs: ExecucaoAcao[]): Promise<EnvioResultado[]> {
  const st = statusNotificacoes();
  const out: EnvioResultado[] = [];
  for (const e of execs) {
    if (e.status !== "executada") continue;
    const msg = `all4pay · ${e.ruleNome}: ${e.detalhe.replace(/ · provider .*/i, "")}`.slice(0, 300);
    if (e.acao === "enviar_whatsapp" && st.whatsapp) {
      const to = ehTelefone(e.destino) ? (e.destino as string) : process.env.ALERTS_WHATSAPP_TO || "";
      out.push(await enviarWhatsapp(to, msg));
    } else if (e.acao === "enviar_email" && st.email) {
      const to = ehEmail(e.destino) ? (e.destino as string) : process.env.ALERTS_EMAIL_TO || "";
      out.push(await enviarEmail(to, `all4pay · ${e.ruleNome}`, msg));
    }
  }
  return out;
}
