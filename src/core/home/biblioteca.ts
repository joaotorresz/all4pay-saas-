/**
 * A BIBLIOTECA DE CARDS DA HOME (14/10/2026, pedido do dono): os cards que
 * outras telas e motores já sabem desenhar e que a Home NÃO mostra por padrão.
 * Ficam escondidos até a pessoa pedir na conversa ("coloca a inadimplência",
 * "quero ver o EBITDA") — e saem do mesmo jeito ("tira o radar de anomalias").
 *
 * O DESENHO de cada card mora no catálogo do cockpit
 * (`components/visao-geral/cockpit.tsx`, `CATALOG_BY_ID`), pelo MESMO id. Aqui
 * só mora o que a conversa precisa: o nome, o tema, uma linha sobre o que ele
 * mostra e os SINÔNIMOS (sem acento, minúsculas) — é por eles que o texto
 * digitado vira card. Nenhum número sai daqui.
 *
 * ⚠️ Os cards que repetem um item FIXO da Home (o caixa, o burn, o runway e a
 * receita recorrente já estão no "Seu painel") ficam FORA da biblioteca, em
 * `EQUIVALENTES_AO_PAINEL`: dois cards do mesmo número na mesma tela fariam a
 * pessoa conferir se eles batem. A guarda (`npm run home-sugestoes`) exige que
 * todo card do cockpit esteja aqui OU lá, e que nenhum sinônimo seja de dois.
 *
 * Puro, tipado, demo-safe.
 */

export const BIBLIOTECA_VERSION = "home-biblioteca/1.0.0";

export type TemaCard =
  | "Resumo executivo" | "Caixa" | "Receita" | "Despesas" | "Cobrança"
  | "Resultado do mês" | "Operação" | "Radares da IA";

/** A ordem em que os temas aparecem quando o chat lista o que dá para colocar. */
export const TEMAS_CARD: TemaCard[] = [
  "Caixa", "Receita", "Despesas", "Resultado do mês", "Cobrança", "Resumo executivo", "Operação", "Radares da IA",
];

export interface CardBiblioteca {
  /** O id do card no catálogo do cockpit (`CATALOG_BY_ID`). */
  id: string;
  nome: string;
  tema: TemaCard;
  /** Uma linha sobre o que o card mostra (vai para a IA e para a lista do chat). */
  descricao: string;
  /** Como a pessoa o chama, SEM acento e em minúsculas. */
  sinonimos: string[];
}

/** Os cards do cockpit que repetem um item fixo da Home, e qual. */
export const EQUIVALENTES_AO_PAINEL: Record<string, string> = {
  "caixa-consolidado": "caixa",
  burn_rate: "burn",
  runway_meses: "runway",
  receita_recorrente: "arr",
};

const c = (id: string, nome: string, tema: TemaCard, descricao: string, sinonimos: string[]): CardBiblioteca =>
  ({ id, nome, tema, descricao, sinonimos });

