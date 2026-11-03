"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * COMPRAS, BOLETOS RECEBIDOS E NFs RECEBIDAS — onde moram e como viram caixa.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A compra APROVADA vira título — é assim que ela chega ao fluxo de caixa, ao
 * DRE e à cobrança sem ninguém lançar duas vezes. Reprovar ou cancelar RETIRA
 * os títulos: um pedido negado não pode continuar pesando num caixa que ele
 * nunca tocou.
 *
 * ⚠️ **O ESCRITOR MORTO, de novo, e pela quarta porta.** A versão anterior
 * gravava os títulos com `appendImported` depois de um `if (!isDemo) return`:
 * em PRODUÇÃO aprovar uma compra não criava conta a pagar nenhuma — e a tela
 * dizia "os títulos entraram em contas a pagar". O boleto lançado idem: ganhava
 * `movimentoId` e nenhum título. A guarda do escritor morto não via, porque ela
 * só exigia a palavra `isDemo` no escopo — e o próprio `return` a continha.
 *
 * ⚠️ **E A COMPRA MORAVA SÓ NO NAVEGADOR**, depois numa linha só de
 * `org_state` com a lista inteira: quem pede e quem aprova em máquinas
 * diferentes regravavam a lista toda, e a última gravação vencia (uma
 * aprovação podia sumir quando outra pessoa salvava um pedido novo).
 *
 * Desde 03/11/2026 a compra mora em `public.compras`, UMA LINHA POR COMPRA
 * (migration 20261103200000). O documento é `dados` (o tipo `Compra`);
 * número, status e valor são colunas geradas dele, e o banco recusa número
 * repetido e status fora da lista. A chave `a4p_compras` ficou CONGELADA em
 * `store-org`: em produção ela não é lida nem gravada; na demonstração, que
 * não tem banco, ela continua sendo a casa.
 *
 * As regras de dinheiro, escritas:
 *   · o título nasce ANTES de a compra virar "aprovada"; se o banco recusar,
 *     o status não muda e a mensagem real vai para a tela;
 *   · reprovar/cancelar/excluir retira só o PREVISTO, e é RECUSADO com parcela
 *     paga (`recusaDeRetirada`) — apagar pagamento sem estorno deixa o saldo
 *     sem o lançamento que o explica;
 *   · aprovar de novo não duplica: o título já existente (pela chave
 *     `compra:<id>:<parcela>`) encerra a operação.
 */
import { appendImported, removerImported, importedMovements } from "@/lib/imported";
import { isDemo } from "@/lib/demo";
import { ler, gravar, CHAVES_ORG } from "@/lib/store-org";
import { excluirLogico, restaurarLogico } from "@/lib/exclusao";
import { semAmostra, TETO_LINHAS } from "@/lib/supabase/consulta";
import { reportar } from "@/lib/erros";
import {
  movimentosDaCompra, parcelasDaCompra, linhaDoTituloDaCompra, recusaDeRetirada,
  referenciaDaParcela, proximoNumeroDeCompra, situacaoPaga,
  type Compra, type BoletoRecebido, type NFRecebida,
} from "@/core/compras";
import type { Movement } from "@/lib/types";

async function cliente() {
  const { createClient } = await import("@/lib/supabase/client");
  return createClient();
}

const mensagem = (e: unknown): string => {
  const x = e as { message?: string; hint?: string } | null;
  return x?.message ? `${x.message}${x.hint ? ` ${x.hint}` : ""}` : "o banco recusou a gravação";
};

export const novoId = (p: string): string =>
  `${p}_${Date.now().toString(36)}_${Math.floor(Math.abs(performance.now()) % 1000)}`;

/* --------------------------------- compras --------------------------------- */

