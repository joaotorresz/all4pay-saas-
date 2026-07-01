import { responderLocal } from "../src/core/assistant/engine.ts";
const mv=(o:any)=>({status:"pago",paid_date:o.due_date,party_id:null,category:null,...o});
const input:any={hoje:"2026-06-15",saldoAtual:42000,movements:[mv({id:"1",type:"saida",amount:5000,due_date:"2026-06-10",category:"fornecedor",party_id:"pF"}),mv({id:"2",type:"saida",amount:9000,due_date:"2026-06-11",category:"folha",party_id:"pG"}),mv({id:"3",type:"entrada",amount:12000,due_date:"2026-06-05",party_id:"pA"})],partyNames:{pF:"Textil SA",pG:"Folha Ltda",pA:"Aurora"}};
for(const q of ["quais meus maiores fornecedores?","para quem mais pago?","quantos clientes eu tenho?","quantos fornecedores?"]) console.log("Q:",q,"->", responderLocal(q,input,{} as any)?.resposta ?? "[null]");
