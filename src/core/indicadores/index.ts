/**
 * ═══════════════════════════════════════════════════════════════════════════
 * UMA VERDADE SÓ — a camada canônica de cálculo financeiro.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * **Uma função por indicador. Nenhuma tela calcula indicador por conta
 * própria.** Se um número aparece em duas telas, ele sai daqui nas duas.
 *
 * O problema que esta camada existe para matar: cada tela somava os
 * lançamentos do seu jeito. O Fluxo de Caixa contava um título com `paid_date`
 * preenchido e status `pendente`; a Home não. O Razão postava previstos no
 * caixa; o extrato não. Nenhum estava "errado" isoladamente — estavam
 * respondendo perguntas diferentes com o mesmo rótulo. As respostas às quatro
 * perguntas (sinal, o que conta, qual data, o que é saldo) vivem em
 * `convencoes.ts`; aqui elas viram os indicadores.
 *
 * **Toda função devolve `procedencia`** — de quantos lançamentos o número saiu,
 * sob que regime e em que janela. Um indicador que não sabe dizer de onde veio
 * não pode ser conferido, e é conferindo que se descobre a divergência.
 *
 * Puro, tipado, demo-safe, sem I/O e sem relógio (`hoje` vem do `RiskInput`).
 * Versão indicadores/1.0.0.
 */
import type { RiskInput, RiskMovement } from "@/core/risk-engine/types";
import {
  assinado, magnitude, liquidado, previsto, cancelado, dataDe, saldoEm, saldoAbertura,
  semZeroNegativo, type Regime,
} from "./convencoes";
import {
  type Janela, janela, janelaHoje, janelaDoMesDe, janelaUltimosDias, diasDe, dentro,
} from "./janela";

export const INDICADORES_VERSION = "indicadores/1.0.0";

export * from "./convencoes";
export * from "./janela";

/* ========================================================================== */
/* O contrato de saída                                                         */
/* ========================================================================== */

export interface Procedencia {
  /** Quantos lançamentos entraram na conta. */
  lancamentos: number;
  regime: Regime | "posicao";
  janela: Janela;
  /** Frase curta e literal do que foi somado — vai para o "i" dos boxes. */
  formula: string;
  /** Preenchido quando o número é 0 por impossibilidade, não por ausência. */
  aviso?: string;
}

export interface Indicador {
  valor: number;
  procedencia: Procedencia;
}

const vazio = (j: Janela, formula: string, regime: Regime | "posicao" = "caixa"): Indicador => ({
  valor: 0,
  procedencia: { lancamentos: 0, regime, janela: j, formula, aviso: j.motivo },
});

/** Filtro comum: os movimentos que caem na janela sob o regime. */
function naJanela(input: RiskInput, j: Janela, regime: Regime): RiskMovement[] {
  if (j.vazia) return [];
  return input.movements.filter((m) => !cancelado(m) && dentro(j, dataDe(m, regime)));
}

/* ========================================================================== */
/* 1. SALDO — posição, não fluxo                                               */
/* ========================================================================== */

/**
 * O saldo **na data final da janela**. Ver a regra por extenso em
 * `convencoes.saldoEm`: o nível vem do `balance` das contas; os movimentos
 * apenas o deslocam para trás (realizados) ou para frente (previstos).
 *
 * Saldo é POSIÇÃO: o "total" de uma série de saldos é o último ponto, nunca a
 * soma dos pontos.
 */
export function saldo(input: RiskInput, j: Janela = janelaHoje(input.hoje)): Indicador {
  if (j.vazia) return vazio(j, "saldo consolidado das contas", "posicao");
  const valor = saldoEm(input, j.ate);
  const hoje = input.hoje.slice(0, 10);
  const formula =
    j.ate === hoje
      ? "saldo consolidado das contas financeiras (posição de hoje)"
      : j.ate < hoje
        ? "saldo de hoje menos os lançamentos liquidados após a data"
        : "saldo de hoje mais os lançamentos previstos até a data";
  return { valor, procedencia: { lancamentos: input.movements.length, regime: "posicao", janela: j, formula } };
}

