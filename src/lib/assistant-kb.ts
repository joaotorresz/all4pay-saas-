/**
 * Base de conhecimento do sistema (all4pay IA) — o que o assistente "entende"
 * sobre as FUNCIONALIDADES e os CÁLCULOS do all4pay. Responde a perguntas
 * conceituais ("o que é runway?", "como calcula o EBITDA?", "para que serve a
 * conciliação?") na hora, sem depender de chave de IA, e aponta a tela onde o
 * tema vive. Combina com a memória adaptativa (assistant-memory) para aprender
 * quais temas o cliente mais pergunta. Determinístico, demo-safe.
 */
export interface KBEntry {
  id: string;
  termos: RegExp; // gatilhos (sinônimos pt-BR)
  titulo: string;
  texto: string; // explicação + fórmula quando há
  rota?: string; // onde abrir
}

export const KB: KBEntry[] = [
  { id: "runway", termos: /runway|f[oô]lego|quantos meses.*caixa|dura(r)? o caixa/, titulo: "Runway de caixa", texto: "Por quantos meses o caixa atual cobre o ritmo de queima. Fórmula: saldo disponível ÷ burn mensal. Cai quando o burn sobe ou o saldo encolhe.", rota: "/fluxo-caixa" },
  { id: "burn-multiple", termos: /burn multiple|múltiplo de queima|efici[êe]ncia de queima|quanto queimo (para|pra) crescer/, titulo: "Burn multiple", texto: "Quanto de caixa você queima para cada R$ 1 de nova receita (queima líquida ÷ crescimento de receita). Abaixo de 1 é eficiente; muito acima indica crescimento caro.", rota: "/inteligencia" },
  { id: "burn", termos: /burn|queima de caixa|consumo de caixa/, titulo: "Burn rate", texto: "Quanto de caixa a operação consome por mês, em média (saídas − entradas recorrentes). É o denominador do runway.", rota: "/inteligencia" },
  { id: "ltv", termos: /\bltv\b|lifetime value|valor do cliente/, titulo: "LTV", texto: "Receita média gerada por cliente no período. Aproximação: receita ÷ clientes distintos. Quanto maior, mais valioso é cada cliente adquirido.", rota: "/painel-vendas" },
  { id: "cac", termos: /\bcac\b|custo de aquisi|custo por cliente/, titulo: "CAC", texto: "Custo de Aquisição de Cliente: gasto de marketing ÷ clientes adquiridos no período. Mede quanto custa trazer um novo cliente.", rota: "/painel-vendas" },
  { id: "ltvcac", termos: /ltv\s*\/?\s*cac|rela[çc][ãa]o ltv/, titulo: "LTV / CAC", texto: "Razão LTV ÷ CAC. Acima de 3× costuma indicar aquisição saudável; abaixo de 1× você gasta mais para adquirir do que o cliente retorna.", rota: "/painel-vendas" },
  { id: "ebitda", termos: /ebitda/, titulo: "EBITDA", texto: "Resultado operacional antes de juros, impostos sobre o lucro, depreciação e amortização. Aqui: receita − despesas operacionais (exclui financeiro, D&A e IRPJ/CSLL). % Receita = EBITDA ÷ receita.", rota: "/painel-vendas" },
  { id: "mc", termos: /margem de contribui|margem contribui/, titulo: "Margem de contribuição", texto: "Receita − custos variáveis (CMV, comissões, taxas de gateway, frete). É o que sobra de cada venda para cobrir os custos fixos e gerar lucro.", rota: "/dre" },
  { id: "faturamento", termos: /faturamento|receita bruta/, titulo: "Faturamento bruto", texto: "Soma de todas as entradas (vendas/serviços) reconhecidas no período pela competência (data de vencimento/emissão).", rota: "/painel-vendas" },
  { id: "dre", termos: /\bdre\b|demonstra[çc][ãa]o de resultado|resultado do exerc/, titulo: "DRE", texto: "Demonstração do Resultado: cascata de Receita → impostos → líquida → CMV → lucro bruto → despesas → EBITDA → financeiro → lucro líquido, com drill-down por categoria.", rota: "/dre" },
  { id: "fcf", termos: /fluxo de caixa livre|free cash flow|\bfcf\b|caixa livre/, titulo: "Fluxo de caixa livre (FCF)", texto: "O caixa que sobra da operação depois de cobrir custos e investimentos — o dinheiro realmente disponível para reservar, distribuir ou reinvestir. É a base do runway.", rota: "/fluxo-caixa" },
  { id: "fluxo", termos: /fluxo de caixa|dfc|entradas e sa[íi]das/, titulo: "Fluxo de caixa", texto: "Entradas − saídas ao longo do tempo (regime de caixa), com saldo acumulado, projeção e cenários. Diferente do DRE (competência).", rota: "/fluxo-caixa" },
  { id: "inadimplencia", termos: /inadimpl[êe]ncia|atraso|cliente de risco|vai pagar/, titulo: "Inadimplência (risco de crédito)", texto: "Prevê o risco de calote ANTES de acontecer, pelo comportamento de pagamento de cada cliente (atraso médio, tendência, oscilação). Devolve score + fatores explicáveis + ação de cobrança.", rota: "/inadimplencia" },
  { id: "conciliacao", termos: /concilia[çc][ãa]o|ofx|bater extrato|extrato banc/, titulo: "Conciliação bancária", texto: "Compara o que está lançado no all4pay com o extrato do banco (OFX) e sinaliza o que bate/não bate. Garante que o saldo do sistema = saldo real.", rota: "/conciliacao-bancaria" },
  { id: "mrr", termos: /\bmrr\b|recorr[êe]ncia|assinatura|receita recorrente/, titulo: "Recorrências / MRR", texto: "Receita recorrente mensal de contratos/assinaturas. Cada recorrência projeta as próximas faturas como entradas previstas no fluxo.", rota: "/recorrencias" },
  { id: "score", termos: /score|sa[úu]de financeira|nota da empresa/, titulo: "Score de saúde financeira", texto: "Nota 0–100 ponderando liquidez, runway, inadimplência, margem, volatilidade, concentração e crescimento. Acompanha a tendência e a probabilidade de ruptura de caixa.", rota: "/inteligencia" },
  { id: "chargeback", termos: /chargeback|contesta[çc][ãa]o/, titulo: "Chargeback", texto: "Estorno forçado de uma cobrança no cartão, contestada pelo portador. Reduz o faturamento líquido e é monitorado no painel de Vendas.", rota: "/painel-vendas" },
  { id: "reembolso", termos: /reembolso|devolu[çc][ãa]o de venda/, titulo: "Reembolso", texto: "Devolução de um valor ao cliente (estorno voluntário). Abate da receita no período em que ocorre.", rota: "/painel-vendas" },
  { id: "regime", termos: /compet[êe]ncia|regime de caixa|regime|caixa vs compet/, titulo: "Competência × Caixa", texto: "São duas datas do mesmo lançamento: competência (quando o fato aconteceu → vai pro DRE) e caixa (quando o dinheiro entra/sai → vai pro fluxo). O DRE usa competência; o fluxo de caixa usa caixa.", rota: "/dre" },
  { id: "aging", termos: /aging|envelhecimento|faixa de atraso|dias de atraso/, titulo: "Aging (envelhecimento)", texto: "Agrupa os títulos em aberto por faixa de atraso (a vencer, 1–30, 31–60, 60+ dias). Mostra o quão velha é a dívida de cada cliente — quanto mais velho, mais difícil receber.", rota: "/inadimplencia" },
  { id: "rateio", termos: /rateio|centro de custo|ratear|por projeto/, titulo: "Rateio / Centro de custo", texto: "Distribui um lançamento entre projetos ou centros de custo, para saber quanto cada área gastou/gerou. Alimenta o DRE por centro de custo.", rota: "/centros-custo" },
  { id: "liquidez", termos: /liquidez corrente|[íi]ndice de liquidez/, titulo: "Liquidez corrente", texto: "Mede se os recursos de curto prazo cobrem as obrigações de curto prazo. Fórmula: ativo circulante ÷ passivo circulante. Acima de 1 indica folga para honrar as contas.", rota: "/inteligencia" },
  { id: "concentracao", termos: /concentra[çc][ãa]o|depend[êe]ncia de cliente|hhi/, titulo: "Concentração de receita", texto: "O quanto sua receita depende de poucos clientes. Medida pelo índice HHI e pelo peso do maior cliente — concentração alta é risco se um deles sair.", rota: "/risco" },
  { id: "capital-giro", termos: /capital de giro|giro|necessidade de capital/, titulo: "Capital de giro", texto: "O dinheiro que a operação precisa para girar entre pagar fornecedores e receber dos clientes. Quanto maior o descasamento de prazos, mais capital de giro é exigido.", rota: "/fluxo-caixa" },
  { id: "churn", termos: /churn|cancelamento|perda de clientes/, titulo: "Churn", texto: "A taxa de cancelamento de assinaturas/recorrências no período. Churn alto derruba o MRR — receita recorrente que você deixa de ter nos próximos meses.", rota: "/recorrencias" },
  { id: "nsu", termos: /\bnsu\b|autoriza[çc][ãa]o|c[óo]digo da transa/, titulo: "NSU", texto: "Número que identifica uma transação de cartão junto à adquirente. Serve para conciliar cada venda com o repasse que cai na conta.", rota: "/conciliacao-bancaria" },
  { id: "boleto", termos: /boleto|linha digit|c[óo]digo de barras/, titulo: "Boleto", texto: "Título de cobrança bancária com vencimento e linha digitável. Vira um recebível previsto no fluxo até ser pago/baixado.", rota: "/boletos" },
  { id: "pix", termos: /\bpix\b|chave pix/, titulo: "Pix", texto: "Pagamento/recebimento instantâneo. Entra como lançamento imediato (data de caixa = data de vencimento), sem prazo de compensação.", rota: "/recebimentos" },
  { id: "nfse", termos: /nfs-?e|nota fiscal|nota de servi[çc]|emitir nota/, titulo: "Nota fiscal / NFS-e", texto: "Documento fiscal da venda ou serviço. A venda é o documento-mãe que propaga para recebível, imposto e nota.", rota: "/notas-fiscais" },
  { id: "breakeven", termos: /ponto de equil[íi]brio|break-?even|equil[íi]brio/, titulo: "Ponto de equilíbrio", texto: "O faturamento mínimo para as receitas cobrirem todos os custos (resultado zero). Abaixo dele, a operação fica no vermelho.", rota: "/dre" },
  { id: "prev-real", termos: /previsto (vs|x|e|contra) realizado|realizado (vs|x) previsto|acur[áa]cia/, titulo: "Previsto × Realizado", texto: "Compara o que estava planejado (previsto/agendado) com o que de fato aconteceu (realizado), medindo a acurácia do seu planejamento.", rota: "/fluxo-caixa" },
  { id: "partidas", termos: /partidas? (dobrada|dupla)|dupla partida|d[ée]bito e cr[ée]dito|raz[ãa]o|ledger/, titulo: "Partidas dobradas (razão)", texto: "Todo lançamento afeta duas contas: um débito e um crédito de igual valor. Garante que o balanço sempre fecha (débitos = créditos).", rota: "/razao" },
  { id: "provisao", termos: /provis[ãa]o|accrual|compet[êe]ncia futura|despesa (a )?apropriar/, titulo: "Provisão / Accrual", texto: "Reconhece uma despesa/receita no período em que ela ocorre (competência), mesmo antes de o dinheiro entrar/sair. Ex.: 13º provisionado mês a mês.", rota: "/fechamento" },
  { id: "concil-auto", termos: /concilia[çc][ãa]o autom[áa]tica|matching autom|bate autom/, titulo: "Conciliação automática", texto: "O sistema casa cada linha do extrato com o título correspondente por valor+data+documento (matching probabilístico); só o que fica em dúvida vai para revisão manual.", rota: "/conciliacao-bancaria" },
  { id: "dso", termos: /\bdso\b|prazo m[ée]dio de recebiment|days sales outstanding|dias (para|pra) receber/, titulo: "Prazo médio de recebimento (DSO)", texto: "Quantos dias, em média, seus clientes levam para pagar em relação ao vencimento. Quanto menor, mais rápido o dinheiro entra no caixa. O all4pay mede pelo atraso médio dos títulos já liquidados e pelo % pago no prazo.", rota: "/inadimplencia" },
  { id: "dpo", termos: /\bdpo\b|prazo m[ée]dio de pagament|days payable outstanding/, titulo: "Prazo médio de pagamento (DPO)", texto: "Quantos dias, em média, você leva para pagar seus fornecedores em relação ao vencimento. Alongar sem gerar multa/juros preserva capital de giro; atrasar demais arranha o relacionamento.", rota: "/pagamentos" },
  { id: "ciclo-caixa", termos: /ciclo (de caixa|financeiro|operacional)|cash conversion|convers[ãa]o de caixa/, titulo: "Ciclo de caixa", texto: "O tempo entre pagar fornecedores e receber dos clientes (aprox. DSO + prazo de estoque − DPO). Quanto maior o ciclo, mais capital de giro a operação exige para não faltar caixa no meio do caminho.", rota: "/fluxo-caixa" },
  { id: "margem-bruta", termos: /margem bruta|lucro bruto/, titulo: "Margem bruta", texto: "Receita − CMV (custo do que foi vendido), dividido pela receita. Mostra quanto sobra de cada venda antes das despesas operacionais. É o teto da sua lucratividade.", rota: "/dre" },
  { id: "margem-liquida", termos: /margem l[íi]quida|lucro l[íi]quido|margem final/, titulo: "Margem líquida", texto: "Lucro líquido ÷ receita — o que de fato sobra depois de TUDO (impostos, despesas, financeiro). É o termômetro final de rentabilidade do negócio.", rota: "/dre" },
  { id: "cmv", termos: /\bcmv\b|custo (da |de )?mercadoria|custo dos produtos|\bcogs\b|custo variável/, titulo: "CMV / Custo variável", texto: "Custo direto do que foi vendido (mercadoria, matéria-prima, taxas por venda). Varia com o volume. Receita − CMV = lucro bruto.", rota: "/dre" },
  { id: "opex", termos: /\bopex\b|despesa(s)? operacion|custo fixo|despesa fixa/, titulo: "OPEX / Despesas operacionais", texto: "As despesas de manter a operação de pé (folha, aluguel, softwares, marketing) — não variam diretamente com cada venda. Entram depois do lucro bruto no DRE.", rota: "/dre" },
  { id: "reserva", termos: /reserva (de caixa|de emerg[êe]ncia|financeira)|caixa m[íi]nimo|colch[ãa]o (de caixa|financeiro)/, titulo: "Reserva de caixa", texto: "Um caixa mínimo guardado para meses ruins — em geral 3 a 6 meses de custos fixos. O all4pay usa ~3 meses de operação ao avaliar se você pode gastar um valor.", rota: "/fluxo-caixa" },
  { id: "roi", termos: /\broi\b|retorno sobre (o )?investiment|retorno do investiment/, titulo: "ROI (retorno sobre investimento)", texto: "Ganho gerado ÷ valor investido. Mede se um investimento (marketing, equipamento, contratação) se paga e em quanto. ROI positivo = retornou mais do que custou.", rota: "/inteligencia" },
  { id: "sazonalidade", termos: /sazonalidade|sazonal|[ée]poca do ano|meses (fortes|fracos)|pico de venda/, titulo: "Sazonalidade", texto: "A variação previsível da receita ao longo do ano (datas fortes, meses fracos). O all4pay detecta seus padrões sazonais para projetar caixa e antecipar apertos.", rota: "/inteligencia" },
  { id: "ticket-medio", termos: /ticket m[ée]dio|valor m[ée]dio (por|da) (venda|pedido|compra)|ticket/, titulo: "Ticket médio", texto: "O valor médio de cada venda: receita ÷ número de vendas no período. Subir o ticket (upsell, combos) cresce a receita sem precisar de mais clientes.", rota: "/painel-vendas" },
  { id: "payback", termos: /payback|tempo de retorno|em quanto tempo (se paga|recupero)|prazo de retorno/, titulo: "Payback", texto: "O tempo até um investimento se pagar com o retorno que gera (valor investido ÷ ganho mensal). Payback curto = capital de volta rápido para reinvestir.", rota: "/inteligencia" },
];

