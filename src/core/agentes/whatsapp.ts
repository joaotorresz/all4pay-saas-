/**
 * ═══════════════════════════════════════════════════════════════════════════
 * APROVAR O QUE O AGENTE PROPÔS PELO WHATSAPP (Etapa 3, 04/11/2026) — o texto
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Só texto. O código, quem recebe e quem decide moram no banco (migration
 * 20261104150000): o pedido sai só para quem aprova E tem o número
 * confirmado, e o "SIM <código>" decide pela MESMA regra da tela
 * (`agente_decidir_na_empresa`). A leitura da resposta é a da aprovação de
 * título (`lerResposta`): o mesmo formato, uma regra só para as pessoas.
 */
export const TETO_PEDIDOS_POR_EXECUCAO = 10;

export interface DadosPedidoAgente {
  /** "Agente de cobrança" */
  agente: string;
  /** "Cobrar Padaria do Zé" */
  titulo: string;
  /** "Venceu há 3 dias, 2 títulos. Vai pelo WhatsApp, para (11) •••• 0001." */
  porque: string;
  /** Já formatado ("R$ 1.300,50"), ou nulo quando a ação não tem valor. */
  valorFormatado: string | null;
  codigo: string;
}

/** A mensagem do pedido. Registro formal, sem emoji. */
export function mensagemDoPedidoAgente(d: DadosPedidoAgente): string {
  return [
    `Quattro AI: o ${d.agente.toLowerCase()} pede a sua aprovação.`,
    `${d.titulo}${d.valorFormatado ? `, ${d.valorFormatado}` : ""}.`,
    d.porque,
    "",
    `Para aprovar, responda: SIM ${d.codigo}`,
    `Para recusar, responda: NÃO ${d.codigo}`,
    "",
    "O código vale por 24 horas e pode ser usado uma única vez.",
  ].join("\n");
}

/** O aviso quando há mais propostas do que pedidos numa execução. */
export const avisoDoResto = (n: number) =>
  `Quattro AI: há mais ${n} ${n === 1 ? "proposta" : "propostas"} dos agentes esperando a sua aprovação. Veja em Automações.`;

export interface RespostaDoBanco {
  encontrado?: boolean;
  ok?: boolean;
  decisao?: "sim" | "nao";
  estado?: string;
  motivo?: string;
}

/**
 * O que a pessoa lê depois de responder. `execucao` é o resultado do envio
 * feito na hora (só no SIM): a frase não diz "feito" quando nada saiu.
 */
export function respostaDaDecisaoAgente(r: RespostaDoBanco, execucao?: { estado: string; erro?: string | null } | null): string {
  if (!r.ok) return `A decisão não foi registrada: ${r.motivo ?? "motivo não informado"}.`;
  if (r.decisao === "nao") return "Recusa registrada. O agente não vai fazer isso.";
  if (!execucao) return "Aprovação registrada. O agente faz na próxima execução.";
  if (execucao.estado === "executada") return execucao.erro ? `Aprovação registrada e feita. ${execucao.erro}` : "Aprovação registrada e feita: a cobrança saiu.";
  if (execucao.estado === "falhou") return `Aprovação registrada, mas não deu certo. ${execucao.erro ?? ""}`.trim();
  return "Aprovação registrada. O agente faz na próxima execução.";
}