/** Saldo de abertura da janela — o ponto de partida de todo gráfico acumulado. */
export function saldoInicial(input: RiskInput, j: Janela): Indicador {
  if (j.vazia) return vazio(j, "saldo de abertura", "posicao");
  return {
    valor: saldoAbertura(input, j.de),
    procedencia: {
      lancamentos: input.movements.length, regime: "posicao", janela: j,
      formula: "saldo no dia anterior ao início da janela",
    },
  };
}

/* ========================================================================== */
/* 2–4. ENTRADAS · SAÍDAS · RESULTADO                                          */
/* ========================================================================== */

function somaDirecao(
  input: RiskInput, j: Janela, regime: Regime, tipo: "entrada" | "saida",
): Indicador {
  const rotulo = tipo === "entrada" ? "entradas" : "saídas";
  const base = regime === "caixa" ? "liquidadas (data de pagamento)" : "por competência (data de vencimento)";
  if (j.vazia) return vazio(j, `${rotulo} ${base}`, regime);
  const rows = naJanela(input, j, regime).filter((m) => m.type === tipo);
  return {
    valor: rows.reduce((s, m) => s + magnitude(m), 0),
    procedencia: { lancamentos: rows.length, regime, janela: j, formula: `soma das ${rotulo} ${base}` },
  };
}

/**
 * Tudo que entrou na janela. **Magnitude** — entradas são um total positivo; o
 * sinal aparece só no resultado.
 */
export const entradas = (input: RiskInput, j: Janela, regime: Regime = "caixa"): Indicador =>
  somaDirecao(input, j, regime, "entrada");

/** Tudo que saiu na janela, também em magnitude (positivo). */
export const saidas = (input: RiskInput, j: Janela, regime: Regime = "caixa"): Indicador =>
  somaDirecao(input, j, regime, "saida");

/**
 * `entradas − saídas`. Negativo quando se gastou mais do que entrou — e
 * negativo é como tem de chegar na tela.
 */
export function resultado(input: RiskInput, j: Janela, regime: Regime = "caixa"): Indicador {
  if (j.vazia) return vazio(j, "entradas − saídas", regime);
  const rows = naJanela(input, j, regime);
  return {
    valor: semZeroNegativo(rows.reduce((s, m) => s + assinado(m), 0)),
    procedencia: {
      lancamentos: rows.length, regime, janela: j,
      formula: "entradas − saídas no período (mesma base das duas linhas)",
    },
  };
}

/* ========================================================================== */
/* 5–6. BURN · RUNWAY                                                          */
/* ========================================================================== */

/** Janela padrão dos indicadores de ritmo: 90 dias, 3 meses cheios. */
export const JANELA_RITMO_DIAS = 90;

/**
 * **Burn** — quanto de caixa a operação QUEIMA por mês, na média da janela.
 *
 * É `max(0, saídas − entradas) / meses`: quem gera caixa tem burn zero, não
 * burn negativo. Um "burn de −40 mil" já foi lido como queima em tela.
 * Só conta o liquidado — o previsto não queimou nada ainda.
 */
export function burn(
  input: RiskInput, j: Janela = janelaUltimosDias(JANELA_RITMO_DIAS, input.hoje),
): Indicador {
  const formula = "média mensal de (saídas − entradas) liquidadas, com piso em zero";
  if (j.vazia) return vazio(j, formula);
  const meses = Math.max(1, diasDe(j)) / 30;
  const rows = naJanela(input, j, "caixa");
  const liquido = rows.reduce((s, m) => s + assinado(m), 0) / meses;
  return {
    valor: Math.max(0, -liquido),
    procedencia: { lancamentos: rows.length, regime: "caixa", janela: j, formula },
  };
}

/** Geração de caixa mensal (o burn com sinal) — positiva quando sobra. */
export function geracaoCaixaMensal(
  input: RiskInput, j: Janela = janelaUltimosDias(JANELA_RITMO_DIAS, input.hoje),
): Indicador {
  const formula = "média mensal de (entradas − saídas) liquidadas";
  if (j.vazia) return vazio(j, formula);
  const meses = Math.max(1, diasDe(j)) / 30;
  const rows = naJanela(input, j, "caixa");
  return {
    valor: semZeroNegativo(rows.reduce((s, m) => s + assinado(m), 0) / meses),
    procedencia: { lancamentos: rows.length, regime: "caixa", janela: j, formula },
  };
}