/** Detecta intenção CONCEITUAL ("o que é/como calcula/para que serve"). */
const CONCEITUAL = /\b(o que|oque|que [ée]|qual [ée]|como (calcul\w*|funciona|fazer)|para que serve|explic\w*|defin\w*|signific\w*|entender)\b/i;

/** Tenta responder pela base de conhecimento. Retorna a entrada ou null. */
export function buscarKB(q: string): KBEntry | null {
  const s = q.toLowerCase();
  const conceitual = CONCEITUAL.test(s);
  for (const e of KB) {
    if (e.termos.test(s)) {
      // termos fortes (sigla/numérico) respondem mesmo sem o gatilho conceitual
      // "concentra"/"ponto de equil"/"break-even" saem do fallback forte: têm
      // intent COMPUTADO no motor (número real). Só respondem como CONCEITO
      // quando a pergunta é explicitamente conceitual ("o que é…"); "qual meu
      // ponto de equilíbrio?" / "risco de concentração?" caem no motor.
      if (conceitual || /ltv|cac|ebitda|mrr|dre|runway|burn|score|aging|churn|\bnsu\b|\bdso\b|\bdpo\b|liquidez|capital de giro|compet[êe]ncia|boleto|\bpix\b|nfs-?e|partidas? (dobrada|dupla)|provis[ãa]o|accrual/i.test(s)) return e;
    }
  }
  return null;
}