/** As compras da empresa aberta, da mais nova para a mais antiga. */
export async function listarCompras(): Promise<Compra[]> {
  if (isDemo) return ler<Compra[]>(CHAVES_ORG.compras, []);
  const s = await cliente();
  const { data, error } = await s.from("compras").select("dados").limit(TETO_LINHAS);
  if (error) throw new Error(mensagem(error));
  return ((data ?? []) as { dados: Compra }[])
    .map((r) => r.dados)
    .sort((a, b) => (b.criadoEm ?? "").localeCompare(a.criadoEm ?? "") || b.numero.localeCompare(a.numero));
}

async function lerCompra(id: string): Promise<Compra | null> {
  if (isDemo) return ler<Compra[]>(CHAVES_ORG.compras, []).find((c) => c.id === id) ?? null;
  const s = await cliente();
  const { data, error } = await s.from("compras").select("dados").eq("id", id).maybeSingle();
  if (error) throw new Error(mensagem(error));
  return (data as { dados: Compra } | null)?.dados ?? null;
}

/**
 * Grava UMA compra. Em produção é uma linha só: duas pessoas mexendo em
 * compras diferentes não se sobrescrevem mais. A empresa vem do banco
 * (`auth_org_id()`), nunca do navegador.
 */
async function persistir(c: Compra): Promise<Compra[]> {
  if (isDemo) {
    gravar(CHAVES_ORG.compras, [c, ...ler<Compra[]>(CHAVES_ORG.compras, []).filter((x) => x.id !== c.id)]);
    return listarCompras();
  }
  const s = await cliente();
  const { error } = await s.from("compras").upsert({ id: c.id, dados: c }, { onConflict: "org_id,id" });
  if (error) throw new Error(mensagem(error));
  return listarCompras();
}

/** Os títulos que ESTA compra tem hoje no caixa, e se algum já foi pago. */
async function titulosDaCompra(c: Compra): Promise<{ id: string; pago: boolean }[]> {
  if (isDemo) {
    // ⚠️ Os ids vêm de `parcelasDaCompra`, não de `movimentosDaCompra`: o
    // segundo devolve vazio quando a compra não está aprovada, e é justamente
    // aí que precisamos saber o que remover.
    const ids = new Set(parcelasDaCompra(c).map((p) => `compra-${c.id}-${p.numero}`));
    return (importedMovements() ?? [])
      .filter((m) => ids.has(m.id))
      .map((m) => ({ id: m.id, pago: m.status === "pago" }));
  }
  const refs = parcelasDaCompra(c).map((p) => referenciaDaParcela(c.id, p.numero));
  const s = await cliente();
  const { data, error } = await semAmostra(s
    .from("movements").select("id,situacao"))
    .in("reference_code", refs)
    .limit(TETO_LINHAS);
  if (error) throw new Error(error.message);
  return ((data ?? []) as { id: string; situacao: string }[])
    .filter((t) => t.situacao !== "cancelado" && t.situacao !== "estornado")
    .map((t) => ({ id: t.id, pago: situacaoPaga(t.situacao) }));
}

/**
 * Coloca no caixa as parcelas de uma compra aprovada.
 *
 * ⚠️ Em demonstração o corpo roda de forma SÍNCRONA (antes do primeiro
 * `await`): quem chama invalida as consultas logo em seguida, e uma gravação
 * que acontecesse um tique depois deixaria a tela relendo o dataset antigo.
 */
async function criarTitulosDaCompra(c: Compra): Promise<void> {
  const movs = movimentosDaCompra(c);
  if (movs.length === 0) return;
  if (movs.some((m) => !(m.amount > 0))) {
    throw new Error("Uma das parcelas ficou com valor zero: aumente o valor da compra ou reduza o número de parcelas.");
  }
  if (isDemo) {
    const jaTem = new Set((importedMovements() ?? []).map((m) => m.id));
    movs.filter((m) => !jaTem.has(m.id)).forEach((m) => {
      appendImported({
        movement: {
          id: m.id,
          account_id: m.accountId,
          type: "saida",
          status: m.status,
          amount: m.amount,
          due_date: m.dueDate,
          paid_date: m.paidDate,
          reconciled: false,
          category: m.category,
          description: m.description,
          party_id: m.partyId,
          reference_code: m.referencia,
          origem: "manual",
        } as unknown as Movement,
      });
    });
    return;
  }
  // Aprovar de novo (a tentativa depois de uma recusa) não pode duplicar.
  if ((await titulosDaCompra(c)).length > 0) return;
  const s = await cliente();
  const { error } = await s.from("movements").insert(movs.map(linhaDoTituloDaCompra));
  if (error) throw error;
}

