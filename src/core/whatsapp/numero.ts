/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O CELULAR DE QUEM CONVERSA COM A QUATTRO AI (whatsapp-numero/1.0.0)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Etapa 1 da IA no WhatsApp: o titular ou o administrador cadastra o celular
 * em Segurança da conta e confirma com um código que chega POR WHATSAPP ao
 * próprio número. Sem o código, qualquer pessoa cadastraria o número de outra
 * e leria o caixa dela pela conversa.
 *
 * ⚠️ Quem decide é o banco (migration 20261030150000): o código é gerado só
 * pela chave de serviço (a rota que o envia) e conferido só pela sessão da
 * própria pessoa. Aqui moram a leitura do celular digitado, a mensagem e o
 * interruptor — nada que autorize.
 */
export const VERSAO_NUMERO_WHATSAPP = "whatsapp-numero/1.0.0";

/** O interruptor da IA no WhatsApp. Nasce desligado. */
export const INTERRUPTOR_IA_WHATSAPP = "WHATSAPP_IA";
export const iaWhatsappLigada = (env: Record<string, string | undefined> = process.env): boolean =>
  env[INTERRUPTOR_IA_WHATSAPP] === "ligado";

/** Dígitos do código (o mesmo tamanho do aplicativo autenticador). */
export const DIGITOS_CODIGO_WHATSAPP = 6;

/**
 * O celular digitado, como o banco o guarda: só dígitos, sem o 55. Devolve
 * `null` para o que não é celular brasileiro com DDD (10 ou 11 dígitos) —
 * o banco recusa o mesmo, e a tela diz antes de gastar um código.
 */
export function celularCanonico(t: string | null | undefined): string | null {
  let d = (t ?? "").replace(/\D/g, "");
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return null;
  if (d.startsWith("0")) return null;
  return d;
}

/** "11998388744" → "(11) 99838-8744"; o que não reconhece volta como veio. */
export function celularLegivel(c: string | null | undefined): string {
  const d = (c ?? "").replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return c ?? "";
}

/**
 * A mensagem com o código, para o envio em texto livre (dentro da janela de
 * 24 horas). Fora dela, o envio usa o modelo de autenticação aprovado
 * (`TWILIO_TEMPLATE_CODIGO_WHATSAPP_SID`, variável 1 = código).
 * ⚠️ O código vai SÓ aqui — nunca para log, trilha ou resposta da rota.
 */
export function mensagemDoCodigo(codigo: string): string {
  return `Seu código para conectar este celular à Quattro AI é ${codigo}. Ele vale por 10 minutos. Se não foi você que pediu, ignore esta mensagem.`;
}

/** A recusa do banco sem o prefixo técnico (`A4P-WAN-…:`). */
export const semPrefixoNumero = (msg: string): string => msg.replace(/^A4P-[A-Z-]+:\s*/, "");
