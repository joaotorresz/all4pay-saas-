/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A PREVISÃO DO MÊS EM TRÊS CAMADAS — o que já foi, o que está marcado e o
 * que costuma acontecer.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O dono pergunta "como vai fechar este mês?" e o sistema respondia com UM
 * número de fluxo — sem dizer quanto dele já aconteceu e quanto é aposta. As
 * três camadas separam isso:
 *
 *  1. **REALIZADO** — o que já entrou e saiu da conta neste mês, até hoje.
 *     É FATO: `entradas`/`saidas` canônicas, regime de caixa.
 *  2. **AGENDADO** — títulos em aberto que vencem até o fim do mês, MAIS o
 *     vencido não pago (que ainda vai se mover, e a data mais cedo é hoje).
 *     É PROJEÇÃO: `projetadoNaJanela`, a mesma regra do fluxo de caixa.
 *  3. **ESTIMADO** — o que costuma acontecer e NÃO está agendado: as regras de
 *     recorrência sem título no mês (`projetarRecorrentes`) e os compromissos
 *     que se repetem nos lançamentos (`montarPainelRecorrentes`) e ainda não
 *     apareceram neste mês. É ESTIMATIVA: média do que se repete.
 *
 * ⚠️ **A REGRA QUE DÁ VALOR AO NÚMERO: nada é contado duas vezes.** O
 * estimado só existe onde NÃO há título:
 *   - regra de recorrência → casamento por (regra, MÊS), a mesma chave
 *     `rec:<regra>:<data>` que o materializador grava; um título da regra no
 *     mês (pago ou em aberto) SUPRIME a estimativa — por isso só as ocorrências
 *     `origem: "projetado"` entram;
 *   - padrão inferido → o compromisso (contraparte + categoria) que já tem
 *     QUALQUER lançamento no mês não é estimado; e o compromisso cujos títulos
 *     vêm de uma regra cadastrada fica com a regra (senão a mesma conta de luz
 *     entraria pela regra E pelo padrão).
 *
 * ⚠️ **O resultado previsto é a soma das três, e a tela mostra as três.**
 * Um número só esconderia que metade dele é aposta.
 *
 * Puro, tipado, demo-safe, sem I/O e sem relógio (`hoje` vem do `RiskInput`).
 * Versão `previsao-mes/1.0.0`.
 */
import type { RiskInput } from "@/core/risk-engine/types";
import {
  entradas, saidas, projetadoNaJanela, janela, janelaDoMesDe, valorOuNulo,
  magnitude, previsto, cancelado, type Natureza, type Procedencia, type Janela,
} from "@/core/indicadores";
import { projetarRecorrentes, regraDoMovimento, type RegraRecorrente } from "@/core/contas-pagar/projecao";
import { montarPainelRecorrentes, chave as chaveDoCompromisso, deslocarMes } from "@/core/contas-pagar/recorrentes";

export const PREVISAO_MES_VERSION = "previsao-mes/1.0.0";

export type Camada = "realizado" | "agendado" | "estimado";

export const ROTULO_CAMADA: Record<Camada, string> = {
  realizado: "Realizado",
  agendado: "Agendado",
  estimado: "Estimado",
};

export const NATUREZA_CAMADA: Record<Camada, Natureza> = {
  realizado: "fato",
  agendado: "projecao",
  estimado: "estimativa",
};

export interface ItemEstimado {
  /** `rec:<regra>:<data>` para regra; `padrao:<compromisso>` para padrão inferido. */
  chave: string;
  origem: "regra" | "padrao";
  tipo: "entrada" | "saida";
  descricao: string;
  categoria: string | null;
  valor: number;
  /** Data prevista quando vem de regra; `null` no padrão (só se sabe o mês). */
  data: string | null;
}

