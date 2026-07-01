/**
 * assistant-values — guarda de CORRETUDE NUMÉRICA da IA nativa.
 *
 * Enquanto `npm run corpus` protege o ROTEAMENTO (frase → intent certo), este
 * protege os NÚMEROS: sobre um dataset determinístico com respostas conhecidas,
 * exige que cada intent computado devolva exatamente o valor esperado (margem %,
 * ponto de equilíbrio, concentração, LTV, DSO, gasto/receita/resultado, saldo,
 * maior cliente, burn diário). Falha (exit 1) em qualquer divergência —
 * protege contra regressão nas fórmulas (não só nas regex).
 *
 *   npm run values
 */
import { responderLocal } from "@/core/assistant/engine";
import type { RiskInput, RiskMovement } from "@/core/risk-engine/types";

const HOJE = "2026-07-15";
let seq = 0;
const mk = (o: Partial<RiskMovement>): RiskMovement =>
  ({ id: `m${seq++}`, type: "entrada", amount: 1000, due_date: HOJE, paid_date: HOJE, status: "pago", category: "Vendas", party_id: null, ...o }) as RiskMovement;

// Dataset com respostas fechadas:
// mai: rec 30000 (A 20000 pago +2d, B 10000 pago +0d), desp 10000 (Fornecedores)
// jun: rec 20000 (A 20000 pago +2d),                    desp 20000 (Fornecedores)
// jul (mês atual): rec 10000 (A 6000 pago, B 4000 pago), desp 6000 (Marketing 6000)
const movs: RiskMovement[] = [
  mk({ type: "entrada", amount: 20000, due_date: "2026-05-01", paid_date: "2026-05-03", party_id: "A", category: "Vendas" }),
  mk({ type: "entrada", amount: 10000, due_date: "2026-05-01", paid_date: "2026-05-01", party_id: "B", category: "Servicos" }),
  mk({ type: "saida", amount: 10000, due_date: "2026-05-05", paid_date: "2026-05-05", party_id: "F", category: "Fornecedores" }),
  mk({ type: "entrada", amount: 20000, due_date: "2026-06-01", paid_date: "2026-06-03", party_id: "A", category: "Vendas" }),
  mk({ type: "saida", amount: 20000, due_date: "2026-06-05", paid_date: "2026-06-05", party_id: "F", category: "Fornecedores" }),
  mk({ type: "entrada", amount: 6000, due_date: "2026-07-02", paid_date: "2026-07-05", party_id: "A", category: "Vendas" }),
  mk({ type: "entrada", amount: 4000, due_date: "2026-07-02", paid_date: "2026-07-05", party_id: "B", category: "Servicos" }),
  mk({ type: "saida", amount: 6000, due_date: "2026-07-08", paid_date: "2026-07-08", party_id: "G", category: "Marketing" }),
];
const input: RiskInput = { hoje: HOJE, saldoAtual: 50000, partyNames: { A: "Loja Alpha", B: "Beta", F: "Forn", G: "Mkt" }, movements: movs } as RiskInput;

// [pergunta, regex do NÚMERO esperado, descrição do cálculo]
const CASES: [string, RegExp, string][] = [
  // jul: rec 10000, desp 6000 → margem = 4000/10000 = 40%
  ["qual minha margem esse mês?", /\b40%/, "resultado 4000 / receita 10000"],
  // break-even = média despesa 3 meses = (10000+20000+6000)/3 = 12000
  ["qual meu ponto de equilíbrio?", /12\.000/, "média despesa (10000+20000+6000)/3"],
  // gasto jul = 6000
  ["quanto gastei esse mês?", /6\.000/, "saída paga de julho"],
  // receita jul = 10000
  ["quanto recebi esse mês?", /10\.000/, "entrada paga de julho"],
  // resultado jul = 4000 (azul)
  ["quanto sobrou esse mês?", /4\.000/, "10000 - 6000"],
  // saldo
  ["qual meu saldo?", /50\.000/, "saldoAtual"],
  // LTV jul: 10000 / 2 clientes = 5000
  ["quanto cada cliente me rende?", /5\.000/, "10000 / 2 clientes"],
  // maior cliente jul: A pagou 6000 de 10000 = 60%
  ["qual meu maior cliente?", /60%/, "A 6000 / 10000"],
  // concentração 6 meses: A = 20000+20000+6000 = 46000; total = 46000 + B(10000+4000=14000) = 60000 → A 77%
  ["dependo de algum cliente?", /77%/, "A 46000 / 60000"],
  // pontualidade recebimento: atrasos A(+2 mai,+2 jun,0 jul? due 07-02 paid 07-05=+3) B(0 mai, 0 jul due 07-02 paid 07-05=+3)
  //   A: mai +2, jun +2, jul +3 ; B: mai 0, jul +3 → média (2+2+3+0+3)/5 = 2
  ["quanto tempo demoro para receber?", /2 dia\(s\) de atraso/, "média (2+2+3+0+3)/5"],
];

let pass = 0;
const fails: string[] = [];
for (const [q, re, calc] of CASES) {
  const r = responderLocal(q, input);
  if (r && re.test(r.resposta)) pass++;
  else fails.push(`✗ "${q}"  esperava ${re} (${calc})\n     → ${r ? r.resposta.slice(0, 110) : "NULL"}`);
}
for (const f of fails) console.log(f);
console.log(`\n${fails.length === 0 ? "✓ TODOS" : `✗ ${fails.length} FALHA(S)`} — ${pass}/${CASES.length} valores corretos`);
if (fails.length > 0) process.exit(1);
