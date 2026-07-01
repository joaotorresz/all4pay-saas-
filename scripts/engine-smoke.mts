/**
 * engine-smoke — guarda de regressão dos motores financeiros puros.
 *
 * Roda cada motor (src/core/*) sobre entradas realistas + de borda (vazio,
 * saldo negativo, 0 contas) e falha se QUALQUER número do resultado for
 * NaN/Infinity ou um score sair de [0,100]. Não substitui os testes de
 * roteamento da IA; é uma rede de segurança numérica barata.
 *
 *   npm run smoke
 *
 * Motivação: uma auditoria adversarial encontrou bugs reais (janela, recorrência
 * com data futura, classificação de folha). Este smoke fixa o piso: nenhum
 * motor pode vazar NaN/Infinity para a UI.
 */
import { scoreRiscoCaixa } from "@/core/risk-engine";
import { analisarQuantitativo } from "@/core/quant";
import { analisarInadimplencia } from "@/core/risk";
import { decidir } from "@/core/decision";
import { centroInteligencia } from "@/core/executive";
import { montarFluxoCaixa } from "@/core/cashflow";
import { financialDRE, periodoPreset } from "@/core/dre";
import { analisarMoat } from "@/core/datamoat";
import { operacaoAutonoma } from "@/core/autonomous";
import { treasuryCore } from "@/core/treasury";
import type { RiskInput, RiskMovement } from "@/core/risk-engine/types";
import type { FinancialAccount } from "@/lib/types";

const HOJE = "2026-07-15";
let seq = 0;
const mk = (o: Partial<RiskMovement>): RiskMovement =>
  ({ id: `m${seq++}`, type: "entrada", amount: 1000, due_date: HOJE, paid_date: HOJE, status: "pago", category: "Vendas", party_id: null, ...o }) as RiskMovement;

function dataset(): RiskMovement[] {
  const ms: RiskMovement[] = [];
  const cats = ["Impostos", "Fornecedores", "Folha", "Aluguel", "Juros", "Marketing"];
  for (const [mes, rec, desp] of [["03", 18000, 12000], ["04", 17000, 14000], ["05", 22000, 12500], ["06", 21000, 15000], ["07", 12000, 8000]] as [string, number, number][]) {
    ms.push(mk({ type: "entrada", amount: rec * 0.6, paid_date: `2026-${mes}-05`, due_date: `2026-${mes}-03`, party_id: "A", category: "Vendas" }));
    ms.push(mk({ type: "entrada", amount: rec * 0.4, paid_date: `2026-${mes}-12`, due_date: `2026-${mes}-10`, party_id: "B", category: "Servicos" }));
    cats.forEach((cat, i) => ms.push(mk({ type: "saida", amount: desp / cats.length, paid_date: `2026-${mes}-08`, due_date: `2026-${mes}-07`, party_id: `F${i}`, category: cat })));
  }
  ms.push(mk({ type: "entrada", amount: 5000, status: "pendente", paid_date: null, due_date: "2026-06-20", party_id: "C" }));
  return ms;
}

const NOMES = { A: "Loja Alpha", B: "Beta", C: "Gama", F0: "F0", F1: "F1", F2: "F2", F3: "F3", F4: "F4", F5: "F5" };
const ACCOUNTS: FinancialAccount[] = [
  { id: "a1", name: "Conta 1", bank: "Banco", balance: 25000 } as FinancialAccount,
  { id: "a2", name: "Conta 2", bank: "Banco 2", balance: 5000 } as FinancialAccount,
];

const inNormal: RiskInput = { hoje: HOJE, saldoAtual: 30000, partyNames: NOMES, movements: dataset() } as RiskInput;
const inVazio: RiskInput = { hoje: HOJE, saldoAtual: 0, partyNames: {}, movements: [] } as RiskInput;
const inNeg: RiskInput = { hoje: HOJE, saldoAtual: -3000, partyNames: NOMES, movements: dataset() } as RiskInput;

