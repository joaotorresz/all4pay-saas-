"use client";

/**
 * Emite a NFS-e de UMA venda — o caminho que faltava entre a lista de vendas e
 * o emissor (ver `core/vendas/nota` para o defeito que ele fecha).
 *
 * A receita NÃO é lançada de novo: a nota reaproveita o título que a venda já
 * gerou. E o resultado volta para o documento da venda (`gravarNotaDaVendaDoc`,
 * só as colunas da nota), então os dois painéis — status da venda e status da NF —
 * leem o mesmo fato.
 */
import { isDemo } from "@/lib/demo";
import { criarNfse, transmitirNfse, type Nfse } from "@/lib/nfse";
import { gravarNotaDaVendaDoc, titulosDaVenda } from "@/lib/vendas";
import { idRecebivel, lerConfigImpostos, listarVendas, salvarSoDocumento } from "@/lib/vendas-store";
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
  // O número e o status da NF voltam para o documento — SÓ eles: a nota não
  // mexe em dinheiro, e reescrever a venda inteira (itens + título) podia ser
  // recusado num mês fechado depois de a nota já estar autorizada.
  if (isDemo) salvarSoDocumento(venda);
  else await gravarNotaDaVendaDoc(venda.id, venda.statusNF, venda.numeroNF);
  return { venda, numero: nf.numero, autorizada: nf.status === "autorizada", motivo: nf.motivoRejeicao };
}

/**
 * Cancelar a nota de uma venda leva o status de volta ao documento da venda.
 *
 * ⚠️ Sem isto a lista de vendas seguia dizendo "Emitida · nº 100002" de uma
 * nota que já foi cancelada — e é por essa lista que se decide se a venda
 * ainda precisa de nota. Devolve o id da venda, ou `null` quando a nota não
 * era de venda nenhuma (avulsa ou de assinatura).
 */
export async function refletirCancelamentoNaVenda(nf: Nfse): Promise<string | null> {
  const titulo = nf.movimentoReceita ?? nf.movimentos[0];
  if (!titulo) return null;
  if (isDemo) {
    const venda = listarVendas().find((x) => idRecebivel(x.id) === titulo);
    if (!venda) return null;
    salvarSoDocumento({ ...venda, statusNF: "cancelada" });
    return venda.id;
  }
  const { createClient } = await import("@/lib/supabase/client");
  const { semAmostra } = await import("@/lib/supabase/consulta");
  const { data, error } = await semAmostra(createClient().from("movements").select("sale_doc_id")).eq("id", titulo).maybeSingle();
  if (error) throw new Error(error.message);
  const vendaId = (data as { sale_doc_id: string | null } | null)?.sale_doc_id;
  if (!vendaId) return null;
  await gravarNotaDaVendaDoc(vendaId, "cancelada", nf.numero ?? "");
  return vendaId;
}
