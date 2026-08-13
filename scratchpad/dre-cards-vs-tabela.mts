/**
 * MEDIÇÃO — cards do DRE × linhas da tabela, mesmo período, mesmos filtros.
 *
 * Roda os dois lados que a tela desenha:
 *   · cards  → `cascataDRE` (o selector único)
 *   · tabela → `montarRelatorio` + ESTRUTURA_DRE
 *
 * ⚠️ Na primeira execução os cards vinham de `painelResultado`, uma SEGUNDA
 * agregação, e foi assim que a divergência foi medida. Depois do conserto os
 * dois lados leem a mesma cascata e a diferença é zero — inclusive com receita
 * financeira injetada, que é o caso que produzia o defeito.
 *
 * Sobre a org joaov.yoshimi (835278a9) com o filtro de amostra ATIVO — o mesmo
 * retrato da linha de base (`base-joaov.json`).
 */
import { readFileSync } from "node:fs";
import { montarRelatorio, ESTRUTURA_DRE } from "@/core/relatorios";
import { cascataDRE } from "@/core/relatorios/cascata";
import type { RiskInput, RiskMovement } from "@/core/risk-engine/types";

const HOJE = "2026-08-13", SALDO = -31000.16;
const DE = "2025-09-01", ATE = "2026-08-31";

type G = [string, string, string, string, string | null, number, number];
const grupos = JSON.parse(readFileSync("scratchpad/base-joaov.json", "utf8")) as G[];
const movements: RiskMovement[] = grupos.map(([t, s, c, mc, mx, v], i) => ({
  id: `g${i}`, type: t as "entrada" | "saida", status: s as "pendente" | "pago" | "cancelado",
  amount: v, due_date: `${mc}-01`, paid_date: mx ? `${mx}-01` : null,
  category: c === "(sem categoria)" || c === "" ? null : c,
}));
const input: RiskInput = { hoje: HOJE, saldoAtual: SALDO, movements };

const brl = (n: number) =>
  (n < 0 ? "−" : "") + Math.abs(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n: number) => (n * 100).toFixed(1).replace(".", ",") + "%";

const rel = montarRelatorio(input, ESTRUTURA_DRE,
  { intervalo: { de: DE, ate: ATE }, tipo: "dre", regime: "competencia" });
const c0 = cascataDRE(input, { intervalo: { de: DE, ate: ATE } });
const p = { receitaLiquida: c0.linhas.receita_liquida, ebitda: c0.linhas.ebitda, lucroLiquido: c0.linhas.resultado_liquido, margemEbitda: c0.margemEbitda, receitaBruta: c0.linhas.receita_bruta };

const daTabela = (id: string) => rel.linhas.find((l) => l.id === id)?.total.valor ?? NaN;

const finTab = daTabela("resultado_financeiro");
const rlTab = daTabela("receita_liquida");
const ebTab = daTabela("ebitda");
const llTab = daTabela("resultado_liquido");
const margemTab = rlTab === 0 ? NaN : ebTab / rlTab;

const linhas: [string, number, number, number][] = [
  ["Receita líquida", p.receitaLiquida.valor, rlTab, p.receitaLiquida.valor - rlTab],
  ["EBITDA", p.ebitda.valor, ebTab, p.ebitda.valor - ebTab],
  ["Lucro líquido", p.lucroLiquido.valor, llTab, p.lucroLiquido.valor - llTab],
];

console.log(`\nPeríodo ${DE} a ${ATE} · regime competência · filtro de amostra ATIVO\n`);
console.log("card|valor do CARD|linha da TABELA|diferença");
for (const [nome, card, tab, dif] of linhas) {
  console.log(`${nome}|${brl(card)}|${brl(tab)}|${dif === 0 ? "—" : brl(dif)}`);
}
console.log(`Margem EBITDA|${pct(p.margemEbitda.valor)}|${Number.isNaN(margemTab) ? "n/d" : pct(margemTab)}|${
  Number.isNaN(margemTab) ? "n/d" : pct(p.margemEbitda.valor - margemTab)}`);

