"use client";

/**
 * Persistência LOCAL de vendas (só a DEMONSTRAÇÃO), configuração de impostos e
 * links de pagamento.
 *
 * ⚠️ Em produção a venda mora em `sales_docs` e é lida e gravada por
 * `lib/vendas` — nenhuma tela chama as funções de venda daqui fora da
 * demonstração. A chave `a4p_vendas_docs` está CONGELADA (store-org): o que
 * ficou nela antes da morada única aparece na lista como "só neste navegador".
 *
 * A venda é o documento-mãe: ao salvar, ela também gera o RECEBÍVEL no dataset,
 * para que caixa, DRE e cobrança a enxerguem sem ninguém lançar duas vezes.
 */
import { appendImported, removerImported } from "@/lib/imported";
import { isDemo } from "@/lib/demo";
import { ler, gravar } from "@/lib/store-org";
import { criarTitulos } from "@/lib/data";
import { createClient } from "@/lib/supabase/client";
import { TETO_LINHAS, semAmostra } from "@/lib/supabase/consulta";
import { configPadrao, type Venda, type ConfigImpostos, type LinkPagamento, type ContaImposto } from "@/core/vendas";
import type { Movement } from "@/lib/types";
import { proximoNumeroDe } from "@/core/vendas/documento";

const K_VENDAS = "a4p_vendas_docs";
const K_CONFIG = "a4p_impostos_config";
const K_LINKS = "a4p_links_pagamento";

/**
 * ⚠️ As três chaves são de NEGÓCIO (`CHAVES_ORG`) e passam por `store-org`:
 * gravadas com `localStorage.setItem` cru, a configuração de impostos de uma
 * máquina nunca chegava à outra, e a hidratação a sobrescrevia com a versão
 * velha do servidor na sessão seguinte.
 *
 * A venda antiga (`a4p_vendas_docs`, CONGELADA) é a exceção de LEITURA: em
 * produção o `ler` de chave congelada devolve vazio, e a lista precisa ver o
 * rastro do navegador para oferecer "enviar". Ler não cria segunda morada.
 */
function lerVendasDoNavegador(): Venda[] {
  if (isDemo) return ler<Venda[]>(K_VENDAS, []);
  if (typeof window === "undefined") return [];
  try {
    const s = window.localStorage.getItem(K_VENDAS);
    return s ? (JSON.parse(s) as Venda[]) : [];
  } catch { return []; }
}

export const novoId = (p: string): string =>
  `${p}_${Date.now().toString(36)}_${Math.floor(Math.abs(performance.now()) % 1000)}`;

/* --------------------------------- vendas --------------------------------- */

export const listarVendas = (): Venda[] => lerVendasDoNavegador();

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
        // O NOME da categoria no texto (o id vai só para a chave, em produção).
        category: v.categoriaNome || v.categoria || "venda",
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
  return proximoNumeroDe(listarVendas().map((v) => v.numero), new Date().getFullYear());
}

/* -------------------------- configuração de impostos -------------------------- */

/**
 * ⚠️ DÍVIDA DECLARADA, não esquecida. Quando a empresa nunca salvou a
 * configuração de impostos, a tela parte das alíquotas do Lucro Presumido —
 * inclusive para quem declarou Simples ou Real. Trocar isto pelo regime
 * declarado MUDA o número de empresa com regime declarado, e o card que tirou o
 * Presumido por omissão exigiu o contrário (número idêntico para quem
 * declarou). Fica EXPLÍCITO aqui, com nome, até alguém decidir.
 *
 * Quem NÃO declarou regime nunca chega aqui: a tela de provisionamento mostra o
 * aviso e não monta a configuração.
 */
export const REGIME_DA_CONFIG_NUNCA_SALVA = "presumido" as const;

export const lerConfigImpostos = (): ConfigImpostos =>
  ler<ConfigImpostos>(K_CONFIG, configPadrao(REGIME_DA_CONFIG_NUNCA_SALVA));

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
export async function criarContasDeImpostos(
  contas: ContaImposto[],
  mesCompetencia: string,
  contaBancaria: string,
  nomeCategoria: (id: string) => string | null = () => null,
): Promise<{ criadas: number; jaExistiam: number }> {
  const refs = contas.map((c) => `imp:${mesCompetencia}:${c.imposto}`);
  if (isDemo) {
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
          // ⚠️ O NOME no texto e o id na chave — gravar o id no texto fazia a
          // lista e o DRE mostrarem um número no lugar da categoria.
          category: (c.categoria && nomeCategoria(c.categoria)) || c.rotulo,
          category_id: c.categoria || null,
          description: `${c.rotulo} · competência ${mesCompetencia}`,
          party_id: c.fornecedorId || null,
          reference_code: refs[k],
        } as unknown as Movement,
      });
    });
    return { criadas: contas.length, jaExistiam: 0 };
  }
  /**
   * ⚠️ **EM PRODUÇÃO ISTO NÃO GRAVAVA NADA** (`if (!isDemo) return 0`) e a
   * tela dizia "Nada a criar neste período" — o escritor morto da família da
   * folha e da venda, com uma mensagem que ainda culpava o período.
   *
   * Idempotente pela `reference_code` (`imp:<mês>:<imposto>`): o que já existe
   * fica como está (pode ter sido baixado ou editado), e só o que falta nasce.
   */
  const { data, error } = await semAmostra(createClient()
    .from("movements").select("reference_code"))
    .in("reference_code", refs).limit(TETO_LINHAS);
  if (error) throw error;
  const existentes = new Set(((data ?? []) as { reference_code: string | null }[]).map((r) => r.reference_code));
  const novas = contas.filter((_, k) => !existentes.has(refs[k]));
  await criarTitulos(novas.map((c) => ({
    account_id: contaBancaria,
    type: "saida" as const,
    amount: c.valor,
    due_date: c.vencimento,
    // A competência é o MÊS apurado, não o vencimento (que cai no seguinte).
    competence_date: `${mesCompetencia}-01`,
    category: (c.categoria && nomeCategoria(c.categoria)) || c.rotulo,
    category_id: c.categoria || null,
    description: `${c.rotulo} · competência ${mesCompetencia}`,
    party_id: c.fornecedorId || null,
    reference_code: `imp:${mesCompetencia}:${c.imposto}`,
    origem: "manual" as const,
  })));
  return { criadas: novas.length, jaExistiam: contas.length - novas.length };
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
