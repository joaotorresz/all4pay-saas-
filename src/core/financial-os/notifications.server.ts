/**
 * Envio REAL de notificações — SERVER-ONLY (lê segredos de ambiente).
 * Importado só pelas rotas do servidor, nunca no cliente.
 *
 * WhatsApp via Twilio e e-mail via Resend — escolhidos por exigirem só chaves
 * (sem SMTP/infra). Sem credenciais → SIMULADO, e simulado NUNCA conta como
 * avisado (quem registra olha `ativo(canal)` antes de chamar).
 *
 * Variáveis (definidas na Vercel, server-side — nenhuma é criada por código):
 *   WhatsApp (Twilio): TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM
 *   Teste de plataforma: ALERTS_WHATSAPP_TO (só o `/api/notificacoes/teste` usa)
 *   Templates aprovados (fora da janela de 24h só sai template), UM POR FINALIDADE:
 *     TWILIO_TEMPLATE_COBRANCA_LEMBRETE_SID · TWILIO_TEMPLATE_COBRANCA_ATRASO_SID ·
 *     TWILIO_TEMPLATE_COBRANCA_FORMAL_SID  (variáveis 1 cliente · 2 credor ·
 *       3 valor · 4 vencimento · 5 dias de atraso)
 *     TWILIO_TEMPLATE_RESUMO_SID · TWILIO_TEMPLATE_LEMBRETE_PAGAR_SID ·
 *     TWILIO_TEMPLATE_ALERTA_SID · TWILIO_TEMPLATE_FECHAMENTO_SID
 *       (variável 1 = o texto curto, numa linha)
 *   E-mail (Resend): RESEND_API_KEY, ALERTS_EMAIL_FROM (remetente)
 *
 * ⚠️ `TWILIO_TEMPLATE_COBRANCA_SID` (o template ÚNICO) foi APOSENTADO: com ele
 * configurado, todas as etapas da régua saíam com o mesmo texto — o lembrete
 * amigável e o aviso formal diziam a mesma coisa. Cada tom tem o seu agora.
 *
 * ⚠️ O destino dos alertas NÃO é mais global. `ALERTS_EMAIL_TO` e o fallback de
 * `ALERTS_WHATSAPP_TO` para alertas de empresa saíram: o alerta de qualquer
 * organização ia parar no número do dono da plataforma. Cada automação tem os
 * destinatários DA EMPRESA (`automacoes.destinatarios`).
 *
 * ⚠️ `ok` mede se o provedor ACEITOU (Twilio 201 / Resend 200), não se a
 * mensagem foi ENTREGUE. Sem status callback, "enviado" é o máximo que se pode
 * afirmar — e a tela diz "enviado", nunca "entregue".
 */
import type { CanalEnvio, FinalidadeTemplate, MensagemAutomacao, ProvedorEnvio } from "@/core/automacoes";

export interface EnvioResultado {
  canal: "whatsapp" | "email";
  para: string;
  ok: boolean;
  detalhe: string;
  /** O identificador que o provedor devolveu (SID da Twilio, id da Resend). */
  id?: string | null;
}

const TEMPLATE_DA_FINALIDADE: Record<FinalidadeTemplate, string> = {
  cobranca_lembrete: "TWILIO_TEMPLATE_COBRANCA_LEMBRETE_SID",
  cobranca_atraso: "TWILIO_TEMPLATE_COBRANCA_ATRASO_SID",
  cobranca_formal: "TWILIO_TEMPLATE_COBRANCA_FORMAL_SID",
  resumo_diario: "TWILIO_TEMPLATE_RESUMO_SID",
  lembrete_pagar: "TWILIO_TEMPLATE_LEMBRETE_PAGAR_SID",
  alerta_caixa: "TWILIO_TEMPLATE_ALERTA_SID",
  fechamento_pendente: "TWILIO_TEMPLATE_FECHAMENTO_SID",
};

export const templateDe = (f: FinalidadeTemplate): string | undefined =>
  process.env[TEMPLATE_DA_FINALIDADE[f]] || undefined;

export function statusNotificacoes() {
  const templates = Object.fromEntries(
    (Object.keys(TEMPLATE_DA_FINALIDADE) as FinalidadeTemplate[]).map((f) => [f, !!templateDe(f)]),
  ) as Record<FinalidadeTemplate, boolean>;
  return {
    whatsapp: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM),
    email: !!process.env.RESEND_API_KEY,
    templates,
  };
}

const waAddr = (n: string) => (n.startsWith("whatsapp:") ? n : `whatsapp:${n.replace(/[^\d+]/g, "")}`);
const ehTelefone = (s?: string) => !!s && s.replace(/\D/g, "").length >= 10;

/** Envio de WhatsApp via Twilio. Com `opts.contentSid`, usa template aprovado
 * (ContentVariables); senão, mensagem livre (Body). */
