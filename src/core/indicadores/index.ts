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

/**
 * ⚠️ **O QUE O NÚMERO É** — a separação entre fato e modelo.
 *
 * Ela existia só como texto: o MRR estimado saía com a palavra "ESTIMADO"
 * grudada na frase da fórmula. Uma frase não dá para a tela decidir nada, e não
 * dá para o gerador de planilha recusar nada — então uma projeção de caixa e um
 * saldo de extrato saíam do sistema com exatamente a mesma cara, e viravam a
 * mesma linha na planilha que alguém manda para o banco.
 *
 *  - **`fato`** — soma de lançamentos que ACONTECERAM. Só isto pode sair do
 *    sistema sem ressalva.
 *  - **`estimativa`** — medido, mas por proxy ou média: o burn é a média de 90
 *    dias, o MRR sem contrato é inferido de quem repete pagamento.
 *  - **`projecao`** — conta sobre o FUTURO: runway, saldo numa data que ainda
 *    não chegou, qualquer janela que inclua título não liquidado.
 *
 * A regra do produto que nasce daqui: **projeção não vira artefato externo sem
 * marca** (ver `confiavelParaArtefato`).
 */
export type Natureza = "fato" | "estimativa" | "projecao";

export interface Procedencia {
  /** Quantos lançamentos entraram na conta. */
  lancamentos: number;
  regime: Regime | "posicao";
  janela: Janela;
  /** Frase curta e literal do que foi somado — vai para o "i" dos boxes. */
  formula: string;
  /** Fato, estimativa ou projeção — ver `Natureza`. */
  natureza: Natureza;
  /** Preenchido quando o número é 0 por impossibilidade, não por ausência. */
  aviso?: string;
  /**
   * Os ids dos lançamentos que ENTRARAM na conta.
   *
   * ⚠️ `lancamentos` diz QUANTOS; isto diz QUAIS — e a diferença é a que separa
   * "confie em mim, são 34" de conferir os 34. Só as somas o preenchem: um
   * saldo vem do `balance` das contas e uma média não tem linha para apontar.
   */
  movimentos?: readonly string[];
}

/**
 * ⚠️ ONDA 4 — **ZERO É UM VALOR, NÃO A AUSÊNCIA DE VALOR.**
 *
 * Foi a raiz medida das três contradições que a auditoria apontou, e as três
 * eram a MESMA doença: o sistema preenchendo o silêncio com um número em vez de
 * dizer que não sabe.
 *
 *  - A Home mostrava saldo de −R$ 31.000 ao lado de entradas, saídas e
 *    resultado em R$ 0. Os dois números estavam CERTOS: o saldo é posição, o
 *    resto é o período — e nenhum lançamento foi liquidado em agosto (o último
 *    pagamento foi 28/07). "R$ 0" e "nada se moveu" não são a mesma frase, e
 *    lidas lado a lado a primeira parece erro.
 *  - O fluxo de caixa mostrava runway de 33 meses com burn zero. 33 meses era o
 *    TETO saindo como fato — e sobre saldo negativo, onde runway nem se define.
 *  - A contabilidade rotulava R$ 437.983,17 de resíduo como "conciliado":
 *    diferença absorvida em vez de nomeada.
 *
 * Daí o campo. Quando ele está preenchido, `valor` **não deve ser exibido** — a
 * tela mostra o motivo. E o motivo é uma frase para quem OPERA, não um código:
 * "não há queima no período" resolve; "runway indisponível" só empurra a
 * pergunta adiante.
 */
/**
 * ⚠️ O código existe para quem CONSOME decidir sem ler a frase.
 *
 * "Não há queima" e "o caixa já é negativo" produzem ambos um runway
 * indisponível, e são o oposto um do outro: o primeiro é a empresa saudável, o
 * segundo é a empresa quebrada. Um consumidor que precise distinguir os dois só
 * teria a frase — e casar substring de texto em português é a fragilidade que
 * este repositório já pagou três vezes (o auditor de RLS, o classificador
 * `maq_*`, o extrator do ia-eval). A frase é para a PESSOA; o código é para o
 * código.
 */