/** Retira do caixa as parcelas previstas — e recusa se alguma já foi paga. */
async function retirarTitulosDaCompra(c: Compra, acao: "cancelar" | "excluir", motivo: string): Promise<void> {
  const titulos = await titulosDaCompra(c);
  const recusa = recusaDeRetirada(c.numero, titulos, acao);
  if (recusa) throw new Error(recusa);
  if (isDemo) { removerImported(titulos.map((t) => t.id)); return; }
  for (const t of titulos) await excluirLogico("movements", t.id, motivo);
}

/**
 * Grava a compra criada pelo formulário.
 *
 * ⚠️ A compra PAGA nasce aprovada e precisa entrar no caixa já — e o
 * formulário ESPERA a gravação. A versão anterior disparava o título sem
 * aguardar e a tela anunciava "registrada e aprovada — os títulos entraram no
 * caixa" antes de o banco responder; uma recusa (mês fechado, conta inválida)
 * chegava depois, quando a pessoa já tinha saído da tela com a promessa.
 *
 * ⚠️ O DINHEIRO VEM ANTES DO STATUS, como em `decidirCompra`: se o banco
 * recusar o título, a compra NÃO é gravada e o erro sobe com a mensagem real.
 * O formulário continua aberto com tudo preenchido — corrigir e salvar de novo
 * não duplica nada, porque nada foi gravado.
 */
export async function salvarCompra(c: Compra): Promise<Compra[]> {
  if (c.status === "aprovada") {
    try {
      await criarTitulosDaCompra(c);
    } catch (e) {
      reportar("compras.titulos", e, "a compra paga foi recusada: os títulos não entraram no caixa");
      throw new Error(mensagem(e));
    }
    // ⚠️ Daqui em diante os títulos JÁ estão no caixa. Se gravar a compra
    // falhar (número repetido, sem permissão), "a compra não foi registrada" seria meia
    // verdade: o dinheiro entrou. A mensagem diz as duas metades, e salvar de
    // novo no mesmo formulário não duplica (mesmo id → mesma chave do título).
    try {
      return await persistir(c);
    } catch (e) {
      reportar("compras.gravar", e, "os títulos da compra paga entraram no caixa e a compra não foi gravada");
      throw new Error(`os títulos já entraram no caixa, mas a compra não foi gravada (${mensagem(e)}). Salve de novo neste formulário — não duplica.`);
    }
  }
  return persistir(c);
}

export async function removerCompra(id: string): Promise<Compra[]> {
  const alvo = await lerCompra(id);
  if (alvo) await retirarTitulosDaCompra(alvo, "excluir", `compra ${alvo.numero} excluída`);
  if (isDemo) {
    gravar(CHAVES_ORG.compras, ler<Compra[]>(CHAVES_ORG.compras, []).filter((c) => c.id !== id));
    return listarCompras();
  }
  // Exclusão LÓGICA, como em toda tabela de negócio: a compra vai para a
  // lixeira (com motivo e na trilha) e "Desfazer" a devolve.
  await excluirLogico("compras", id, alvo ? `compra ${alvo.numero} excluída` : "compra excluída");
  return listarCompras();
}

