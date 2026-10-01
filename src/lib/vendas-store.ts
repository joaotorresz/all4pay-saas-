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
import { configPadrao, contasSemTitulo, descricaoDoImposto, type Venda, type ConfigImpostos, type LinkPagamento, type ContaImposto } from "@/core/vendas";
import { criarTitulos } from "@/lib/data";
import { listPlanoContas } from "@/lib/registros";
import { reportar } from "@/lib/erros";
import { semAmostra, TETO_LINHAS } from "@/lib/supabase/consulta";
import { ehUUID } from "@/core/vendas/documento";
import { ler, gravar } from "@/lib/store-org";
import type { Movement } from "@/lib/types";
import { proximoNumeroDe } from "@/core/vendas/documento";
import { ler as lerOrg, gravar as gravarOrg } from "@/lib/store-org";

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

/*
 * ⚠️ A CONFIGURAÇÃO DOS IMPOSTOS E OS LINKS DE PAGAMENTO são dado da EMPRESA
 * (`CHAVES_ORG` em store-org) e passam por `store-org`, não pelo `localStorage`
 * cru. Antes, as duas chaves eram gravadas só no navegador: as alíquotas e os
 * fornecedores que o contador configurou valiam só naquela máquina — o colega
 * gerava as contas a pagar com a alíquota de fábrica —, e a hidratação (o
 * servidor vence) DEVOLVIA a cópia antiga migrada uma vez, desfazendo a edição
 * na sessão seguinte. A chave da venda (`K_VENDAS`) continua local: ela está
 * CONGELADA, e a casa da venda é `sales_docs`.
 */
export const lerConfigImpostos = (): ConfigImpostos =>
  lerOrg<ConfigImpostos>(K_CONFIG, configPadrao(REGIME_DA_CONFIG_NUNCA_SALVA));