export type MotivoIndisponivel =
  /** O intervalo pedido não existe (`de > ate`). */
  | "janela_invalida"
  /** Nenhum lançamento na janela para medir. */
  | "sem_lancamentos"
  /** O divisor não existe — não há razão a calcular. */
  | "sem_base"
  /** O ponto de partida já é negativo; a projeção não se define. */
  | "caixa_negativo"
  /** Não houve consumo no período — não há prazo a projetar. */
  | "sem_queima";

export interface Indisponivel {
  codigo: MotivoIndisponivel;
  motivo: string;
  /** O que a pessoa pode fazer para o número existir. Vazio quando não há o que fazer. */
  comoResolver?: string;
}

export interface Indicador {
  /** ⚠️ Só é resposta quando `indisponivel` é `undefined`. */
  valor: number;
  /** Preenchido = não há número. A tela mostra o motivo, nunca o `valor`. */
  indisponivel?: Indisponivel;
  procedencia: Procedencia;
}

/** `true` quando há um número para mostrar. */
export const temValor = (i: Indicador): boolean => !i.indisponivel;

/**
 * O valor, ou `null` quando não há.
 *
 * ⚠️ `null` e não `0`: é a fronteira onde a ausência costuma virar número de
 * novo. Um `?? 0` numa tela desfaz a onda inteira, e por isso a guarda de
 * coerência procura exatamente esse padrão.
 */
export const valorOuNulo = (i: Indicador): number | null =>
  i.indisponivel ? null : i.valor;

/** Constrói um indicador SEM resposta. */
const semDados = (
  j: Janela, formula: string, codigo: MotivoIndisponivel, motivo: string,
  regime: Regime | "posicao" = "caixa", natureza: Natureza = "fato",
  comoResolver?: string, lancamentos = 0,
): Indicador => ({
  valor: 0,
  indisponivel: { codigo, motivo, comoResolver },
  procedencia: { lancamentos, regime, janela: j, formula, natureza, aviso: motivo },
});

/** Só o FATO sai do sistema sem ressalva. Ver `Natureza`. */
export const confiavelParaArtefato = (p: Procedencia): boolean =>
  p.natureza === "fato" && !p.aviso;

/**
 * A natureza de uma soma de lançamentos, deduzida do que ENTROU nela.
 *
 * ⚠️ Não é declaração, é medição: se alguma linha contada ainda não foi
 * liquidada, o número fala do que se espera receber ou pagar, e chamar isso de
 * fato é o começo da divergência. No regime de caixa isso nunca acontece (um
 * pendente não tem data de caixa); no de competência acontece o tempo todo.
 */
const naturezaDaSoma = (rows: readonly RiskMovement[]): Natureza =>
  rows.some((m) => !liquidado(m)) ? "projecao" : "fato";

/**
 * O indicador de uma janela que não existe (`de > ate`).
 *
 * ⚠️ Ele já devolvia `aviso`, e isso bastava para o portão de artefato — mas
 * NÃO para a tela, que lia `valor` e mostrava R$ 0. Um zero aqui responde "não
 * houve receita" a uma pergunta que ninguém chegou a fazer, porque o intervalo
 * pedido não recorta período nenhum. Passa a ser ausência declarada.
 */
const vazio = (
  j: Janela, formula: string, regime: Regime | "posicao" = "caixa", natureza: Natureza = "fato",
): Indicador =>
  semDados(j, formula, "janela_invalida",
    j.motivo ?? "o período pedido não existe", regime, natureza,
    "Corrija as datas: a data inicial está depois da final.");

/**
 * O indicador de uma janela LEGÍTIMA onde nada aconteceu.
 *
 * ⚠️ Este é o caso da Home: saldo de −R$ 31.000 ao lado de entradas, saídas e
 * resultado em R$ 0, porque o último pagamento foi em 28/07 e a janela era
 * agosto. Os quatro números estavam certos e, lidos juntos, o primeiro parecia
 * erro. "R$ 0" e "nada se moveu neste período" não são a mesma frase — e a
 * segunda ainda diz o que fazer.
 */
