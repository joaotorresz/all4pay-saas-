"use client";

/**
 * Persistência de vendas, configuração de impostos e links de pagamento
 * (localStorage, demo-safe).
 *
 * A venda é o documento-mãe: ao salvar, ela também gera o RECEBÍVEL no dataset,
 * para que caixa, DRE e cobrança a enxerguem sem ninguém lançar duas vezes.
 */
import { appendImported, removerImported } from "@/lib/imported";
import { isDemo } from "@/lib/demo";
import { configPadrao, type Venda, type ConfigImpostos, type LinkPagamento, type ContaImposto } from "@/core/vendas";
import type { Movement } from "@/lib/types";

const K_VENDAS = "a4p_vendas_docs";
const K_CONFIG = "a4p_impostos_config";
const K_LINKS = "a4p_links_pagamento";

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

/* --------------------------------- vendas --------------------------------- */

export const listarVendas = (): Venda[] => ler<Venda[]>(K_VENDAS, []);

/** O id do recebível que a venda gera — um por venda, sempre o mesmo. */
const idRecebivel = (vendaId: string) => `${vendaId}-rec`;

export function salvarVenda(v: Venda): Venda[] {
  const lista = [v, ...listarVendas().filter((x) => x.id !== v.id)];
  gravar(K_VENDAS, lista);

  if (isDemo) {
    // Regravar a venda substitui o recebível: sem remover o antigo, editar uma
    // venda duplicaria o valor a receber.
    removerImported([idRecebivel(v.id)]);
    appendImported({
      movement: {
        id: idRecebivel(v.id),
        account_id: v.contaId,
        type: "entrada",
        status: v.pago ? "pago" : "pendente",
        amount: v.valorTotalComJuros || v.valorTotal,
        due_date: v.vencimento,
        paid_date: v.pago ? v.dataPagamento : null,
        reconciled: false,
        category: v.categoria || "venda",
        description: v.descricao || `Venda ${v.numero}`,
        party_id: v.clienteId,
      } as unknown as Movement,
    });
  }
  return lista;
}

export function removerVenda(id: string): Venda[] {
  const out = listarVendas().filter((v) => v.id !== id);
  gravar(K_VENDAS, out);
  if (isDemo) removerImported([idRecebivel(id)]);
  return out;
}

/** Próximo número sequencial da venda — legível e estável no ano. */
export function proximoNumero(): string {
  const ano = new Date().getFullYear();
  const doAno = listarVendas().filter((v) => v.numero.startsWith(String(ano)));
  return `${ano}-${String(doAno.length + 1).padStart(4, "0")}`;
}

/* -------------------------- configuração de impostos -------------------------- */

export const lerConfigImpostos = (): ConfigImpostos =>
  ler<ConfigImpostos>(K_CONFIG, configPadrao());

export function salvarConfigImpostos(c: ConfigImpostos): ConfigImpostos {
  gravar(K_CONFIG, c);
  return c;
}

/**
 * Gera as contas a pagar dos impostos do mês.
 *
 * ⚠️ Idempotente por competência: o id carrega mês + imposto, e o antigo é
 * removido antes de gravar. Sem isso, clicar duas vezes em "Criar contas a
 * pagar" dobraria o imposto do mês no fluxo de caixa.
 */
export function criarContasDeImpostos(
  contas: ContaImposto[],
  mesCompetencia: string,
  contaBancaria: string,
): number {
  if (!isDemo) return 0;
  const ids = contas.map((c) => `imp-${mesCompetencia}-${c.imposto}`);
  removerImported(ids);
  contas.forEach((c, k) => {
    appendImported({
      movement: {
        id: ids[k],
        account_id: contaBancaria,
        type: "saida",
        status: "pendente",
        amount: c.valor,
        due_date: c.vencimento,
        paid_date: null,
        reconciled: false,
        category: c.categoria || c.rotulo,
        description: `${c.rotulo} · competência ${mesCompetencia}`,
        party_id: c.fornecedorId || null,
      } as unknown as Movement,
    });
  });
  return contas.length;
}

/* ---------------------------- links de pagamento ---------------------------- */

export const listarLinks = (): LinkPagamento[] => ler<LinkPagamento[]>(K_LINKS, []);

export function salvarLink(l: LinkPagamento): LinkPagamento[] {
  const out = [l, ...listarLinks().filter((x) => x.id !== l.id)];
  gravar(K_LINKS, out);
  return out;
}

export function removerLink(id: string): LinkPagamento[] {
  const out = listarLinks().filter((l) => l.id !== id);
  gravar(K_LINKS, out);
  return out;
}
