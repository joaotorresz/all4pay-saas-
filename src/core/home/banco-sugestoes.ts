/**
 * O BANCO AMPLIADO DE PERGUNTAS DA QUATTRO AI (16/10/2026, pedido do dono).
 *
 * As 47 perguntas de `./sugestoes` foram escritas para a HOME: poucas, e cada
 * uma com a regra que a faz aparecer. O "Veja tudo o que eu faço" do chat
 * precisa de outra coisa — mostrar o sistema INTEIRO, um pouco de cada vez, e
 * trocar a cada pergunta respondida (`./rodizio`). Estas 130 saem de uma
 * varredura das telas (o inventário de rotas): caixa e bancos, resultado e
 * contabilidade, impostos, receber e cobrar, pagar e comprar, folha, vendas e
 * maquininha, receita recorrente, simuladores, risco e operação.
 *
 * ⚠️ Nenhuma tem regra nem base: na Home elas não aparecem sozinhas. Só sobem
 * para lá quando a pessoa as usa no chat (o clique soma peso, como em qualquer
 * sugestão) — é assim que a Home aprende com o chat sem que o chat a encha.
 *
 * Cada linha: id · pergunta inteira · tema · rótulo curto do chip · ícone do DS.
 * As regras de forma (id e texto únicos, rótulo até 24 letras, ícone existente,
 * rótulos distintos por público) são as MESMAS do catálogo, cobradas pela
 * guarda `npm run home-sugestoes`.
 */

import type { TemaSugestao } from "./sugestoes";

export type LinhaBanco = [id: string, texto: string, tema: TemaSugestao, curto: string, icone: string];

