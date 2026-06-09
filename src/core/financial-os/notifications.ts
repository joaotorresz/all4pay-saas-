/**
 * Notification provider seam — Automation/Notification engine pluga aqui.
 * Default: `simulado` (registra, não envia) — seguro sem credenciais.
 * Para ativar envios reais, implemente um provider (Twilio p/ WhatsApp,
 * Resend/SES p/ e-mail) e selecione-o em getNotificationProvider(),
 * lendo as chaves do ambiente no SERVIDOR. O contrato não muda.
 */
export interface NotificationProvider {
  nome: string;
  whatsapp(to: string, msg: string): boolean;
  email(to: string, subject: string, body: string): boolean;
}

export const simulatedProvider: NotificationProvider = {
  nome: "simulado",
  whatsapp: () => true,
  email: () => true,
};

/**
 * Seleciona o provider. Sem credenciais → simulado. Plugue Twilio/Resend
 * aqui (server-side) quando `TWILIO_*` / `RESEND_API_KEY` existirem.
 */
export function getNotificationProvider(): NotificationProvider {
  return simulatedProvider;
}
