import type { SupabaseClient } from "@supabase/supabase-js";
import { semAmostra, TETO_LINHAS } from "@/lib/supabase/filtros";
import { somaDias } from "@/core/pinbank/plano";
import { passouDoTeto, pedirAte } from "@/core/pinbank/conferencia-portoes";
import {
  nsusDoExtratoComAviso,
  type EventoPinbankSistema,
  type LinhaMovimentoPinbank,
  type NsusParaDetalhar,
  type TransacaoPinbankSistema,
} from "@/core/pinbank/conferencia";

/**
 * As LEITURAS da conferência extrato × sistema — SERVER-ONLY, pela sessão de
 * quem pediu (nunca a chave de serviço): a política de linha recorta pela
 * empresa ABERTA e esconde o que está na lixeira. Só `.select`.
 *
 * ⚠️ **A EMPRESA É A DO VÍNCULO, DITA EM TODA LEITURA** (`.eq("org_id", orgId)`).
 * A política olha a empresa aberta NO INSTANTE de cada consulta; se a pessoa
 * troca de empresa em outra aba durante a conferência (a Pinbank sozinha pode
 * levar 25 s), o extrato da empresa A seria casado com os títulos da B, sob uma
 * permissão conferida só na A. A política continua sendo a autoridade; o filtro
 * garante que toda linha vem da empresa do vínculo.
 *
 * ⚠️ Sem diretiva, e importando os filtros de `@/lib/supabase/filtros` — nunca
 * de `consulta.ts`, que é `"use client"`: num route handler, `semAmostra` de lá
 * é um proxy que LANÇA (medido no build).
 *
 * ⚠️ **TRUNCAR NÃO É UMA SAÍDA.** Uma conferência sobre as primeiras 5.000 linhas
 * acusaria as vendas que ficaram de fora como "só no extrato". Cada leitura pede
 * UMA linha a mais do que o teto (`pedirAte`) e só acusa volume quando ela veio
 * (`passouDoTeto`) — o lote cheio e legítimo não é estouro. Passou do teto, a
 * resposta é `volume_alto` e a tela pede um período menor.
 *
 * ⚠️ **O SERVIDOR PODE CORTAR ANTES DO TETO.** O PostgREST entrega no máximo
 * `max_rows` linhas (1.000 no padrão do Supabase), por mais que o `.limit` peça.
 * Por isso toda leitura que pode passar disso (a janela, os títulos e os avisos
 * pelo NSU) pede `count: "exact"` e passa a contagem a `passouDoTeto`: o
 * servidor que contou mais do que entregou é volume alto, nunca uma conferência
 * sobre o pedaço. (Se o `max_rows` de produção for menor que 5.001, a janela
 * recusa períodos bem menores que o teto — D4/D2: conferir antes de ligar, e
 * paginar com `.range()` se for o caso.)
 */

/** NSUs por lote no `.in(…)` — a URL do PostgREST tem limite. */
export const LOTE_NSU = 100;
/**
 * Acima disto, de UM lado (as NSUs dos títulos da janela, ou as das linhas do
 * extrato), a conferência pede um período menor. O teto é POR LADO, nunca o da
 * união (ver `lerDetalhesPorNsu`).
 */
export const TETO_NSUS = 2000;
/** Avisos da Pinbank por lote de NSUs (aprovação, cancelamento, estornos, reentregas). */
export const TETO_EVENTOS_LOTE = LOTE_NSU * 20;
/** Maquininhas vivas de uma empresa. */
export const TETO_VINCULOS = 50;

const COLS = "id, chave, nsu, type, amount, due_date, competence_date, situacao";

export type Leitura<T> = { ok: true; dados: T } | { ok: false; codigo: "volume_alto" | "leitura_falhou" };

const falhou = { ok: false, codigo: "leitura_falhou" } as const;
const volumeAlto = { ok: false, codigo: "volume_alto" } as const;

/**
 * Os títulos da maquininha cuja COMPETÊNCIA cai no período, com um dia de
 * margem de cada lado (a venda do dia vizinho pode ter o par do outro lado).
 */
export async function lerTitulosDaJanela(s: SupabaseClient, orgId: string, p: { de: string; ate: string }): Promise<Leitura<LinhaMovimentoPinbank[]>> {
  const { data, error, count } = await semAmostra(s.from("movements").select(COLS, { count: "exact" })).eq("org_id", orgId).like("chave", "pinbank:%").is("excluido_em", null).gte("competence_date", somaDias(p.de, -1)).lte("competence_date", somaDias(p.ate, 1)).order("id").limit(pedirAte(TETO_LINHAS));
  if (error) return falhou;
  const linhas = (data ?? []) as LinhaMovimentoPinbank[];
  if (passouDoTeto(linhas.length, TETO_LINHAS, count)) return volumeAlto;
  return { ok: true, dados: linhas };
}