/** Devolve uma compra excluída — o desfazer da exclusão. */
export async function restaurarCompra(c: Compra): Promise<Compra[]> {
  if (isDemo) {
    if (c.status === "aprovada") await criarTitulosDaCompra(c);
    return persistir(c);
  }
  // A compra volta da lixeira primeiro; os títulos previstos, depois, pela
  // mesma chave (`compra:<id>:<parcela>`), sem duplicar.
  await restaurarLogico("compras", c.id);
  if (c.status === "aprovada") await criarTitulosDaCompra(c);
  return listarCompras();
}

/**
 * Aprovar/reprovar/cancelar — o único caminho que mexe no caixa.
 *
 * ⚠️ O DINHEIRO VEM ANTES DO STATUS: se o banco recusar o título, a compra
 * continua como estava e o erro sobe com a mensagem real. Gravar o status
 * primeiro deixaria uma compra "aprovada" que não está em conta a pagar
 * nenhuma — a promessa sem o dinheiro.
 */
export async function decidirCompra(id: string, status: Compra["status"]): Promise<Compra[]> {
  const alvo = await lerCompra(id);
  if (!alvo) return listarCompras();
  const nova: Compra = { ...alvo, status, erroTitulos: null };
  if (status === "aprovada") {
    await criarTitulosDaCompra(nova);
  } else {
    await retirarTitulosDaCompra(alvo, status === "cancelada" ? "cancelar" : "excluir",
      `compra ${alvo.numero} ${status === "cancelada" ? "cancelada" : "reprovada"}`);
  }
  return persistir(nova);
}

/**
 * Número sequencial legível e estável dentro do ano — o maior + 1. Duas
 * pessoas criando ao mesmo tempo podem chegar ao mesmo número: o banco recusa
 * a segunda (`compras_numero_unico`) e a mensagem vai para o formulário.
 */
export async function proximoNumeroCompra(): Promise<string> {
  return proximoNumeroDeCompra((await listarCompras()).map((c) => c.numero), new Date().getFullYear());
}

/* ---------------------------- boletos recebidos ---------------------------- */

export const listarBoletos = (): BoletoRecebido[] => ler<BoletoRecebido[]>(CHAVES_ORG.boletosRecebidos, []);

export function salvarBoleto(b: BoletoRecebido): BoletoRecebido[] {
  // O código de barras É a identidade do boleto: o mesmo título capturado pelo
  // DDA e digitado à mão é UM boleto, não dois.
  const out = [b, ...listarBoletos().filter((x) => x.leitura.codigoBarras !== b.leitura.codigoBarras)];
  gravar(CHAVES_ORG.boletosRecebidos, out);
  return out;
}

export function removerBoleto(id: string): BoletoRecebido[] {
  const out = listarBoletos().filter((b) => b.id !== id);
  gravar(CHAVES_ORG.boletosRecebidos, out);
  return out;
}

/*
 * ⚠️ CAMP-B — `lancarBoleto` foi REMOVIDO. Ele criava o título só dentro de
 * `if (isDemo)`; em produção marcava o boleto como lançado e nenhuma conta
 * nascia. O boleto agora vira conta pelo formulário de conta a pagar (a partir
 * da caixa de entrada ou da tela de boletos), que grava pelo escritor único.
 */

/* ------------------------------ NFs recebidas ------------------------------ */

export const listarNFs = (): NFRecebida[] => ler<NFRecebida[]>(CHAVES_ORG.nfsRecebidas, []);

export function salvarNF(n: NFRecebida): NFRecebida[] {
  const chave = n.chave?.chave;
  const out = [
    n,
    // A chave de acesso é única por nota em todo o país — é o dedup natural.
    // Sem chave (NFS-e municipal) o dedup cai no id.
    ...listarNFs().filter((x) => (chave ? x.chave?.chave !== chave : x.id !== n.id)),
  ];
  gravar(CHAVES_ORG.nfsRecebidas, out);
  return out;
}

export function removerNF(id: string): NFRecebida[] {
  const out = listarNFs().filter((n) => n.id !== id);
  gravar(CHAVES_ORG.nfsRecebidas, out);
  return out;
}
