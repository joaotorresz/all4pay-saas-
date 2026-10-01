/**
 * A NOTA DA VENDA — a ponte entre o documento-mãe e o emissor de NFS-e.
 *
 * ⚠️ **ERAM DOIS MUNDOS QUE NÃO SE FALAVAM.** A lista de vendas mostra o
 * status da NF de cada venda ("a emitir", "emitida"…) e o emissor de NFS-e
 * emitia notas AVULSAS, cada uma com a SUA receita. Não havia caminho entre os
 * dois: emitir a nota de uma venda pelo emissor deixava a venda "a emitir" para
 * sempre nos dois painéis, e ainda lançava uma SEGUNDA receita do mesmo
 * dinheiro — a venda já tinha gerado o recebível. O faturamento dobrava no DRE.
 *
 * Aqui a nota nasce DA venda: o valor é o faturamento da venda, o tomador é o
 * cliente dela e a receita é o título que a venda já criou (`movimentoReceita`),
 * que o emissor reaproveita em vez de lançar outro. O resultado volta para o
 * documento como status e número da NF.
 *
 * Puro, tipado, demo-safe.
 */
import { temFaturamento, type StatusNF, type Venda } from "./index";

export const NOTA_DA_VENDA_VERSION = "nota-da-venda/1.0.0";

export interface PedidoDeNota {
  tomadorId: string;
  tomadorNome: string;
  discriminacao: string;
  codigoServico: string;
  valorServico: number;
  municipio: string;
  issAliquota: number;
  aguardarPagamento: false;
  /** O título que a venda já gerou — o emissor o REAPROVEITA. */
  movimentoReceita: string;
}

/** Só a venda com nota por emitir (ou recusada) oferece a emissão. */
export const podeEmitirNota = (v: Pick<Venda, "statusNF" | "status">): boolean =>
  (v.statusNF === "a_emitir" || v.statusNF === "negada") && temFaturamento(v);

export function pedidoDeNota(v: Venda, tituloId: string, issAliquota: number, municipio = "São Paulo"): PedidoDeNota {
  const itens = v.itens.filter((i) => i.nome).map((i) => `${i.quantidade}× ${i.nome}`).join(" · ");
  return {
    tomadorId: v.clienteId,
    tomadorNome: v.clienteNome,
    discriminacao: (v.textoDocumentoFiscal || v.descricao || itens || `Venda ${v.numero}`).trim(),
    codigoServico: "Conforme a venda",
    // A nota é sobre o FATURAMENTO (sem os juros do parcelamento, que são da
    // plataforma) — a mesma base do provisionamento de impostos.
    valorServico: v.valorTotal,
    municipio,
    issAliquota,
    aguardarPagamento: false,
    movimentoReceita: tituloId,
  };
}

/** O status da NF que volta para a venda, a partir do que o emissor respondeu. */
export function statusNFDaNota(status: string): StatusNF {
  if (status === "autorizada" || status === "enviada") return "emitida";
  if (status === "rejeitada") return "negada";
  if (status === "cancelada") return "cancelada";
  return "processando";
}

/**
 * A receita ligada a uma nota foi REAPROVEITADA (é o título da venda ou da
 * fatura da assinatura) ou nasceu DA nota avulsa?
 *
 * ⚠️ É a pergunta que decide se cancelar a nota apaga a receita. A resposta
 * morava só na memória da sessão (`movimentoReceita`), e o banco não a
 * guardava: depois de recarregar a tela, a nota de uma venda virava "nota com
 * receita própria", e cancelá-la mandava o RECEBÍVEL DA VENDA para a lixeira —
 * a venda continuava na lista e o dinheiro sumia do contas a receber.
 *
 * O que o banco sabe responde: a fatura de assinatura (`recorrenciaId`), o
 * título com chave de venda (`saleDocId`), e a nota que ainda não foi
 * autorizada — a avulsa só ganha receita NA autorização, então um rascunho
 * com título ligado só pode estar reaproveitando um.
 */
export function receitaReaproveitada(n: {
  status: string; movimentoId?: string | null; recorrenciaId?: string | null; saleDocId?: string | null;
}): boolean {
  if (!n.movimentoId) return false;
  if (n.recorrenciaId || n.saleDocId) return true;
  return n.status === "rascunho" || n.status === "processando";
}

/**
 * Por que esta venda NÃO pode ser excluída agora — ou `null` quando pode.
 * Uma regra só para demonstração e produção (antes a demonstração apagava até
 * recebimento baixado, e nenhum dos dois caminhos olhava a nota).
 *
 * - **Nota emitida ou em processamento:** a nota continua valendo na
 *   prefeitura. Excluir a venda tiraria a receita do DRE e o recebível do
 *   contas a receber, e o faturamento declarado ao fisco deixaria de ter
 *   contrapartida no sistema. Cancela-se a nota primeiro.
 * - **Recebimento baixado:** é dinheiro que já entrou; estorna-se antes.
 *
 * `situacoesDosTitulos` são as `situacao` dos títulos da venda.
 */
export function bloqueioDeExclusao(v: Pick<Venda, "numero" | "statusNF" | "numeroNF">, situacoesDosTitulos: readonly string[]): string | null {
  if (v.statusNF === "emitida" || v.statusNF === "processando") {
    return `A venda ${v.numero} tem nota fiscal ${v.statusNF === "emitida" ? `emitida${v.numeroNF ? ` (nº ${v.numeroNF})` : ""}` : "em processamento"}. Cancele a nota no emissor de NFS-e antes de excluir a venda — a nota continuaria valendo sem venda nem recebível no sistema.`;
  }
  if (situacoesDosTitulos.some((s) => s !== "previsto" && s !== "cancelado")) {
    return `A venda ${v.numero} tem recebimento baixado. Estorne o recebimento antes de excluir a venda — excluir agora apagaria dinheiro que já entrou.`;
  }
  return null;
}

export const vendaComNota = (v: Venda, nota: { status: string; numero?: string }): Venda => ({
  ...v,
  statusNF: statusNFDaNota(nota.status),
  numeroNF: nota.numero ?? v.numeroNF ?? "",
});
