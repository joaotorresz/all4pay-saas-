"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A VENDA — UM ESCRITOR, UM LEITOR, UMA MORADA (`sales_docs`)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ A venda morava em TRÊS lugares com escritores independentes: o navegador
 * (`a4p_vendas_docs`, a tela "Nova venda"), `sales_docs` (o lançamento rápido)
 * e o recebível em `movements`. A lista somava o navegador e o DRE somava
 * `movements` — dois faturamentos com o mesmo rótulo. Editar uma venda em
 * produção não mexia no título; excluir deixava o recebível órfão.
 *
 * Agora, em produção, toda tela de venda LÊ e GRAVA por aqui, e o título aponta
 * para o documento por `movements.sale_doc_id` (chave estrangeira).
 * Em demonstração não há banco: a casa legítima é o navegador
 * (`lib/vendas-store`), e este módulo delega para ele.
 *
 * As regras de dinheiro, escritas:
 *   · o TÍTULO nasce com o documento, pelo escritor único (`criarTitulos`);
 *   · editar a venda atualiza o título SÓ enquanto ele é previsto — título
 *     baixado ou conciliado é dinheiro que já se moveu, e reescrevê-lo moveria
 *     de novo. A tela recebe o aviso e o que fazer;
 *   · excluir a venda é exclusão LÓGICA do documento e dos títulos previstos,
 *     e é RECUSADA quando há título baixado — primeiro estorna, depois exclui.
 */
import { useQuery } from "@tanstack/react-query";
import { isDemo } from "@/lib/demo";
import { criarTitulos } from "@/lib/data";
import { excluirLogico } from "@/lib/exclusao";
import { linhasDoRateio, principalDoRateio } from "@/core/registros/hierarquia";
import { semAmostra, TETO_LINHAS } from "@/lib/supabase/consulta";
import {
  listarVendas as listarLocal,
  salvarVenda as salvarLocal,
  removerVenda as removerLocal,
} from "@/lib/vendas-store";
import type { Venda } from "@/core/vendas";
import {
  documentoDaVenda, itensDoDocumento, vendaDoDocumento, proximoNumeroDe, ehUUID,
  type LinhaDocumento,
} from "@/core/vendas/documento";

async function cliente() {
  const { createClient } = await import("@/lib/supabase/client");
  return createClient();
}

const COLUNAS =
  "id,numero,doc_date,competence_date,due_date,account_id,party_id,total,subtotal,status,status_nf,numero_nf,notes,created_at,detalhe,"
  + "parties(name),sale_items(product_id,service_id,description,qty,unit_price)";

