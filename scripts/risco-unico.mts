/**
 * risco-unico — a chance de ruptura de caixa é UMA, num horizonte só
 * (Fase 3.3 do plano, 03/11/2026).
 *
 *   npm run risco-unico        (dentro de npm test)
 *
 * Antes, três motores davam três chances: o risk-engine (60 dias), o quant
 * (1 − score ÷ 100, "90 dias") e o decision (o "stress" da matriz e a
 * simulação Monte Carlo, 90 dias). E a do risk-engine ainda mudava com o
 * período que a tela projetava. A guarda reprova se alguém desfizer:
 *
 *   VALOR (o que a pessoa vê)
 *   1. risk-engine, quant e decision dão o MESMO número para o mesmo caixa;
 *   2. o número não muda com o período projetado (60, 90, 180 dias);
 *   3. uma ruptura além do horizonte não entra na chance (o horizonte é fixo).
 *
 *   FORMA (o caminho de volta do defeito)
 *   4. ninguém publica `probabilidadeStress`, `probabilidadeNegativo`,
 *      `probNegativo` ou `probStress`;
 *   5. o quant LÊ a chance do risk-engine em vez de calculá-la;
 *   6. o score do risk-engine mede no horizonte fixo, não em input.horizonDias;
 *   7. nenhum texto de tela fala em ruptura/negativo/stress "em 90 dias".
 *
 * ⚠️ A fixture é montada aqui; os números esperados (1 e 2) vêm de comparar os
 * motores entre si e o 3 de uma conta independente (sem ruptura no horizonte, a
 * chance é a do score, igual à do mesmo caixa sem a conta distante).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { RiskInput, RiskMovement } from "@/core/risk-engine/types";
import { scoreRiscoCaixa } from "@/core/risk-engine";
import { analisarQuantitativo } from "@/core/quant";
import { decidir } from "@/core/decision";

let falhas = 0;
const ok = (nome: string, cond: boolean, det = "") => {
  if (cond) console.log(`  ✓ ${nome}`);
  else { falhas++; console.log(`  ✗ ${nome}${det ? ` — ${det}` : ""}`); }
};

const HOJE = "2026-11-03";
const mais = (d: number) => { const x = new Date(HOJE + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10); };
let s = 0;
const rm = (o: Partial<RiskMovement>): RiskMovement =>
  ({ id: `ru${s++}`, type: "entrada", amount: 1000, due_date: HOJE, paid_date: HOJE, status: "pago", category: "Vendas", party_id: null, ...o }) as RiskMovement;

// Uma empresa com histórico de 4 meses, que queima caixa e tem contas a pagar.
const historico: RiskMovement[] = [];
for (let m = 1; m <= 4; m++) {
  historico.push(rm({ amount: 30000, due_date: mais(-30 * m), paid_date: mais(-30 * m), party_id: "c1" }));
  historico.push(rm({ type: "saida", amount: 36000, due_date: mais(-30 * m + 2), paid_date: mais(-30 * m + 2), category: "Folha" }));
}
const abertos: RiskMovement[] = [
  rm({ type: "saida", amount: 9000, due_date: mais(20), paid_date: null, status: "pendente", category: "Aluguel" }),
  rm({ amount: 7000, due_date: mais(25), paid_date: null, status: "pendente", party_id: "c1" }),
];
const base: RiskInput = { hoje: HOJE, saldoAtual: 25000, partyNames: { c1: "Cliente Um" }, movements: [...historico, ...abertos] } as RiskInput;

/* ── 1. os três motores, o mesmo número ─────────────────────────────────── */
const risco = scoreRiscoCaixa(base).probabilidadeRuptura;
const quant = analisarQuantitativo(base).score.probabilidadeRuptura;
const dec = decidir(base).risco.probabilidadeRuptura;
ok(`risk-engine, quant e decision dão a mesma chance (${risco})`, risco === quant && risco === dec,
   `risk ${risco} · quant ${quant} · decision ${dec}`);