/** Teto do runway em dias — acima disso a resposta é "não queima", não um número. */
export const RUNWAY_CAP_DIAS = 999;

/**
 * **Runway em DIAS** — quantos dias o saldo atual cobre no ritmo da janela.
 *
 * A unidade canônica é o DIA. Meses saem de `runwayMeses`, que divide por 30 no
 * mesmo lugar — o sistema tinha versões que devolviam dias, versões que
 * devolviam meses e versões que capavam em 24 meses, e comparar duas telas
 * exigia saber qual era qual.
 *
 * Sem queima, devolve `RUNWAY_CAP_DIAS`: infinito não cabe num eixo de gráfico,
 * e zero diria o contrário do que acontece.
 */
export function runway(
  input: RiskInput, j: Janela = janelaUltimosDias(JANELA_RITMO_DIAS, input.hoje),
): Indicador {
  const formula = "saldo atual ÷ queima diária média (0 se o caixa já está negativo)";
  if (j.vazia) return vazio(j, formula);
  const b = burn(input, j);
  const saldoHoje = input.saldoAtual;
  let dias: number;
  if (b.valor <= 0) dias = RUNWAY_CAP_DIAS;
  else if (saldoHoje <= 0) dias = 0; // já acabou — não há runway a projetar
  else dias = Math.min(RUNWAY_CAP_DIAS, Math.round(saldoHoje / (b.valor / 30)));
  return { valor: dias, procedencia: { ...b.procedencia, formula } };
}

/**
 * A FÓRMULA do runway, isolada do `RiskInput`.
 *
 * Existe para os SIMULADORES: um cenário ("e se a receita cair 20%?") calcula o
 * runway de um fluxo hipotético, que por definição não está nos lançamentos.
 * Mesmo assim a fórmula tem de ser a mesma — os simuladores tinham cada um a
 * sua, com teto próprio, e um cenário "sem queima" saía 24 meses num lugar e
 * 999 dias no outro, na mesma tela.
 */
export function runwayDeFluxo(saldoAtual: number, liquidoMensal: number): number {
  if (liquidoMensal >= 0) return RUNWAY_CAP_DIAS;
  if (saldoAtual <= 0) return 0;
  return Math.min(RUNWAY_CAP_DIAS, Math.round(saldoAtual / (-liquidoMensal / 30)));
}

/** O mesmo, em meses. Uma conversão (÷30), nunca um segundo teto. */
export const mesesDeRunway = (dias: number): number => Math.round((dias / 30) * 10) / 10;

/** O mesmo runway em meses (dias ÷ 30) — uma conversão, não outro cálculo. */
export function runwayMeses(input: RiskInput, j?: Janela): Indicador {
  const r = runway(input, j);
  return {
    valor: Math.round((r.valor / 30) * 10) / 10,
    procedencia: { ...r.procedencia, formula: `${r.procedencia.formula}, convertido em meses (÷30)` },
  };
}

/* ========================================================================== */
/* 7–8. MRR · ARR                                                              */
/* ========================================================================== */

/**
 * A forma mínima de um contrato recorrente. Quem tem contratos cadastrados
 * (recorrências, assinaturas) passa a lista; ela é a fonte AUTORIDADE do MRR.
 */
export interface ContratoRecorrente {
  ativo: boolean;
  /** Valor cobrado a cada ciclo. */
  valorCiclo: number;
  /** Duração do ciclo em meses (1 = mensal, 12 = anual). */
  mesesCiclo: number;
}

/**
 * **MRR — receita recorrente MENSALIZADA.**
 *
 * A normalização do ciclo é a regra inteira: um contrato anual de R$ 1.200 vale
 * R$ 100 de MRR, não R$ 1.200. Somar o valor da fatura sem dividir pelo ciclo
 * inflava o MRR de quem vende plano anual — e era o que duas das quatro
 * implementações anteriores faziam.
 *
 * Sem contratos cadastrados o MRR é **estimado** a partir da receita recorrente
 * detectada nos lançamentos, e a procedência diz isso com todas as letras:
 * estimativa e medição não podem sair com o mesmo rótulo.
 */