let falhas = 0;
function badNums(o: unknown, path: string, acc: string[]): string[] {
  if (typeof o === "number") { if (!Number.isFinite(o)) acc.push(`${path}=${o}`); return acc; }
  if (o && typeof o === "object" && !(o instanceof Date)) for (const k of Object.keys(o as object)) badNums((o as Record<string, unknown>)[k], `${path}.${k}`, acc);
  return acc;
}
function check(nome: string, resultado: unknown, extra?: () => string | null) {
  const bad = badNums(resultado, nome, []);
  const err = extra?.() ?? null;
  if (bad.length || err) { falhas++; console.log(`✗ ${nome}: ${err ?? ""}${bad.length ? ` NaN/Infinity: ${bad.slice(0, 6).join(", ")}` : ""}`); }
  else console.log(`✓ ${nome}`);
}

// risco (score 0-100)
for (const [nome, inp] of [["risco/normal", inNormal], ["risco/vazio", inVazio], ["risco/neg", inNeg]] as [string, RiskInput][]) {
  const s = scoreRiscoCaixa(inp);
  check(nome, s, () => (s.score >= 0 && s.score <= 100 ? null : `score fora de [0,100]: ${s.score}`));
}
// quant (score 0-100)
for (const [nome, inp] of [["quant/normal", inNormal], ["quant/vazio", inVazio]] as [string, RiskInput][]) {
  const q = analisarQuantitativo(inp);
  check(nome, q, () => (q.score.score >= 0 && q.score.score <= 100 ? null : `score fora de [0,100]: ${q.score.score}`));
}
// inadimplência · decisão · executivo · datamoat · autônomo
check("inadimplencia/normal", analisarInadimplencia(inNormal));
check("inadimplencia/vazio", analisarInadimplencia(inVazio));
check("decisao/normal", decidir(inNormal));
check("decisao/vazio", decidir(inVazio));
check("executivo/normal", centroInteligencia(inNormal));
check("executivo/vazio", centroInteligencia(inVazio));
check("datamoat/normal", analisarMoat(inNormal));
check("autonomo/normal", operacaoAutonoma(inNormal, ACCOUNTS));
check("autonomo/vazio", operacaoAutonoma(inVazio, []));
check("treasury/normal", treasuryCore(ACCOUNTS, inNormal));
check("treasury/0contas", treasuryCore([], inVazio));
// fluxo de caixa (30/90/365d + vazio)
for (const dias of [30, 90, 365]) check(`fluxo/${dias}d`, montarFluxoCaixa(inNormal, ACCOUNTS, { dias }));
check("fluxo/vazio", montarFluxoCaixa(inVazio, [], { dias: 30 }));
// DRE (4 presets + vazio) — + invariante do waterfall: cada dedução ≥ 0, então
// receitaBruta ≥ receitaLiquida ≥ lucroBruto ≥ EBITDA (guarda contra erro de
// sinal/classificação que jogue uma despesa negativa numa linha).
for (const preset of ["mes", "mes_anterior", "ytd", "12m"] as const) {
  const dre = financialDRE(inNormal, periodoPreset(HOJE, preset));
  const g = dre.gerencial;
  check(`dre/${preset}`, dre, () =>
    g.receitaBruta >= g.receitaLiquida - 0.01 && g.receitaLiquida >= g.lucroBruto - 0.01 && g.lucroBruto >= g.ebitda - 0.01
      ? null
      : `waterfall não-monotônico: bruta=${g.receitaBruta} liq=${g.receitaLiquida} lucroBruto=${g.lucroBruto} ebitda=${g.ebitda}`);
}
check("dre/vazio", financialDRE(inVazio, periodoPreset(HOJE, "mes")));

console.log(`\n${falhas === 0 ? "✓ TODOS os motores OK (sem NaN/Infinity)" : `✗ ${falhas} FALHA(S)`}`);
if (falhas > 0) process.exit(1);
