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
import { appendImported, removerImported, importedMovements } from "@/lib/imported";
import { isDemo } from "@/lib/demo";
import { configPadrao, descricaoDoImposto, type Venda, type ConfigImpostos, type LinkPagamento, type ContaImposto } from "@/core/vendas";
import { criarTitulos } from "@/lib/data";
import { listPlanoContas } from "@/lib/registros";
import { reportar } from "@/lib/erros";
import { semAmostra, TETO_LINHAS } from "@/lib/supabase/consulta";
import { ehUUID } from "@/core/vendas/documento";
import type { Movement } from "@/lib/types";
import { proximoNumeroDe } from "@/core/vendas/documento";

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
export const idRecebivel = (vendaId: string): string => `${vendaId}-rec`;

export function salvarVenda(v: Venda): Venda[] {
  const lista = [v, ...listarVendas().filter((x) => x.id !== v.id)];
  gravar(K_VENDAS, lista);

  if (isDemo) {
    // ⚠️ Recebível já BAIXADO não é reescrito — a mesma regra de produção
    // (`lib/vendas.atualizarTitulo`: só o previsto acompanha a edição). Antes,
    // regravar a venda depois da baixa devolvia o título a "pendente" e
    // desfazia o recebimento do caixa sem ninguém pedir.
    const atual = (importedMovements() ?? []).find((m) => m.id === idRecebivel(v.id));
    if (atual && atual.status === "pago") return lista;
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

/**
 * Regrava SÓ o documento — sem tocar no recebível. É o caminho da nota fiscal:
 * emitir a NF muda o status e o número da nota, não o dinheiro.
 */
export function salvarSoDocumento(v: Venda): Venda[] {
  const lista = [v, ...listarVendas().filter((x) => x.id !== v.id)];
  gravar(K_VENDAS, lista);
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
 * O NOME da categoria escolhida na configuração.
 *
 * ⚠️ A configuração guarda o ID da categoria do plano de contas local, e o
 * título gravava esse id no campo de TEXTO — a lista e o DRE liam "217290" no
 * lugar de "Impostos sobre vendas", e o classificador do DRE não reconhece um
 * número. Sem categoria escolhida, vale o nome do imposto ("PIS", "ISS"), que o
 * DRE classifica sozinho.
 */
export function nomeDaCategoriaDoImposto(c: ContaImposto): string {
  if (!c.categoria) return c.rotulo;
  const noPlano = listPlanoContas().find((p) => p.id === c.categoria);
  if (noPlano) return noPlano.nome;
  // Um UUID solto (categoria do banco) não é nome; o rótulo do imposto é.
  return ehUUID(c.categoria) || /^\d+$/.test(c.categoria) ? c.rotulo : c.categoria;
}

const tituloDoImposto = (c: ContaImposto, mesCompetencia: string, contaBancaria: string) => ({
  account_id: contaBancaria,
  type: "saida" as const,
  amount: c.valor,
  due_date: c.vencimento,
  // A competência do imposto é o mês das vendas que o geraram, não o do vencimento.
  competence_date: `${mesCompetencia}-01`,
  category: nomeDaCategoriaDoImposto(c),
  description: descricaoDoImposto(c.rotulo, mesCompetencia),
  party_id: ehUUID(c.fornecedorId) ? c.fornecedorId : null,
  origem: "manual" as const,
});

export interface ResultadoImpostos { criadas: number; jaExistiam: string[] }

/**
 * Gera as contas a pagar dos impostos do mês — em demonstração E em produção.
 *
 * ⚠️ **EM PRODUÇÃO ESTE BOTÃO NÃO FAZIA NADA.** A função começava por
 * `if (!isDemo) return 0`, e a tela respondia "Nada a criar neste período." —
 * com os impostos calculados na tabela logo acima. O imposto provisionado
 * nunca virava conta a pagar, não entrava no fluxo de caixa nem no DRE: o
 * "escritor morto" pela porta de produção.
 *
 * ⚠️ **Idempotente por competência, nos dois caminhos.** Em demonstração o id
 * carrega mês + imposto e o antigo é substituído. Em produção a chave é a
 * descrição (`descricaoDoImposto`): o imposto que já tem título vivo naquela
 * competência NÃO ganha outro — é devolvido em `jaExistiam`. Sem isso, clicar
 * duas vezes dobraria o imposto do mês no fluxo de caixa.
 *
 * LANÇA quando o banco recusa, com a mensagem dele.
 */
export async function gravarContasDeImpostos(
  contas: ContaImposto[],
  mesCompetencia: string,
  contaBancaria: string,
): Promise<ResultadoImpostos> {
  if (contas.length === 0) return { criadas: 0, jaExistiam: [] };
  if (isDemo) {
    const ids = contas.map((c) => `imp-${mesCompetencia}-${c.imposto}`);
    removerImported(ids);
    contas.forEach((c, k) => {
      const t = tituloDoImposto(c, mesCompetencia, contaBancaria);
      appendImported({
        movement: {
          id: ids[k], account_id: t.account_id, type: t.type, status: "pendente",
          amount: t.amount, due_date: t.due_date, paid_date: null, reconciled: false,
          category: t.category, description: t.description, party_id: t.party_id ?? (c.fornecedorId || null),
          origem: t.origem,
        } as unknown as Movement,
      });
    });
    return { criadas: contas.length, jaExistiam: [] };
  }

  const { createClient } = await import("@/lib/supabase/client");
  const s = createClient();
  const descricoes = contas.map((c) => descricaoDoImposto(c.rotulo, mesCompetencia));
  const { data, error } = await semAmostra(s.from("movements").select("description,status"))
    .eq("type", "saida").in("description", descricoes).neq("status", "cancelado").limit(TETO_LINHAS);
  if (error) throw new Error(error.message);
  const vivas = new Set(((data ?? []) as { description: string }[]).map((r) => r.description));
  const novas = contas.filter((c) => !vivas.has(descricaoDoImposto(c.rotulo, mesCompetencia)));
  if (novas.length) await criarTitulos(novas.map((c) => tituloDoImposto(c, mesCompetencia, contaBancaria)));
  return {
    criadas: novas.length,
    jaExistiam: contas.filter((c) => vivas.has(descricaoDoImposto(c.rotulo, mesCompetencia))).map((c) => c.rotulo),
  };
}

/**
 * A porta SÍNCRONA que a tela de provisionamento ainda chama
 * (`OutrasViews`, arquivo reservado nesta rodada — ver
 * docs/rodada-30-09/vender.md: a tela deve passar a aguardar
 * `gravarContasDeImpostos` e mostrar `jaExistiam`).
 *
 * Em demonstração a gravação é local e imediata. Em produção a gravação é
 * disparada aqui e, se o banco a recusar, a MENSAGEM REAL aparece num alerta —
 * o `return 0` de antes fazia a tela dizer "nada a criar" com o imposto na
 * tela. Devolve quantas contas foram enviadas.
 */
export function criarContasDeImpostos(
  contas: ContaImposto[],
  mesCompetencia: string,
  contaBancaria: string,
): number {
  const envio = gravarContasDeImpostos(contas, mesCompetencia, contaBancaria);
  envio.catch((e) => {
    reportar("vendas.impostos", e, "as contas a pagar dos impostos do mês não foram criadas");
    if (typeof window !== "undefined") {
      window.alert(`As contas a pagar dos impostos NÃO foram criadas. O sistema respondeu: ${e instanceof Error ? e.message : String(e)}`);
    }
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
