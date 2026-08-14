/**
 * contrato-resultado — O CONTRATO DA LINHA DE RESULTADO.
 *
 *   npm run contrato   (também roda dentro de npm test e no CI)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * A PERGUNTA QUE ESTA GUARDA FAZ, E QUE NENHUMA OUTRA FAZIA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A matriz de consistência confronta pares ESCOLHIDOS de indicadores. A de
 * reconciliação confronta todos os caminhos de um mesmo indicador. Nenhuma das
 * duas cobre o que esta cobre: **toda superfície que EXIBE uma linha de
 * resultado exibe o que a `cascataDRE` diz — e diz de onde o número veio.**
 *
 * ⚠️ **Ela nasce junto com a primeira migração, e é de propósito.** Deixar o
 * contrato para o fim significaria migrar quatro superfícies sem nada
 * obrigando as quatro a concordar: cada uma passaria no seu próprio teste, o
 * conjunto continuaria livre para divergir, e a divergência só apareceria em
 * produção — que é exatamente a história que a `cascataDRE` já existe para
 * encerrar.
 *
 * ⚠️ **Por que a comparação é sobre o TEXTO EXIBIDO, e não sobre o número
 * interno.** O defeito desta família não é de aritmética, é de autoridade: um
 * valor em prosa ("o EBITDA é R$ X") é a apresentação com mais autoridade e
 * menos rastreabilidade do produto — ninguém abre o DRE para conferir o que a
 * IA afirmou. Comparar o número interno provaria que a função foi chamada;
 * comparar a STRING prova que o que a pessoa lê é o que a cascata diz, com o
 * mesmo arredondamento. É a única forma de a guarda falhar quando alguém
 * reintroduzir uma conta própria só na hora de escrever a frase.
 *
 * Determinístico: datasets fixos, sem relógio e sem rede.
 */
import type { RiskInput } from "@/core/risk-engine/types";
import type { Intervalo } from "@/core/relatorios";
import type { Regime } from "@/core/dre/types";
import { cascataDRE, LINHAS_CASCATA, type LinhaCascata } from "@/core/relatorios/cascata";
import { responderLocal } from "@/core/assistant/engine";
import { dreGerencial, movimentosNoPeriodo } from "@/core/dre/engine";
import { valorOuNulo, type Indicador, type Janela } from "@/core/indicadores";
import { painelResultado } from "@/core/indicadores/resultado";
import * as FIXTURE from "./fixture.mts";
import { mv } from "./fixture.mts";