/** Um id novo que o banco aceita — o documento é `uuid`. */
export const novoIdVenda = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(16).padStart(8, "0").slice(-8)}-0000-4000-8000-${Math.floor(Math.random() * 1e12).toString(16).padStart(12, "0")}`;

/* ─────────────────────────────── leitura ─────────────────────────────── */

export async function listarVendasDoc(): Promise<Venda[]> {
  if (isDemo) return listarLocal();
  const s = await cliente();
  const { data, error } = await semAmostra(
    s.from("sales_docs").select(COLUNAS).eq("kind", "venda"),
  ).order("doc_date", { ascending: false }).limit(TETO_LINHAS);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as LinhaDocumento[]).map(vendaDoDocumento);
}

export function useVendas() {
  return useQuery({ queryKey: ["vendas-doc"], queryFn: listarVendasDoc });
}

export async function proximoNumeroVenda(): Promise<string> {
  const ano = new Date().getFullYear();
  const numeros = (await listarVendasDoc()).map((v) => v.numero);
  return proximoNumeroDe(numeros, ano);
}

/* ─────────────────────────────── gravação ─────────────────────────────── */

export interface ResultadoGravacao {
  /** Quando o título NÃO pôde acompanhar a edição — e por quê. */
  aviso?: string;
}

export async function salvarVendaDoc(v: Venda): Promise<ResultadoGravacao> {
  if (isDemo) { salvarLocal(v); return {}; }
  if (!ehUUID(v.id)) throw new Error("Venda sem identificador válido — recarregue a tela e tente de novo.");
  const s = await cliente();
  const doc = documentoDaVenda(v);

  const { data: existente, error: e0 } = await semAmostra(s
    .from("sales_docs").select("id")).eq("id", v.id).maybeSingle();
  if (e0) throw new Error(e0.message);

  if (!existente) {
    const { error: e1 } = await s.from("sales_docs").insert(doc);
    if (e1) throw new Error(e1.message);
    const itens = itensDoDocumento(v);
    if (itens.length) {
      const { error: e2 } = await s.from("sale_items").insert(itens);
      if (e2) { await desfazerDocumento(v.id); throw new Error(e2.message); }
    }
    try {
      await criarTitulos([tituloDaVenda(v)]);
    } catch (e) {
      // ⚠️ Documento sem título é a venda que promete dinheiro que não entra em
      // lugar nenhum — o defeito que esta morada existe para matar. Recusado o
      // título, o documento sai junto.
      await desfazerDocumento(v.id);
      throw e;
    }
    return {};
  }

  const { id: _id, ...semId } = doc;
  const { error: e3 } = await s.from("sales_docs").update(semId).eq("id", v.id);
  if (e3) throw new Error(e3.message);
  await trocarItens(v);
  return atualizarTitulo(v);
}

/** O título da venda — sempre pelo escritor único, com a chave do documento. */
function tituloDaVenda(v: Venda) {
  return {
    account_id: v.contaId,
    type: "entrada" as const,
    amount: v.valorTotalComJuros || v.valorTotal,
    due_date: v.vencimento,
    competence_date: v.competencia || v.vencimento,
    // ⚠️ O texto é o NOME e a chave é o id do banco. Gravar o id no texto fazia
    // a lista e o DRE mostrarem "217290" no lugar da categoria.
    category: v.categoriaNome || (ehUUID(v.categoria) ? null : v.categoria) || "Vendas",
    category_id: ehUUID(v.categoria) ? v.categoria : null,
    description: v.descricao || `Venda ${v.numero}`,
    party_id: ehUUID(v.clienteId) ? v.clienteId : null,
    status: v.pago ? ("pago" as const) : ("pendente" as const),
    paid_date: v.pago ? v.dataPagamento : null,
    origem: "venda" as const,
    sale_doc_id: v.id,
    // ⚠️ O projeto e o centro da venda chegam ao RECEBÍVEL (UUID do cadastro):
    // antes ficavam só no documento, e o relatório por projeto não via a
    // receita. Com mais de uma fatia, o rateio vira `movement_splits`.
    cost_center_id: ehUUID(principalDoRateio(v.centros) ?? "") ? principalDoRateio(v.centros) : null,
    project_id: ehUUID(principalDoRateio(v.projetos) ?? "") ? principalDoRateio(v.projetos) : null,
    splits: rateioUUID(v).length
      ? linhasDoRateio(v.projetos, v.centros, v.valorTotalComJuros || v.valorTotal, ehUUID(v.categoria) ? v.categoria : null)
      : null,
  };
}

/** Só rateio com chaves do BANCO vira linha — um id do cadastro antigo seria recusado. */
function rateioUUID(v: Venda) {
  const linhas = linhasDoRateio(v.projetos, v.centros, 100);
  return linhas.every((l) => (!l.project_id || ehUUID(l.project_id)) && (!l.cost_center_id || ehUUID(l.cost_center_id)))
    ? linhas : [];
}

async function titulosDaVenda(id: string): Promise<{ id: string; situacao: string }[]> {
  const s = await cliente();
  const { data, error } = await semAmostra(s
    .from("movements").select("id,situacao")).eq("sale_doc_id", id).limit(TETO_LINHAS);
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: string; situacao: string }[];
}

async function atualizarTitulo(v: Venda): Promise<ResultadoGravacao> {
  const titulos = await titulosDaVenda(v.id);
  if (titulos.length === 0) {
    // Venda antiga, de antes da chave: o título nasce agora.
    await criarTitulos([tituloDaVenda(v)]);
    return {};
  }
  const previstos = titulos.filter((t) => t.situacao === "previsto");
  if (titulos.length > 1) {
    return { aviso: "Esta venda é parcelada: o documento foi salvo e as parcelas ficaram como estavam. Ajuste cada parcela no contas a receber." };
  }
  if (previstos.length === 0) {
    return { aviso: "O recebimento desta venda já foi baixado: o documento foi salvo, o título não. Para mudar o valor, estorne o recebimento primeiro." };
  }
  const t = tituloDaVenda(v);
  const s = await cliente();
  const { error } = await s.from("movements").update({
    account_id: t.account_id,
    amount: t.amount,
    due_date: t.due_date,
    competence_date: t.competence_date,
    category: t.category,
    description: t.description,
    party_id: t.party_id,
    cost_center_id: t.cost_center_id,
    project_id: t.project_id,
    // O rateio de uma venda EDITADA não é reescrito (as fatias antigas ficam):
    // declarado em docs/rodada-30-09/cad.md.
  }).eq("id", previstos[0].id).eq("situacao", "previsto");
  if (error) throw new Error(error.message);
  if (v.pago) {
    return { aviso: "Documento e título atualizados. A baixa do recebimento é feita no contas a receber — é ali que a conta e a data do dinheiro são conferidas." };
  }
  return {};
}

async function trocarItens(v: Venda): Promise<void> {
  const s = await cliente();
  const { data, error } = await semAmostra(s.from("sale_items").select("id")).eq("doc_id", v.id).limit(TETO_LINHAS);
  if (error) throw new Error(error.message);
  // O papel do cliente não apaga (DELETE revogado): o item velho vai para a
  // lixeira, com o evento na trilha, e o novo entra.
  for (const it of (data ?? []) as { id: string }[]) await excluirLogico("sale_items", it.id, "item substituído na edição da venda");
  const itens = itensDoDocumento(v);
  if (itens.length) {
    const { error: e } = await s.from("sale_items").insert(itens);
    if (e) throw new Error(e.message);
  }
}

async function desfazerDocumento(id: string): Promise<void> {
  try { await excluirLogico("sales_docs", id, "gravação da venda desfeita: o título foi recusado"); } catch { /* a falha original é a que importa */ }
}

/* ─────────────────────────────── exclusão ─────────────────────────────── */

export async function removerVendaDoc(v: Venda): Promise<void> {
  if (isDemo) { removerLocal(v.id); return; }
  const titulos = await titulosDaVenda(v.id);
  const movidos = titulos.filter((t) => t.situacao !== "previsto" && t.situacao !== "cancelado");
  if (movidos.length > 0) {
    throw new Error(`A venda ${v.numero} tem recebimento baixado. Estorne o recebimento antes de excluir a venda — excluir agora apagaria dinheiro que já entrou.`);
  }
  for (const t of titulos.filter((x) => x.situacao === "previsto")) {
    await excluirLogico("movements", t.id, `venda ${v.numero} excluída`);
  }
  await excluirLogico("sales_docs", v.id, `venda ${v.numero} excluída`);
}

/* ─────────────────── vendas que ficaram só no navegador ─────────────────── */

/**
 * ⚠️ Antes da morada única, a tela "Nova venda" gravava no navegador também em
 * produção. Essas vendas não estão no banco — e a maioria nunca gerou título.
 * Elas NÃO são enviadas sozinhas: enviá-las cria o recebível, e isso muda o
 * contas a receber e o DRE. A tela mostra quantas são e a pessoa decide.
 */
export function vendasSoNoNavegador(doBanco: readonly Venda[]): Venda[] {
  if (isDemo) return [];
  // ⚠️ Casa pelo CONTEÚDO, não pelo número: ao subir, a venda pode ganhar outro
  // número (o dela já estava em uso) e continuaria parecendo pendente.
  const noBanco = new Set(doBanco.map(impressao));
  return listarLocal().filter((v) => !noBanco.has(impressao(v)));
}

const impressao = (v: Venda): string =>
  [v.clienteId, v.competencia, v.vencimento, (v.valorTotalComJuros || v.valorTotal).toFixed(2)].join("|");

export async function enviarVendasDoNavegador(locais: readonly Venda[], doBanco: readonly Venda[]): Promise<number> {
  let numeros = doBanco.map((v) => v.numero);
  let enviadas = 0;
  for (const v of locais) {
    // O número local pode já estar em uso no banco: ganha o próximo livre.
    const numero = numeros.includes(v.numero) ? proximoNumeroDe(numeros, Number(v.numero.slice(0, 4)) || new Date().getFullYear()) : v.numero;
    await salvarVendaDoc({ ...v, id: novoIdVenda(), numero });
    numeros = [...numeros, numero];
    enviadas += 1;
  }
  return enviadas;
}