export function mrr(
  input: RiskInput,
  contratos?: ContratoRecorrente[],
  j: Janela = janelaDoMesDe(input.hoje),
): Indicador {
  if (contratos && contratos.length > 0) {
    const ativos = contratos.filter((c) => c.ativo && c.mesesCiclo > 0);
    return {
      valor: ativos.reduce((s, c) => s + c.valorCiclo / c.mesesCiclo, 0),
      procedencia: {
        lancamentos: ativos.length, regime: "competencia", janela: j,
        formula: "soma dos contratos ativos, cada um dividido pelos meses do seu ciclo",
      },
    };
  }
  const est = receitaRecorrenteEstimada(input, j);
  return {
    valor: est.valor,
    procedencia: { ...est.procedencia, formula: `ESTIMADO — ${est.procedencia.formula}` },
  };
}

/**
 * **ARR = MRR × 12.** Uma multiplicação, nunca uma segunda apuração: apurar o
 * ARR somando doze meses de receita faz ARR e MRR discordarem em todo mês em
 * que a base mudou.
 */
export function arr(input: RiskInput, contratos?: ContratoRecorrente[], j?: Janela): Indicador {
  const m = mrr(input, contratos, j);
  return { valor: m.valor * 12, procedencia: { ...m.procedencia, formula: `${m.procedencia.formula}, × 12` } };
}

/**
 * Receita recorrente estimada: a parcela da receita do mês que vem de
 * contrapartes que pagaram em ao menos 3 dos últimos 6 meses. É proxy, e só
 * entra quando não há contrato cadastrado.
 */
function receitaRecorrenteEstimada(input: RiskInput, j: Janela): Indicador {
  const formula = "receita das contrapartes presentes em 3+ dos últimos 6 meses";
  if (j.vazia) return vazio(j, formula, "competencia");
  const seisMeses = janelaUltimosDias(180, j.ate);
  const mesesPorParte = new Map<string, Set<string>>();
  for (const m of input.movements) {
    if (m.type !== "entrada" || cancelado(m)) continue;
    const d = dataDe(m, "competencia");
    if (!d || !dentro(seisMeses, d)) continue;
    const k = m.party_id ?? m.category ?? "—";
    const set = mesesPorParte.get(k) ?? new Set<string>();
    set.add(d.slice(0, 7));
    mesesPorParte.set(k, set);
  }
  const recorrentes = new Set(
    Array.from(mesesPorParte.entries()).filter(([, s]) => s.size >= 3).map(([k]) => k),
  );
  const rows = naJanela(input, j, "competencia")
    .filter((m) => m.type === "entrada" && recorrentes.has(m.party_id ?? m.category ?? "—"));
  const meses = Math.max(1, diasDe(j)) / 30;
  return {
    valor: rows.reduce((s, m) => s + magnitude(m), 0) / meses,
    procedencia: { lancamentos: rows.length, regime: "competencia", janela: j, formula },
  };
}

/* ========================================================================== */
/* 9. INADIMPLÊNCIA                                                            */
/* ========================================================================== */

/**
 * **Inadimplência = valor VENCIDO e não pago.** Em reais; a taxa sai de
 * `inadimplenciaTaxa`.
 *
 * "Vencido" é `due_date < hoje` com status pendente. Um título que vence hoje
 * NÃO está vencido — contá-lo criava um pico de inadimplência toda manhã que
 * sumia à tarde, sem nada ter acontecido.
 *
 * A janela recorta pela data de VENCIMENTO: a pergunta é "o que venceu neste
 * período e não entrou".
 */
export function inadimplencia(
  input: RiskInput,
  j: Janela = janela("1900-01-01", input.hoje.slice(0, 10), "Tudo em aberto"),
  tipo: "entrada" | "saida" = "entrada",
): Indicador {
  const formula = "soma dos títulos pendentes com vencimento anterior a hoje";
  if (j.vazia) return vazio(j, formula, "competencia");
  const hoje = input.hoje.slice(0, 10);
  const rows = input.movements.filter(
    (m) => m.type === tipo && previsto(m) && m.due_date?.slice(0, 10) < hoje && dentro(j, m.due_date),
  );
  return {
    valor: rows.reduce((s, m) => s + magnitude(m), 0),
    procedencia: { lancamentos: rows.length, regime: "competencia", janela: j, formula },
  };
}

