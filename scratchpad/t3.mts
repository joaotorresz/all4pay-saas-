import { responderLocal } from "../src/core/assistant/engine.ts";
const input:any = { hoje:"2026-06-15", saldoAtual:42000, movements:[{id:"1",type:"entrada",status:"pago",amount:12000,due_date:"2026-06-05",paid_date:"2026-06-05",party_id:"pA",category:"venda"}], partyNames:{pA:"Aurora Varejo"} };
const r = responderLocal("mostre a ficha da Aurora Varejo", input, {} as any);
console.log(r ? r.resposta + " | contatoId=" + (r as any).contatoId : "[null]");