export function salvarConfigImpostos(c: ConfigImpostos): ConfigImpostos {
  gravarOrg(K_CONFIG, c);
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
export function nomeDaCategoriaDoImposto(
  c: ContaImposto, nomeCategoria: (id: string) => string | null = () => null,
): string {
  if (!c.categoria) return c.rotulo;
  // A categoria do BANCO (CAD) resolve pelo cadastro que a tela já carregou.
  const doBanco = nomeCategoria(c.categoria);
  if (doBanco) return doBanco;
  const noPlano = listPlanoContas().find((p) => p.id === c.categoria);
  if (noPlano) return noPlano.nome;
  // Um UUID solto (categoria do banco) não é nome; o rótulo do imposto é.
  return ehUUID(c.categoria) || /^\d+$/.test(c.categoria) ? c.rotulo : c.categoria;
}

type NomeCategoria = (id: string) => string | null;
const tituloDoImposto = (c: ContaImposto, mesCompetencia: string, contaBancaria: string, nomeCategoria?: NomeCategoria) => ({
  account_id: contaBancaria,
  type: "saida" as const,
  amount: c.valor,
  due_date: c.vencimento,
  // A competência do imposto é o mês das vendas que o geraram, não o do vencimento.
  competence_date: `${mesCompetencia}-01`,
  category: nomeDaCategoriaDoImposto(c, nomeCategoria),
  category_id: ehUUID(c.categoria) ? c.categoria : null,
  description: descricaoDoImposto(c.rotulo, mesCompetencia),
  reference_code: `imp:${mesCompetencia}:${c.imposto}`,
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
 * ⚠️ **Idempotente por competência, nos dois caminhos e pela mesma regra
 * (`contasSemTitulo`).** A chave é a
 * descrição (`descricaoDoImposto`): o imposto que já tem título vivo naquela
 * competência NÃO ganha outro — é devolvido em `jaExistiam`. Sem isso, clicar
 * duas vezes dobraria o imposto do mês no fluxo de caixa.
 *
 * LANÇA quando o banco recusa, com a mensagem dele.
 */
export function gravarContasDeImpostos(
  contas: ContaImposto[],
  mesCompetencia: string,
  contaBancaria: string,
  nomeCategoria?: NomeCategoria,
): Promise<ResultadoImpostos> {
  if (contas.length === 0) return Promise.resolve({ criadas: 0, jaExistiam: [] });
  // Em demonstração a gravação é local e SÍNCRONA — a tela relê logo depois.
  if (isDemo) return Promise.resolve(gravarNaDemonstracao(contas, mesCompetencia, contaBancaria, nomeCategoria));
  // ⚠️ Em produção, UMA gravação por vez. A tela chama a porta síncrona sem
  // travar o botão; dois cliques rápidos disparavam duas consultas que viam
  // "nenhum título" ao mesmo tempo e gravavam o imposto DUAS vezes. Em fila, a
  // segunda consulta já enxerga o que a primeira gravou.
  const vez = filaImpostos.then(() => gravarNoBanco(contas, mesCompetencia, contaBancaria, nomeCategoria));
  filaImpostos = vez.catch(() => undefined);
  return vez;
}

let filaImpostos: Promise<unknown> = Promise.resolve();

/**
 * A MESMA regra de produção: imposto com título vivo na competência não ganha
 * outro nem é reescrito. Antes a demonstração SUBSTITUÍA o título — e
 * substituir uma guia já paga a devolvia a "pendente", desfazendo a baixa.
 */
function gravarNaDemonstracao(contas: ContaImposto[], mesCompetencia: string, contaBancaria: string, nomeCategoria?: NomeCategoria): ResultadoImpostos {
  // O dataset da demonstração não é lido por ninguém em produção (o "escritor
  // morto"): chamado fora dela, isto tem de falhar alto, não gravar no nada.
  if (!isDemo) throw new Error("As contas de imposto só são gravadas no navegador em demonstração.");
  const vivas = (importedMovements() ?? [])
    .filter((m) => m.type === "saida" && m.status !== "cancelado")
    .map((m) => m.description ?? "");
  const { novas, jaExistiam } = contasSemTitulo(contas, mesCompetencia, vivas);
  novas.forEach((c) => {
    const t = tituloDoImposto(c, mesCompetencia, contaBancaria, nomeCategoria);
    appendImported({
      movement: {
        id: `imp-${mesCompetencia}-${c.imposto}`, account_id: t.account_id, type: t.type, status: "pendente",
        amount: t.amount, due_date: t.due_date, paid_date: null, reconciled: false,
        category: t.category, category_id: t.category_id, reference_code: t.reference_code, description: t.description, party_id: t.party_id ?? (c.fornecedorId || null),
        origem: t.origem,
      } as unknown as Movement,
    });
  });
  return { criadas: novas.length, jaExistiam };
}

async function gravarNoBanco(contas: ContaImposto[], mesCompetencia: string, contaBancaria: string, nomeCategoria?: NomeCategoria): Promise<ResultadoImpostos> {
  const { createClient } = await import("@/lib/supabase/client");
  const s = createClient();
  const descricoes = contas.map((c) => descricaoDoImposto(c.rotulo, mesCompetencia));
  const { data, error } = await semAmostra(s.from("movements").select("description,status"))
    .eq("type", "saida").in("description", descricoes).neq("status", "cancelado").limit(TETO_LINHAS);
  if (error) throw new Error(error.message);
  const vivas = ((data ?? []) as { description: string }[]).map((r) => r.description);
  const { novas, jaExistiam } = contasSemTitulo(contas, mesCompetencia, vivas);
  if (novas.length) await criarTitulos(novas.map((c) => tituloDoImposto(c, mesCompetencia, contaBancaria, nomeCategoria)));
  return { criadas: novas.length, jaExistiam };
}

/**
 * A porta que a tela de provisionamento chama: aguarda a gravação e devolve
 * quantas contas nasceram e quantas já existiam (a tela diz as duas).
 */
export async function criarContasDeImpostos(
  contas: ContaImposto[],
  mesCompetencia: string,
  contaBancaria: string,
  nomeCategoria: (id: string) => string | null = () => null,
): Promise<{ criadas: number; jaExistiam: number }> {
  const r = await gravarContasDeImpostos(contas, mesCompetencia, contaBancaria, nomeCategoria);
  return { criadas: r.criadas, jaExistiam: r.jaExistiam.length };
}

/* ---------------------------- links de pagamento ---------------------------- */

export const listarLinks = (): LinkPagamento[] => lerOrg<LinkPagamento[]>(K_LINKS, []);

export function salvarLink(l: LinkPagamento): LinkPagamento[] {
  const out = [l, ...listarLinks().filter((x) => x.id !== l.id)];
  gravarOrg(K_LINKS, out);
  return out;
}

export function removerLink(id: string): LinkPagamento[] {
  const out = listarLinks().filter((l) => l.id !== id);
  gravarOrg(K_LINKS, out);
  return out;
}
