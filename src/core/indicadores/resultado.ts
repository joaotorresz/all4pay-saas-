/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OS INDICADORES DE RESULTADO — a cascata, uma função por linha.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Receita bruta, deduções, receita líquida, custo, despesa operacional, EBITDA,
 * margem — e, ao lado deles, a posição consolidada, o estoque de títulos e o
 * churn. Cada um com o MESMO contrato dos dez primeiros: `{ valor, indisponivel?,
 * procedencia }`.
 *
 * ⚠️ **Por que aqui e não em `core/dre`.** O `dreGerencial` continua sendo o
 * motor da CASCATA (as linhas, os componentes, o drill-down) e nada disto o
 * substitui — a aritmética é a mesma e a classificação é literalmente o mesmo
 * módulo. O que falta lá é o contrato: `dreGerencial` devolve `number`, e um
 * `number` não sabe dizer que não sabe. "EBITDA de R$ 0" e "não houve
 * lançamento no período" saem idênticos de um `number`, e é essa a diferença
 * que a ONDA 4 existe para tornar visível.
 *
 * ⚠️ **A MARGEM É O CASO MAIS PERIGOSO**, e é por ela que este arquivo começou.
 * Toda margem é uma razão sobre a receita: sem receita não existe margem, e
 * "margem de 0%" lê como "a empresa vendeu e não sobrou nada" — a notícia
 * ruim — quando a verdade é "a empresa não vendeu". As duas mandam o dono fazer
 * coisas opostas: a primeira manda cortar custo, a segunda manda vender.
 *
 * Puro, tipado, demo-safe, sem I/O e sem relógio. Versão `indicadores/1.0.0`.
 */
import type { RiskInput, RiskMovement } from "@/core/risk-engine/types";
import {
  magnitude, liquidado, previsto, cancelado, dataDe, type Regime,
} from "./convencoes";
import { type Janela, dentro, janelaDoMesDe } from "./janela";
import { ehReceitaOperacional } from "@/core/relatorios";
import { cascataDRE, type LinhaCascata } from "@/core/relatorios/cascata";
import {
  classificarDespesa, classificarReceita,
  type LinhaDespesa, type LinhaReceita,
} from "./classificacao";
import {
  type Indicador, type Natureza, type MotivoIndisponivel, type Procedencia,
} from "./index";

/* -------------------------------------------------------------------------- */
/* Construtores locais                                                         */
/* -------------------------------------------------------------------------- */

const ausente = (
  j: Janela, regime: Regime | "posicao", formula: string,
  codigo: MotivoIndisponivel, motivo: string,
  comoResolver?: string, natureza: Natureza = "fato", lancamentos = 0,
): Indicador => ({
  valor: 0,
  indisponivel: { codigo, motivo, comoResolver },
  procedencia: { lancamentos, regime, janela: j, formula, natureza, aviso: motivo },
});

const presente = (
  valor: number, j: Janela, regime: Regime, formula: string,
  rows: readonly RiskMovement[], natureza: Natureza,
): Indicador => ({
  valor,
  procedencia: {
    lancamentos: rows.length, regime, janela: j, formula, natureza,
    movimentos: rows.map((m) => m.id),
  },
});

/* -------------------------------------------------------------------------- */
/* A base                                                                      */
/* -------------------------------------------------------------------------- */

interface Base {
  rows: RiskMovement[];
  receita: number;
  receitaPorLinha: Record<LinhaReceita, number>;
  despesaPorLinha: Record<LinhaDespesa, number>;
  /** Toda entrada que NÃO é faturamento (juros, rendimento, empréstimo, aporte). */
  entradaNaoOperacional: number;
  /** Alguma linha contada ainda não foi liquidada? Então o número é projeção. */
  natureza: Natureza;
}

