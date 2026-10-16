/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O PEDIDO DE SAÍDA PELO WHATSAPP (whatsapp-saida/1.0.0)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Quem recebe uma mensagem do número da plataforma pode responder SAIR, e a
 * partir dali não recebe mais nada de nenhuma empresa. VOLTAR desfaz.
 *
 * ⚠️ A MENSAGEM INTEIRA é a palavra: "sair" sozinho sai; "vou sair mais
 * cedo hoje" não. Ler a palavra no meio da frase calaria quem só conversava
 * — e o contrário (deixar de reconhecer um pedido) é o erro que custa caro,
 * por isso a lista aceita as formas comuns, sem acento, sem caixa e com
 * pontuação no fim.
 */
export const VERSAO_SAIDA_WHATSAPP = "whatsapp-saida/1.0.0";

export type PedidoWhatsapp = "sair" | "voltar";

const SAIR = new Set([
  "sair", "parar", "pare", "para", "stop", "cancelar", "cancela", "descadastrar",
  "descadastrar-me", "remover", "nao quero mais", "nao quero receber", "parar de receber",
  "unsubscribe",
]);
const VOLTAR = new Set(["voltar", "volta", "start", "quero receber", "receber"]);

const limpar = (s: string): string =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[.!?,;:"'()]+/g, " ").replace(/\s+/g, " ").trim();

/** "SAIR", "Sair.", "Não quero mais!" → "sair"; "VOLTAR" → "voltar"; o resto → null. */
export function lerPedidoDeSaida(texto: string): PedidoWhatsapp | null {
  const t = limpar(texto);
  if (!t || t.length > 40) return null;
  if (SAIR.has(t)) return "sair";
  if (VOLTAR.has(t)) return "voltar";
  return null;
}

export const RESPOSTA_SAIR =
  "Pronto. Você não vai mais receber mensagens automáticas deste número. Para voltar a receber, responda VOLTAR.";
export const RESPOSTA_VOLTAR =
  "Pronto. Você voltou a poder receber mensagens deste número. Para parar, responda SAIR.";
export const RESPOSTA_PADRAO =
  "Este número envia avisos automáticos e não é atendido por pessoas. Para falar com a empresa, use o contato dela. Para não receber mais mensagens, responda SAIR.";
