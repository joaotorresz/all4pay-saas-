/**
 * assistant-corpus — guarda de regressão do ROTEAMENTO da IA nativa.
 *
 * Dispara ~70 frases pt-BR (formais + coloquiais) em `responderLocal` sobre um
 * dataset determinístico e exige que cada uma caia no intent certo (a resposta
 * casa a regex esperada). Falha (exit 1) em qualquer misroute — inclui as
 * variações coloquiais que já quebraram antes ("qual meu caixa?", "tô lucrando?",
 * "quando meu dinheiro acaba?", "pra quem eu mais pago?"…).
 *
 *   npm run corpus
 *
 * O motor só tem `import type`, então roda com --experimental-strip-types sem
 * loader de alias.
 */
import { responderLocal } from "@/core/assistant/engine";
import type { RiskInput, RiskMovement } from "@/core/risk-engine/types";
import type { ExecutiveContext } from "@/core/executive/types";

const HOJE = "2026-07-15";
let seq = 0;
const mk = (o: Partial<RiskMovement>): RiskMovement =>
  ({ id: `m${seq++}`, type: "entrada", amount: 1000, due_date: HOJE, paid_date: HOJE, status: "pago", category: "Vendas", party_id: null, ...o }) as RiskMovement;

const movs: RiskMovement[] = [];
for (const [m, rec, desp] of [["03", 18000, 12000], ["04", 17000, 14000], ["05", 22000, 12500], ["06", 21000, 15000], ["07", 12000, 8000]] as [string, number, number][]) {
  movs.push(mk({ type: "entrada", amount: rec * 0.6, paid_date: `2026-${m}-05`, due_date: `2026-${m}-01`, party_id: "A", category: "Vendas" }));
  movs.push(mk({ type: "entrada", amount: rec * 0.4, paid_date: `2026-${m}-12`, due_date: `2026-${m}-10`, party_id: "B", category: "Servicos" }));
  ["Impostos", "Fornecedores", "Folha", "Marketing"].forEach((cat, idx) =>
    movs.push(mk({ type: "saida", amount: desp / 4, paid_date: `2026-${m}-08`, due_date: `2026-${m}-07`, party_id: `F${idx}`, category: cat })));
}
movs.push(mk({ type: "entrada", amount: 5000, status: "pendente", paid_date: null, due_date: "2026-07-20", party_id: "C" }));
movs.push(mk({ type: "saida", amount: 3000, status: "pendente", paid_date: null, due_date: "2026-07-22", party_id: "F0" }));

const input: RiskInput = {
  hoje: HOJE, saldoAtual: 45000,
  partyNames: { A: "Loja Alpha", B: "Beta", C: "Gama", F0: "Uno", F1: "Dois", F2: "Tres", F3: "Quatro" },
  movements: movs,
} as RiskInput;

// ctx como em produção (AssistantWidget passa intel.context) — cobre os intents
// gateados por ctx (score/saúde, burn).
const ctx = { saldoAtual: 45000, runwayMeses: 8, burnRate: 6000, inadimplencia: 0.08, scoreFinanceiro: 72, probRuptura: 0.12, receitaMensal: 18000, despesaMensal: 12000 } as unknown as ExecutiveContext;

