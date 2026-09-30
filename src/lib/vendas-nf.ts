"use client";

/**
 * Emite a NFS-e de UMA venda — o caminho que faltava entre a lista de vendas e
 * o emissor (ver `core/vendas/nota` para o defeito que ele fecha).
 *
 * A receita NÃO é lançada de novo: a nota reaproveita o título que a venda já
 * gerou. E o resultado volta para o documento da venda pelo escritor único
 * (`salvarVendaDoc`), então os dois painéis — status da venda e status da NF —
 * leem o mesmo fato.
 */
import { isDemo } from "@/lib/demo";
import { criarNfse, transmitirNfse } from "@/lib/nfse";
import { salvarVendaDoc, titulosDaVenda } from "@/lib/vendas";
import { idRecebivel, lerConfigImpostos, salvarSoDocumento } from "@/lib/vendas-store";
import { pedidoDeNota, vendaComNota } from "@/core/vendas/nota";
import type { Venda } from "@/core/vendas";

async function tituloDaVenda(v: Venda): Promise<string> {
  if (isDemo) return idRecebivel(v.id);
  const titulos = await titulosDaVenda(v.id);
  const vivo = titulos.find((t) => t.situacao !== "cancelado" && t.situacao !== "estornado");
  if (!vivo) throw new Error(`A venda ${v.numero} não tem título a receber — salve a venda de novo para gerá-lo antes de emitir a nota.`);
  return vivo.id;
}

export interface NotaEmitida { venda: Venda; numero?: string; autorizada: boolean; motivo?: string }

/** LANÇA quando o banco recusa algum passo, com a mensagem dele. */
export async function emitirNotaDaVenda(v: Venda): Promise<NotaEmitida> {
  const titulo = await tituloDaVenda(v);
  const iss = lerConfigImpostos().aliquotas.iss ?? 0;
  const rascunho = await criarNfse(pedidoDeNota(v, titulo, iss));
  const nf = await transmitirNfse(rascunho.id);
  if (!nf) throw new Error("A nota foi criada, mas não foi encontrada para transmitir. Abra a aba Emitir NFS-e e transmita por lá.");
  const venda = vendaComNota(v, nf);
  // O número e o status da NF voltam para o documento. O aviso de título (venda
  // já baixada, parcelada) não se aplica: a nota não mexe em dinheiro.
  if (isDemo) salvarSoDocumento(venda);
  else await salvarVendaDoc(venda);
  return { venda, numero: nf.numero, autorizada: nf.status === "autorizada", motivo: nf.motivoRejeicao };
}
