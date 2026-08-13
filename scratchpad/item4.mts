/** ITEM 4 — MEDIÇÃO: "Resultado do período — sem movimento" no /fluxo-caixa. */
import { readFileSync } from "node:fs";
import { resultado, janela as fazJanela } from "@/core/indicadores";
import { financialDRE } from "@/core/dre";
import type { RiskInput, RiskMovement } from "@/core/risk-engine/types";
const HOJE = "2026-08-13";
type G = [string,string,string,string,string|null,number,number];
const g = JSON.parse(readFileSync("scratchpad/base-joaov.json","utf8")) as G[];
const movements: RiskMovement[] = g.map(([t,s,c,mc,mx,v],i)=>({
  id:`g${i}`, type:t as "entrada"|"saida", status:s as "pendente"|"pago"|"cancelado",
  amount:v, due_date:`${mc}-01`, paid_date:mx?`${mx}-01`:null,
  category:c==="(sem categoria)"||c===""?null:c,
}));
const input: RiskInput = { hoje: HOJE, saldoAtual: -31000.16, movements };
const brl=(n:number)=>(n<0?"−":"")+Math.abs(n).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});

for (const dias of [30, 90]) {
  const fim = new Date(Date.parse(HOJE+"T00:00:00") + (dias-1)*864e5).toISOString().slice(0,10);
  const j = fazJanela(HOJE, fim, `Próximos ${dias} dias`);
  const r = resultado(input, j, "caixa");
  console.log(`\n== BaseDoSaldo · "Resultado do período" · janela ${HOJE}..${fim} (À FRENTE) ==`);
  console.log(r.indisponivel
    ? `INDISPONÍVEL — código ${r.indisponivel.codigo} · "${r.indisponivel.motivo}"`
    : brl(r.valor));
  const liq = movements.filter(m=>m.status==="pago" && (m.paid_date??"")>=HOJE && (m.paid_date??"")<=fim);
  console.log(`liquidados DENTRO da janela: ${liq.length}`);
}
// O vizinho na mesma tela: o DRE (competência), que olha para trás.
const dre = financialDRE(input, { preset: "12m", regime: "competencia" } as never);
console.log(`\n== O VIZINHO: DRE/waterfall na mesma tela ==`);
console.log(`Resultado líquido (competência, 12m): ${brl((dre as { gerencial?: { lucroLiquido?: number } }).gerencial?.lucroLiquido ?? NaN)}`);