// [pergunta, regex que a resposta CERTA deve casar]
const CORPUS: [string, RegExp][] = [
  // saldo
  ["qual meu saldo?", /saldo/i], ["qual meu caixa?", /saldo/i], ["quanto de dinheiro eu tenho?", /saldo/i], ["quanta grana eu tenho?", /saldo/i],
  // gasto / receita
  ["quanto gastei esse mês?", /gastou/i], ["quanto torrei esse mês?", /gastou/i], ["quanto recebi esse mês?", /recebeu/i], ["qual meu faturamento?", /receb|fatur/i],
  // a receber / pagar
  ["quanto tenho a receber?", /a receber/i], ["quanto o pessoal me deve?", /a receber|devedor|vencidos/i], ["quanto tenho a pagar?", /a pagar/i], ["quais minhas dívidas?", /a pagar/i],
  // inadimplência
  ["quem tá me devendo?", /vencid|devedor|em dia/i], ["tem cliente atrasado?", /vencid|devedor|em dia|atras/i],
  // margem / resultado / crescimento
  ["qual minha margem?", /margem/i], ["tô lucrando?", /margem|sobrou|resultado|azul|vermelho/i], ["quanto sobrou esse mês?", /sobrou|entraram/i],
  ["estou crescendo?", /receita está/i], ["minhas vendas tão crescendo?", /receita está|cresc/i], ["tô vendendo mais que mês passado?", /receita está|cresc|vs\./i],
  // ponto de equilíbrio
  ["qual meu ponto de equilíbrio?", /equil[íi]brio/i], ["qual meu break even?", /equil[íi]brio/i], ["quanto preciso faturar pra empatar?", /equil[íi]brio/i],
  // ruptura / runway
  ["quando vou ficar sem dinheiro?", /ruptura|dura|acabar|não se esgota|limite/i], ["quando meu dinheiro acaba?", /ruptura|dura|acabar|não se esgota|limite/i],
  ["qual meu runway?", /runway|f[ôo]lego|ilimitado|dura/i], ["até quando meu caixa aguenta?", /runway|dura|ruptura|meses|aguenta/i],
  // melhor / pior mês
  ["qual foi meu melhor mês?", /melhor mês/i], ["qual foi meu mês mais forte?", /melhor mês|mês/i], ["em que mês vendi mais?", /melhor mês|mês/i], ["qual foi meu pior mês?", /pior mês/i],
  // concentração / clientes / fornecedores
  ["dependo de algum cliente?", /concentra|depende/i], ["tô dependente de algum cliente?", /concentra|depende/i],
  ["quem é meu melhor cliente?", /maior cliente/i], ["quais meus maiores fornecedores?", /fornecedor/i], ["pra quem eu mais pago?", /fornecedor/i],
  // categoria específica
  ["quanto gastei com marketing?", /Marketing/i], ["quanto paguei de imposto?", /Impostos/i],
  // pontualidade
  ["meus clientes pagam em dia?", /Seus clientes pagam/i], ["quanto meus clientes atrasam?", /clientes pagam|atraso|prazo/i], ["meus clientes são pontuais?", /clientes pagam|prazo|atraso/i],
  ["pago minhas contas em dia?", /Você paga/i],
  // LTV / burn diário / média
  ["quanto cada cliente me rende?", /Cada cliente rende/i], ["recebo em média por cliente?", /Cada cliente rende/i], ["quanto gasto por dia?", /por dia|gasta em média/i], ["qual meu gasto médio mensal?", /m[ée]dia|hist[óo]rico/i],
  // economizar
  ["onde posso economizar?", /economizar|cortar|controlados/i], ["onde dá pra cortar custo?", /economizar|cortar|controlados/i],
  // afordabilidade (mil)
  ["posso gastar 5.000?", /cabe|folga|5\.000/i], ["posso gastar 8 mil?", /cabe|folga|8\.000/i], ["dá pra investir 20 mil?", /cabe|folga|20\.000/i],
  // vencimentos / próximos / contraparte / individual
  ["o que vence essa semana?", /vencem|vence|nada vence/i], ["o que tá pra vencer?", /vencem|vence|a vencer|nada/i],
  ["qual meu próximo pagamento?", /pr[óo]ximo|pagar|vence/i], ["qual foi meu maior gasto?", /maior gasto/i], ["qual minha maior venda?", /maior recebiment|maior/i],
  ["quanto a Loja Alpha me pagou?", /Loja Alpha/i], ["gastei mais em maio ou junho?", /maio|junho/i],
  // janelas
  ["quanto gastei nos últimos 3 meses?", /últimos 3 meses|gastou/i], ["o que vence em julho?", /julho|vencem|nada vence/i],
  // resumo
  ["me dá um resumo do dia", /Hoje|resumo/i], ["me faz um resumo do mês", /m[êe]s|resultado|entr/i],
  // score / saúde (gateados por ctx)
  ["qual a saúde financeira?", /sa[úu]de|score/i], ["minha empresa tá saudável?", /sa[úu]de|score/i],
  // afordabilidade coloquial
  ["compensa gastar 3 mil?", /cabe|folga|3\.000/i], ["tenho dinheiro pra 15 mil?", /cabe|folga|15\.000/i],
  // vencimentos/pagar timeframe
  ["o que preciso pagar essa semana?", /vencem|pagar|vence|nada/i], ["qual conta vence primeiro?", /pr[óo]xim|vence|vencem/i],
  // como foi mês nomeado
  ["como foi junho?", /junho/i], ["como foi o dia?", /Hoje|resumo/i],
];

let pass = 0;
const fails: string[] = [];
for (const [q, re] of CORPUS) {
  const r = responderLocal(q, input, ctx);
  if (r && re.test(r.resposta)) pass++;
  else { fails.push(`✗ "${q}"  → ${r ? r.resposta.slice(0, 90) : "NULL (sem intent → Claude)"}`); }
}
for (const f of fails) console.log(f);
console.log(`\n${fails.length === 0 ? "✓ TODAS" : `✗ ${fails.length} FALHA(S)`} — ${pass}/${CORPUS.length} frases rotearam ao intent esperado`);
if (fails.length > 0) process.exit(1);
