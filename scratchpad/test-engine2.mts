import { responderLocal } from "../src/core/assistant/engine.ts";
const hoje = "2026-06-15";
const mv = (o:any) => ({ status: "pago", paid_date: o.due_date, party_id: null, category: null, costCenter: null, ...o });
const movements:any[] = [
  mv({ id:"1", type:"entrada", amount:12000, due_date:"2026-06-05", category:"venda", party_id:"pA" }),
  mv({ id:"2", type:"entrada", amount:8000, due_date:"2026-06-12", category:"venda", party_id:"pB" }),
  mv({ id:"3", type:"saida", amount:5000, due_date:"2026-06-10", category:"fornecedor", party_id:"pF", costCenter:"Operações" }),
  mv({ id:"4", type:"saida", amount:9000, due_date:"2026-06-11", category:"folha", costCenter:"Administrativo" }),
  mv({ id:"5", type:"saida", amount:1500, due_date:"2026-06-13", category:"marketing", costCenter:"Comercial" }),
  { id:"6", type:"entrada", status:"pendente", amount:4000, due_date:"2026-06-25", paid_date:null, category:"venda", party_id:"pA" },
  { id:"7", type:"saida", status:"pendente", amount:3000, due_date:"2026-06-20", paid_date:null, category:"imposto" },
];
const input:any = { hoje, saldoAtual: 42000, movements, partyNames: { pA:"Aurora Varejo", pB:"Atlas Cloud", pF:"Fornecedor Textil" } };
const ctx:any = { saldoAtual:42000, runwayMeses:4, burnRate:9500, scoreFinanceiro:72, receitaMensal:20000, despesaMensal:15500, margemOperacional:0.22, inadimplencia:0.08, probRuptura:0.18, concentracao:[], clientesRisco:[] };
const perguntas = [
  "quanto recebi da Aurora Varejo?",
  "quanto paguei pro Fornecedor Textil?",
  "qual meu maior gasto esse mês?",
  "gastos por centro de custo",
  "quanto vai sobrar esse mês?",
  "quando é meu próximo pagamento?",
  "qual meu próximo recebimento?",
  "maiores gastos",  // deve continuar caindo em categorias
];
for (const q of perguntas) { const r = responderLocal(q, input, ctx); console.log("Q:", q, "\n   ->", r ? r.resposta : "[null]"); }