const semMovimento = (
  j: Janela, formula: string, regime: Regime | "posicao" = "caixa",
): Indicador =>
  semDados(j, formula, "sem_lancamentos",
    "nenhum lançamento no período", regime, "fato",
    "Escolha outro período, ou importe o extrato se o movimento existiu e não entrou.");

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
  return {
    valor,
    procedencia: {
      lancamentos: input.movements.length, regime: "posicao", janela: j, formula,
      // ⚠️ Saldo numa data FUTURA soma os previstos: é projeção, não extrato.
      // Era o mesmo número, com a mesma cara, para "quanto tenho" e "quanto
      // vou ter" — e a segunda pergunta depende de todo mundo pagar em dia.
      natureza: j.ate > hoje ? "projecao" : "fato",
    },
  };
}

/** Saldo de abertura da janela — o ponto de partida de todo gráfico acumulado. */
export function saldoInicial(input: RiskInput, j: Janela): Indicador {
  if (j.vazia) return vazio(j, "saldo de abertura", "posicao");
  return {
    valor: saldoAbertura(input, j.de),
    procedencia: {
      lancamentos: input.movements.length, regime: "posicao", janela: j,
      formula: "saldo no dia anterior ao início da janela",
      natureza: j.de > input.hoje ? "projecao" : "fato",
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
  const formula = `soma das ${rotulo} ${base}`;
  if (j.vazia) return vazio(j, formula, regime);
  const rows = naJanela(input, j, regime).filter((m) => m.type === tipo);
  // ⚠️ Nenhuma linha não é "somou zero". A soma de nada não é um total; é a
  // ausência de totais. Devolver 0 aqui é o que põe "R$ 0" ao lado de um saldo
  // negativo e faz o saldo parecer errado.
  if (rows.length === 0) return semMovimento(j, formula, regime);
  return {
    valor: rows.reduce((s, m) => s + magnitude(m), 0),
    procedencia: {
      lancamentos: rows.length, regime, janela: j, formula,
      natureza: naturezaDaSoma(rows), movimentos: rows.map((m) => m.id),
    },
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
  const formula = "entradas − saídas no período (mesma base das duas linhas)";
  if (j.vazia) return vazio(j, formula, regime);
  const rows = naJanela(input, j, regime);
  // ⚠️ Zero por EMPATE e zero por VAZIO são leituras opostas: "entrou e saiu o
  // mesmo tanto" × "não houve movimento". Só o segundo é ausência — o primeiro
  // é um resultado, e um resultado nulo é informação.
  if (rows.length === 0) return semMovimento(j, formula, regime);
  return {
    valor: semZeroNegativo(rows.reduce((s, m) => s + assinado(m), 0)),
    procedencia: {
      lancamentos: rows.length, regime, janela: j, formula,
      natureza: naturezaDaSoma(rows), movimentos: rows.map((m) => m.id),
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
  // ⚠️ Sem lançamento liquidado não há RITMO a medir, e "burn zero" lê como "a
  // empresa não queima caixa" — a leitura mais tranquilizadora possível, dita
  // justamente quando o sistema não sabe de nada. É o mesmo zero da Home.
  if (rows.length === 0) {
    return semDados(j, formula, "sem_lancamentos",
      "nenhum lançamento liquidado no período para medir o ritmo", "caixa", "estimativa",
      "Importe o extrato do período ou dê baixa nos títulos já pagos.");
  }
  const liquido = rows.reduce((s, m) => s + assinado(m), 0) / meses;
  return {
    valor: Math.max(0, -liquido),
    // O burn é MEDIDO, mas é uma média usada como ritmo: chamá-lo de fato
    // sugere que o mês que vem queima exatamente isto.
    procedencia: { lancamentos: rows.length, regime: "caixa", janela: j, formula, natureza: "estimativa" },
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
    procedencia: { lancamentos: rows.length, regime: "caixa", janela: j, formula, natureza: "estimativa" },
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
 * ⚠️ Sem queima ele NÃO devolve mais `RUNWAY_CAP_DIAS`. O teto continua
 * existindo para o caso legítimo — a empresa queima pouquíssimo e a divisão dá
 * um número que não cabe num eixo — mas ali ele sai com `aviso` dizendo que é
 * teto. O que saiu foi o teto respondendo à AUSÊNCIA de queima, que era o
 * "runway de 33 meses" medido sobre saldo negativo.
 */
export function runway(
  input: RiskInput, j: Janela = janelaUltimosDias(JANELA_RITMO_DIAS, input.hoje),
): Indicador {
  const formula = "saldo atual ÷ queima diária média";
  if (j.vazia) {
    return semDados(j, formula, "janela_invalida",
      j.motivo ?? "o período pedido não existe", "caixa", "projecao");
  }
  const b = burn(input, j);
  const saldoHoje = input.saldoAtual;

  // ⚠️ A ORDEM DESTES DOIS TESTES ESTAVA INVERTIDA, e era o defeito medido:
  // `burn <= 0` vinha primeiro e devolvia o TETO, então uma empresa com o caixa
  // NEGATIVO e sem queima recebia "33 meses de runway". Duas mentiras numa: o
  // teto saindo como fato, e um fôlego anunciado para quem já está no vermelho.
  if (saldoHoje <= 0) {
    return semDados(
      j, formula, "caixa_negativo",
      "o caixa já está negativo — não há fôlego a projetar",
      "caixa", "projecao",
      "Entre com um recebimento ou aporte para que o runway volte a existir.",
      b.procedencia.lancamentos,
    );
  }
  // ⚠️ ESTA ORDEM TAMBÉM IMPORTA, e o erro é sutil: sem lançamento nenhum o
  // burn dá zero, e um `burn <= 0` conferido antes responderia "a empresa gerou
  // caixa" — uma afirmação sobre a operação, feita a partir de nada. Silêncio
  // não é boa notícia. Por isso a ausência do burn atravessa primeiro.
  if (b.indisponivel) {
    return semDados(
      j, formula, b.indisponivel.codigo, b.indisponivel.motivo,
      "caixa", "projecao", b.indisponivel.comoResolver, b.procedencia.lancamentos,
    );
  }
  if (b.valor <= 0) {
    // Não é runway infinito: é runway INDEFINIDO. A empresa gerou caixa na
    // janela, então não há taxa de queima pela qual dividir. Devolver um teto
    // aqui responde "33 meses" a uma pergunta que não tem resposta numérica.
    return semDados(
      j, formula, "sem_queima",
      "não houve queima no período — a empresa gerou caixa, então não há prazo a calcular",
      "caixa", "projecao",
      undefined,
      b.procedencia.lancamentos,
    );
  }

  const bruto = Math.round(saldoHoje / (b.valor / 30));
  // ⚠️ Quando o teto morde, ele é DITO. Um número que na verdade é "pelo menos
  // isso" exibido como se fosse exato é a mesma família de defeito do 33.
  const dias = Math.min(RUNWAY_CAP_DIAS, bruto);
  const aviso = bruto > RUNWAY_CAP_DIAS
    ? `no ritmo atual passa de ${Math.round(RUNWAY_CAP_DIAS / 30)} meses; o valor é o teto do cálculo, não a medida`
    : undefined;
  // Runway é conta sobre o FUTURO — a mais projeção de todas.
  return { valor: dias, procedencia: { ...b.procedencia, formula, natureza: "projecao", aviso } };
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
  // ⚠️ A indisponibilidade ATRAVESSA a conversão. Dividir a ausência por 30 e
  // devolver um número seria reintroduzir o zero pela porta do derivado — que é
  // como o defeito volta depois de consertado na origem.
  return {
    valor: Math.round((r.valor / 30) * 10) / 10,
    indisponivel: r.indisponivel,
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
 * A normalização do ciclo é a regra inteira: um contrato anual de R$1.200 vale
 * R$100 de MRR, não R$1.200. Somar o valor da fatura sem dividir pelo ciclo
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
        // Contrato assinado é fato; o de baixo é inferência sobre quem repete.
        natureza: "fato",
      },
    };
  }
  const est = receitaRecorrenteEstimada(input, j);
  return {
    valor: est.valor,
    indisponivel: est.indisponivel,
    procedencia: { ...est.procedencia, formula: `ESTIMADO — ${est.procedencia.formula}`, natureza: "estimativa" },
  };
}

/**
 * **ARR = MRR × 12.** Uma multiplicação, nunca uma segunda apuração: apurar o
 * ARR somando doze meses de receita faz ARR e MRR discordarem em todo mês em
 * que a base mudou.
 */
export function arr(input: RiskInput, contratos?: ContratoRecorrente[], j?: Janela): Indicador {
  const m = mrr(input, contratos, j);
  // ⚠️ ARR é sempre PROJEÇÃO, mesmo saindo de contratos: multiplicar por 12
  // assume que a base de hoje se repete o ano inteiro, e é justamente essa
  // suposição que o investidor precisa enxergar como suposição.
  return {
    valor: m.valor * 12,
    indisponivel: m.indisponivel,
    procedencia: { ...m.procedencia, formula: `${m.procedencia.formula}, × 12`, natureza: "projecao" },
  };
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
  // ⚠️ Duas ausências diferentes, e só uma é ausência de verdade. SEM receita
  // nenhuma na janela não dá para estimar nada — o proxy não tem sobre o que
  // trabalhar. COM receita e nenhuma dela recorrente, zero é a resposta certa e
  // é informação: nada do que entra se repete.
  const receitaNaJanela = naJanela(input, j, "competencia").filter((m) => m.type === "entrada");
  if (receitaNaJanela.length === 0) {
    return semDados(j, formula, "sem_lancamentos",
      "nenhuma receita no período para estimar o que se repete",
      "competencia", "estimativa",
      "Cadastre os contratos em Assinaturas — com eles o MRR deixa de ser estimativa.");
  }
  const rows = receitaNaJanela
    .filter((m) => recorrentes.has(m.party_id ?? m.category ?? "—"));
  const meses = Math.max(1, diasDe(j)) / 30;
  return {
    valor: rows.reduce((s, m) => s + magnitude(m), 0) / meses,
    // O nome já diz: é proxy de quem repete pagamento, não contrato assinado.
    procedencia: { lancamentos: rows.length, regime: "competencia", janela: j, formula, natureza: "estimativa" },
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
    // ⚠️ Vencido é FATO: o título existe, a data passou e ninguém pagou. Não é
    // previsão de calote — é o que já está em atraso hoje.
    procedencia: {
      lancamentos: rows.length, regime: "competencia", janela: j, formula,
      natureza: "fato", movimentos: rows.map((m) => m.id),
    },
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
  // ⚠️ Base zero é a ausência do DENOMINADOR, e "0% de inadimplência" lê como
  // "todo mundo pagou" — a melhor notícia possível — quando a verdade é que
  // nada venceu no período. É a mesma doença do runway: uma razão sem divisor
  // saindo como se fosse a razão medida.
  if (base <= 0) {
    return semDados(jj, formula, "sem_base",
      "nada venceu no período — não há base sobre a qual medir atraso",
      "competencia", "fato",
      "Escolha um período que contenha vencimentos.", venc.procedencia.lancamentos);
  }
  return {
    valor: venc.valor / base,
    procedencia: { lancamentos: venc.procedencia.lancamentos, regime: "competencia", janela: jj, formula, natureza: "fato" },
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
    procedencia: {
      lancamentos: rows.length, regime, janela: j, formula,
      natureza: naturezaDaSoma(rows), movimentos: rows.map((m) => m.id),
    },
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
/* Posição × Fluxo — por que as duas telas de "a receber" não batem            */
/* ========================================================================== */

export interface PontePosicaoFluxo {
  /** ESTOQUE de títulos (posição): tudo que existe, liquidado ou não. */
  posicao: { liquidado: number; aberto: number; atrasado: number; total: number; titulos: number };
  /** RESULTADO do período (fluxo): entradas − saídas liquidadas na janela. */
  fluxo: { entradas: number; saidas: number; resultado: number; janela: Janela };
  /** A frase que explica por que os dois números são diferentes e ambos certos. */
  explicacao: string;
}

/**
 * **A ponte entre as duas leituras de "quanto tenho a receber".**
 *
 * ⚠️ Existem duas telas respondendo a essa pergunta com números que não batem,
 * e a razão não é defeito de cálculo — é que elas medem coisas diferentes:
 *
 *  - **Posição (estoque)** — "quantos títulos existem e quanto somam". Não tem
 *    período: um título de 2024 ainda em aberto conta hoje. É a pergunta de
 *    quem vai cobrar.
 *  - **Fluxo (resultado)** — "quanto entrou menos quanto saiu neste período".
 *    Tem período por definição, e pode ser NEGATIVO num mês em que se pagou
 *    mais do que se recebeu. É a pergunta de quem vai decidir gasto.
 *
 * O defeito real era a interface não dizer isso: mesmo nome no menu, mesmo
 * título na aba do navegador, e nada explicando a diferença. Quem abrisse as
 * duas em sequência não tinha como saber qual era a verdade — e as duas eram.
 *
 * Esta função devolve as duas leituras JUNTAS, para cada tela mostrar a sua e
 * declarar a outra.
 */
export function pontePosicaoFluxo(
  input: RiskInput,
  j: Janela,
  direcao: "entrada" | "saida" = "entrada",
): PontePosicaoFluxo {
  const hoje = input.hoje.slice(0, 10);
  const doLado = input.movements.filter((m) => m.type === direcao && !cancelado(m));

  let liq = 0, aberto = 0, atrasado = 0;
  for (const m of doLado) {
    const v = magnitude(m);
    if (liquidado(m)) liq += v;
    else if (m.due_date?.slice(0, 10) < hoje) atrasado += v;
    else aberto += v;
  }

  const e = entradas(input, j).valor;
  const s = saidas(input, j).valor;
  const rotulo = direcao === "entrada" ? "receber" : "pagar";

  return {
    posicao: {
      liquidado: round2c(liq), aberto: round2c(aberto), atrasado: round2c(atrasado),
      total: round2c(liq + aberto + atrasado), titulos: doLado.length,
    },
    fluxo: { entradas: round2c(e), saidas: round2c(s), resultado: round2c(e - s), janela: j },
    explicacao:
      `São duas perguntas diferentes. O ESTOQUE conta todos os títulos a ${rotulo} que existem, ` +
      `sem recorte de período e sem descontar o outro lado — é o que se usa para cobrar. ` +
      `O RESULTADO do período (${j.label}) é o que entrou menos o que saiu na janela, ` +
      `e pode ser negativo num mês em que se pagou mais do que se recebeu — é o que se usa para decidir gasto.`,
  };
}

const round2c = (n: number) => Math.round(n * 100) / 100;

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
  /**
   * ⚠️ O que SOBRA depois das parcelas — o resíduo NOMEADO, em reais.
   *
   * A auditoria achou R$ 437.983,17 rotulados como "conciliado". A conta
   * estava certa e as parcelas estavam listadas; o que faltava era o número do
   * resto. `fecha: true` sem resíduo à vista convida a ler "não há diferença",
   * quando o que houve foi "a diferença foi explicada" — e as duas frases
   * mandam a pessoa fazer coisas diferentes. Zero quando fecha; o valor exato
   * quando não.
   */
  residuo: number;
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
  // Em centavos inteiros: `extrato - (liquidado + abertura)` em ponto flutuante
  // devolve resíduos de 1e-10 que não são diferença nenhuma.
  const residuo = semZeroNegativo(
    Math.round((extrato - (liquidadoTotal + aberturaHistorica)) * 100) / 100,
  );

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
    fecha: residuo === 0,
    residuo,
  };
}


/* ========================================================================== */
/* RECORTES — as perguntas que as telas faziam por conta própria               */
/* ========================================================================== */

/**
 * A posição de UMA contraparte: quanto ela já pagou, quanto deve, o que venceu.
 *
 * ⚠️ Existe porque três telas faziam esta conta sozinhas — a ficha do contato, o
 * motor da IA e o DRE por cliente — e as três usavam `Math.abs(m.amount)`
 * direto, que é a convenção de sinal contornada. Enquanto a conta morava na
 * tela, a correção da convenção não alcançava nenhuma delas.
 *
 * `share` é a participação na receita LIQUIDADA total: concentração de cliente
 * se mede pelo que entrou, não pelo que foi prometido.
 */
export interface PosicaoContraparte {
  recebido: number;
  pago: number;
  aReceber: number;
  aPagar: number;
  vencido: number;
  share: number;
  lancamentos: number;
}

export function posicaoDaContraparte(input: RiskInput, partyId: string): PosicaoContraparte {
  const hoje = input.hoje.slice(0, 10);
  const movs = input.movements.filter((m) => m.party_id === partyId && !cancelado(m));
  const soma = (f: (m: RiskMovement) => boolean) =>
    movs.filter(f).reduce((s, m) => s + magnitude(m), 0);

  const recebido = soma((m) => m.type === "entrada" && liquidado(m));
  const totalRecebidoGeral = input.movements
    .filter((m) => m.type === "entrada" && liquidado(m) && !cancelado(m))
    .reduce((s, m) => s + magnitude(m), 0);

  return {
    recebido,
    pago: soma((m) => m.type === "saida" && liquidado(m)),
    aReceber: soma((m) => m.type === "entrada" && previsto(m)),
    aPagar: soma((m) => m.type === "saida" && previsto(m)),
    vencido: soma((m) => previsto(m) && (m.due_date?.slice(0, 10) ?? "") < hoje),
    share: totalRecebidoGeral > 0 ? recebido / totalRecebidoGeral : 0,
    lancamentos: movs.length,
  };
}

/**
 * O que está PREVISTO (não liquidado) com vencimento dentro da janela.
 *
 * ⚠️ É POSIÇÃO, não fluxo: responde "o que vence aqui", que é a pergunta de
 * quem vai cobrar ou pagar. Somar isto com o realizado do mesmo período conta
 * o mesmo título duas vezes quando ele é quitado no meio do caminho.
 */
export function previstoNaJanela(
  input: RiskInput, j: Janela, tipo: "entrada" | "saida" = "entrada",
): Indicador {
  const formula = `títulos de ${tipo === "entrada" ? "entrada" : "saída"} ainda em aberto com vencimento na janela`;
  if (j.vazia) return vazio(j, formula, "competencia", "projecao");
  const rows = input.movements.filter(
    (m) => m.type === tipo && previsto(m) && !cancelado(m) && dentro(j, m.due_date),
  );
  return {
    valor: rows.reduce((s, m) => s + magnitude(m), 0),
    // Sempre projeção: é dinheiro que ainda não se moveu.
    procedencia: { lancamentos: rows.length, regime: "competencia", janela: j, formula, natureza: "projecao" },
  };
}

/** O previsto em aberto de UMA conta — o que a conciliação precisa por conta. */
export function previstoDaConta(input: RiskInput, accountId: string): Indicador {
  const j = janelaHoje(input.hoje);
  const rows = input.movements.filter(
    (m) => m.accountId === accountId && previsto(m) && !cancelado(m),
  );
  return {
    valor: rows.reduce((s, m) => s + magnitude(m), 0),
    procedencia: {
      lancamentos: rows.length, regime: "competencia", janela: j,
      formula: "títulos em aberto vinculados à conta", natureza: "projecao",
    },
  };
}
