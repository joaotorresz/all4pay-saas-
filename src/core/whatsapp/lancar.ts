/**
 * LANÇAR PELO WHATSAPP (etapa 5 da Quattro AI no WhatsApp, Fase 4.4 do plano,
 * 04/11/2026).
 *
 * "Paguei 100 de gasolina" no WhatsApp vira a MESMA proposta do chat
 * (`interpretarLancamento`) e volta como resposta com um link. O link abre o
 * app, já na empresa da conversa, com o chat mostrando o cartão de
 * confirmação. Só o "Confirmar" do app grava, pelo escritor único
 * (`confirmarDocumento`).
 *
 * ⚠️ O WhatsApp NÃO grava. O número do celular identifica quem pergunta, mas
 * não autoriza escrever dinheiro: quem autoriza é a sessão no app (regra 19).
 * Com isso não nasce segundo escritor de lançamento, nem token, nem tabela.
 *
 * Puro, sem I/O e sem relógio.
 */
import type { PropostaFalada } from "@/core/assistant/lancamento-falado";
import { formatBRL, dataBR } from "@/lib/format";

export const PARAM_FRASE = "lancar";
export const PARAM_EMPRESA = "empresa";
/** A frase vai no link: mais que isto não é um lançamento dito. */
export const TAMANHO_MAXIMO_FRASE = 280;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** O endereço que abre o app com a proposta, na empresa da conversa. */
export function linkDoLancamento(appUrl: string, frase: string, orgId: string): string {
  const u = new URL("/", appUrl);
  u.searchParams.set(PARAM_FRASE, frase.trim().slice(0, TAMANHO_MAXIMO_FRASE));
  u.searchParams.set(PARAM_EMPRESA, orgId);
  return u.toString();
}

/** Lê o link no app. Link torto (sem frase, empresa que não é id) é ignorado. */
export function lerLinkDeLancamento(search: string): { frase: string; empresa: string } | null {
  const p = new URLSearchParams(search);
  const frase = (p.get(PARAM_FRASE) ?? "").trim();
  const empresa = (p.get(PARAM_EMPRESA) ?? "").trim();
  if (!frase || frase.length > TAMANHO_MAXIMO_FRASE || !UUID.test(empresa)) return null;
  return { frase, empresa };
}

/** O endereço sem os dois parâmetros: recarregar não abre a proposta de novo. */
export function semLinkDeLancamento(href: string): string {
  const u = new URL(href);
  u.searchParams.delete(PARAM_FRASE);
  u.searchParams.delete(PARAM_EMPRESA);
  return `${u.pathname}${u.search}${u.hash}`;
}

const ACAO = (p: PropostaFalada) =>
  p.tipo === "saida" ? (p.pago ? "Paguei" : "Vou pagar") : (p.pago ? "Recebi" : "Vou receber");

/** A resposta do WhatsApp: o que a Quattro AI entendeu e o link para confirmar. */
export function respostaDoLancamento(p: PropostaFalada, link: string): string {
  return [
    `Entendi: *${ACAO(p)}* ${formatBRL(p.valor)} · ${p.categoria} · ${dataBR(p.data)}.`,
    "Nada foi lançado ainda. Para lançar, confira e confirme no app:",
    link,
  ].join("\n");
}