export interface CamadaDoMes {
  camada: Camada;
  natureza: Natureza;
  entradas: number;
  saidas: number;
  /** entradas − saídas desta camada. */
  resultado: number;
  /** Quantos lançamentos (ou ocorrências estimadas) formam a camada. */
  itens: number;
  /** Frase literal do que foi somado — vai para o "i". */
  formula: string;
  /** A procedência canônica — é ela que a tela usa para marcar o que é projeção. */
  procedencia: Procedencia;
}

export interface PrevisaoDoMes {
  versao: string;
  /** "YYYY-MM". */
  mes: string;
  hoje: string;
  /** Fim do mês, "YYYY-MM-DD". */
  fimDoMes: string;
  camadas: Record<Camada, CamadaDoMes>;
  /** Soma das três camadas. */
  previsto: { entradas: number; saidas: number; resultado: number };
  /** Quanto do agendado é vencido de antes (entra no mês como "a partir de hoje"). */
  vencidoNoAgendado: { entradas: number; saidas: number };
  estimados: ItemEstimado[];
  /** Regras de recorrência consideradas — `0` torna o estimado "só padrões". */
  regras: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface EntradaPrevisao {
  input: RiskInput;
  /** As regras de recorrência (hoje só as de saída existem no banco). */
  regras: readonly RegraRecorrente[];
}

export function montarPrevisaoDoMes({ input, regras }: EntradaPrevisao): PrevisaoDoMes {
  const hoje = input.hoje.slice(0, 10);
  const jm = janelaDoMesDe(hoje);
  const mes = hoje.slice(0, 7);

  /* ---- 1. REALIZADO: caixa do dia 1º até hoje ----------------------------- */
  const jReal = janela(jm.de, hoje, "Realizado no mês");
  const ie = entradas(input, jReal, "caixa");
  const is = saidas(input, jReal, "caixa");
  // ⚠️ Mês sem movimento devolve o indicador AUSENTE (ONDA 4); aqui ele é uma
  // PARCELA de uma soma, e a parcela de nada é zero — a tela diz quantos itens.
  const eReal = valorOuNulo(ie) ?? 0;
  const sReal = valorOuNulo(is) ?? 0;
  const nReal = ie.procedencia.lancamentos + is.procedencia.lancamentos;

  /* ---- 2. AGENDADO: aberto até o fim do mês + vencido não pago ----------- */
  const jAg = janela(jm.de, jm.ate, "Agendado no mês");
  const pe = projetadoNaJanela(input, jAg, "entrada");
  const ps = projetadoNaJanela(input, jAg, "saida");
  const eAg = pe.valor;
  const sAg = ps.valor;
  // O vencido de ANTES do mês — dito à parte, porque ele infla o agendado com
  // dinheiro que já devia ter se movido.
  const vencidoAntes = (tipo: "entrada" | "saida") => round2(input.movements
    .filter((m) => m.type === tipo && previsto(m) && !cancelado(m) && m.due_date.slice(0, 10) < jm.de)
    .reduce((s, m) => s + magnitude(m), 0));

  /* ---- 3. ESTIMADO ------------------------------------------------------- */
  const estimados: ItemEstimado[] = [];

  // 3a. Regras de recorrência sem título no mês.
  const proj = projetarRecorrentes({ regras: [...regras], movimentos: input.movements, de: jm.de, ate: jm.ate });
  for (const o of proj.ocorrencias) {
    if (o.origem !== "projetado") continue; // ⚠️ realizado = título existe → já está nas camadas 1 ou 2
    estimados.push({
      chave: o.chave, origem: "regra", tipo: "saida", descricao: o.descricao,
      categoria: o.categoria, valor: o.valor, data: o.vencimento,
    });
  }

  // 3b. Padrões inferidos (fixos e variáveis) que ainda não apareceram no mês.
  const nomes = input.partyNames ?? {};
  const doMes = input.movements.filter((m) => !cancelado(m) && (m.paid_date ?? m.due_date).slice(0, 7) === mes);
  const idsRegras = new Set(regras.map((r) => r.id));
  const chavesDaRegra = new Set<string>();
  const chavesNoMes = new Set<string>();
  for (const m of input.movements) {
    const rid = regraDoMovimento(m);
    if (rid && idsRegras.has(rid)) chavesDaRegra.add(`${m.type}|${chaveDoCompromisso(m, nomes)}`);
  }
  for (const m of doMes) chavesNoMes.add(`${m.type}|${chaveDoCompromisso(m, nomes)}`);
  // A regra também "cobre" o compromisso de mesma contraparte + categoria.
  const regraCobre = new Set(regras.map((r) => `saida|${(r.contraparte ?? "").trim().toLowerCase()}·${(r.categoria ?? "—").trim().toLowerCase()}`));

  for (const tipo of ["saida", "entrada"] as const) {
    // O histórico é a janela de 6 meses que TERMINA no mês anterior: o mês
    // corrente ainda está acontecendo, e deixá-lo entrar faria "não apareceu
    // ainda" pesar contra o padrão.
    const painel = montarPainelRecorrentes(input, deslocarMes(mes, -1), tipo);
    for (const g of painel.grupos) {
      if (g.especie !== "fixa" && g.especie !== "variavel") continue;
      const k = `${tipo}|${g.chave}`;
      if (chavesNoMes.has(k)) continue;      // ⚠️ já tem lançamento no mês
      if (chavesDaRegra.has(k)) continue;    // ⚠️ quem responde é a regra
      if (regraCobre.has(k)) continue;
      estimados.push({
        chave: `padrao:${k}`, origem: "padrao", tipo, descricao: g.contraparte,
        categoria: g.categoria, valor: g.mediaMensal, data: null,
      });
    }
  }
  estimados.sort((a, b) => b.valor - a.valor || a.descricao.localeCompare(b.descricao, "pt-BR"));

  const eEst = round2(estimados.filter((x) => x.tipo === "entrada").reduce((s, x) => s + x.valor, 0));
  const sEst = round2(estimados.filter((x) => x.tipo === "saida").reduce((s, x) => s + x.valor, 0));

  const camada = (c: Camada, e: number, s: number, itens: number, formula: string, j: Janela): CamadaDoMes => ({
    camada: c, natureza: NATUREZA_CAMADA[c], entradas: round2(e), saidas: round2(s),
    resultado: round2(e - s), itens, formula,
    procedencia: {
      lancamentos: itens, regime: c === "realizado" ? "caixa" : "competencia", janela: j, formula,
      natureza: NATUREZA_CAMADA[c],
    },
  });
  const camadas: Record<Camada, CamadaDoMes> = {
    realizado: camada("realizado", eReal, sReal, nReal,
      `entradas e saídas liquidadas com data de pagamento entre ${jm.de} e ${hoje}`, jReal),
    agendado: camada("agendado", eAg, sAg, pe.procedencia.lancamentos + ps.procedencia.lancamentos,
      "títulos em aberto com vencimento até o fim do mês, mais o vencido não pago (esperado a partir de hoje)", jAg),
    estimado: camada("estimado", eEst, sEst, estimados.length,
      "regras de recorrência sem título no mês, e compromissos que se repetem (média dos últimos meses) e ainda não apareceram neste mês", jAg),
  };

  const tot = (k: "entradas" | "saidas") => round2(camadas.realizado[k] + camadas.agendado[k] + camadas.estimado[k]);
  const E = tot("entradas");
  const S = tot("saidas");
  return {
    versao: PREVISAO_MES_VERSION,
    mes, hoje, fimDoMes: jm.ate,
    camadas,
    previsto: { entradas: E, saidas: S, resultado: round2(E - S) },
    vencidoNoAgendado: {
      entradas: vencidoAntes("entrada"),
      saidas: vencidoAntes("saida"),
    },
    estimados,
    regras: regras.length,
  };
}