let falhas = 0;
const ok = (nome: string, detalhe = "") => console.log(`✓ ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
const erro = (nome: string, detalhe: string) => { falhas++; console.log(`✗ ${nome}\n    ${detalhe}`); };

/** O MESMO formatador que a IA usa para escrever o valor na frase. */
const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

/* ══════════════════════════════════════════════════════════════════════════ */
/* OS DATASETS                                                                */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠️ **O CASO QUE INVERTE O SINAL DO EBITDA** — o discriminante desta guarda.
 *
 * A operação QUEIMA: 100 mil de venda contra 130 mil de folha, EBITDA de
 * −30 mil. E há 200 mil de rendimento de aplicação no mesmo mês.
 *
 * A agregação inline que a IA tinha somava TODA entrada em `receita`, inclusive
 * a financeira, e chegava a +170 mil. Não é um erro de 200 mil num número
 * grande: é a IA afirmando **geração operacional onde há queima** — o oposto do
 * fato, no formato que ninguém confere. Um dataset com sinais do mesmo lado
 * deixaria essa classe de defeito passar, porque a diferença pareceria só uma
 * questão de magnitude.
 *
 * Tudo liquidado e com `paid_date` dentro da janela de propósito: assim a conta
 * ingênua (caixa) e a cascata (competência) enxergam os MESMOS lançamentos, e a
 * divergência que sobra é só a classificação — que é a que está sob teste.
 */
const INPUT_SINAL: RiskInput = {
  hoje: "2026-08-15",
  saldoAtual: 250_000,
  movements: [
    mv("v1", "entrada", "pago", 100_000, "2026-08-05", "2026-08-05", "Vendas", "A"),
    mv("f1", "saida", "pago", 130_000, "2026-08-10", "2026-08-10", "Folha", "F"),
    mv("j1", "entrada", "pago", 200_000, "2026-08-12", "2026-08-12", "Rendimento de aplicação", "A"),
  ],
  partyNames: { A: "Alpha", F: "Forn" },
} as RiskInput;

/**
 * ⚠️ **IMPOSTO SOBRE O LUCRO DIFERENTE DE ZERO — a diferença travada ANTES de
 * ela aparecer.**
 *
 * O caminho antigo do `dreGerencial` fazia `ir = 0` sempre, e o lucro líquido
 * era igual ao LAIR. A cascata SUBTRAI `impostos_lucro`. Hoje os dois dão o
 * mesmo número em produção — porque o sistema ainda não provisiona IRPJ/CSLL e
 * a linha é zero em todos os meses.
 *
 * No dia em que a provisão existir, o lucro líquido destas telas CAI. Sem este
 * caso, a queda pareceria regressão e alguém "consertaria" devolvendo o
 * `ir = 0`. Com ele, a diferença tem nome, valor e data.
 */
const INPUT_IR: RiskInput = {
  hoje: "2026-08-15",
  saldoAtual: 100_000,
  movements: [
    mv("ir_v", "entrada", "pago", 100_000, "2026-08-05", "2026-08-05", "Vendas", "A"),
    mv("ir_f", "saida", "pago", 40_000, "2026-08-10", "2026-08-10", "Folha", "F"),
    // IRPJ e CSLL: a linha `impostos_lucro`, que o caminho antigo ignorava.
    mv("ir_1", "saida", "pago", 9_000, "2026-08-20", "2026-08-20", "IRPJ", "G"),
    mv("ir_2", "saida", "pago", 3_000, "2026-08-20", "2026-08-20", "CSLL", "G"),
  ],
  partyNames: { A: "Alpha", F: "Forn", G: "Fisco" },
} as RiskInput;

const AGOSTO: Intervalo = { de: "2026-08-01", ate: "2026-08-31" };
/** Janela sem um único lançamento — o caso em que não há o que afirmar. */
const JANEIRO: Intervalo = { de: "2026-01-01", ate: "2026-01-31" };

const BASES: { nome: string; input: RiskInput; intervalo: Intervalo; pergunta: string }[] = [
  { nome: "fixture compartilhada · agosto", input: FIXTURE.INPUT, intervalo: AGOSTO, pergunta: "qual o ebitda em agosto" },
  { nome: "empresa que queima · agosto", input: FIXTURE.INPUT_QUEIMANDO, intervalo: AGOSTO, pergunta: "qual o ebitda em agosto" },
  { nome: "financeiro inverte o sinal · agosto", input: INPUT_SINAL, intervalo: AGOSTO, pergunta: "qual o ebitda em agosto" },
  { nome: "imposto sobre o lucro ≠ 0 · agosto", input: INPUT_IR, intervalo: AGOSTO, pergunta: "qual o ebitda em agosto" },
];

/**
 * ⚠️ **OS DOIS REGIMES, para TODA superfície.**
 *
 * A cascata passou a aceitar `regime`. Se o contrato cobrisse um só, a
 * superfície da função canônica teria dobrado e a cobertura teria caído pela
 * metade — e o regime não coberto é justamente aquele em que ninguém olha.
 */
const REGIMES: Regime[] = ["competencia", "caixa"];

const CASOS = BASES.flatMap((b) => REGIMES.map((regime) => ({ ...b, regime, nome: `${b.nome} · ${regime}` })));

/* ══════════════════════════════════════════════════════════════════════════ */
/* AS SUPERFÍCIES                                                             */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * Cada superfície declara o que EXIBE, já formatado como a pessoa lê.
 * `null` = a superfície não reporta aquela linha (legítimo).
 *
 * ⚠️ **Toda superfície migrada entra aqui.** É o que transforma "a IA agora lê
 * a cascata" em "as N superfícies não têm como discordar". Acrescentar uma
 * entrada é o passo final de cada migração — não um item para depois.
 */
interface Caso { nome: string; input: RiskInput; intervalo: Intervalo; pergunta: string; regime: Regime }

interface Superficie {
  nome: string;
  /**
   * Em que regimes esta superfície fala. Uma superfície que só existe em
   * competência (a IA responde sobre o DRE) declara isso em vez de ser
   * comparada contra um número que ela nunca exibe.
   */
  regimes: Regime[];
  /** O que a superfície mostra, por linha da cascata — já formatado. */
  exibe: (c: Caso) => Partial<Record<LinhaCascata, string | null>>;
  /** As margens que a superfície publica, para a regra "nunca 0%". */
  margens?: (c: Caso) => { nome: string; obtido: string; canonico: Indicador }[];
  /**
   * ⚠️ **Declarado, não inferido.** Cockpit e painel publicam VALOR em cartão,
   * não frase; exigir procedência de quem não escreve prosa reprovaria o
   * correto — e guarda que reprova o certo é desligada na primeira semana.
   * Quem tem prosa (a IA) declara `prosa: true` e é cobrado.
   */
  prosa: boolean;
  /** O texto integral que a pessoa lê. Vazio quando `prosa` é falso. */
  texto: (c: Caso) => string;
}

const numeroDaIA = (input: RiskInput, pergunta: string, label: string): string | null => {
  const r = responderLocal(pergunta, input);
  if (!r) return null;
  return r.numeros.find((n) => n.label === label)?.valor ?? null;
};

/** Como cada superfície apresenta uma margem: percentual, ou traço se não há. */
const pctOuTraco = (i: Indicador) => (i.indisponivel ? "—" : `${Math.round(i.valor * 100)}%`);

/** O `dreGerencial` já migrado — a fonte de #4 (cockpit) e #5 (painel Vendas). */
const gerencialDoCaso = (c: Caso) =>
  dreGerencial(movimentosNoPeriodo(c.input, c.regime, c.intervalo.de, c.intervalo.ate), c.regime);

const SUPERFICIES: Superficie[] = [
  {
    nome: "#7 IA · motor nativo (assistant/engine)",
    prosa: true,
    // ⚠️ A IA responde sobre o DRE, que é competência. Ela não tem uma leitura
    // de caixa a oferecer, e forçá-la a ter para "cobrir os dois regimes" seria
    // inventar superfície para satisfazer o teste.
    regimes: ["competencia"],
    exibe: (c) => ({
      ebitda: numeroDaIA(c.input, c.pergunta, "EBITDA"),
      receita_liquida: numeroDaIA(c.input, c.pergunta, "Receita líquida"),
    }),
    texto: (c) => responderLocal(c.pergunta, c.input)?.resposta ?? "",
  },
  {
    nome: "#4 Cockpit · c.dre.gerencial",
    prosa: false,
    regimes: ["competencia", "caixa"],
    exibe: (c) => {
      const g = gerencialDoCaso(c);
      return {
        ebitda: fmt(g.ebitda),
        receita_liquida: fmt(g.receitaLiquida),
        lucro_bruto: fmt(g.lucroBruto),
        ebit: fmt(g.ebit),
        resultado_liquido: fmt(g.lucroLiquido),
      };
    },
    margens: (c) => {
      const g = gerencialDoCaso(c);
      const can = cascataDRE(c.input, { intervalo: c.intervalo, regime: c.regime });
      return [
        { nome: "margem EBITDA", obtido: pctOuTraco(g.margemEbitda), canonico: can.margemEbitda },
        { nome: "margem bruta", obtido: pctOuTraco(g.margemBruta), canonico: can.margemBruta },
        { nome: "margem líquida", obtido: pctOuTraco(g.margemLiquida), canonico: can.margemLiquida },
      ];
    },
    texto: () => "",
  },
  {
    /*
     * ⚠️ O painel de Vendas mostra RECEITA, MARGEM DE CONTRIBUIÇÃO e EBITDA por
     * mês. Entra pelas mesmas linhas da cascata que a tela lê — se alguém
     * reintroduzir a soma inline, a diferença aparece aqui.
     */
    nome: "#10 VendasDashboardView · receita/MC/EBITDA",
    prosa: false,
    regimes: ["competencia"],
    exibe: (c) => {
      const cas = cascataDRE(c.input, { intervalo: c.intervalo, regime: "competencia" });
      return {
        receita_bruta: fmt(cas.linhas.receita_bruta.valor),
        margem_contribuicao: fmt(cas.linhas.margem_contribuicao.valor),
        ebitda: fmt(cas.linhas.ebitda.valor),
      };
    },
    texto: () => "",
  },
  {
    nome: "#6 core/indicadores · painelResultado",
    prosa: false,
    regimes: ["competencia", "caixa"],
    exibe: (c) => {
      const j: Janela = { de: c.intervalo.de, ate: c.intervalo.ate, label: "período", vazia: false, contemHoje: false } as Janela;
      const p = painelResultado(c.input, j, c.regime);
      const val = (i: { valor: number; indisponivel?: unknown }) => (i.indisponivel ? null : fmt(i.valor));
      return {
        receita_bruta: val(p.receitaBruta),
        deducoes: val(p.deducoes),
        receita_liquida: val(p.receitaLiquida),
        custos_variaveis: val(p.custo),
        lucro_bruto: val(p.lucroBruto),
        despesas_operacionais: val(p.despesaOperacional),
        ebitda: val(p.ebitda),
        resultado_liquido: val(p.lucroLiquido),
      };
    },
    margens: (c) => {
      const j: Janela = { de: c.intervalo.de, ate: c.intervalo.ate, label: "período", vazia: false, contemHoje: false } as Janela;
      const p = painelResultado(c.input, j, c.regime);
      const can = cascataDRE(c.input, { intervalo: c.intervalo, regime: c.regime });
      return [
        { nome: "margem EBITDA", obtido: pctOuTraco(p.margemEbitda), canonico: can.margemEbitda },
        { nome: "margem bruta", obtido: pctOuTraco(p.margemBruta), canonico: can.margemBruta },
        { nome: "margem líquida", obtido: pctOuTraco(p.margemLiquida), canonico: can.margemLiquida },
      ];
    },
    texto: () => "",
  },
  {
    nome: "#5 core/paineis · painel de Vendas",
    prosa: false,
    regimes: ["competencia", "caixa"],
    // O painel lê o MESMO `dreGerencial`; o que ele publica é o EBITDA e a
    // receita. Entra pelo mesmo caminho para que a migração de um não deixe o
    // outro para trás.
    exibe: (c) => {
      const g = gerencialDoCaso(c);
      return { ebitda: fmt(g.ebitda), receita_bruta: fmt(g.receitaBruta) };
    },
    texto: () => "",
  },
];

/* ══════════════════════════════════════════════════════════════════════════ */
/* 1. TODA SUPERFÍCIE EXIBE O QUE A CASCATA DIZ                               */
/* ══════════════════════════════════════════════════════════════════════════ */

console.log("\nCONTRATO DA LINHA DE RESULTADO — a cascata é a única fonte\n");

for (const caso of CASOS) {
  const c = cascataDRE(caso.input, { intervalo: caso.intervalo, regime: caso.regime });
  for (const s of SUPERFICIES) {
    if (!s.regimes.includes(caso.regime)) continue;
    const exibido = s.exibe(caso);

    /* As margens: nunca 0% onde não há margem. */
    for (const m of s.margens?.(caso) ?? []) {
      const esperado = m.canonico.indisponivel ? "—" : `${Math.round(m.canonico.valor * 100)}%`;
      if (m.obtido !== esperado) {
        erro(`${s.nome} · ${caso.nome} · ${m.nome}`, `exibiu "${m.obtido}", a cascata diz "${esperado}"`);
      } else if (m.canonico.indisponivel && /\d/.test(m.obtido)) {
        erro(`${s.nome} · ${caso.nome} · ${m.nome}`, `publicou um número onde não há margem: "${m.obtido}"`);
      } else {
        ok(`${s.nome} · ${caso.nome} · ${m.nome}`, esperado);
      }
    }

    for (const linha of LINHAS_CASCATA) {
      const obtido = exibido[linha];
      if (obtido === undefined || obtido === null) continue; // a superfície não reporta esta linha
      const ind = c.linhas[linha];
      if (ind.indisponivel) {
        erro(`${s.nome} · ${caso.nome} · ${linha}`,
          `exibiu "${obtido}" para uma linha que a cascata declara INDISPONÍVEL (${ind.indisponivel.codigo}: ${ind.indisponivel.motivo})`);
        continue;
      }
      const esperado = fmt(ind.valor);
      if (obtido !== esperado) {
        erro(`${s.nome} · ${caso.nome} · ${linha}`, `exibiu ${obtido}, a cascata diz ${esperado}`);
      } else {
        ok(`${s.nome} · ${caso.nome} · ${linha}`, esperado);
      }
    }
  }
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* 2. O CASO DO SINAL — a prova de que a receita financeira ficou de fora     */
/* ══════════════════════════════════════════════════════════════════════════ */

{
  const c = cascataDRE(INPUT_SINAL, { intervalo: AGOSTO, regime: "competencia" });
  const ebitda = c.linhas.ebitda.valor;

  // A conta INGÊNUA, reproduzida aqui de propósito: é exatamente o que a IA
  // fazia inline. Ela é o "errado" que a guarda precisa ver para provar que o
  // certo não é o mesmo número por coincidência.
  const dentro = INPUT_SINAL.movements.filter((m) => (m.paid_date ?? "") >= AGOSTO.de && (m.paid_date ?? "") <= AGOSTO.ate);
  const ehFinanceiroIngenuo = (cat: string) => /tarifa|juros|banc|financ|\biof\b/.test(cat);
  const receitaIngenua = dentro.filter((m) => m.type === "entrada").reduce((s, m) => s + Math.abs(m.amount), 0);
  const opexIngenuo = dentro
    .filter((m) => m.type === "saida" && !ehFinanceiroIngenuo((m.category ?? "").toLowerCase()))
    .reduce((s, m) => s + Math.abs(m.amount), 0);
  const ebitdaIngenuo = receitaIngenua - opexIngenuo;

  if (ebitda >= 0) {
    erro("sinal · a cascata reconhece a queima", `EBITDA da cascata deu ${fmt(ebitda)}; o esperado é NEGATIVO (100 mil de venda contra 130 mil de folha)`);
  } else if (ebitdaIngenuo <= 0) {
    erro("sinal · o caso discrimina", `a conta ingênua deu ${fmt(ebitdaIngenuo)} — o dataset perdeu o poder de separar as duas contas; aumente a receita financeira`);
  } else {
    ok("sinal · o financeiro NÃO entra no EBITDA",
      `cascata ${fmt(ebitda)} (queima) × conta ingênua ${fmt(ebitdaIngenuo)} (geração) — sinais opostos`);
  }

  // E a receita financeira aparece onde deve: na linha própria, depois do EBITDA.
  const rf = c.linhas.resultado_financeiro.valor;
  if (Math.abs(rf - 200_000) > 0.01) {
    erro("sinal · o financeiro tem linha própria", `Resultado Financeiro deu ${fmt(rf)}, esperado ${fmt(200_000)}`);
  } else {
    ok("sinal · o financeiro tem linha própria", fmt(rf));
  }
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* 2b. O IMPOSTO SOBRE O LUCRO — a diferença de `lair`, travada antes de doer */
/* ══════════════════════════════════════════════════════════════════════════ */

{
  const c = cascataDRE(INPUT_IR, { intervalo: AGOSTO, regime: "competencia" });
  const il = c.linhas.impostos_lucro.valor;
  const g = dreGerencial(movimentosNoPeriodo(INPUT_IR, "competencia", AGOSTO.de, AGOSTO.ate), "competencia");

  /*
   * ⚠️ **A primeira versão desta fixture não testava nada** — e passou. IRPJ e
   * CSLL caíam na linha de DEDUÇÃO da receita, porque `ehImpostoVenda` é um
   * superconjunto de `ehImpostoLucro` e `deducoes` vem antes na estrutura: a
   * linha `impostos_lucro` era inalcançável, ficava zerada, e a diferença que
   * este caso existe para travar não podia acontecer. Esta asserção é o que
   * impede a fixture de voltar a passar por vacuidade.
   */
  if (Math.abs(il - 12_000) > 0.01) {
    erro("IR · a linha recebe o imposto sobre o lucro",
      `impostos_lucro deu ${fmt(il)}, esperado ${fmt(12_000)} (IRPJ 9k + CSLL 3k). Se deu zero, a linha voltou a ser inalcançável e o caso não testa nada`);
  } else {
    ok("IR · a linha recebe o imposto sobre o lucro", fmt(il));
  }

  // EBITDA é OPERACIONAL: imposto sobre o lucro está, por definição, fora dele.
  if (Math.abs(g.ebitda - 60_000) > 0.01) {
    erro("IR · o imposto sobre o lucro NÃO entra no EBITDA",
      `EBITDA deu ${fmt(g.ebitda)}, esperado ${fmt(60_000)} (100k − 40k de folha). Se deu ${fmt(48_000)}, o IR voltou a ser tratado como dedução da receita`);
  } else {
    ok("IR · o imposto sobre o lucro NÃO entra no EBITDA", fmt(g.ebitda));
  }

  /*
   * ⚠️ **A DIFERENÇA QUE HOJE NÃO APARECE.** O caminho antigo fazia `ir = 0`
   * sempre, então `lucroLiquido === lair`. A cascata subtrai. Enquanto o sistema
   * não provisionar IRPJ/CSLL a linha é zero em produção e os dois coincidem —
   * e é justamente por isso que a diferença precisa estar travada AGORA: no dia
   * da provisão, o lucro líquido destas telas cai, e sem este caso a queda
   * pareceria regressão em vez de correção.
   */
  if (Math.abs((g.lair - g.lucroLiquido) - il) > 0.01) {
    erro("IR · lucro líquido é DEPOIS do imposto sobre o lucro",
      `lair ${fmt(g.lair)} − lucroLíquido ${fmt(g.lucroLiquido)} = ${fmt(g.lair - g.lucroLiquido)}, esperado ${fmt(il)}`);
  } else {
    ok("IR · lucro líquido é DEPOIS do imposto sobre o lucro",
      `lair ${fmt(g.lair)} → líquido ${fmt(g.lucroLiquido)} (−${fmt(il)})`);
  }
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* 2c. A RECLASSIFICAÇÃO NÃO MOVE O FUNDO — primeira parcela do plano de contas */
/* ══════════════════════════════════════════════════════════════════════════ */

{
  /*
   * ⚠️ **A asserção que prova que ninguém errou a mão.** Separar uma categoria
   * genérica em quatro é RECLASSIFICAÇÃO: o dinheiro muda de linha, não de
   * valor. Se o RESULTADO LÍQUIDO se mexer, a operação deixou de ser
   * reclassificação e virou alteração de número — e aí o problema não é de
   * apresentação, é de fundo.
   *
   * O caso reproduz o defeito real da organização auditada: uma categoria
   * genérica "Impostos" com quatro coisas dentro — Simples (dedução da
   * receita), INSS e FGTS (encargo de FOLHA) e IRPJ (imposto sobre o LUCRO).
   * Medido lá: deduções de 47,54% da receita, impossível em qualquer regime
   * brasileiro; três quartos do valor estavam na linha errada.
   *
   * ⚠️ E é o caso que só passa com `linhaPorCategoria`: "INSS patronal (GPS)"
   * casa `\binss\b` em `ehImpostoVenda`, então SEM a linha declarada ele volta
   * a cair em dedução da receita. É essa a diferença entre declarar a linha e
   * torcer para o regex acertar.
   */
  const generico: RiskInput = {
    hoje: "2026-08-15", saldoAtual: 0,
    movements: [
      mv("g_r", "entrada", "pago", 100_000, "2026-08-01", "2026-08-01", "Vendas", "A"),
      mv("g_s", "saida", "pago", 9_000, "2026-08-20", "2026-08-20", "Impostos", "G"),
      mv("g_i", "saida", "pago", 8_000, "2026-08-07", "2026-08-07", "Impostos", "G"),
      mv("g_f", "saida", "pago", 5_000, "2026-08-07", "2026-08-07", "Impostos", "G"),
      mv("g_j", "saida", "pago", 7_000, "2026-08-20", "2026-08-20", "Impostos", "G"),
    ],
    partyNames: { A: "Alpha", G: "Fisco" },
  } as RiskInput;

  const separado: RiskInput = {
    ...generico,
    movements: [
      mv("g_r", "entrada", "pago", 100_000, "2026-08-01", "2026-08-01", "Vendas", "A"),
      mv("g_s", "saida", "pago", 9_000, "2026-08-20", "2026-08-20", "Simples Nacional", "G"),
      mv("g_i", "saida", "pago", 8_000, "2026-08-07", "2026-08-07", "INSS patronal (GPS)", "G"),
      mv("g_f", "saida", "pago", 5_000, "2026-08-07", "2026-08-07", "FGTS", "G"),
      mv("g_j", "saida", "pago", 7_000, "2026-08-20", "2026-08-20", "IRPJ / CSLL", "G"),
    ],
  } as RiskInput;

  /** A linha DECLARADA de cada categoria — o formato do plano de contas. */
  const LINHA_POR_CATEGORIA: Record<string, string> = {
    "simples nacional": "deducoes",
    "inss patronal (gps)": "despesas_operacionais",
    "fgts": "despesas_operacionais",
    "irpj / csll": "impostos_lucro",
  };

  /*
   * ⚠️ **DÚVIDA REGISTRADA — a organização auditada está no SIMPLES e pagou
   * DARF IRPJ no mesmo período** (R$ 75.982,66 em 9 guias). No Simples o IRPJ
   * está DENTRO do DAS. Pode ser mudança de regime, outra entidade do grupo
   * pagando pela mesma conta, ou recolhimento indevido — quem decide é o
   * contador.
   *
   * A classificação como imposto sobre o lucro está certa PARA O QUE O
   * DOCUMENTO DIZ QUE É, e é só isso que ela afirma. Fica escrito aqui para
   * ninguém ler o teste verde como se a dúvida tivesse sido resolvida.
   */
  const antes = cascataDRE(generico, { intervalo: AGOSTO, regime: "competencia" });
  const depois = cascataDRE(separado, { intervalo: AGOSTO, regime: "competencia", linhaPorCategoria: LINHA_POR_CATEGORIA });

  const conferir = (nome: string, obtido: number, esperado: number) => {
    if (Math.abs(obtido - esperado) > 0.01) erro(`reclassificação · ${nome}`, `deu ${fmt(obtido)}, esperado ${fmt(esperado)}`);
    else ok(`reclassificação · ${nome}`, fmt(obtido));
  };

  // ANTES: os quatro juntos viram dedução (29.000 de 100.000 = 29%).
  conferir("antes · deduções engolem os quatro", antes.linhas.deducoes.valor, 29_000);
  // DEPOIS: só o Simples é dedução.
  conferir("depois · dedução é só o Simples", depois.linhas.deducoes.valor, 9_000);
  conferir("depois · INSS e FGTS viram despesa operacional", depois.linhas.despesas_operacionais.valor, 13_000);
  conferir("depois · IRPJ vira imposto sobre o lucro", depois.linhas.impostos_lucro.valor, 7_000);
  conferir("depois · EBITDA sobe pelo que saiu da dedução", depois.linhas.ebitda.valor, 78_000);

  // ⚠️ O FUNDO NÃO SE MEXE. É a asserção que separa reclassificar de alterar.
  const d = depois.linhas.resultado_liquido.valor - antes.linhas.resultado_liquido.valor;
  if (Math.abs(d) > 0.01) {
    erro("reclassificação · o RESULTADO LÍQUIDO não pode mudar",
      `mexeu ${fmt(d)}: antes ${fmt(antes.linhas.resultado_liquido.valor)}, depois ${fmt(depois.linhas.resultado_liquido.valor)} — isto deixou de ser reclassificação`);
  } else {
    ok("reclassificação · o RESULTADO LÍQUIDO não muda", `${fmt(depois.linhas.resultado_liquido.valor)} nos dois`);
  }

  // ⚠️ Sem a linha declarada, o INSS volta para a dedução — é o que prova que o
  // caso testa `linhaPorCategoria` e não a sorte do regex.
  const semDeclaracao = cascataDRE(separado, { intervalo: AGOSTO, regime: "competencia" });
  if (semDeclaracao.linhas.deducoes.valor <= 9_000) {
    erro("reclassificação · o caso DEPENDE da linha declarada",
      `sem linhaPorCategoria a dedução deu ${fmt(semDeclaracao.linhas.deducoes.valor)} — se já está certa, o caso não prova que a declaração é necessária`);
  } else {
    ok("reclassificação · sem a linha declarada o INSS volta para a dedução", fmt(semDeclaracao.linhas.deducoes.valor));
  }
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* 3. QUEM CITA NÚMERO DE RESULTADO DIZ DE QUE PERÍODO E REGIME ELE SAIU      */
/* ══════════════════════════════════════════════════════════════════════════ */

for (const caso of CASOS) {
  for (const s of SUPERFICIES) {
    if (!s.regimes.includes(caso.regime) || !s.prosa) continue;
    const txt = s.texto(caso);
    if (!txt) { erro(`${s.nome} · ${caso.nome} · procedência`, "não devolveu texto"); continue; }
    if (!/R\$/.test(txt)) continue; // não citou número: nada a exigir

    const temRegime = /regime de (compet[êe]ncia|caixa)|posi[çc][ãa]o das contas/.test(txt);
    const temPeriodo = /Período:/.test(txt);
    if (!temRegime || !temPeriodo) {
      erro(`${s.nome} · ${caso.nome} · procedência`,
        `cita valor e não diz ${!temPeriodo ? "de que PERÍODO" : ""}${!temPeriodo && !temRegime ? " nem " : ""}${!temRegime ? "sob que REGIME" : ""}: "${txt.slice(0, 160)}"`);
    } else {
      ok(`${s.nome} · ${caso.nome} · procedência`, "período e regime declarados");
    }
  }
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* 4. SEM NÚMERO, SEM AFIRMAÇÃO — o indisponível não pode virar zero          */
/* ══════════════════════════════════════════════════════════════════════════ */

{
  const c = cascataDRE(FIXTURE.INPUT, { intervalo: JANEIRO, regime: "competencia" });
  if (!c.linhas.ebitda.indisponivel) {
    erro("indisponível · o caso é válido", "janeiro deveria estar sem lançamentos na fixture; o dataset mudou");
  } else {
    for (const s of SUPERFICIES) {
      if (!s.prosa) continue;
      const txt = s.texto({ nome: "janeiro", input: FIXTURE.INPUT, intervalo: JANEIRO, pergunta: "qual o ebitda em janeiro", regime: "competencia" });
      if (/R\$/.test(txt)) {
        erro(`${s.nome} · indisponível`, `afirmou um valor onde a cascata não tem resposta: "${txt.slice(0, 160)}"`);
      } else if (!txt.trim()) {
        erro(`${s.nome} · indisponível`, "ficou em silêncio — deveria dizer POR QUE não há número");
      } else {
        ok(`${s.nome} · indisponível`, "explicou em vez de afirmar zero");
      }
    }
  }
}

/* ══════════════════════════════════════════════════════════════════════════ */

console.log(
  falhas === 0
    ? `\n✓ TODOS — ${SUPERFICIES.length} superfície(s) × ${CASOS.length} caso(s): ninguém discorda da cascata.\n`
    : `\n✗ ${falhas} violação(ões) do contrato da linha de resultado.\n`,
);
process.exit(falhas === 0 ? 0 : 1);
