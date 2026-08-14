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
import { cascataDRE, LINHAS_CASCATA, type LinhaCascata } from "@/core/relatorios/cascata";
import { responderLocal } from "@/core/assistant/engine";
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

const AGOSTO: Intervalo = { de: "2026-08-01", ate: "2026-08-31" };
/** Janela sem um único lançamento — o caso em que não há o que afirmar. */
const JANEIRO: Intervalo = { de: "2026-01-01", ate: "2026-01-31" };

const CASOS: { nome: string; input: RiskInput; intervalo: Intervalo; pergunta: string }[] = [
  { nome: "fixture compartilhada · agosto", input: FIXTURE.INPUT, intervalo: AGOSTO, pergunta: "qual o ebitda em agosto" },
  { nome: "empresa que queima · agosto", input: FIXTURE.INPUT_QUEIMANDO, intervalo: AGOSTO, pergunta: "qual o ebitda em agosto" },
  { nome: "financeiro inverte o sinal · agosto", input: INPUT_SINAL, intervalo: AGOSTO, pergunta: "qual o ebitda em agosto" },
];

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
interface Superficie {
  nome: string;
  /** O que a superfície mostra, por linha da cascata. */
  exibe: (input: RiskInput, intervalo: Intervalo, pergunta: string) => Partial<Record<LinhaCascata, string | null>>;
  /**
   * O texto integral que a pessoa lê — usado para cobrar a procedência
   * (período + regime) e para provar que um número indisponível não vira zero.
   */
  texto: (input: RiskInput, intervalo: Intervalo, pergunta: string) => string;
}

const numeroDaIA = (input: RiskInput, pergunta: string, label: string): string | null => {
  const r = responderLocal(pergunta, input);
  if (!r) return null;
  return r.numeros.find((n) => n.label === label)?.valor ?? null;
};

const SUPERFICIES: Superficie[] = [
  {
    nome: "IA · motor nativo (assistant/engine)",
    exibe: (input, _i, pergunta) => ({
      ebitda: numeroDaIA(input, pergunta, "EBITDA"),
      receita_liquida: numeroDaIA(input, pergunta, "Receita líquida"),
    }),
    texto: (input, _i, pergunta) => responderLocal(pergunta, input)?.resposta ?? "",
  },
  // ⬅️ As próximas superfícies migradas entram AQUI, no mesmo formato.
];

/* ══════════════════════════════════════════════════════════════════════════ */
/* 1. TODA SUPERFÍCIE EXIBE O QUE A CASCATA DIZ                               */
/* ══════════════════════════════════════════════════════════════════════════ */

console.log("\nCONTRATO DA LINHA DE RESULTADO — a cascata é a única fonte\n");

for (const caso of CASOS) {
  const c = cascataDRE(caso.input, { intervalo: caso.intervalo });
  for (const s of SUPERFICIES) {
    const exibido = s.exibe(caso.input, caso.intervalo, caso.pergunta);
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
  const c = cascataDRE(INPUT_SINAL, { intervalo: AGOSTO });
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
/* 3. QUEM CITA NÚMERO DE RESULTADO DIZ DE QUE PERÍODO E REGIME ELE SAIU      */
/* ══════════════════════════════════════════════════════════════════════════ */

for (const caso of CASOS) {
  for (const s of SUPERFICIES) {
    const txt = s.texto(caso.input, caso.intervalo, caso.pergunta);
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
  const c = cascataDRE(FIXTURE.INPUT, { intervalo: JANEIRO });
  if (!c.linhas.ebitda.indisponivel) {
    erro("indisponível · o caso é válido", "janeiro deveria estar sem lançamentos na fixture; o dataset mudou");
  } else {
    for (const s of SUPERFICIES) {
      const txt = s.texto(FIXTURE.INPUT, JANEIRO, "qual o ebitda em janeiro");
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