/**
 * A agregação por linha, sobre a janela e o regime pedidos.
 *
 * ⚠️ Mesma aritmética de `agregar()` em `core/dre/engine` — de propósito, e com
 * o MESMO classificador importado do mesmo módulo. O que muda é só o recorte:
 * lá o período chega como duas strings soltas, aqui como uma `Janela` tipada
 * que sabe dizer quando é impossível.
 */
function base(input: RiskInput, j: Janela, regime: Regime): Base {
  const receitaPorLinha: Record<LinhaReceita, number> = { vendas: 0, servicos: 0, juros: 0, outras: 0 };
  const despesaPorLinha: Record<LinhaDespesa, number> = { impostos: 0, cmv: 0, folha: 0, financeiro: 0, opex: 0 };
  const rows: RiskMovement[] = [];
  let receita = 0;
  for (const m of input.movements) {
    if (cancelado(m) || !dentro(j, dataDe(m, regime))) continue;
    rows.push(m);
    if (m.type === "entrada") {
      // ⚠️ `receita` é a OPERACIONAL. A receita financeira (juros, rendimento
      // de aplicação) é resultado financeiro e entra só na sua linha — somá-la
      // aqui inflava receita bruta, líquida, lucro bruto e o EBITDA, que por
      // definição exclui o financeiro. Mesmo defeito que `core/dre/engine`
      // tinha; `core/relatorios` sempre esteve certo e é a referência.
      const linhaR = classificarReceita(m.category);
      receitaPorLinha[linhaR] += magnitude(m);
      /*
       * ⚠️ **O teste era `linhaR !== "juros"`, e ele deixava o EMPRÉSTIMO
       * passar.** O comentário acima já dizia a regra certa — "receita é a
       * OPERACIONAL" — mas a implementação só reconhecia a receita financeira.
       * Empréstimo bancário e aporte de sócio entram no caixa, não são
       * faturamento, e entravam aqui: medido na fixture compartilhada, R$ 15.000
       * de empréstimo inflavam receita bruta, receita líquida, lucro bruto e
       * EBITDA deste painel — e só deste, o que fazia as duas cascatas do
       * sistema divergirem por esse valor exato.
       *
       * Agora a pergunta tem UMA resposta: `ehReceitaOperacional`, a mesma que
       * `core/relatorios` usa para montar a linha de Receita Bruta.
       */
      if (ehReceitaOperacional(m)) receita += magnitude(m);
    } else {
      despesaPorLinha[classificarDespesa(m.category)] += magnitude(m);
    }
  }
  /*
   * ⚠️ **A perna financeira tem de recolher TUDO que a receita operacional
   * deixou de fora.** Era `receitaPorLinha.juros`, e o empréstimo não é juros:
   * ao sair da receita (certo), ele sumia do resultado — o lucro líquido caía
   * pelo valor exato do empréstimo. Tirar de um lado sem devolver do outro não
   * é corrigir, é trocar um erro por outro de sinal contrário.
   */
  const entradaNaoOperacional = rows
    .filter((m) => m.type === "entrada" && !ehReceitaOperacional(m))
    .reduce((acc, m) => acc + magnitude(m), 0);

  return {
    rows, receita, receitaPorLinha, despesaPorLinha, entradaNaoOperacional,
    natureza: rows.some((m) => !liquidado(m)) ? "projecao" : "fato",
  };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ A FÁBRICA NÃO CALCULA MAIS. Ela LÊ a cascata e veste o contrato.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Este módulo era a **terceira** agregação independente de resultado do sistema
 * (`docs/auditoria.md`). O que ele acrescenta — e continua acrescentando — é o
 * CONTRATO da ONDA 4: dizer quando NÃO sabe, com código, motivo e saída. O que
 * ele não precisa mais fazer é somar: `cascataDRE` já devolve `Indicador` por
 * linha, com a mesma ausência e a mesma procedência.
 *
 * ⚠️ Enquanto ele somava por conta própria, a diferença aparecia no dado real:
 * ele contava **empréstimo bancário como receita** e a cascata não — R$ 15.000
 * de divergência declarados na matriz de reconciliação. Duas implementações só
 * divergem no dado que as separa, e o dado sempre chega depois do teste.
 *
 * A `formula` continua vindo daqui: ela é o texto que a tela mostra na origem do
 * número, e é escrita no vocabulário do produto, não no da estrutura contábil.
 */
function daCascata(
  input: RiskInput, j: Janela, regime: Regime,
  formula: string, id: LinhaCascata,
): Indicador {
  if (j.vazia) {
    return ausente(j, regime, formula, "janela_invalida",
      j.motivo ?? "o período pedido não existe",
      "Corrija as datas: a data inicial está depois da final.");
  }
  const ind = cascataDRE(input, { intervalo: { de: j.de, ate: j.ate }, regime }).linhas[id];
  if (ind.indisponivel) {
    return ausente(j, regime, formula, ind.indisponivel.codigo,
      ind.indisponivel.motivo, ind.indisponivel.comoResolver,
      ind.procedencia.natureza, ind.procedencia.lancamentos);
  }
  return {
    valor: ind.valor,
    procedencia: { ...ind.procedencia, janela: j, regime, formula },
  };
}

/* -------------------------------------------------------------------------- */
/* 11–17. A CASCATA                                                            */
/* -------------------------------------------------------------------------- */

const DEFAULT_REGIME: Regime = "competencia";

/** **Receita bruta** — tudo que entrou, antes de qualquer dedução. */
export const receitaBruta = (
  input: RiskInput, j: Janela = janelaDoMesDe(input.hoje), regime: Regime = DEFAULT_REGIME,
): Indicador =>
  daCascata(input, j, regime, "soma das entradas operacionais do período", "receita_bruta");

/**
 * **Deduções** — impostos sobre a receita. Sai em MAGNITUDE (positivo).
 *
 * ⚠️ O sinal aparece na cascata, não aqui. Uma dedução negativa somada em vez
 * de subtraída infla a receita líquida, e a cascata continua "fechando" —
 * porque ela fecha sobre os números que recebe, não sobre os que deveria.
 */
export const deducoes = (
  input: RiskInput, j: Janela = janelaDoMesDe(input.hoje), regime: Regime = DEFAULT_REGIME,
): Indicador =>
  daCascata(input, j, regime, "impostos sobre receita no período", "deducoes");

/** **Receita líquida** = bruta − deduções. */
export const receitaLiquida = (
  input: RiskInput, j: Janela = janelaDoMesDe(input.hoje), regime: Regime = DEFAULT_REGIME,
): Indicador =>
  daCascata(input, j, regime, "receita bruta − impostos sobre receita", "receita_liquida");

/** **Custo** — CMV / fornecedores. Magnitude. */
export const custo = (
  input: RiskInput, j: Janela = janelaDoMesDe(input.hoje), regime: Regime = DEFAULT_REGIME,
): Indicador =>
  daCascata(input, j, regime, "custo das mercadorias e fornecedores no período", "custos_variaveis");

/** **Lucro bruto** = receita líquida − custo. */
export const lucroBruto = (
  input: RiskInput, j: Janela = janelaDoMesDe(input.hoje), regime: Regime = DEFAULT_REGIME,
): Indicador =>
  daCascata(input, j, regime, "receita líquida − custo", "lucro_bruto");

/** **Despesa operacional** = OPEX + folha. Magnitude. */
export const despesaOperacional = (
  input: RiskInput, j: Janela = janelaDoMesDe(input.hoje), regime: Regime = DEFAULT_REGIME,
): Indicador =>
  daCascata(input, j, regime, "despesas operacionais no período", "despesas_operacionais");

/** **EBITDA** = lucro bruto − despesa operacional. */
export const ebitda = (
  input: RiskInput, j: Janela = janelaDoMesDe(input.hoje), regime: Regime = DEFAULT_REGIME,
): Indicador =>
  daCascata(input, j, regime, "margem de contribuição − despesas operacionais", "ebitda");

/** **Lucro líquido** = EBITDA + resultado financeiro. */
export const lucroLiquido = (
  input: RiskInput, j: Janela = janelaDoMesDe(input.hoje), regime: Regime = DEFAULT_REGIME,
): Indicador =>
  daCascata(input, j, regime, "EBIT + resultado financeiro − impostos sobre o lucro", "resultado_liquido");

/* -------------------------------------------------------------------------- */
/* 18. AS MARGENS — o caso perigoso                                            */
/* -------------------------------------------------------------------------- */

type LinhaDaMargem = "bruta" | "ebitda" | "liquida";

/**
 * A margem (0..1) sobre a **receita líquida**.
 *
 * ⚠️ **Sem receita não existe margem** — e este é o caso mais perigoso da
 * onda inteira. "Margem de 0%" lê como "vendeu e não sobrou nada", que é a
 * notícia ruim; a verdade, num mês sem faturamento, é "não vendeu". As duas
 * mandam o dono fazer coisas OPOSTAS: a primeira manda cortar custo, a segunda
 * manda vender. Um percentual é a única grandeza em que o zero da ausência e o
 * zero do desastre são graficamente idênticos.
 *
 * ⚠️ E a base é a receita LÍQUIDA, nunca a bruta: uma margem calculada sobre a
 * bruta é sistematicamente menor que a mesma margem calculada sobre a líquida,
 * e comparar as duas entre telas produz a divergência que a ONDA 1 matou nos
 * valores absolutos.
 */
export function margem(
  input: RiskInput,
  qual: LinhaDaMargem = "ebitda",
  j: Janela = janelaDoMesDe(input.hoje),
  regime: Regime = DEFAULT_REGIME,
): Indicador {
  const formula = `${qual === "bruta" ? "lucro bruto" : qual === "ebitda" ? "EBITDA" : "lucro líquido"} ÷ receita líquida`;
  if (j.vazia) {
    return ausente(j, regime, formula, "janela_invalida",
      j.motivo ?? "o período pedido não existe",
      "Corrija as datas: a data inicial está depois da final.");
  }
  /*
   * ⚠️ A guarda de denominador vive na cascata, e é uma só. Repeti-la aqui
   * criaria dois lugares onde "sem receita não existe margem" pode ser
   * afrouxado — e basta um para a regra deixar de valer.
   */
  const c = cascataDRE(input, { intervalo: { de: j.de, ate: j.ate }, regime });
  const ind = qual === "bruta" ? c.margemBruta : qual === "ebitda" ? c.margemEbitda : c.margemLiquida;
  if (ind.indisponivel) {
    return ausente(j, regime, formula, ind.indisponivel.codigo,
      ind.indisponivel.motivo, ind.indisponivel.comoResolver,
      ind.procedencia.natureza, ind.procedencia.lancamentos);
  }
  return { valor: ind.valor, procedencia: { ...ind.procedencia, janela: j, regime, formula } };
}

/* -------------------------------------------------------------------------- */
/* 19. ESTOQUE DE TÍTULOS — posição, não fluxo                                 */
/* -------------------------------------------------------------------------- */

/**
 * **O estoque de títulos em aberto** — quantos reais existem a receber (ou a
 * pagar) neste instante, independentemente de período.
 *
 * ⚠️ É POSIÇÃO. Um título de 2024 ainda em aberto conta hoje, e por isso a
 * janela aqui não recorta o estoque — ela só descreve o instante. É a leitura
 * de quem vai cobrar; quem vai decidir gasto quer `resultado`, que é fluxo. As
 * duas já ganharam nomes distintos ("Títulos a receber" × "Extrato de
 * recebimentos") justamente porque exibi-las com o mesmo rótulo fez uma parecer
 * errada.
 *
 * ⚠️ **Zero aqui é RESPOSTA**, e boa: não há título em aberto. Só a ausência de
 * carteira inteira — nenhum título, nem aberto nem liquidado — é ignorância, e
 * ela é rara o bastante para não valer inventar um código próprio; o que ela
 * produz é o mesmo `sem_lancamentos` dos demais.
 */
export function estoqueDeTitulos(
  input: RiskInput, tipo: "entrada" | "saida" = "entrada",
): Indicador {
  const hoje = input.hoje.slice(0, 10);
  const j: Janela = {
    de: "1900-01-01", ate: hoje, label: "Posição de hoje", vazia: false,
  } as Janela;
  const formula = `soma dos títulos de ${tipo === "entrada" ? "entrada" : "saída"} ainda em aberto (posição, sem recorte de período)`;
  const doTipo = input.movements.filter((m) => m.type === tipo && !cancelado(m));
  if (doTipo.length === 0) {
    return ausente(j, "competencia", formula, "sem_lancamentos",
      "nenhum título cadastrado deste lado",
      "Importe o extrato ou lance os títulos para que a carteira exista.");
  }
  const abertos = doTipo.filter((m) => previsto(m));
  return presente(
    abertos.reduce((s, m) => s + magnitude(m), 0),
    j, "competencia", formula, abertos,
    // Um título em aberto ainda não aconteceu — é expectativa de caixa.
    abertos.length === 0 ? "fato" : "projecao",
  );
}

/* -------------------------------------------------------------------------- */
/* 20. CHURN                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * **Churn** (0..1) — a fração das contrapartes que pagavam no período anterior
 * e não pagaram neste.
 *
 * ⚠️ Ele é uma razão sobre a base ANTERIOR, e é aí que mora a armadilha: sem
 * ninguém no período anterior, "churn de 0%" lê como retenção perfeita — a
 * melhor notícia possível — quando a verdade é que não havia de quem perder. O
 * primeiro mês de qualquer empresa exibiria retenção impecável.
 *
 * ⚠️ E o mês CORRENTE, incompleto, não serve de comparação: no dia 2 quase
 * ninguém pagou ainda, e o churn apareceria perto de 100%. Por isso a janela
 * padrão é o mês passado contra o retrasado — a última comparação entre dois
 * períodos fechados.
 */
export function churn(
  input: RiskInput, atual: Janela, anterior: Janela,
): Indicador {
  const formula = "contrapartes que pagavam no período anterior e não pagaram neste ÷ contrapartes do período anterior";
  if (atual.vazia || anterior.vazia) {
    return ausente(atual, "caixa", formula, "janela_invalida",
      "um dos dois períodos comparados não existe",
      "Corrija as datas: a data inicial está depois da final.");
  }
  const pagantes = (j: Janela) => {
    const set = new Set<string>();
    for (const m of input.movements) {
      if (m.type !== "entrada" || !liquidado(m)) continue;
      if (!dentro(j, dataDe(m, "caixa"))) continue;
      const k = m.party_id ?? m.category;
      if (k) set.add(k);
    }
    return set;
  };
  const antes = pagantes(anterior);
  if (antes.size === 0) {
    return ausente(atual, "caixa", formula, "sem_base",
      "não havia cliente pagante no período anterior — não há de quem medir perda",
      "Compare períodos em que já havia carteira; o primeiro mês de operação não tem churn.");
  }
  const agora = pagantes(atual);
  const perdidos = Array.from(antes).filter((k) => !agora.has(k));
  return {
    valor: perdidos.length / antes.size,
    procedencia: {
      lancamentos: antes.size, regime: "caixa", janela: atual, formula,
      // Contagem de fatos passados dos dois lados: quem pagou e quem não pagou.
      natureza: "fato",
    },
  };
}

/* -------------------------------------------------------------------------- */
/* 21. POSIÇÃO CONSOLIDADA                                                     */
/* -------------------------------------------------------------------------- */

export interface EmpresaConsolidada {
  nome: string;
  input: RiskInput;
}

/**
 * **A posição consolidada** — o saldo somado das empresas do grupo.
 *
 * ⚠️ Uma empresa que o servidor não devolveu **não vale zero**. É o defeito
 * desta onda na sua forma mais cara: o consolidado sai menor que a realidade,
 * com a cara de um consolidado completo, e é esse número que vai ao banco
 * pedir crédito. Por isso a lista de empresas entra inteira e a ausência de
 * qualquer uma torna o total indisponível — com o nome de quem faltou.
 *
 * (As eliminações entre empresas do grupo continuam em `core/contabilidade`:
 * consolidar não é somar, e este indicador é a POSIÇÃO de caixa, que não sofre
 * eliminação — dinheiro em conta de uma empresa é dinheiro do grupo.)
 */
export function posicaoConsolidada(
  empresas: readonly EmpresaConsolidada[],
  faltando: readonly string[] = [],
): Indicador {
  const j: Janela = {
    de: "1900-01-01", ate: "9999-12-31", label: "Posição de hoje", vazia: false,
  } as Janela;
  const formula = "soma do saldo em conta de cada empresa do grupo";
  if (empresas.length === 0) {
    return ausente(j, "posicao", formula, "sem_lancamentos",
      "nenhuma empresa carregada",
      "Verifique o vínculo do seu usuário com as empresas do grupo.");
  }
  if (faltando.length > 0) {
    return ausente(j, "posicao", formula, "sem_base",
      `${faltando.length === 1 ? "uma empresa não respondeu" : `${faltando.length} empresas não responderam`}: ${faltando.join(", ")}`,
      "Recarregue. Um consolidado com empresa faltando seria menor que a realidade, com a cara de completo.",
      "fato", empresas.length);
  }
  const total = empresas.reduce((s, e) => s + e.input.saldoAtual, 0);
  return {
    valor: total,
    procedencia: {
      lancamentos: empresas.reduce((s, e) => s + e.input.movements.length, 0),
      regime: "posicao", janela: j, formula, natureza: "fato",
    },
  };
}

/* -------------------------------------------------------------------------- */
/* O painel do resultado — a cascata inteira numa execução                     */
/* -------------------------------------------------------------------------- */

export interface PainelResultado {
  janela: Janela;
  regime: Regime;
  receitaBruta: Indicador;
  deducoes: Indicador;
  receitaLiquida: Indicador;
  custo: Indicador;
  lucroBruto: Indicador;
  despesaOperacional: Indicador;
  ebitda: Indicador;
  lucroLiquido: Indicador;
  margemBruta: Indicador;
  margemEbitda: Indicador;
  margemLiquida: Indicador;
}

/**
 * A cascata inteira sobre a MESMA janela — a forma preferida de consumo.
 *
 * Pedir linha a linha convida a passar janelas diferentes sem querer, e é
 * assim que uma tela mostra a receita de agosto com o EBITDA de julho.
 */
export function painelResultado(
  input: RiskInput,
  j: Janela = janelaDoMesDe(input.hoje),
  regime: Regime = DEFAULT_REGIME,
): PainelResultado {
  return {
    janela: j, regime,
    receitaBruta: receitaBruta(input, j, regime),
    deducoes: deducoes(input, j, regime),
    receitaLiquida: receitaLiquida(input, j, regime),
    custo: custo(input, j, regime),
    lucroBruto: lucroBruto(input, j, regime),
    despesaOperacional: despesaOperacional(input, j, regime),
    ebitda: ebitda(input, j, regime),
    lucroLiquido: lucroLiquido(input, j, regime),
    margemBruta: margem(input, "bruta", j, regime),
    margemEbitda: margem(input, "ebitda", j, regime),
    margemLiquida: margem(input, "liquida", j, regime),
  };
}

export type { Procedencia };
