/**
 * assistant-edge — guarda de CRASH-SAFETY da IA nativa.
 *
 * Dispara ~30 perguntas sobre 7 datasets DEGENERADOS (vazio, 1 movimento, tudo
 * cancelado, tudo pendente, datas futuras, saldo negativo, valores zero/negativo)
 * e exige que responderLocal NUNCA lance exceção e nunca devolva resposta vazia.
 * Falha (exit 1) em qualquer crash — protege contra divisão por zero, acesso a
 * [0] de array vazio, slice de data nula, etc. em entradas de borda.
 *
 *   npm run edge   (também roda dentro de npm test)
 */
import { responderLocal } from "@/core/assistant/engine";
import type { RiskInput, RiskMovement } from "@/core/risk-engine/types";
import type { ExecutiveContext } from "@/core/executive/types";

const HOJE = "2026-07-15";
let seq = 0;
const mk = (o: Partial<RiskMovement>): RiskMovement =>
  ({ id: `m${seq++}`, type: "entrada", amount: 1000, due_date: HOJE, paid_date: HOJE, status: "pago", category: "Vendas", party_id: null, ...o }) as RiskMovement;

const ctx = { saldoAtual: 0, runwayMeses: 0, burnRate: 0, inadimplencia: 0, scoreFinanceiro: 0, probRuptura: 1, receitaMensal: 0, despesaMensal: 0 } as unknown as ExecutiveContext;

const bases: [string, RiskInput][] = [
  ["vazio", { hoje: HOJE, saldoAtual: 0, partyNames: {}, movements: [] } as RiskInput],
  ["1 movimento", { hoje: HOJE, saldoAtual: 1000, partyNames: { A: "A" }, movements: [mk({ party_id: "A" })] } as RiskInput],
  ["tudo cancelado", { hoje: HOJE, saldoAtual: 0, partyNames: {}, movements: [mk({ status: "cancelado" }), mk({ type: "saida", status: "cancelado" })] } as RiskInput],
  ["tudo pendente", { hoje: HOJE, saldoAtual: 0, partyNames: { A: "A" }, movements: [mk({ status: "pendente", paid_date: null, party_id: "A" }), mk({ type: "saida", status: "pendente", paid_date: null })] } as RiskInput],
  ["datas futuras", { hoje: HOJE, saldoAtual: 5000, partyNames: { A: "A" }, movements: [mk({ paid_date: "2027-01-01", due_date: "2027-01-01", party_id: "A" })] } as RiskInput],
  ["saldo negativo", { hoje: HOJE, saldoAtual: -9999, partyNames: {}, movements: [mk({ type: "saida", amount: 5000 })] } as RiskInput],
  ["amount zero/neg", { hoje: HOJE, saldoAtual: 0, partyNames: { A: "A" }, movements: [mk({ amount: 0, party_id: "A" }), mk({ type: "saida", amount: -100 })] } as RiskInput],
];

const PERGUNTAS = [
  "qual meu saldo?", "quanto gastei esse mês?", "quanto recebi?", "qual minha margem?", "estou crescendo?",
  "qual meu ponto de equilíbrio?", "dependo de algum cliente?", "meus clientes pagam em dia?", "pago em dia?",
  "quanto cada cliente me rende?", "quanto gasto por dia?", "qual foi meu melhor mês?", "quando vou ficar sem dinheiro?",
  "quem está me devendo?", "quanto tenho a receber?", "quanto tenho a pagar?", "qual meu maior cliente?",
  "quais meus maiores fornecedores?", "onde economizar?", "qual meu maior gasto?", "qual meu runway?",
  "meu score?", "resumo do dia", "resumo do mês", "qual meu ticket médio?", "quantos clientes tenho?",
  "posso gastar 5 mil?", "previsão do mês", "quanto vence essa semana?", "qual foi meu pior mês?",
  // intents novos (métricas) — também precisam ser crash-safe nos degenerados
  "qual meu EBITDA?", "qual minha receita líquida?", "qual meu fluxo de caixa livre?",
  "qual minha carga tributária?", "quanto a folha pesa na receita?", "recebo mais de produto ou serviço?",
  "qual o total que já entrou?", "quanto vou receber mês que vem?", "quanto vou receber semana que vem?",
  "como foi meu semestre?", "quantos dias de caixa?", "quanto entra vs sai?", "quanto recebi da A em maio?",
  // calculadoras (sem/ com números degenerados) — não podem quebrar nem dar NaN
  "quanto fica a parcela de um empréstimo", "que preço vender com margem de 30%", "quantas unidades pra empatar",
  "quanto provisionar de 13º", "quanto rende guardar por mês", "em quanto tempo recupero", "vale a pena antecipar",
  "quanto é 2% ao mês ao ano", "0 com 50% de desconto", "empréstimo de 0 em 0x a 0%",
  "quanto pago de simples nacional com faturamento de 0 por ano", "qual meu DAS no anexo III",
  "quanto pago de simples nacional?",
];

let problemas = 0;
let ok = 0;
for (const [nome, inp] of bases) {
  for (const q of PERGUNTAS) {
    try {
      const r = responderLocal(q, inp, ctx);
      if (r && (typeof r.resposta !== "string" || r.resposta.length === 0)) { problemas++; console.log(`✗ resposta vazia: [${nome}] "${q}"`); }
      else ok++;
    } catch (e) { problemas++; console.log(`✗ CRASH: [${nome}] "${q}" → ${(e as Error).message}`); }
  }
}
console.log(`\n${problemas === 0 ? "✓ SEM CRASHES" : `✗ ${problemas} problema(s)`} — ${ok} chamadas OK sobre ${bases.length} datasets degenerados × ${PERGUNTAS.length} perguntas`);
if (problemas > 0) process.exit(1);