export async function enviarWhatsapp(
  to: string,
  msg: string,
  opts?: { contentSid?: string; contentVariables?: Record<string, string> },
): Promise<EnvioResultado> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const tok = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!sid || !tok || !from || !to) return { canal: "whatsapp", para: to, ok: false, detalhe: "config/destino ausente" };
  try {
    const params: Record<string, string> = { From: waAddr(from), To: waAddr(to) };
    if (opts?.contentSid) {
      params.ContentSid = opts.contentSid;
      if (opts.contentVariables && Object.keys(opts.contentVariables).length)
        params.ContentVariables = JSON.stringify(opts.contentVariables);
    } else {
      params.Body = msg;
    }
    const body = new URLSearchParams(params);
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${sid}:${tok}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    const j = (await res.json().catch(() => null)) as { sid?: string; message?: string } | null;
    const via = opts?.contentSid ? "template" : "Twilio";
    return {
      canal: "whatsapp", para: to, ok: res.ok, id: j?.sid ?? null,
      detalhe: res.ok ? `aceito via ${via}` : `falha Twilio ${res.status}${j?.message ? `: ${j.message}` : ""}`,
    };
  } catch (e) {
    return { canal: "whatsapp", para: to, ok: false, detalhe: e instanceof Error ? e.message : "erro de rede" };
  }
}

/** E-mail via Resend — texto E HTML (o HTML sai do núcleo, na paleta Quattro). */
export async function enviarEmail(to: string, subject: string, texto: string, html?: string): Promise<EnvioResultado> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.ALERTS_EMAIL_FROM || "Quattro <alertas@all4pay.app>";
  if (!key || !to) return { canal: "email", para: to, ok: false, detalhe: "config/destino ausente" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, text: texto, ...(html ? { html } : {}) }),
    });
    const j = (await res.json().catch(() => null)) as { id?: string; message?: string } | null;
    return {
      canal: "email", para: to, ok: res.ok, id: j?.id ?? null,
      detalhe: res.ok ? "aceito via Resend" : `falha Resend ${res.status}${j?.message ? `: ${j.message}` : ""}`,
    };
  } catch (e) {
    return { canal: "email", para: to, ok: false, detalhe: e instanceof Error ? e.message : "erro de rede" };
  }
}

/**
 * O provedor que o runner e as rotas usam. `ativo` é a pergunta que decide
 * entre ENVIAR e SIMULAR — e é feita ANTES de chamar, para que um simulado
 * nunca seja gravado como enviado.
 */
export function provedorReal(): ProvedorEnvio {
  const st = statusNotificacoes();
  return {
    ativo: (canal: CanalEnvio) => (canal === "email" ? st.email : st.whatsapp),
    async enviar(m: MensagemAutomacao) {
      const r = m.canal === "email"
        ? await enviarEmail(m.destino, m.assunto, m.texto, m.html)
        : await enviarWhatsapp(m.destino, m.texto.slice(0, 1500), (() => {
            const sid = templateDe(m.finalidade);
            return sid ? { contentSid: sid, contentVariables: m.variaveis } : undefined;
          })());
      return { ok: r.ok, id: r.id ?? null, erro: r.ok ? null : r.detalhe };
    },
  };
}

export interface AlvoCobranca {
  cliente: string;
  telefone: string;
  mensagem: string;
  /** O tom da etapa decide o template aprovado (um por tom). */
  finalidade?: FinalidadeTemplate;
  /** Variáveis do template aprovado (1 cliente · 2 credor · 3 valor · 4 vencimento · 5 dias). */
  variaveis?: Record<string, string>;
}

/**
 * Teste manual de WhatsApp de PLATAFORMA — valida as credenciais Twilio na
 * hora. Sem `to`, usa ALERTS_WHATSAPP_TO. Sem credenciais, "simulado".
 */
export async function testarWhatsapp(to?: string, mensagem?: string): Promise<EnvioResultado> {
  const destino = (to && to.trim()) || process.env.ALERTS_WHATSAPP_TO || "";
  if (!ehTelefone(destino)) return { canal: "whatsapp", para: destino, ok: false, detalhe: "destino ausente (defina ALERTS_WHATSAPP_TO ou envie 'to')" };
  const msg = (mensagem && mensagem.trim().slice(0, 300)) || "Quattro · teste de notificação. Se você recebeu isto, o WhatsApp está configurado.";
  if (!statusNotificacoes().whatsapp) return { canal: "whatsapp", para: destino, ok: false, detalhe: "simulado (sem credenciais Twilio)" };
  return enviarWhatsapp(destino, msg);
}

/**
 * Cobrança por cliente — um WhatsApp por alvo. O template sai da FINALIDADE do
 * alvo (o tom da etapa); sem template configurado para aquele tom, vai o texto
 * da própria etapa. Sem credenciais: nada é chamado (quem chama registra
 * "simulado", nunca "avisado").
 */
export async function dispararCobrancas(alvos: AlvoCobranca[]): Promise<{ cliente: string; resultado: EnvioResultado }[]> {
  const ativo = statusNotificacoes().whatsapp;
  const out: { cliente: string; resultado: EnvioResultado }[] = [];
  for (const a of alvos) {
    if (!a.telefone) {
      out.push({ cliente: a.cliente, resultado: { canal: "whatsapp", para: "", ok: false, detalhe: "sem telefone" } });
      continue;
    }
    const sid = a.finalidade ? templateDe(a.finalidade) : undefined;
    const resultado = ativo
      ? await enviarWhatsapp(a.telefone, a.mensagem, sid ? { contentSid: sid, contentVariables: a.variaveis } : undefined)
      : { canal: "whatsapp" as const, para: a.telefone, ok: false, detalhe: "simulado (sem credenciais Twilio)" };
    out.push({ cliente: a.cliente, resultado });
  }
  return out;
}
