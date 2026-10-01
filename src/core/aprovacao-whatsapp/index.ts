/**
 * ═══════════════════════════════════════════════════════════════════════════
 * APROVAÇÃO DE TÍTULO PELA WHATSAPP — o núcleo puro (`aprovacao-whatsapp/1.0.0`)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Só o que é TEXTO: ler a resposta do aprovador, tirar o telefone do remetente
 * e montar a mensagem do pedido. Quem DECIDE a aprovação é o banco — a RPC
 * `responder_aprovacao_whatsapp` faz o mesmo UPDATE da Central, como o
 * aprovador, e o gatilho `central_maquina` aplica segregação, permissão e
 * alçada. Nada aqui reimplementa regra de aprovação.
 *
 * ⚠️ O alfabeto do código não tem 0/O/1/I (é digitado de um celular, olhando
 * outra tela). A leitura aceita minúsculas e o acento de "NÃO", porque é assim
 * que as pessoas digitam — e recusa "SIM" sem código: uma resposta que não diz
 * QUAL pedido aprova não aprova nenhum.
 */

export const VERSAO_APROVACAO_WHATSAPP = "aprovacao-whatsapp/1.0.0";

/** O alfabeto do código: 32 símbolos, sem 0, O, 1 e I. */
export const ALFABETO_CODIGO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODIGO_RE = /^[A-HJ-NP-Z2-9]{6}$/;

export type DecisaoWhatsapp = "sim" | "nao";

/** Tira acento e caixa: "NÃO" → "nao". */
const semAcento = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Lê "SIM ABC234", "sim abc234", "NÃO ABC234", "nao abc234". Espaços a mais
 * são ignorados. Qualquer outra forma — inclusive a decisão sem código, ou um
 * código fora do alfabeto — devolve `null`.
 */
export function lerResposta(body: string): { decisao: DecisaoWhatsapp; codigo: string } | null {
  const partes = (body ?? "").trim().split(/\s+/).filter(Boolean);
  if (partes.length !== 2) return null;
  const palavra = semAcento(partes[0]);
  const decisao: DecisaoWhatsapp | null = palavra === "sim" ? "sim" : palavra === "nao" ? "nao" : null;
  if (!decisao) return null;
  const codigo = partes[1].toUpperCase();
  if (!CODIGO_RE.test(codigo)) return null;
  return { decisao, codigo };
}

/** "whatsapp:+5511999998888" → "5511999998888" (só dígitos). */
export function telefoneDoRemetente(from: string): string {
  return (from ?? "").replace(/^whatsapp:/i, "").replace(/\D/g, "");
}

/**
 * O telefone como o pedido o GUARDA: só dígitos, COM o 55 do país.
 *
 * ⚠️ A resposta chega da Twilio sempre como "+55…". Se o pedido guardasse o
 * número sem o país ("11999998888"), nenhuma resposta casaria com ele — o
 * aprovador responderia certo e o sistema diria "código inválido". Por isso
 * 10 ou 11 dígitos (DDD + número) ganham o 55 aqui, ANTES de gravar.
 */
export function telefoneParaPedido(t: string): string {
  const d = (t ?? "").replace(/\D/g, "");
  return d.length === 10 || d.length === 11 ? `55${d}` : d;
}

export interface DadosDoPedido {
  descricao: string;
  /** Já formatado (ex.: "R$1.000,00") — a moeda encosta no número. */
  valorFormatado: string;
  /** Data legível (ex.: "15/10/2026"). */
  vencimento: string;
  codigo: string;
}

/** A mensagem que o aprovador recebe. Registro formal, sem gíria. */
export function mensagemDoPedido(d: DadosDoPedido): string {
  return [
    "Quattro — pedido de aprovação de título.",
    `Descrição: ${d.descricao}`,
    `Valor: ${d.valorFormatado}`,
    `Vencimento: ${d.vencimento}`,
    "",
    `Para aprovar, responda: SIM ${d.codigo}`,
    `Para recusar, responda: NÃO ${d.codigo}`,
    "",
    "O código vale por 24 horas e pode ser usado uma única vez.",
  ].join("\n");
}

/** Texto de ajuda devolvido quando a resposta não segue o formato. */
export const AJUDA_FORMATO =
  "Resposta não reconhecida. Responda SIM seguido do código para aprovar, ou NÃO seguido do código para recusar (ex.: SIM ABC234).";
