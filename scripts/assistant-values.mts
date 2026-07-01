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
  // crescimento: jul rec 10000 vs jun rec 20000 → -50%
  ["estou crescendo?", /-50%/, "(10000-20000)/20000"],
  // burn diário: últimos 30 dias (16/06–15/07) só 07-08 Marketing 6000 → 6000/30 = 200/dia
  ["quanto gasto por dia?", /R\$.?200 por dia/, "6000 / 30"],
  // gasto categoria: Marketing jul = 6000
  ["quanto gastei com marketing?", /6\.000/, "Marketing julho"],
  // receita por fonte: Servicos jul = 4000
  ["quanto recebi de servicos?", /4\.000/, "Servicos julho (B)"],
  // pagamento em dia: F/G pagos na data de vencimento → em dia, 100% no prazo
  ["pago minhas contas em dia?", /em dia/, "todos paid_date = due_date"],
  // média mensal de gasto: (10000+20000+6000)/3 = 12000
  ["qual meu gasto médio mensal?", /12\.000/, "média (10000+20000+6000)/3"],
  // maior gasto individual jul = 6000 (Marketing)
  ["qual foi meu maior gasto?", /6\.000/, "Marketing 6000"],
  // concentração 6m: só 2 clientes (A,B) → top 3 = 100%
  ["dependo de algum cliente?", /100%/, "top3 = A+B = 100% (2 clientes)"],
  // pontualidade recebimento: 5 títulos, só 1 no prazo (B mai) → 20%
  ["quanto tempo demoro para receber?", /20% (foram|dos)/, "1 de 5 no prazo"],
  // pagamento em dia: F/G pagos na data → 100% no prazo
  ["pago minhas contas em dia?", /100% no prazo/, "todos paid = due"],
  // maior recebimento individual jul = 6000 (A)
  ["qual meu maior recebimento?", /6\.000/, "A 6000 em julho"],
  // quantos clientes: A e B têm entrada → 2
  ["quantos clientes eu tenho?", /\b2\b/, "A, B distintos"],
  // receita por fonte Vendas jul = 6000 (A)
  ["quanto recebi de vendas?", /6\.000/, "Vendas julho (A)"],
  // previsão do mês (jul): realizado rec 10000 - desp 6000, sem pendentes → sobra 4000
  ["qual a previsão do mês?", /4\.000/, "10000 - 6000, sem pendentes"],
  // maior fornecedor jul = G (Mkt) 6000
  ["quais meus maiores fornecedores?", /6\.000/, "Mkt (G) 6000 em julho"],
  // comparação de gasto mai(10000) vs jun(20000) → mais em junho
  ["gastei mais em maio ou junho?", /junho/, "mai 10000 < jun 20000"],
  // total acumulado (histórico): entradas 20000+10000+20000+6000+4000 = 60000
  ["qual o total que já entrou?", /já recebeu R\$.?60\.000/, "Σ entradas pagas = 60000"],
  // saídas 10000+20000+6000 = 36000
  ["qual o total que já saiu?", /já pagou R\$.?36\.000/, "Σ saídas pagas = 36000"],
  // movimentado = 60000 + 36000 = 96000
  ["quanto movimentei no total?", /movimentou R\$.?96\.000/, "60000 + 36000"],
  // trimestre TRAILING (mai–jul): entradas 30000+20000+10000 = 60000
  ["quanto entrou no trimestre?", /R\$.?60\.000 no trimestre/, "trailing mai+jun+jul entradas"],
  // semestre TRAILING (fev–jul = todo o dataset): entraram 60000
  ["como foi meu semestre?", /No semestre entraram R\$.?60\.000/, "trailing 6m entradas = 60000"],
  // produto vs serviço no mês (jul): produtos (Vendas A) 6000 vs serviços (B) 4000
  ["recebo mais de produto ou serviço?", /R\$.?6\.000 de produtos e R\$.?4\.000 de serviços/, "jul: Vendas 6000 x Servicos 4000"],
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