/**
 * Pelo NSU: os avisos recebidos, o estado de cada transação e os títulos
 * (inclusive os de fora da janela — a parcela que vence meses depois, o
 * estorno). Lotes em sequência.
 *
 * ⚠️ **NENHUMA LEITURA CUJO TAMANHO DEPENDA DO EXTRATO ALHEIO E DO QUE A
 * EMPRESA GRAVA AO MESMO TEMPO.** Antes do portão das contagens a resposta
 * ainda pode ser `volume_alto` (422): se o tamanho de uma leitura dependesse do
 * cruzamento entre as NSUs do extrato e os títulos que a empresa grava, o 422
 * contra o 200 diria à empresa se uma NSU escolhida por ela está no extrato de
 * OUTRA loja (o EC errado, D10) — um bit por chamada. Por isso:
 *   · UM TETO POR LADO (`TETO_NSUS` para as NSUs da janela e outro para as do
 *     extrato), nunca o da união — a união encolhe quando os lados coincidem;
 *   · PRIMEIRO os avisos e as transações (que só a plataforma grava) das NSUs
 *     da janela e do extrato;
 *   · DEPOIS os títulos (que a empresa também grava), só das NSUs da janela e
 *     das do extrato que têm um aviso desta empresa NO DIA DA VENDA
 *     (`nsusDoExtratoComAviso`). Uma venda real sempre tem o aviso do dia
 *     dela; o título forjado com a NSU de uma linha alheia nunca entra numa
 *     leitura cujo tamanho dependa do extrato.
 */
export async function lerDetalhesPorNsu(s: SupabaseClient, orgId: string, pedido: NsusParaDetalhar): Promise<Leitura<{
  titulos: LinhaMovimentoPinbank[];
  eventos: EventoPinbankSistema[];
  transacoes: TransacaoPinbankSistema[];
}>> {
  const todas = Array.from(new Set([...pedido.janela, ...pedido.extrato.map((x) => x.nsu)]));
  if (pedido.janela.length > TETO_NSUS || pedido.extrato.length > TETO_NSUS) return volumeAlto;
  const eventos: EventoPinbankSistema[] = [];
  const transacoes: TransacaoPinbankSistema[] = [];
  for (let i = 0; i < todas.length; i += LOTE_NSU) {
    const lote = todas.slice(i, i + LOTE_NSU);
    const [e, x] = await Promise.all([
      s.from("pinbank_eventos").select("nsu, vinculo_id, situacao, event_type, ocorrido_em, autorizacao:payload->>codAutorizAdquirente", { count: "exact" }).eq("org_id", orgId).in("nsu", lote).limit(pedirAte(TETO_EVENTOS_LOTE)),
      // (empresa, NSU) é ÚNICO: o lote devolve no máximo uma transação por NSU — o lote cheio é o normal.
      s.from("pinbank_transacoes").select("nsu, status, valor, valor_original").eq("org_id", orgId).in("nsu", lote).limit(pedirAte(lote.length)),
    ]);
    if (e.error || x.error) return falhou;
    const le = (e.data ?? []) as unknown as EventoPinbankSistema[];
    const lx = (x.data ?? []) as TransacaoPinbankSistema[];
    if (passouDoTeto(le.length, TETO_EVENTOS_LOTE, e.count) || passouDoTeto(lx.length, lote.length)) return volumeAlto;
    eventos.push(...le);
    transacoes.push(...lx);
  }
  // Os títulos: os da janela e os das NSUs do extrato com aviso desta empresa no dia da venda.
  const paraTitulos = Array.from(new Set([...pedido.janela, ...nsusDoExtratoComAviso(pedido.extrato, eventos)]));
  const titulos: LinhaMovimentoPinbank[] = [];
  for (let i = 0; i < paraTitulos.length; i += LOTE_NSU) {
    const lote = paraTitulos.slice(i, i + LOTE_NSU);
    // `count: "exact"`: o servidor pode cortar ABAIXO do teto (o `max_rows` do PostgREST) — sem a contagem, o corte passaria calado.
    const t = await semAmostra(s.from("movements").select(COLS, { count: "exact" })).eq("org_id", orgId).like("chave", "pinbank:%").is("excluido_em", null).in("nsu", lote).limit(pedirAte(TETO_LINHAS));
    if (t.error) return falhou;
    const lt = (t.data ?? []) as LinhaMovimentoPinbank[];
    if (passouDoTeto(lt.length, TETO_LINHAS, t.count)) return volumeAlto;
    titulos.push(...lt);
  }
  return { ok: true, dados: { titulos, eventos, transacoes } };
}

/** As maquininhas vivas da empresa do vínculo — para saber se há mais de uma. */
export async function lerVinculosDaEmpresa(s: SupabaseClient, orgId: string): Promise<Leitura<{ id: string; codigo_cliente: number | null }[]>> {
  const { data, error } = await s.from("pinbank_vinculos").select("id, codigo_cliente").eq("org_id", orgId).limit(pedirAte(TETO_VINCULOS));
  if (error) return falhou;
  const linhas = (data ?? []) as { id: string; codigo_cliente: number | null }[];
  if (passouDoTeto(linhas.length, TETO_VINCULOS)) return volumeAlto;
  return { ok: true, dados: linhas };
}
