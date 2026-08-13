/** ITEM 7 — onde os R$ 35.000 do Aluguel somem entre o DRE e o fluxo de caixa. */
import { compararFluxo } from "@/core/cashflow/comparativo";
import { montarDRE } from "@/core/relatorios";
import type { RiskInput, RiskMovement } from "@/core/risk-engine/types";
const HOJE = "2026-08-13";
const mk = (id:string,amount:number,due:string,paid:string|null,status:"pago"|"cancelado",cat:string|null,desc:string): RiskMovement =>
  ({ id, type:"saida", status, amount, due_date:due, paid_date:paid, category:cat, party_id:desc } as RiskMovement);

// Os 13 lançamentos reais de Aluguel desta org.
const movements: RiskMovement[] = [
  mk("fk35000", 35000, "2026-06-11", "2026-06-12", "pago", "Aluguel", "123"),
  ...["2025-10-10","2025-11-10","2025-12-10","2026-01-10","2026-02-10","2026-03-10",
      "2026-04-10","2026-05-10","2026-06-10"].map((d,i)=>
      mk(`t${i}`, 9500, d, d, "pago", "Aluguel", "ALUGUEL IMOBILIARIA CENTRAL")),
  ...["2026-07-10","2026-08-10","2026-09-10"].map((d,i)=>
      mk(`c${i}`, 9500, d, null, "cancelado", "Aluguel", "ALUGUEL IMOBILIARIA CENTRAL")),
];
const input: RiskInput = { hoje: HOJE, saldoAtual: 0, movements, partyNames: {} };
const brl=(n:number)=>"R$"+n.toLocaleString("pt-BR",{minimumFractionDigits:2});

const dre = montarDRE(input, { intervalo:{de:"2025-09-01",ate:"2026-08-31"}, tipo:"vertical" });
const desp = dre.linhas.find(l=>l.id==="despesas_operacionais");
console.log(`DRE · Despesas Operacionais (12m): ${brl(desp?.total.valor ?? 0)}`);
const filho = desp?.filhos.find(f=>/aluguel/i.test(f.label));
console.log(`DRE · linha Aluguel            : ${brl(filho?.total.valor ?? 0)}`);

for (const dias of [90, 365]) {
  const c = compararFluxo(input, { dias });
  const cat = c.gastos.categorias ?? [];
  const alu = c.sankey.nodes.find(n=>/aluguel/i.test(n.name));
  console.log(`\nFluxo · ${dias}d · categorias: ${cat.join(", ") || "(nenhuma)"}`);
  console.log(`Fluxo · ${dias}d · nó Aluguel no "Para onde foi": ${brl(alu?.valor ?? 0)}`);
}
console.log(`\nsoma dos 9 não cancelados de 9.500 = ${brl(9*9500)}`);
console.log(`+ o de 35.000                      = ${brl(9*9500+35000)}`);