/**
 * A TAXA de inadimplência (0..1): vencido ÷ (vencido + recebido na janela).
 *
 * O denominador inclui o que foi recebido porque a pergunta é "de tudo que
 * deveria ter entrado, quanto não entrou". Dividir só pela receita do mês faz a
 * taxa saltar em mês fraco sem nenhum cliente ter atrasado.
 */
export function inadimplenciaTaxa(input: RiskInput, j?: Janela): Indicador {
  const jj = j ?? janela("1900-01-01", input.hoje.slice(0, 10), "Tudo em aberto");
  const formula = "vencido ÷ (vencido + recebido) no período";
  if (jj.vazia) return vazio(jj, formula, "competencia");
  const venc = inadimplencia(input, jj);
  const hoje = input.hoje.slice(0, 10);
  const recebido = input.movements
    .filter((m) => m.type === "entrada" && liquidado(m) && dentro(jj, m.due_date) && m.due_date.slice(0, 10) < hoje)
    .reduce((s, m) => s + magnitude(m), 0);
  const base = venc.valor + recebido;
  return {
    valor: base <= 0 ? 0 : venc.valor / base,
    procedencia: { lancamentos: venc.procedencia.lancamentos, regime: "competencia", janela: jj, formula },
  };
}

/* ========================================================================== */
/* 10. RECEITA TRIBUTÁVEL                                                      */
/* ========================================================================== */

/**
 * Categorias que entram como receita mas **não são faturamento**, e por isso
 * ficam fora da base tributável: dinheiro que já era da empresa (transferência,
 * resgate), dinheiro emprestado (empréstimo, aporte) e resultado financeiro
 * (juros, rendimento de aplicação).
 *
 * ⚠️ Ancorado em `\b`: sem a borda, `aporte` casa dentro de "transp**orte**" e
 * uma receita de frete sairia da base de cálculo do imposto. É o mesmo erro que
 * fazia `iss` casar dentro de "com**iss**ão" em `core/relatorios`.
 */
const FORA_DA_BASE =
  /\b(transfer[êe]ncia|transf|resgate|aplica[çc][ãa]o|rendimento|juros|empr[ée]stimo|financiamento|aporte|estorno|reembolso|devolu[çc][ãa]o)\b/i;

export const foraDaBaseTributavel = (categoria: string | null | undefined): boolean =>
  FORA_DA_BASE.test(categoria ?? "");

/**
 * **Receita tributável** — a base sobre a qual o imposto é apurado.
 *
 * Regime de COMPETÊNCIA por padrão: o fato gerador é a emissão, não o
 * recebimento. (No Simples por caixa, passe `regime: "caixa"`.)
 *
 * Não é "todas as entradas": transferência entre contas próprias, resgate de
 * aplicação e empréstimo entram como entrada e não são faturamento. Somá-las
 * inflava a base e, com ela, a alíquota efetiva por faixa.
 */
export function receitaTributavel(
  input: RiskInput,
  j: Janela = janelaDoMesDe(input.hoje),
  regime: Regime = "competencia",
): Indicador {
  const formula = "entradas do período menos transferências, resgates, empréstimos e receita financeira";
  if (j.vazia) return vazio(j, formula, regime);
  const rows = naJanela(input, j, regime)
    .filter((m) => m.type === "entrada" && !foraDaBaseTributavel(m.category));
  return {
    valor: rows.reduce((s, m) => s + magnitude(m), 0),
    procedencia: { lancamentos: rows.length, regime, janela: j, formula },
  };
}

/* ========================================================================== */
/* O painel canônico — todos os indicadores de uma janela, numa execução        */
/* ========================================================================== */

export interface PainelIndicadores {
  versao: string;
  janela: Janela;
  regime: Regime;
  saldo: Indicador;
  saldoInicial: Indicador;
  entradas: Indicador;
  saidas: Indicador;
  resultado: Indicador;
  burn: Indicador;
  runwayDias: Indicador;
  mrr: Indicador;
  arr: Indicador;
  inadimplencia: Indicador;
  receitaTributavel: Indicador;
}

/**
 * Roda os dez indicadores sobre a MESMA janela e o MESMO regime.
 *
 * É a forma preferida de consumo: pedir um a um abre espaço para uma tela
 * calcular entradas de um jeito e saídas de outro — que é literalmente o
 * defeito que esta camada existe para impedir.
 */