export const BANCO_EMPRESA: LinhaBanco[] = [
  // ── caixa e bancos
  ["saldo-hoje", "Qual é o meu saldo em conta hoje?", "caixa", "Saldo de hoje", "database"],
  ["saldo-por-conta", "Quanto tenho em cada conta bancária?", "caixa", "Saldo por conta", "building"],
  ["entradas-saidas", "Quanto entrou e quanto saiu este mês?", "caixa", "Entradas e saídas", "arrow-left-right"],
  ["geracao-caixa", "A empresa gerou ou consumiu caixa este mês?", "caixa", "Geração de caixa", "activity"],
  ["caixa-livre", "Qual foi o fluxo de caixa livre do mês?", "caixa", "Caixa livre", "layers"],
  ["previsao-mes", "Como o caixa deve fechar no fim do mês?", "caixa", "Previsão do mês", "target"],
  ["caixa-amanha", "O que entra e o que sai amanhã?", "caixa", "Agenda de amanhã", "calendar"],
  ["transferencias", "Quais transferências entre contas fiz no mês?", "caixa", "Transferências", "arrow-left-right"],
  ["extrato-semana", "Mostre o extrato da última semana", "caixa", "Extrato da semana", "list-checks"],
  ["caixa-ano", "Como o caixa evoluiu ao longo do ano?", "caixa", "Caixa no ano", "trending-up"],

  // ── resultado e contabilidade
  ["dre-mes", "Mostre o DRE do mês", "contabil", "DRE do mês", "file-text"],
  ["ebitda", "Qual foi o EBITDA do mês?", "contabil", "EBITDA", "activity"],
  ["margem-liquida", "Qual a margem líquida da empresa?", "contabil", "Margem líquida", "layers"],
  ["margem-bruta", "Qual a margem bruta deste mês?", "contabil", "Margem bruta", "layers"],
  ["lucro-ano", "Quanto a empresa lucrou no ano até agora?", "contabil", "Lucro do ano", "trending-up"],
  ["ponto-equilibrio", "Qual o ponto de equilíbrio da empresa?", "contabil", "Ponto de equilíbrio", "target"],
  ["receita-liquida", "Qual foi a receita líquida do mês?", "contabil", "Receita líquida", "receipt"],
  ["melhor-mes", "Qual foi o melhor mês do ano?", "contabil", "Melhor mês", "trending-up"],
  ["pior-mes", "Qual foi o pior mês do ano?", "contabil", "Pior mês", "trending-down"],
  ["balanco", "Como está o balanço patrimonial da empresa?", "contabil", "Balanço patrimonial", "layers"],
  ["dfc", "Mostre o DFC do mês por atividade", "contabil", "DFC do mês", "workflow"],
  ["razao-extrato", "O razão bate com o extrato do banco?", "contabil", "Razão × extrato", "check"],
  ["sem-categoria", "Quais lançamentos estão sem categoria?", "contabil", "Sem categoria", "help-circle"],
  ["exportar-contador", "Como exporto o mês para o contador?", "contabil", "Exportar ao contador", "download"],
  ["txt-dominio", "Como gero o TXT contábil para o Domínio?", "contabil", "TXT do Domínio", "file-text"],
  ["envio-nfs", "Como envio as notas do mês ao contador?", "contabil", "NFs ao contador", "mail"],
  ["resultado-financeiro", "Quanto o resultado financeiro pesou no mês?", "contabil", "Resultado financeiro", "activity"],
  ["dre-ano", "Mostre o DRE dos últimos 12 meses", "contabil", "DRE de 12 meses", "calendar"],

  // ── fechamento
  ["travar-mes", "Como travo o mês depois de fechado?", "fechamento", "Travar o mês", "shield-check"],
  ["provisoes", "Quais provisões devo lançar no fechamento?", "fechamento", "Provisões", "list-checks"],
  ["relatorio-fechamento", "Monte o relatório de fechamento do mês", "fechamento", "Relatório de fechamento", "file-text"],
  ["competencia", "Quantos lançamentos estão sem data de competência?", "fechamento", "Competência", "calendar"],
  ["duplicados", "Há lançamentos duplicados na base?", "fechamento", "Duplicados", "layers"],
  ["variacao-linhas", "Quais linhas do DRE variaram acima do normal?", "fechamento", "Análise de variação", "sliders-horizontal"],

  // ── impostos
  ["carga-tributaria", "Qual é a carga tributária sobre a receita?", "impostos", "Carga tributária", "receipt"],
  ["simples", "Quanto pago de Simples Nacional neste mês?", "impostos", "Simples Nacional", "receipt"],
  ["regime-ideal", "Qual regime tributário compensa para a empresa?", "impostos", "Regime tributário", "sliders-horizontal"],
  ["guias-vencer", "Quais guias de impostos vencem este mês?", "impostos", "Guias a vencer", "calendar"],
  ["notas-emitidas", "Quantas notas fiscais emiti este mês?", "impostos", "Notas emitidas", "file-text"],
  ["nfs-recebidas", "Quais notas de fornecedores chegaram este mês?", "impostos", "NFs recebidas", "inbox"],
  ["retencoes", "Quais impostos devo reter na nota de um PJ?", "impostos", "Retenções", "receipt"],
  ["impostos-ano", "Quanto a empresa pagou de impostos no ano?", "impostos", "Impostos no ano", "calendar"],

  // ── receber e cobrar
  ["inadimplencia", "Qual a taxa de inadimplência da carteira?", "receber", "Inadimplência", "triangle-alert"],
  ["prazo-recebimento", "Em quantos dias, em média, os clientes pagam?", "receber", "Prazo de recebimento", "calendar"],
  ["aging-receber", "Como está o envelhecimento dos títulos vencidos?", "receber", "Envelhecimento", "layers"],
  ["regua-cobranca", "Em que etapa da régua de cobrança está cada cliente?", "receber", "Régua de cobrança", "list-checks"],
  ["juros-multa", "Quanto cobrar de juros e multa num boleto atrasado?", "receber", "Juros e multa", "receipt"],
  ["receber-mes", "Quanto tenho a receber até o fim do mês?", "receber", "Receber no mês", "inbox"],
  ["recebido-hoje", "O que recebi hoje?", "receber", "Recebido hoje", "check"],
  ["boletos-abertos", "Quais boletos e PIX de cobrança estão em aberto?", "receber", "Boletos em aberto", "scan-line"],
  ["links-pagamento", "Quais links de pagamento já foram pagos?", "receber", "Links de pagamento", "link"],
  ["venda-caixa", "Quanto do faturamento já virou caixa?", "receber", "Venda × caixa", "arrow-left-right"],
  ["recuperacao", "Qual a chance de recuperar o que está vencido?", "receber", "Recuperação", "rotate-ccw"],
  ["vencendo-hoje", "Quais recebimentos vencem hoje?", "receber", "Vence hoje", "bell"],

  // ── pagar e comprar
  ["pagar-mes", "Quanto tenho a pagar até o fim do mês?", "pagar", "Pagar no mês", "calendar"],
  ["pago-hoje", "O que paguei hoje?", "pagar", "Pago hoje", "check"],
  ["contas-atrasadas", "Quais contas a pagar estão atrasadas?", "pagar", "Contas atrasadas", "triangle-alert"],
  ["prazo-pagamento", "Com quantos dias, em média, pago os fornecedores?", "pagar", "Prazo de pagamento", "calendar"],
  ["compras-mes", "Quanto foi comprado este mês?", "pagar", "Compras do mês", "shopping-cart"],
  ["boletos-dda", "Quais boletos chegaram pelo DDA?", "pagar", "Boletos DDA", "scan-line"],
  ["reembolsos", "Quais reembolsos estão pendentes?", "pagar", "Reembolsos", "rotate-ccw"],
  ["maior-pagamento", "Qual foi o maior pagamento do mês?", "pagar", "Maior pagamento", "arrow-up-right"],
  ["parcelas-abertas", "Quais compras parceladas ainda estão em aberto?", "pagar", "Parcelas em aberto", "layers"],
  ["fatura-cartao", "Quanto vem na próxima fatura do cartão da empresa?", "pagar", "Fatura do cartão", "credit-card"],

  // ── despesa
  ["contas-fixas", "Quanto pago todo mês em contas fixas?", "despesa", "Contas fixas", "repeat"],
  ["despesa-media", "Qual a média mensal de despesas?", "despesa", "Despesa média", "activity"],
  ["gasto-dia", "Quanto a empresa gasta por dia em média?", "despesa", "Gasto por dia", "gauge"],
  ["mes-contra-mes", "Gastei mais neste mês ou no mês passado?", "despesa", "Mês contra mês", "arrow-left-right"],
  ["despesa-categoria", "Quanto gastei por categoria este mês?", "despesa", "Gasto por categoria", "layers"],
  ["despesa-centro", "Quanto cada centro de custo gastou no mês?", "despesa", "Gasto por centro", "building"],
  ["despesa-projeto", "Quanto cada projeto custou até agora?", "despesa", "Custo por projeto", "package"],
  ["despesa-cresceu", "Qual despesa mais cresceu contra o mês passado?", "despesa", "Despesa que cresceu", "trending-up"],
  ["fora-do-padrao", "Há algum gasto fora do padrão este mês?", "despesa", "Gastos fora do padrão", "eye"],
  ["aluguel-contas", "Quanto vai em aluguel, energia e internet?", "despesa", "Aluguel e contas", "house"],
  ["tarifas-bancarias", "Quanto paguei de tarifas bancárias no mês?", "despesa", "Tarifas bancárias", "building"],
  ["orcado-realizado", "As despesas estão dentro do orçamento?", "despesa", "Orçado × realizado", "target"],

  // ── folha
  ["custo-folha", "Quanto custa a folha com todos os encargos?", "folha", "Custo da folha", "users"],
  ["custo-clt", "Quanto custa de verdade um funcionário CLT?", "folha", "Custo de um CLT", "user"],
  ["clt-ou-pj", "Contratar como CLT ou PJ: qual sai mais caro?", "folha", "CLT ou PJ", "arrow-left-right"],
  ["decimo-terceiro", "Quanto provisionar de 13º salário este mês?", "folha", "Provisão do 13º", "database"],
  ["ferias", "Quanto vou pagar nas próximas férias da equipe?", "folha", "Férias", "sun"],
  ["rescisao", "Quanto custa uma rescisão sem justa causa?", "folha", "Rescisão", "file-text"],
  ["fgts-darf", "Quando vencem o FGTS e o DARF da folha?", "folha", "FGTS e DARF", "calendar"],
  ["posso-contratar", "Consigo contratar mais uma pessoa?", "folha", "Posso contratar?", "users"],

  // ── vendas e maquininha
  ["faturamento-mes", "Quanto a empresa faturou este mês?", "vendas", "Faturamento", "receipt"],
  ["crescimento", "A receita está crescendo mês a mês?", "vendas", "Crescimento", "trending-up"],
  ["origem-receita", "De onde vem a receita da empresa?", "vendas", "Origem da receita", "network"],
  ["produto-servico", "Quanto vem de produto e quanto de serviço?", "vendas", "Produto × serviço", "layers"],
  ["status-vendas", "Quantas vendas estão completas e quantas pendentes?", "vendas", "Status das vendas", "list-checks"],
  ["chargebacks", "Quanto perdi com reembolsos e chargebacks?", "vendas", "Chargebacks", "rotate-ccw"],
  ["ltv-cac", "Qual a relação entre LTV e CAC?", "vendas", "LTV/CAC", "target"],
  ["receita-por-cliente", "Qual a receita média por cliente?", "vendas", "Receita por cliente", "user"],
  ["vendas-maquininha", "Quanto vendi na maquininha este mês?", "vendas", "Vendas na maquininha", "smartphone"],
  ["mdr-maquininha", "Quanto a maquininha cobrou de MDR no mês?", "vendas", "MDR da maquininha", "credit-card"],
  ["clientes-novos", "Quais clientes novos compraram este mês?", "vendas", "Clientes novos", "user"],

  // ── receita recorrente
  ["mrr", "Qual o MRR de hoje?", "recorrencia", "MRR", "repeat"],
  ["assinantes", "Quantos assinantes ativos a empresa tem?", "recorrencia", "Assinantes", "users"],
  ["contratos-vencer", "Quais contratos vencem nos próximos meses?", "recorrencia", "Contratos a vencer", "file-text"],

  // ── simuladores
  ["posso-comprar", "Posso comprar um equipamento de 50 mil em 12x?", "simulacao", "Posso comprar?", "shopping-cart"],
  ["simular-financiamento", "Quanto fica a parcela de 100 mil em 24x a 2%?", "simulacao", "Simular financiamento", "credit-card"],
  ["queda-receita", "E se a receita cair 20% no próximo mês?", "simulacao", "Queda de receita", "trending-down"],
  ["simular-investimento", "Quanto rende guardar 5 mil por mês a 1%?", "simulacao", "Simular investimento", "database"],
  ["unidades-empatar", "Quantas unidades preciso vender para empatar?", "simulacao", "Unidades p/ empatar", "target"],
  ["precificar", "Que preço cobrar com custo de 100 e margem de 30%?", "simulacao", "Precificar", "receipt"],
  ["taxa-anual", "Quanto é 2% ao mês em taxa anual?", "simulacao", "Taxa ao ano", "sliders-horizontal"],

  // ── risco e decisão
  ["risco-ruptura", "Em que dia o caixa pode ficar negativo?", "risco", "Risco de ruptura", "triangle-alert"],
  ["liquidez", "Qual a liquidez da empresa hoje?", "risco", "Liquidez", "gauge"],
  ["concentracao-bancos", "O caixa está concentrado em um banco só?", "risco", "Concentração bancária", "network"],
  ["clientes-risco", "Quais clientes têm maior risco de não pagar?", "risco", "Clientes em risco", "shield-check"],
  ["fatores-score", "Quais fatores mais pesam no score da empresa?", "risco", "Fatores do score", "gauge"],
  ["chance-aperto", "Qual a chance de o caixa ficar negativo em 90 dias?", "risco", "Chance de aperto", "triangle-alert"],
  ["comparar-setor", "Como a empresa se compara ao setor?", "risco", "Comparar ao setor", "activity"],
  ["melhor-acao", "Qual a melhor ação para melhorar o caixa agora?", "risco", "Melhor ação", "sparkles"],

  // ── operação e cadastros
  ["automacoes", "Que automações posso ligar para a cobrança?", "operacao", "Automações", "workflow"],
  ["conectar-banco", "Como conecto o banco pelo Open Finance?", "operacao", "Conectar banco", "link"],
  ["regra-categoria", "Como crio uma regra de categorização?", "operacao", "Regras de categoria", "sliders-horizontal"],
  ["painel-proprio", "Como monto um painel personalizado?", "operacao", "Montar painel", "layout-dashboard"],
  ["plano-contas", "Como está organizado o plano de contas?", "operacao", "Plano de contas", "list-checks"],
];

