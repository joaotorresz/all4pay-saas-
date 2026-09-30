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
import type { StatusNF, Venda } from "./index";

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
  (v.statusNF === "a_emitir" || v.statusNF === "negada")
  && !["cancelada", "reembolsada", "reembolso_manual", "chargeback", "expirada"].includes(v.status);

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

export const vendaComNota = (v: Venda, nota: { status: string; numero?: string }): Venda => ({
  ...v,
  statusNF: statusNFDaNota(nota.status),
  numeroNF: nota.numero ?? v.numeroNF ?? "",
});