export function painelIndicadores(
  input: RiskInput,
  j: Janela,
  regime: Regime = "caixa",
  contratos?: ContratoRecorrente[],
): PainelIndicadores {
  return {
    versao: INDICADORES_VERSION,
    janela: j,
    regime,
    saldo: saldo(input, j),
    saldoInicial: saldoInicial(input, j),
    entradas: entradas(input, j, regime),
    saidas: saidas(input, j, regime),
    resultado: resultado(input, j, regime),
    burn: burn(input),
    runwayDias: runway(input),
    mrr: mrr(input, contratos, j),
    arr: arr(input, contratos, j),
    inadimplencia: inadimplencia(input),
    receitaTributavel: receitaTributavel(input, j),
  };
}

/* ========================================================================== */
/* Reconciliação — por que o Razão e o extrato discordam                       */
/* ========================================================================== */

export interface Reconciliacao {
  /** O saldo que o extrato/contas informam (a autoridade). */
  extrato: number;
  /** O saldo que sai de somar os lançamentos, sob a regra dada. */
  derivado: number;
  diferenca: number;
  /** As parcelas que explicam a diferença, cada uma com seu valor. */
  parcelas: { rotulo: string; valor: number; explicacao: string }[];
  fecha: boolean;
}

/**
 * **Explica a diferença entre o saldo do extrato e o saldo derivado dos
 * lançamentos** — a conta que faltava quando o Razão dizia um número e o
 * extrato dizia outro.
 *
 * A diferença nunca é misteriosa; ela é a soma de três parcelas conhecidas:
 *
 *  1. **Previstos** — títulos em aberto que o Razão postava no caixa. Uma nota
 *     a receber não é dinheiro em conta; era esta parcela que respondia pela
 *     maior parte do desvio.
 *  2. **Histórico anterior à abertura** — o saldo da conta já existia antes do
 *     primeiro lançamento importado. Somar os movimentos desde o início do
 *     arquivo não reconstrói esse ponto de partida.
 *  3. **Liquidados sem data** — dado incompleto que entra no total mas não numa
 *     linha do tempo.
 *
 * Somadas ao derivado, elas fecham no extrato. `fecha` diz se fechou.
 */
export function reconciliarSaldo(input: RiskInput): Reconciliacao {
  const extrato = input.saldoAtual;

  let liquidadoTotal = 0;
  let previstoTotal = 0;
  let semData = 0;
  for (const m of input.movements) {
    if (cancelado(m)) continue;
    if (liquidado(m)) {
      liquidadoTotal += assinado(m);
      if (!m.paid_date && !m.due_date) semData += assinado(m);
    } else if (previsto(m)) {
      previstoTotal += assinado(m);
    }
  }

  // O derivado "ingênuo" — o que o Razão fazia: tudo que não foi cancelado,
  // realizado ou não, tratado como se tivesse passado pelo caixa.
  const derivado = liquidadoTotal + previstoTotal;
  const aberturaHistorica = extrato - liquidadoTotal;

  return {
    extrato,
    derivado,
    diferenca: semZeroNegativo(extrato - derivado),
    parcelas: [
      {
        rotulo: "Títulos em aberto (previstos)",
        valor: semZeroNegativo(-previstoTotal),
        explicacao:
          "Contas a receber e a pagar ainda não liquidadas. Existem no resultado por competência e NÃO existem no caixa — postá-las no Razão é o que fazia o saldo contábil descolar do extrato.",
      },
      {
        rotulo: "Saldo anterior ao histórico importado",
        valor: semZeroNegativo(aberturaHistorica),
        explicacao:
          "O que já havia em conta antes do primeiro lançamento conhecido. Somar os movimentos desde o início do arquivo mede a variação, não a posição — o ponto de partida vem do extrato.",
      },
      {
        rotulo: "Liquidados sem data",
        valor: semZeroNegativo(semData),
        explicacao:
          "Lançamentos marcados como pagos sem data de pagamento nem vencimento. Entram no total e ficam fora de qualquer linha do tempo.",
      },
    ],
    fecha: Math.round((extrato - (liquidadoTotal + aberturaHistorica)) * 100) === 0,
  };
}

