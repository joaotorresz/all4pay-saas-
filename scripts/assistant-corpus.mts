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
  // status pago / plural / lucrei / previsão coloquial
  ["tá tudo pago?", /a pagar|em dia|nada/i], ["quem são meus melhores clientes?", /maior cliente|clientes/i],
  ["quanto lucrei esse mês?", /sobrou|lucro|resultado|margem/i], ["vou fechar o mês no positivo?", /previs|sobrar|proje|fim do m[êe]s/i],
  // "onde vai o dinheiro" / categoria plural-tolerante / cortar / investir
  ["onde vai meu dinheiro?", /gast|despes|categoria|Fornecedor|Impostos/i], ["quais categorias eu mais gasto?", /gast|categoria|Fornecedor|Impostos/i],
  ["preciso cortar gastos?", /economiz|cortar|controlados/i], ["quanto tenho pra investir?", /folga|cabe|gastar/i],
  ["quanto de imposto eu pago?", /Impostos/i],
  // 6ª rodada: números do mês / grana / onde gasto / lucrativo / paga mais / dívida
  ["me dá os números do mês", /m[êe]s|resultado|entr|receb/i], ["como tá a grana?", /saldo/i],
  ["to gastando muito com o quê?", /gast|Fornecedor|Impostos|Folha/i], ["qual despesa mais pesa?", /gast|maior|Fornecedor|Impostos|Folha/i],
  ["meu negócio é lucrativo?", /sobrou|resultado|azul|vermelho|lucro|margem/i], ["quem me paga mais?", /maior cliente|quem mais/i],
  ["tenho muita dívida?", /a pagar|d[íi]vida/i], ["qual meu custo fixo?", /gast|maior|Fornecedor|Folha|Impostos/i],
  // 7ª rodada: finanças / ainda receber / qual cliente compra / perdendo / conseguindo pagar
  ["e aí, como tão as finanças?", /saldo|sa[úu]de|score|resultado/i], ["quanto ainda vou receber?", /a receber/i],
  ["qual cliente compra mais?", /maior cliente|quem mais/i], ["to perdendo dinheiro?", /sobrou|resultado|vermelho|preju|margem|perdendo/i],
  ["to conseguindo pagar as contas?", /previs|proje|conseguir|sobrar|a pagar/i],
  // 8ª rodada: imperativos / gastos fixos / vou ter que pagar / fluxo / to devendo
  ["quais meus gastos fixos?", /gast|despes|Folha|Fornecedor/i], ["quanto vou ter que pagar?", /a pagar/i],
  ["mostra o fluxo de caixa", /entr|sa[íi]|resultado|m[êe]s/i], ["quanto to devendo?", /a pagar|d[íi]vida/i],
  // 9ª rodada: contas em dia / total que entrou / to indo bem
  ["minhas contas tão em dia?", /a pagar|vencid|em dia|nada/i], ["me diz o total que entrou", /receb|entr/i],
  ["to indo bem?", /score|sa[úu]de|saldo|resultado/i],
  // 10ª rodada: situação do caixa / vou quebrar / resumo financeiro / reserva / fluxo positivo
  ["qual a situação do caixa?", /saldo|caixa/i], ["vou quebrar?", /ruptura|dura|não se esgota|limite|acabar/i],
  ["me dá o resumo financeiro", /entr|sa[íi]|sobrou|resultado|receb|gast/i], ["tenho reserva suficiente?", /folga|reserva|cabe|saldo/i],
  ["meu fluxo tá positivo?", /entr|sa[íi]|sobrou|resultado|azul|vermelho/i],
  // 11ª rodada: maior problema / gastos aumentaram / vou pagar de conta / entra e sai
  ["qual meu maior problema financeiro?", /score|sa[úu]de|risco|vencid|inadimpl/i], ["meus gastos aumentaram?", /gast|aument|comparad|vs|receb|alta|queda/i],
  ["quanto vou pagar de conta?", /a pagar/i], ["quanto entra e sai por mês?", /entr|sa[íi]|resultado|m[êe]s/i],
  // 12ª rodada: explicar números / desempenho / ganhando / meus gastos / pior cliente / reservado
  ["me explica meus números", /entr|sa[íi]|resultado|saldo|receb|gast/i], ["qual meu desempenho esse mês?", /sobrou|resultado|receb|m[êe]s|margem/i],
  ["tô ganhando dinheiro?", /sobrou|resultado|lucro|margem|azul/i], ["me diz meus gastos", /gast|despes/i],
  ["quanto custa manter a empresa?", /gast|despes|custo/i], ["qual meu pior cliente?", /vencid|devedor|em dia|risco/i],
  ["quanto tá reservado?", /saldo|reserva|folga/i],
  // 13ª rodada: maior fonte de receita / poupar / contratar
  ["qual minha maior fonte de receita?", /receita|Vendas|Servicos|origem|vem/i], ["to conseguindo poupar?", /sobrou|resultado|folga|saldo/i],
  ["me diz se posso contratar alguém", /cabe|folga|gastar|saldo|runway/i],
  // 14ª rodada: "faturo médio" = receita (não gasto) — misroute pego no probe
  ["quanto eu faturo por mês na média?", /m[ée]dia de receita/i],
  ["qual meu faturamento médio mensal?", /m[ée]dia de receita/i],
  ["em média quanto faturo?", /m[ée]dia de receita/i],
  // 14ª rodada (cont.): "quanto ENTRA de {cat}" = receita da categoria, mesmo
  // quando existe uma despesa com o mesmo nome (guarda de direção no gasto-cat).
  ["quanto entra de Vendas?", /receb\w* .*de Vendas|receita/i],
  ["quanto recebo de vendas?", /receb\w* .*de Vendas|receita/i],
  ["quanto gastei com marketing?", /gastou .*Marketing/i],
  // 14ª rodada (cont.): "maiores FORNECEDORES" não pode virar "maior cliente";
  // "qual fornecedor custa mais" tinha caído no fallback.
  ["quem são meus maiores fornecedores?", /fornecedor/i],
  ["qual fornecedor custa mais?", /fornecedor/i],
  ["quem me paga mais?", /maior cliente|cliente/i],
  // 14ª rodada (cont.): "saúde da empresa" caía no fallback (exigia "saúde financeira")
  ["qual a saúde da empresa?", /sa[úu]de financeira|score/i],
  ["como está a saúde do meu negócio?", /sa[úu]de financeira|score/i],
  // 15ª rodada: "pagamento/boleto vencido" = A PAGAR (não inadimplência de recebível);
  // "mais prejuízo" = PIOR mês (não o resultado do mês corrente).
  ["tenho pagamento vencido?", /a pagar/i],
  ["tenho boleto vencido?", /a pagar/i],
  ["tenho conta atrasada pra pagar?", /a pagar/i],
  ["qual mês tive mais prejuízo?", /pior m[êe]s/i],
  ["em que mês lucrei menos?", /pior m[êe]s/i],
  // 15ª rodada (cont.): cobertura de verbo/frase que caía no fallback
  ["qual cliente comprou mais?", /maior cliente|cliente/i],
  ["o que eu mais pago?", /maiores gastos|gast/i],
  ["qual categoria mais pesa no bolso?", /maiores gastos|gast/i],
  // 15ª rodada (cont.): "quantos FORNECEDORES" é CONTAGEM, não gasto com a
  // categoria homônima "Fornecedores" ("quanto" ⊂ "quantos").
  ["quantos fornecedores eu tenho?", /fornecedor\(es\) com movimento|contrapart/i],
  ["quanto gastei com fornecedores?", /gastou .*Fornecedores/i],
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