ok("a fixture tem chance acima do piso (senão o teste não prova nada)", risco > 0.02, String(risco));

/* ── 2. o período projetado não muda a chance ───────────────────────────── */
for (const h of [30, 90, 180, 365]) {
  const outra = scoreRiscoCaixa({ ...base, horizonDias: h }).probabilidadeRuptura;
  ok(`projetar ${h} dias não muda a chance (${outra})`, outra === risco, `${outra} ≠ ${risco}`);
}

/* ── 3. ruptura além do horizonte não entra ─────────────────────────────── */
// Um caixa folgado, com uma conta enorme daqui a 120 dias: no horizonte, não
// há ruptura; num fluxo de 180 dias, há.
const folgado: RiskInput = { hoje: HOJE, saldoAtual: 200000, partyNames: {}, movements: [
  rm({ amount: 50000, due_date: mais(-30), paid_date: mais(-30) }),
  rm({ type: "saida", amount: 40000, due_date: mais(-28), paid_date: mais(-28), category: "Folha" }),
] } as RiskInput;
const comConta: RiskInput = { ...folgado, horizonDias: 180, movements: [...folgado.movements,
  rm({ type: "saida", amount: 900000, due_date: mais(120), paid_date: null, status: "pendente", category: "Imóvel" })] } as RiskInput;
const rFolgado = scoreRiscoCaixa(comConta);
ok("a conta distante aparece na projeção de 180 dias (a fixture prova o caminho)", rFolgado.rupturaDia != null && rFolgado.rupturaDia > 60,
   String(rFolgado.rupturaDia));
const semConta = scoreRiscoCaixa({ ...folgado, horizonDias: 180 } as RiskInput).probabilidadeRuptura;
ok(`a ruptura no dia ${rFolgado.rupturaDia} não vira chance de ruptura no horizonte`, rFolgado.probabilidadeRuptura === semConta,
   `${rFolgado.probabilidadeRuptura} com a conta · ${semConta} sem`);

/* ── 4 a 7. a forma ─────────────────────────────────────────────────────── */
const semComentario = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const arquivos: string[] = [];
const varrer = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) varrer(p); else if (/\.(ts|tsx)$/.test(p)) arquivos.push(p); } };
varrer("src");
const proibidos = /\b(probabilidadeStress|probabilidadeNegativo|probNegativo|probStress)\b/;
const comProibido = arquivos.filter((a) => proibidos.test(semComentario(readFileSync(a, "utf8"))));
ok("ninguém publica uma segunda chance (stress, negativo)", comProibido.length === 0, comProibido.join(" | "));

const quantSrc = semComentario(readFileSync("src/core/quant/score.ts", "utf8"));
ok("o quant LÊ a chance do risk-engine", /scoreRiscoCaixa\(input\)\.probabilidadeRuptura/.test(quantSrc)
   && !/1\s*-\s*score\s*\/\s*100/.test(quantSrc), "a fórmula própria voltou ou a leitura sumiu");

const scoreSrc = semComentario(readFileSync("src/core/risk-engine/score.engine.ts", "utf8"));
ok("o score mede no horizonte fixo", /const horizon = HORIZONTE_RUPTURA_DIAS;/.test(scoreSrc) && !/input\.horizonDias/.test(scoreSrc));

const noventa = /(?<![_\w])(ruptura|negativo|stress|aperto)[^\n]{0,60}[\s(]90 ?(d\b|dias)/i;
const com90 = arquivos.filter((a) => noventa.test(semComentario(readFileSync(a, "utf8"))));
ok("nenhum texto fala em ruptura em 90 dias", com90.length === 0, com90.join(" | "));

if (falhas > 0) { console.log(`\n✗ risco-unico: ${falhas} falha(s)\n`); process.exit(1); }
console.log("\n✓ risco-unico: uma chance de ruptura, um horizonte\n");
