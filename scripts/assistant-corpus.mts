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
  // 15ª rodada (cont.): mix de receita produto×serviço (não comparação de meses);
  // "vendi mais em maio ou junho" segue como comparação MENSAL.
  ["recebo mais de produto ou serviço?", /de produtos e .* de serviços/i],
  ["vendo mais produto ou serviço?", /de produtos e .* de serviços/i],
  ["vendi mais em maio ou junho?", /em maio e .* em junho|comparação/i],
  // 16ª rodada: risco de insolvência → ruptura; "resumo geral/finanças no geral" → saúde
  ["tem risco de eu quebrar?", /ruptura|caixa cresceu|queima|acabar/i],
  ["tô perto de ficar sem dinheiro?", /ruptura|caixa cresceu|queima|acabar/i],
  ["me dá um resumo geral", /sa[úu]de financeira|score/i],
  ["como estão minhas finanças no geral?", /sa[úu]de financeira|score/i],
  // 16ª rodada (cont.): tendência/melhorando → crescimento; representatividade →
  // concentração; total acumulado (histórico) → novo intent.
  ["qual a tendência da minha receita?", /crescendo|caindo|est[áa]vel|receita est/i],
  ["estou melhorando ou piorando?", /crescendo|caindo|est[áa]vel|receita est/i],
  ["quanto cada cliente representa?", /concentra|depende|maior cliente/i],
  ["qual o total que já entrou?", /No total você já recebeu/i],
  ["qual o total que já saiu?", /No total você já pagou/i],
  ["quanto movimentei no total?", /No total você movimentou/i],
  // 17ª rodada: janela FUTURA — "vou receber/pagar mês que vem" = pendentes do
  // mês seguinte (não o realizado do mês corrente).
  ["quanto vou receber mês que vem?", /mês que vem você tem .* a receber|previsto/i],
  ["quanto vou pagar mês que vem?", /mês que vem você tem .* a pagar|previsto/i],
  ["quanto vou receber próximo mês?", /mês que vem você tem .* a receber|previsto/i],
  // 17ª rodada (cont.): trimestre/semestre = janela TRAILING (últimos 3/6 meses),
  // não o trimestre calendário (que no começo do período fica quase todo futuro);
  // "vou gastar mês que vem" = pagáveis do mês seguinte.
  ["como foi meu semestre?", /no semestre entraram/i],
  ["quanto entrou no trimestre?", /no trimestre/i],
  ["quanto vou gastar mês que vem?", /mês que vem você tem .* a pagar|previsto|Nada previsto/i],
  // 17ª rodada (cont.): comparação de CUSTOS (não só gasto/receita); "quem compra
  // mais comigo" (ordem do verbo) → maior cliente.
  ["meus custos subiram?", /vs\.|queda|aument|gastou/i],
  ["quem compra mais comigo?", /maior cliente|cliente/i],
  // 18ª rodada: fraseados de saldo/caixa que caíam no fallback
  ["e o caixa, como tá?", /saldo consolidado/i],
  ["tenho folga no caixa?", /saldo consolidado/i],
  // 18ª rodada (cont.): receita líquida nativa (bruta − impostos), antes da receita genérica
  ["qual minha receita líquida?", /receita líquida/i],
  ["quanto é minha receita após os impostos?", /receita líquida/i],
  // carga tributária (% da receita em impostos)
  ["qual minha carga tributária?", /carga tributária/i],
  ["quanto de imposto pago sobre a receita?", /carga tributária/i],
  // EBITDA como NÚMERO (motor), não conceito — a KB só explica "o que é EBITDA"
  ["qual meu EBITDA?", /Seu EBITDA/i],
  ["quanto é meu EBITDA esse mês?", /Seu EBITDA/i],
  // sinônimos → categoria: pessoal→Folha, luz→Utilidades
  ["qual meu gasto com pessoal?", /Folha|gastou/i],
  ["quanto gasto com funcionários?", /Folha|gastou/i],
  // fluxo de caixa livre como NÚMERO (motor)
  ["qual meu fluxo de caixa livre?", /fluxo de caixa livre/i],
  ["qual meu FCF?", /fluxo de caixa livre/i],
  // runway em DIAS
  ["quantos dias de caixa eu tenho?", /dias de operação|runway/i],
  // peso de uma categoria na receita (estrutura de custo)
  ["quanto a folha pesa na receita?", /representa .* da sua receita/i],
  ["qual a proporção de marketing na receita?", /representa .* da sua receita/i],
  // entra vs sai → resumo; receita/faturamento "pelados"
  ["quanto entra vs quanto sai?", /entraram .* e saíram/i],
  ["entrada vs saída?", /entraram .* e saíram/i],
  ["qual minha receita?", /recebeu|receita/i],
  ["qual meu faturamento?", /recebeu|receita/i],
  // por contraparte com período (escopa a janela)
  ["quanto recebi da Beta em maio?", /Com Beta em maio/i],
  // faturamento com moldura de TENDÊNCIA → crescimento (não o valor pelado)
  ["meu faturamento subiu ou caiu?", /crescendo|caindo|est[áa]vel|receita est/i],
  ["meu faturamento aumentou?", /crescendo|caindo|est[áa]vel|receita est/i],
  // janela futura de SEMANA (além do mês que vem)
  ["quanto vou receber semana que vem?", /na semana que vem|previsto/i],
  ["quanto vou pagar próxima semana?", /na semana que vem.* a pagar|previsto/i],
  // fraseados extras dos intents novos (robustez de roteamento)
  ["me mostra o ebitda", /EBITDA/i],
  ["quanto vai de imposto na receita", /carga tributária/i],
  ["quanto os impostos pesam na receita", /representa .* da sua receita|carga/i],
  ["total geral que entrou", /já recebeu/i],
  ["meu fluxo livre", /fluxo de caixa livre/i],
  // 19ª rodada: gírias/coloquial de saldo, a pagar, gastos e resultado
  ["cadê minha grana", /saldo consolidado/i],
  ["quanto de dindin eu tenho", /saldo consolidado/i],
  ["quem eu preciso pagar", /a pagar/i],
  ["quais boletos tenho", /a pagar/i],
  ["com o que eu mais torro dinheiro", /maiores gastos/i],
  ["fechei no positivo", /sobrou|azul|entraram/i],
  // afordabilidade com valor — investimento (substantivo), aguento, tirar pró-labore
  ["cabe um investimento de 20 mil?", /cabe|Cuidado|folga/i],
  ["aguento uma despesa de 3 mil?", /cabe|Cuidado|folga/i],
  ["posso tirar 5 mil de pró-labore?", /cabe|Cuidado|folga/i],
  // comandos/requisições
  ["quero ver meus clientes", /maior cliente|cliente/i],
  ["abre meus pagamentos", /a pagar/i],
  // simulador de empréstimo/financiamento (capacidade nova)
  ["quanto fica a parcela de um empréstimo de 50 mil em 12x a 2% ao mês?", /parcela fixa de|Price/i],
  ["simular financiamento de 100 mil em 24x a 1,5% ao mês", /parcela fixa de|Price/i],
  ["parcelar 3 mil em 10 vezes", /parcelamento .* SEM juros|parcela/i],
  // precificação (margem × markup)
  ["que preço vender um produto de custo 100 com margem de 30%?", /venda por|markup/i],
  ["custo 100 com markup de 30%, qual o preço?", /preço|MARGEM/i],
  ["qual a margem se custo 100 e vendo por 150?", /margem de|markup/i],
  // investimento: valor futuro + payback
  ["quanto rende guardar 1000 por mês a 1% ao mês em 12 meses?", /vira R\$|montante|juros/i],
  ["em quanto tempo recupero um investimento de 20 mil que rende 2 mil por mês?", /se paga|payback|meses/i],
  // antecipação de recebíveis
  ["vale a pena antecipar 10 mil que vence em 2 meses a 3% ao mês?", /cai R\$|antecipando|custo/i],
  // conversão de taxa mensal↔anual
  ["quanto é 2% ao mês em juros ao ano?", /ao ANO|equivale/i],
  ["converter 30% ao ano para mensal", /ao MÊS|equivale/i],
  // desconto / acréscimo sobre um valor
  ["quanto fica 200 com 15% de desconto?", /desconto fica R\$ 170|170/i],
  ["quanto é 200 mais 10%?", /acréscimo fica R\$ 220|220/i],
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
