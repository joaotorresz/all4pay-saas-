"use client";

/**
 * Persistência de compras, boletos recebidos e NFs recebidas
 * (localStorage, demo-safe, síncrona).
 *
 * A compra APROVADA vira título no dataset — é assim que ela chega ao fluxo de
 * caixa, ao DRE e à cobrança sem ninguém lançar duas vezes. Reprovar ou
 * cancelar RETIRA os títulos: um pedido negado não pode continuar pesando num
 * caixa que ele nunca tocou.
 */
import { appendImported, removerImported } from "@/lib/imported";
import { isDemo } from "@/lib/demo";
import {
  movimentosDaCompra, parcelasDaCompra,
  type Compra, type BoletoRecebido, type NFRecebida,
} from "@/core/compras";
import type { Movement } from "@/lib/types";

const K_COMPRAS = "a4p_compras";
const K_BOLETOS = "a4p_boletos_recebidos";
const K_NFS = "a4p_nfs_recebidas";

function ler<T>(k: string, padrao: T): T {
  if (typeof window === "undefined") return padrao;
  try {
    const s = localStorage.getItem(k);
    return s ? (JSON.parse(s) as T) : padrao;
  } catch { return padrao; }
}
function gravar(k: string, v: unknown): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* cota cheia */ }
}

export const novoId = (p: string): string =>
  `${p}_${Date.now().toString(36)}_${Math.floor(Math.abs(performance.now()) % 1000)}`;

/* --------------------------------- compras --------------------------------- */

export const listarCompras = (): Compra[] => ler<Compra[]>(K_COMPRAS, []);

/**
 * Todos os ids de título que ESTA compra poderia ter gerado.
 *
 * ⚠️ Vem de `parcelasDaCompra`, não de `movimentosDaCompra`: o segundo devolve
 * vazio quando a compra não está aprovada, e é justamente aí que precisamos
 * saber o que remover. Usar a lista filtrada deixaria títulos órfãos vivos no
 * caixa depois de uma reprovação.
 */
const idsDaCompra = (c: Compra): string[] =>
  parcelasDaCompra(c).map((p) => `compra-${c.id}-${p.numero}`);

function sincronizar(c: Compra): void {
  if (!isDemo) return;
  // Regravar sempre limpa antes: editar o valor de uma compra aprovada não pode
  // somar um segundo jogo de parcelas em cima do primeiro.
  removerImported(idsDaCompra(c));
  movimentosDaCompra(c).forEach((m) => {
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
      } as unknown as Movement,
    });
  });
}

export function salvarCompra(c: Compra): Compra[] {
  const lista = [c, ...listarCompras().filter((x) => x.id !== c.id)];
  gravar(K_COMPRAS, lista);
  sincronizar(c);
  return lista;
}

export function removerCompra(id: string): Compra[] {
  const alvo = listarCompras().find((c) => c.id === id);
  const out = listarCompras().filter((c) => c.id !== id);
  gravar(K_COMPRAS, out);
  if (isDemo && alvo) removerImported(idsDaCompra(alvo));
  return out;
}

/** Aprovar/reprovar/cancelar — o único caminho que mexe no caixa. */
export function decidirCompra(id: string, status: Compra["status"]): Compra[] {
  const alvo = listarCompras().find((c) => c.id === id);
  if (!alvo) return listarCompras();
  return salvarCompra({ ...alvo, status });
}

/** Número sequencial legível e estável dentro do ano. */
export function proximoNumeroCompra(): string {
  const ano = new Date().getFullYear();
  const doAno = listarCompras().filter((c) => c.numero.startsWith(String(ano)));
  return `${ano}-C${String(doAno.length + 1).padStart(4, "0")}`;
}

/* ---------------------------- boletos recebidos ---------------------------- */

export const listarBoletos = (): BoletoRecebido[] => ler<BoletoRecebido[]>(K_BOLETOS, []);

export function salvarBoleto(b: BoletoRecebido): BoletoRecebido[] {
  // O código de barras É a identidade do boleto: o mesmo título capturado pelo
  // DDA e digitado à mão é UM boleto, não dois.
  const out = [b, ...listarBoletos().filter((x) => x.leitura.codigoBarras !== b.leitura.codigoBarras)];
  gravar(K_BOLETOS, out);
  return out;
}

export function removerBoleto(id: string): BoletoRecebido[] {
  const out = listarBoletos().filter((b) => b.id !== id);
  gravar(K_BOLETOS, out);
  return out;
}

/**
 * Lança o boleto como conta a pagar.
 *
 * O boleto não é a despesa — é a cobrança dela. Virar título é o que o coloca
 * no fluxo; enquanto isso não acontece ele é só papel capturado.
 */
export function lancarBoleto(b: BoletoRecebido, contaId: string, categoria: string): BoletoRecebido[] {
  const movId = `boleto-${b.id}`;
  if (isDemo) {
    removerImported([movId]);
    appendImported({
      movement: {
        id: movId,
        account_id: contaId,
        type: "saida",
        status: "pendente",
        amount: b.leitura.valor,
        // Guia de arrecadação não traz vencimento no número; sem data o título
        // não existiria no fluxo, então cai no dia em que foi capturado.
        due_date: b.leitura.vencimento ?? b.recebidoEm,
        paid_date: null,
        reconciled: false,
        category: categoria,
        description: `Boleto ${b.beneficiario}`,
        party_id: null,
      } as unknown as Movement,
    });
  }
  return salvarBoleto({ ...b, movimentoId: movId });
}

/* ------------------------------ NFs recebidas ------------------------------ */

export const listarNFs = (): NFRecebida[] => ler<NFRecebida[]>(K_NFS, []);

export function salvarNF(n: NFRecebida): NFRecebida[] {
  const chave = n.chave?.chave;
  const out = [
    n,
    // A chave de acesso é única por nota em todo o país — é o dedup natural.
    // Sem chave (NFS-e municipal) o dedup cai no id.
    ...listarNFs().filter((x) => (chave ? x.chave?.chave !== chave : x.id !== n.id)),
  ];
  gravar(K_NFS, out);
  return out;
}

export function removerNF(id: string): NFRecebida[] {
  const out = listarNFs().filter((n) => n.id !== id);
  gravar(K_NFS, out);
  return out;
}
