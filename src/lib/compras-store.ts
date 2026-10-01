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
 * ⚠️ **E A COMPRA MORAVA SÓ NO NAVEGADOR.** `localStorage` cru, com as chaves
 * que `store-org` já declarava como dado de negócio: o pedido criado por quem
 * compra não chegava a quem aprova (outra máquina), e depois da primeira
 * sincronização a hidratação ("o servidor vence") SOBRESCREVIA a decisão local
 * com a cópia velha do servidor — uma aprovação que desaparecia sozinha.
 * Agora as três listas leem e gravam por `store-org`.
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
import { excluirLogico } from "@/lib/exclusao";
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

export const listarCompras = (): Compra[] => ler<Compra[]>(CHAVES_ORG.compras, []);

function persistir(c: Compra): Compra[] {
  const lista = [c, ...listarCompras().filter((x) => x.id !== c.id)];
  gravar(CHAVES_ORG.compras, lista);
  return lista;
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
 * ⚠️ A compra PAGA nasce aprovada e precisa entrar no caixa já. Em produção a
 * gravação no banco é assíncrona e o formulário não a espera; se o banco
 * recusar, a compra volta para "aguardando" COM a mensagem da recusa — é a
 * lista que passa a dizer a verdade, e o botão Aprovar é a nova tentativa.
 */
export function salvarCompra(c: Compra): Compra[] {
  const lista = persistir(c);
  if (c.status === "aprovada") {
    criarTitulosDaCompra(c).catch((e) => {
      reportar("compras.titulos", e, "a compra paga foi registrada e os títulos não entraram no caixa");
      persistir({ ...c, status: "aguardando", erroTitulos: mensagem(e) });
    });
  }
  return lista;
}

export async function removerCompra(id: string): Promise<Compra[]> {
  const alvo = listarCompras().find((c) => c.id === id);
  if (alvo) await retirarTitulosDaCompra(alvo, "excluir", `compra ${alvo.numero} excluída`);
  const out = listarCompras().filter((c) => c.id !== id);
  gravar(CHAVES_ORG.compras, out);
  return out;
}

/** Devolve uma compra excluída — o desfazer da exclusão. */
export async function restaurarCompra(c: Compra): Promise<Compra[]> {
  if (c.status === "aprovada") await criarTitulosDaCompra(c);
  return persistir(c);
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
  const alvo = listarCompras().find((c) => c.id === id);
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

/** Número sequencial legível e estável dentro do ano — o maior + 1. */
export function proximoNumeroCompra(): string {
  return proximoNumeroDeCompra(listarCompras().map((c) => c.numero), new Date().getFullYear());
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