console.log(`\nResultado Financeiro (linha da tabela): ${brl(finTab)}`);
console.log("\n== A DIFERENÇA É O RESULTADO FINANCEIRO? ==");
for (const [nome, , , dif] of linhas) {
  if (dif === 0) { console.log(`${nome}: sem divergência`); continue; }
  // A linha da tabela traz o financeiro com SINAL (receita de juros − despesa
  // financeira). A diferença do card tem de bater com ele, em módulo e sinal.
  const bate = Math.abs(dif - finTab) < 0.005;
  console.log(`${nome}: diferença ${brl(dif)} · financeiro ${brl(finTab)} · BATE? ${bate}`);
}

/* A decomposição que nomeia a causa, sem depender da hipótese. */
console.log("\n== DE ONDE VEM ==");
const jurosEntrada = movements
  .filter((m) => m.type === "entrada" && m.status !== "cancelado"
    && m.due_date >= DE && m.due_date <= ATE
    && /juro|rendiment|aplica|financeir/i.test(m.category ?? ""))
  .reduce((s, m) => s + m.amount, 0);
console.log(`Entradas classificadas como financeiras no período: ${brl(jurosEntrada)}`);
console.log(`Receita Bruta da TABELA: ${brl(daTabela("receita_bruta"))}`);
console.log(`Deduções da TABELA:      ${brl(daTabela("deducoes"))}`);
console.log(`Receita bruta do CARD (receita − 0): ${brl(p.receitaBruta.valor)}`);
console.log(`  → card − tabela na receita bruta: ${brl(p.receitaBruta.valor - daTabela("receita_bruta"))}`);

/* ========================================================================== */
/* O TESTE ESTRUTURAL — a hipótese não depende do valor que sumiu             */
/* ========================================================================== */
/**
 * ⚠️ Na base de hoje os dois caminhos batem, e isso NÃO absolve o código: esta
 * organização simplesmente não tem receita financeira no período (0,00). O
 * único lançamento que tinha — os R$ 500.000 de "Juros recebidos" — saiu dos
 * relatórios pelo filtro de amostra.
 *
 * A hipótese é sobre a FÓRMULA, então o teste tem de ser sobre a fórmula:
 * injeta-se uma receita financeira e mede-se de novo. Se os cards a somarem na
 * Receita Líquida e no EBITDA, a divergência reaparece — com qualquer valor.
 */
for (const V of [500_000, 12_345.67]) {
  const comJuros: RiskMovement[] = [...movements, {
    id: "sintetico-juros", type: "entrada", status: "pago", amount: V,
    due_date: "2026-06-23", paid_date: "2026-06-23", category: "Juros recebidos",
  }];
  const inp2: RiskInput = { ...input, movements: comJuros };
  const rel2 = montarRelatorio(inp2, ESTRUTURA_DRE,
    { intervalo: { de: DE, ate: ATE }, tipo: "dre", regime: "competencia" });
  const c2 = cascataDRE(inp2, { intervalo: { de: DE, ate: ATE } });
  const p2 = { receitaLiquida: c2.linhas.receita_liquida, ebitda: c2.linhas.ebitda, lucroLiquido: c2.linhas.resultado_liquido, margemEbitda: c2.margemEbitda };
  const t2 = (id: string) => rel2.linhas.find((l) => l.id === id)?.total.valor ?? NaN;

  console.log(`\n== COM RECEITA FINANCEIRA DE ${brl(V)} ==`);
  console.log("card|CARD|TABELA|diferença|== ao valor injetado?");
  const casos: [string, number, number][] = [
    ["Receita líquida", p2.receitaLiquida.valor, t2("receita_liquida")],
    ["EBITDA", p2.ebitda.valor, t2("ebitda")],
    ["Lucro líquido", p2.lucroLiquido.valor, t2("resultado_liquido")],
  ];
  for (const [nome, card, tab] of casos) {
    const d = card - tab;
    console.log(`${nome}|${brl(card)}|${brl(tab)}|${brl(d)}|${Math.abs(d - V) < 0.005 ? "SIM" : "não"}`);
  }
  const rl2 = t2("receita_liquida"), eb2 = t2("ebitda");
  console.log(`Margem EBITDA|${pct(p2.margemEbitda.valor)}|${pct(eb2 / rl2)}|—|`);
  console.log(`Resultado Financeiro (tabela): ${brl(t2("resultado_financeiro"))}`);
  console.log(`Sinal do EBITDA — card: ${p2.ebitda.valor >= 0 ? "POSITIVO" : "negativo"} · tabela: ${eb2 >= 0 ? "POSITIVO" : "negativo"}`);
}
