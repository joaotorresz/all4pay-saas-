/**
 * A PERGUNTA VAI AO AGENTE CERTO (Etapa 5 do plano "AI first", 04/11/2026).
 *
 * Quem pergunta não precisa saber que existe um agente para cada tarefa: a
 * Quattro AI responde o que sabe e, quando a pergunta é sobre o trabalho de um
 * agente ("cobra os atrasados", "concilia o extrato", "fecha o mês"), a
 * resposta traz o agente dono da tarefa, com o caminho até a conversa dele.
 *
 * ⚠️ UMA regra só: o chat do sistema (`useChatIA`) e a Quattro AI no WhatsApp
 * (`lib/whatsapp-ia`) leem daqui. Nenhum dos dois repete a lista.
 *
 * ⚠️ Rotear não é agir: o agente continua propondo e a pessoa aprovando, no
 * nível que a empresa escolheu. Aqui só se decide QUEM cuida da pergunta.
 *
 * Puro. A ordem do catálogo é a regra de desempate: o termo mais específico
 * vem antes ("fechar o caixa do mês" é fechamento, não caixa).
 */
import { descricaoDe, type IdAgente } from "./index";

interface Rota { agente: IdAgente; termos: RegExp }

/** Texto já sem acento e em minúsculas. */
export const ROTAS_AGENTE: readonly Rota[] = [
  {
    agente: "fechamento",
    termos: /\bfechamento\b|\bfechar? (o |a )?(mes|periodo|balanco|competencia|caixa do mes)\b|\btravar o mes\b|\b(mandar|enviar|mande|envie|manda|envia) (pro|para o|ao) contador\b/,
  },
  {
    agente: "conciliacao",
    termos: /\bconcilia\w*|\bbater (o )?extrato\b|\bextrato (nao )?bate\b|\bcasar (os )?(lancamentos|pagamentos|recebimentos)\b/,
  },
  {
    agente: "cobranca",
    termos: /\bcobr(ar|e|a|anca|ancas)\b|\binadimpl\w*|\bclientes? (em atraso|atrasad\w*|devendo)\b|\bquem (esta|ta) (me )?devendo\b|\bregua\b|\blembrete de (pagamento|vencimento)\b/,
  },
  {
    agente: "contas_pagar",
    termos: /\bcontas? a pagar\b|\b(que|quais) contas? (eu )?(tenho|preciso|devo) (que |de )?pagar\b|\bpagar (os |o )?fornecedor\w*|\bboletos? (a|para) pagar\b|\bagendar (o )?pagamento\b|\bo que (eu )?(tenho|preciso) (que |de )?pagar\b/,
  },
  {
    agente: "caixa",
    termos: /\b(posicao|saldo) de caixa\b|\bfluxo de caixa\b|\bcaixa (do dia|de hoje|da semana|do mes)\b|\b(vou|vai) ficar (sem caixa|sem dinheiro|no vermelho|negativo)\b/,
  },
];

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** O agente dono da tarefa da pergunta, ou `null` (a Quattro AI cuida sozinha). */
export function agenteDaPergunta(pergunta: string): IdAgente | null {
  const q = semAcento(pergunta);
  return ROTAS_AGENTE.find((r) => r.termos.test(q))?.agente ?? null;
}

/** O endereço da conversa com o agente (o mesmo da lista do menu). */
export const enderecoDoAgente = (id: IdAgente) => `/quattro-ai?agente=${id}`;

/** A frase da resposta que apresenta o agente. */
export function conviteDoAgente(id: IdAgente): string {
  const d = descricaoDe(id);
  return d.pronto
    ? `Isso é com o ${d.nome.toLowerCase()}: ${d.missao.charAt(0).toLowerCase()}${d.missao.slice(1)}`
    : `Isso vai ser do ${d.nome.toLowerCase()}, que ainda está em construção.`;
}

/** A linha que o WhatsApp acrescenta à resposta, com o link para a conversa no app. */
export function conviteNoWhatsapp(id: IdAgente, appUrl: string): string {
  const base = appUrl.replace(/\/+$/, "");
  return `${conviteDoAgente(id)}\nFale com ele no app: ${base}${enderecoDoAgente(id)}`;
}