export const BANCO_PESSOAL: LinhaBanco[] = [
  ["pf-saldo", "Quanto tenho em conta agora?", "pessoal", "Meu saldo", "database"],
  ["pf-sobrou", "Quanto sobrou no fim do mês passado?", "pessoal", "Sobra do mês", "target"],
  ["pf-maior-gasto", "Qual foi meu maior gasto do mês?", "pessoal", "Maior gasto", "arrow-up-right"],
  ["pf-mercado", "Quanto gastei com mercado e restaurante?", "pessoal", "Mercado e restaurante", "shopping-cart"],
  ["pf-cartao", "Quanto vem na fatura do cartão?", "pessoal", "Fatura do cartão", "credit-card"],
  ["pf-meta", "Em quanto tempo junto 20 mil guardando mil por mês?", "pessoal", "Meta de poupança", "target"],
  ["pf-fixas", "Quanto da minha renda vai para contas fixas?", "pessoal", "Peso das contas fixas", "repeat"],
  ["pf-economizar", "Onde posso economizar este mês?", "pessoal", "Onde economizar", "minus"],
  ["pf-por-dia", "Quanto gasto por dia em média?", "pessoal", "Gasto por dia", "gauge"],
  ["pf-comprar", "Posso comprar um carro de 80 mil em 48x?", "pessoal", "Posso comprar?", "shopping-cart"],
  ["pf-recebi", "Quanto recebi este mês?", "pessoal", "O que recebi", "inbox"],
  ["pf-transporte", "Quanto gastei com transporte e combustível?", "pessoal", "Transporte", "workflow"],
];