export const CARDS_BIBLIOTECA: CardBiblioteca[] = [
  /* ---- Caixa ---- */
  c("contas-bancarias", "Contas bancárias", "Caixa", "o saldo de cada conta, uma a uma", ["contas bancarias", "saldo por conta", "saldo por banco", "cada conta"]),
  c("maior-conta", "Maior conta", "Caixa", "a conta com mais dinheiro e quanto ela representa", ["maior conta"]),
  c("maior-banco", "Maior banco", "Caixa", "o banco onde está a maior parte do caixa", ["maior banco", "banco principal"]),
  c("concentracao-bancaria", "Concentração bancária", "Caixa", "o quanto o caixa está concentrado num banco só", ["concentracao bancaria", "concentracao nos bancos"]),
  c("liquidez_corrente", "Liquidez corrente", "Caixa", "quanto a empresa tem para cada real que deve no curto prazo", ["liquidez corrente", "liquidez"]),
  c("liquidez-imediata", "Liquidez imediata", "Caixa", "o caixa de hoje contra o que vence logo", ["liquidez imediata"]),
  c("liquidez-30d", "Liquidez em 30 dias", "Caixa", "o caixa projetado para os próximos 30 dias", ["liquidez em 30 dias", "liquidez 30 dias"]),
  c("liquidez-90d", "Liquidez em 90 dias", "Caixa", "o caixa projetado para o trimestre à frente", ["liquidez em 90 dias", "liquidez 90 dias"]),
  c("caixa-4-semanas", "Caixa em 4 semanas", "Caixa", "o saldo projetado ao fim de 4 semanas", ["caixa em 4 semanas", "caixa em quatro semanas", "proximas 4 semanas", "proximas semanas"]),
  c("radar-forecast-30d", "Previsão de caixa", "Caixa", "para onde o caixa caminha nos próximos 30 dias", ["previsao de caixa", "forecast", "forecast de caixa", "projecao de caixa"]),
  c("caixa-projetado-p50", "Caixa projetado", "Caixa", "o caixa mais provável no fim do horizonte da simulação", ["caixa projetado", "caixa previsto"]),
  c("caixa-pessimista-p10", "Caixa no pior cenário", "Caixa", "o caixa num cenário ruim da simulação", ["pior cenario", "caixa no pior cenario", "cenario pessimista"]),
  c("caixa-otimista-p90", "Caixa no melhor cenário", "Caixa", "o caixa num cenário bom da simulação", ["melhor cenario", "caixa no melhor cenario", "cenario otimista"]),
  c("prob-caixa-negativo", "Risco de caixa negativo", "Caixa", "a chance de o caixa ficar negativo", ["caixa negativo", "risco de caixa negativo", "ficar negativo", "ficar no vermelho"]),
  c("data-provavel-ruptura", "Data provável de aperto", "Caixa", "quando o caixa deve apertar", ["data de aperto", "quando aperta", "aperto de caixa", "data provavel de aperto"]),
  c("semana-aperto", "Próxima semana de aperto", "Caixa", "a próxima semana em que sai mais do que entra", ["semana de aperto", "proxima semana de aperto"]),
  c("runway-pessimista", "Fôlego no pior cenário", "Caixa", "quantos meses o caixa aguenta se tudo piorar", ["folego no pior cenario", "runway pessimista"]),
  c("ruptura-dia-risco", "Dias até a ruptura", "Caixa", "em quantos dias o caixa acaba pelo agendado", ["dias ate a ruptura", "dias para ruptura", "dias ate acabar o caixa"]),
  c("volatilidade-fluxo", "Volatilidade do fluxo", "Caixa", "o quanto o caixa oscila de um mês para o outro", ["volatilidade", "volatilidade do fluxo", "oscilacao do caixa"]),
  c("previsibilidade-fluxo", "Previsibilidade do fluxo", "Caixa", "o quanto dá para prever o caixa", ["previsibilidade", "previsibilidade do fluxo"]),
  c("burn-multiple", "Burn multiple", "Caixa", "quanto se queima para cada real de crescimento", ["burn multiple", "multiplo de queima"]),

  /* ---- Receita ---- */
  c("crescimento_mom", "Crescimento mês a mês", "Receita", "quanto a receita cresceu contra o mês anterior", ["crescimento", "crescimento mes a mes", "mom", "quanto cresci"]),
  c("ticket_medio", "Ticket médio", "Receita", "o valor médio de cada venda", ["ticket medio", "ticket"]),
  c("receita-mensal-media", "Receita mensal média", "Receita", "a receita média por mês", ["receita mensal media", "receita media", "media de receita", "faturamento medio", "faturamento"]),
  c("receita-liquida-mes", "Receita líquida do mês", "Receita", "a receita do mês depois dos impostos sobre a venda", ["receita liquida", "faturamento liquido"]),
  c("qualidade-receita", "Qualidade da receita", "Receita", "o quanto a receita é recorrente e estável", ["qualidade da receita"]),
  c("sazonalidade", "Sazonalidade", "Receita", "os meses mais fortes e mais fracos do ano", ["sazonalidade", "sazonal", "meses fortes", "meses fracos"]),
  c("margem-caixa-90d", "Margem de caixa (90 dias)", "Receita", "quanto sobra de cada real que entra, nos últimos 90 dias", ["margem de caixa"]),
  c("eficiencia-de-caixa", "Eficiência de caixa", "Receita", "quanto do que entra vira caixa", ["eficiencia de caixa"]),

  /* ---- Despesas ---- */
  c("despesa-mensal-media", "Despesa mensal média", "Despesas", "a despesa média por mês", ["despesa mensal media", "despesa media", "media de despesas", "gasto medio"]),
  c("custos-fixos-mensais", "Custos fixos mensais", "Despesas", "o boleto fixo da empresa: o que sai todo mês", ["custos fixos", "custo fixo", "contas fixas", "boleto fixo", "custos fixos mensais"]),
  c("opex-mes", "Despesas operacionais", "Despesas", "as despesas operacionais do mês", ["despesas operacionais", "despesa operacional", "opex"]),
  c("cmv-mes", "CMV do mês", "Despesas", "o custo das mercadorias vendidas no mês", ["cmv", "custo das mercadorias", "custo da mercadoria", "custo das vendas"]),
  c("carga-tributaria-mes", "Carga tributária", "Despesas", "quanto da receita vai para impostos", ["carga tributaria", "impostos", "imposto", "tributos"]),
  c("resultado-financeiro-mes", "Resultado financeiro", "Despesas", "juros, tarifas e rendimentos do mês", ["resultado financeiro", "juros e tarifas", "tarifas bancarias", "juros"]),
  c("maior-anomalia-exec", "Maior anomalia", "Despesas", "o gasto mais fora do padrão", ["maior anomalia"]),
  c("radar_anomalias", "Radar de anomalias", "Despesas", "lançamentos fora do padrão, como gasto anormal ou duplicidade", ["radar de anomalias", "anomalias", "anomalia", "gastos estranhos", "fora do padrao", "duplicidade"]),

  /* ---- Resultado do mês ---- */
  c("ebitda-mes", "EBITDA do mês", "Resultado do mês", "o resultado da operação antes de juros, impostos e depreciação", ["ebitda", "lajida"]),
  c("lucro-liquido-mes", "Lucro líquido do mês", "Resultado do mês", "o que sobrou no mês depois de tudo", ["lucro liquido", "lucro", "resultado do mes", "prejuizo"]),
  c("lucro-bruto-mes", "Lucro bruto do mês", "Resultado do mês", "a receita líquida menos o custo do que se vendeu", ["lucro bruto"]),
  c("margem-bruta-mes", "Margem bruta", "Resultado do mês", "o lucro bruto sobre a receita", ["margem bruta"]),
  c("margem-liquida-mes", "Margem líquida", "Resultado do mês", "o lucro líquido sobre a receita", ["margem liquida", "margem"]),

  /* ---- Cobrança ---- */
  c("inadimplencia_pct", "Inadimplência", "Cobrança", "quanto da carteira está em atraso", ["inadimplencia", "inadimplentes", "calote", "calotes", "atrasados"]),
  c("exposicao_vencida", "Exposição vencida", "Cobrança", "o valor que já venceu e não foi pago", ["exposicao vencida", "valor vencido", "vencidos", "titulos vencidos"]),
  c("exposicao-total", "Exposição total em aberto", "Cobrança", "tudo o que está em aberto a receber", ["exposicao total", "total em aberto", "em aberto"]),
  c("carteira_score", "Saúde da carteira", "Cobrança", "a nota da carteira de clientes", ["saude da carteira", "carteira de clientes", "carteira"]),
  c("clientes-ativos", "Clientes na carteira", "Cobrança", "quantos clientes têm algo em aberto", ["clientes na carteira", "clientes ativos", "quantos clientes", "numero de clientes"]),
  c("receita-media-cliente", "A receber médio por cliente", "Cobrança", "quanto cada cliente deve, em média", ["a receber medio por cliente", "receber por cliente", "medio por cliente"]),
  c("perda-esperada-inad", "Perda esperada por inadimplência", "Cobrança", "quanto deve se perder com calote", ["perda esperada", "perda com inadimplencia"]),
  c("clientes-alto-risco", "Clientes de alto risco", "Cobrança", "quantos clientes têm risco alto de não pagar", ["clientes de alto risco", "alto risco"]),
  c("cliente-maior-risco", "Cliente de maior risco", "Cobrança", "o cliente com mais chance de não pagar", ["cliente de maior risco", "pior cliente", "cliente mais arriscado"]),
  c("clientes-risco-exec", "Clientes de risco", "Cobrança", "os clientes que pedem atenção agora", ["clientes de risco", "clientes arriscados"]),
  c("clientes-em-atraso-risco", "Clientes em atraso", "Cobrança", "quantos clientes estão atrasados", ["clientes em atraso", "clientes atrasados", "quem esta atrasado"]),
  c("bons-pagadores", "Bons pagadores", "Cobrança", "quantos clientes pagam em dia", ["bons pagadores", "bom pagador", "bons clientes"]),
  c("recuperacao-vencidos", "Chance de recuperação", "Cobrança", "quanto do vencido deve voltar", ["recuperacao", "chance de recuperacao", "recuperar vencidos"]),
  c("benchmark-inadimplencia", "Inadimplência comparada ao setor", "Cobrança", "a sua inadimplência contra a do setor", ["inadimplencia vs setor", "inadimplencia do setor", "inadimplencia comparada ao setor"]),

  /* ---- Resumo executivo ---- */
  c("health_score", "Saúde financeira (nota)", "Resumo executivo", "a nota de 0 a 100 da saúde financeira", ["saude financeira", "score", "nota da empresa", "health score", "financial health score", "nota de saude"]),
  c("tendencia-score", "Tendência da saúde", "Resumo executivo", "se a saúde financeira está melhorando ou piorando", ["tendencia da saude", "tendencia do score", "tendencia"]),
  c("empresa_risco", "Empresa em risco?", "Resumo executivo", "se a empresa está em risco agora, e por quê", ["empresa em risco", "risco da empresa", "estou em risco"]),
  c("dimensao-risco-critica", "Maior risco agora", "Resumo executivo", "o risco mais alto neste momento", ["maior risco", "risco critico", "principal risco"]),
  c("pilar-mais-fraco", "Pilar mais frágil", "Resumo executivo", "o ponto que mais puxa a nota para baixo", ["pilar mais fragil", "ponto fraco", "ponto mais fraco"]),
  c("dimensao-mais-forte", "Onde você é mais forte", "Resumo executivo", "o ponto mais forte da empresa", ["ponto forte", "pontos fortes", "onde sou mais forte"]),
  c("dimensao-a-melhorar", "O que priorizar", "Resumo executivo", "o ponto que mais vale melhorar", ["o que priorizar", "o que melhorar", "a melhorar"]),
  c("prob-ruptura-90d", "Chance de ruptura em 90 dias", "Resumo executivo", "a chance de faltar caixa nos próximos 90 dias", ["probabilidade de ruptura", "chance de ruptura", "ruptura", "ruptura de caixa"]),
  c("prob-stress-90d", "Chance de aperto em 90 dias", "Resumo executivo", "a chance de um período de stress financeiro", ["stress", "estresse", "chance de stress"]),
  c("eficiencia-operacional", "Eficiência operacional", "Resumo executivo", "o quanto a operação converte receita em resultado", ["eficiencia operacional", "eficiencia"]),
  c("roic-proxy", "Retorno sobre o capital", "Resumo executivo", "o retorno sobre o capital empregado (estimado)", ["roic", "retorno sobre o capital", "retorno do capital"]),
  c("exposicao-liquida", "Exposição líquida", "Resumo executivo", "se no total você tem mais a receber ou a pagar", ["exposicao liquida", "posicao liquida"]),
  c("investor-snapshot", "Resumo para investidores", "Resumo executivo", "MRR e runway do jeito que o investidor lê", ["investidores", "investidor", "resumo para investidores", "investor"]),

  /* ---- Operação ---- */
  c("movimentos-mes", "Movimentos no mês", "Operação", "quantos lançamentos houve no mês", ["movimentos no mes", "movimentacoes do mes", "quantos lancamentos", "lancamentos do mes"]),
  c("contrapartes-distintas", "Contrapartes ativas", "Operação", "com quantos clientes e fornecedores a empresa negociou", ["contrapartes", "contrapartes ativas"]),
  c("ticket-medio-movimento", "Valor médio por lançamento", "Operação", "o valor médio de cada lançamento", ["valor medio por lancamento", "media por lancamento"]),

  /* ---- Radares da IA ---- */
  c("radar_concentracao", "Radar de concentração", "Radares da IA", "o quanto a receita depende de poucos clientes", ["radar de concentracao", "concentracao de receita", "concentracao"]),
  c("radar-dependencia-cliente", "Dependência de clientes", "Radares da IA", "o peso do maior cliente na receita", ["dependencia de clientes", "dependencia de cliente", "dependencia"]),
  c("hhi-clientes-risco", "Concentração de clientes", "Radares da IA", "o índice de concentração da carteira", ["concentracao de clientes", "hhi"]),
  c("radar_bancario", "Radar bancário", "Radares da IA", "riscos de banco: concentração e contas paradas", ["radar bancario", "radar dos bancos", "risco bancario"]),
  c("radar_oportunidades", "Radar de oportunidades", "Radares da IA", "onde há dinheiro a ganhar ou economizar", ["radar de oportunidades", "oportunidades de caixa"]),
  c("oportunidades-briefing", "Oportunidades do dia", "Radares da IA", "as oportunidades que a IA viu hoje", ["oportunidades do dia", "oportunidades"]),
  c("acoes-briefing", "Ações recomendadas", "Radares da IA", "o que a IA recomenda fazer", ["acoes recomendadas", "recomendacoes", "recomendacao"]),
  c("total-recomendacoes", "Número de ações recomendadas", "Radares da IA", "quantas ações a IA recomenda agora", ["numero de acoes recomendadas", "quantas acoes recomendadas"]),
  c("impacto-melhor-acao", "Impacto da melhor ação", "Radares da IA", "quanto a melhor ação melhora o caixa", ["melhor acao", "impacto da melhor acao"]),
  c("plano-autonomo-status", "Sugestões da IA", "Radares da IA", "o plano que a IA montou e o que pede aprovação", ["sugestoes da ia", "plano autonomo", "o que a ia sugere"]),
  c("radar-insight-critico", "Alerta crítico do dia", "Radares da IA", "o alerta mais importante de hoje", ["insight critico", "alerta critico", "insight do dia", "alerta do dia"]),
  c("impacto-insights-exec", "Impacto dos insights", "Radares da IA", "quanto valem os alertas abertos", ["impacto dos insights", "insights"]),
  c("alertas-criticos-risco", "Alertas de risco", "Radares da IA", "os alertas do motor de risco de caixa", ["alertas de risco", "alertas do motor de risco", "alertas"]),
  c("early-warnings-carteira", "Alertas antecipados", "Radares da IA", "sinais de cliente que vai atrasar, antes do atraso", ["alertas antecipados", "sinais de alerta", "early warning"]),
  c("padroes-ia", "Padrões que a IA aprendeu", "Radares da IA", "sazonalidade, despesas que se repetem e clientes críticos", ["padroes", "padroes da ia", "o que a ia aprendeu"]),
  c("radar-projecao-score", "Projeção da nota", "Radares da IA", "para onde a nota de saúde vai num cenário", ["projecao do score", "projecao de score", "projecao da nota"]),
  c("pior-stress-test", "Pior teste de stress", "Radares da IA", "o cenário de stress que mais machuca o caixa", ["teste de stress", "stress test", "pior teste de stress"]),
  c("benchmark-margem", "Margem comparada ao setor", "Radares da IA", "a sua margem contra a do setor", ["margem vs setor", "margem do setor", "margem comparada ao setor"]),
  c("benchmark-crescimento", "Crescimento comparado ao setor", "Radares da IA", "o seu crescimento contra o do setor", ["crescimento vs setor", "crescimento do setor", "crescimento comparado ao setor"]),
  c("benchmark-eficiencia", "Eficiência comparada ao setor", "Radares da IA", "a sua eficiência contra a do setor", ["eficiencia vs setor", "eficiencia do setor", "eficiencia comparada ao setor"]),
];

const POR_ID = new Map(CARDS_BIBLIOTECA.map((x) => [x.id, x]));
export const cardBiblioteca = (id: string): CardBiblioteca | undefined => POR_ID.get(id);
