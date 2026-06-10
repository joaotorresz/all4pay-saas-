/**
 * Conteúdo dos guias por página. Cada rota tem um guia explicando o que dá
 * para fazer, as variáveis/métricas e o que é cada bloco da tela. Consumido
 * por PageGuide (painel) e Tour (passo a passo com spotlight na tela).
 *
 * `match`: substring da legenda visível do card — usado pelo Tour para
 * localizar e destacar o box correspondente na própria tela.
 */
export interface GuideItem {
  nome: string;
  desc: string;
  match?: string;
}
export interface GuideSection {
  titulo: string;
  itens: GuideItem[];
}
export interface Guide {
  titulo: string;
  intro: string;
  secoes: GuideSection[];
}

export const GUIDES: Record<string, Guide> = {
  "/": {
    titulo: "Início — visão geral financeira",
    intro:
      "Painel de comando: o estado do seu dinheiro hoje, em widgets independentes (cada um carrega e falha sozinho).",
    secoes: [
      {
        titulo: "O que dá para fazer",
        itens: [
          { nome: "Novo depósito", desc: "Botão no topo: 16 ações (lançamentos, vendas/compras, cadastros) e atalhos Alt+letra." },
        ],
      },
      {
        titulo: "Os blocos da tela",
        itens: [
          { nome: "A receber", desc: "Hero VENCIDO (vermelho) + VENCE HOJE (verde) e o restante do mês.", match: "A Receber" },
          { nome: "A pagar", desc: "Mesma leitura, para as saídas.", match: "A Pagar" },
          { nome: "Contas financeiras", desc: "Saldo consolidado das contas + selo de conciliação por conta.", match: "Contas Financeiras" },
          { nome: "Fluxo de caixa diário", desc: "Barras divergentes (entradas/saídas) + linha de saldo acumulado.", match: "Fluxo de Caixa" },
          { nome: "Vendas / Faturamento", desc: "Evolução do faturamento mês a mês.", match: "Faturamento" },
        ],
      },
    ],
  },

  "/copiloto": {
    titulo: "Copiloto — IA executiva",
    intro: "O sistema operando como analista + FP&A + tesouraria: o que vai acontecer, o que priorizar, o que está errado.",
    secoes: [
      {
        titulo: "O que dá para fazer",
        itens: [
          { nome: "Perguntar", desc: "Digite ou use as perguntas sugeridas. A resposta vem com números + fontes.", match: "Copiloto financeiro" },
        ],
      },
      {
        titulo: "Os blocos da tela",
        itens: [
          { nome: "Briefing executivo", desc: "Resumo diário: saldo, runway, alertas, oportunidades, risco de ruptura.", match: "Briefing executivo" },
          { nome: "Insights priorizados", desc: "Ordenados por impacto × urgência × probabilidade × criticidade.", match: "Insights priorizados" },
          { nome: "Anomalias", desc: "Despesas fora do padrão (z-score), duplicidade, pagamento atípico.", match: "Anomalias" },
          { nome: "Motor preditivo", desc: "Fluxo líquido projetado (histórico vs previsto) + janela de pressão.", match: "Motor preditivo" },
          { nome: "Memória da operação", desc: "Padrões aprendidos: sazonalidade, despesas recorrentes, clientes críticos.", match: "Memória da operação" },
        ],
      },
    ],
  },

  "/dre": {
    titulo: "DRE Intelligence Center",
    intro: "Centro de resultado: quanto ganhou, por quê, onde, qual cliente/linha, qual tendência e a projeção.",
    secoes: [
      {
        titulo: "O que dá para fazer",
        itens: [
          { nome: "Período & regime", desc: "Mês/anterior/YTD/12m e Competência (vencimento) ou Caixa (pagamento). Recalcula tudo.", match: "Período" },
          { nome: "Drill-down", desc: "Clique nas linhas com ▸ para abrir a composição por categoria." },
        ],
      },
      {
        titulo: "Os blocos da tela",
        itens: [
          { nome: "Leitura do resultado (copiloto)", desc: "Comentário automático + top problemas e oportunidades.", match: "Leitura do resultado" },
          { nome: "Waterfall gerencial", desc: "Receita bruta → impostos → líquida → CMV → lucro bruto → opex → EBITDA → financeiro → lucro líquido.", match: "DRE gerencial" },
          { nome: "DRE financeiro", desc: "Visão caixa: fluxos operacional/financeiro/livre + burn.", match: "DRE financeiro" },
          { nome: "Comparativo", desc: "Mês atual × anterior × YTD × 12m, com variações.", match: "DRE comparativo" },
          { nome: "Por linha de receita", desc: "Rentabilidade por linha (produto/unidade), custo rateado.", match: "Por linha de receita" },
          { nome: "Por cliente", desc: "Receita, share, margem, risco e vencido por cliente.", match: "DRE por cliente" },
          { nome: "Projetado", desc: "Receita média × margem atual para 30/90/180/360 dias.", match: "DRE projetado" },
        ],
      },
    ],
  },

  "/inteligencia": {
    titulo: "Inteligência — camada quantitativa",
    intro: "O 'Bloomberg para PMEs': transforma lançamentos em métricas executivas e score de saúde.",
    secoes: [
      {
        titulo: "Variáveis / métricas",
        itens: [
          { nome: "Burn multiple", desc: "Caixa queimado ÷ nova receita líquida (eficiência de queima)." },
          { nome: "Qualidade da receita", desc: "0–100: recorrência, previsibilidade, inadimplência e concentração." },
        ],
      },
      {
        titulo: "Os blocos da tela",
        itens: [
          { nome: "Score de saúde", desc: "0–100 ponderado + tendência.", match: "Score de saúde" },
          { nome: "Radar executivo", desc: "7 dimensões (liquidez, eficiência, crescimento, previsibilidade, risco, rentabilidade, governança).", match: "Radar executivo" },
          { nome: "Indicadores institucionais", desc: "KPIs: liquidez, runway, margem, ROIC, eficiência, ticket…", match: "Indicadores institucionais" },
          { nome: "Evolução do score", desc: "Score mês a mês.", match: "Evolução do score" },
          { nome: "Cenários preditivos", desc: "Choques → score projetado + prazo.", match: "Score preditivo" },
          { nome: "Benchmark", desc: "Margem/eficiência/inadimplência/crescimento vs o setor.", match: "Benchmark setorial" },
        ],
      },
    ],
  },

  "/decisao": {
    titulo: "Decisão — Financial Decision Layer",
    intro: "Industrializa a inteligência: interpreta, pontua risco, prevê e recomenda com impacto quantificado.",
    secoes: [
      {
        titulo: "Os blocos da tela",
        itens: [
          { nome: "Brief executivo", desc: "Headline: causa + sugestão.", match: "Decisão financeira" },
          { nome: "Matriz de risco", desc: "8 dimensões probabilísticas + stress agregado.", match: "Matriz de risco" },
          { nome: "Previsão Monte Carlo", desc: "Probabilidade de caixa negativo em 90d + bandas p10/p50/p90.", match: "Previsão de caixa" },
          { nome: "Recomendações", desc: "Cada ação re-roda o motor de risco e mede o impacto real.", match: "Recomendações" },
          { nome: "Plano autônomo", desc: "Resposta coordenada com guardrails.", match: "Ações autônomas" },
          { nome: "Feature store", desc: "As variáveis estruturadas que alimentam os modelos.", match: "Feature Store" },
        ],
      },
    ],
  },

  "/autonomo": {
    titulo: "Autônomo — operação supervisionada",
    intro: "O salto de 'informar o problema' para decidir e executar, com você como supervisor.",
    secoes: [
      {
        titulo: "Os blocos da tela",
        itens: [
          { nome: "Próxima melhor ação", desc: "A decisão de maior prioridade no momento.", match: "Operação financeira autônoma" },
          { nome: "Decisões financeiras", desc: "Tipadas (cobrança/pagamento/capital/risco) com confiança e fatores.", match: "Decisões financeiras" },
          { nome: "Human-in-the-loop", desc: "Ações reversíveis executam sozinhas; mover dinheiro > R$2k vai para aprovação.", match: "Human-in-the-loop" },
          { nome: "Políticas SE→ENTÃO", desc: "Regras que a empresa define e a IA executa.", match: "Políticas autônomas" },
          { nome: "Cobrança autônoma", desc: "Canal, horário, estratégia e tom por cliente.", match: "Cobrança autônoma" },
          { nome: "Roteamento de pagamento", desc: "De qual conta/banco pagar para preservar liquidez.", match: "Roteamento de pagamento" },
        ],
      },
    ],
  },

  "/risco": {
    titulo: "Risco de caixa",
    intro: "Motor proprietário de risco operacional: score, runway, ruptura, stress — explicável.",
    secoes: [
      {
        titulo: "Os blocos da tela",
        itens: [
          { nome: "Score de risco", desc: "0–100 (maior = mais saudável) + prob. de ruptura + runway.", match: "Score de risco de caixa" },
          { nome: "Interpretação executiva", desc: "Narrativa + fatores críticos.", match: "Interpretação executiva" },
          { nome: "Runway por cenário", desc: "Otimista / base / pessimista.", match: "Runway por cenário" },
          { nome: "Liquidez projetada", desc: "Saldo dia a dia (60d), marca a ruptura.", match: "Liquidez projetada" },
          { nome: "Composição do score", desc: "Pilares auditáveis (peso + nota).", match: "Composição do score" },
          { nome: "Stress testing", desc: "Impacto de choques (queda de receita, atraso, despesa).", match: "Stress testing" },
        ],
      },
    ],
  },

  "/inadimplencia": {
    titulo: "Inadimplência — inteligência de crédito",
    intro: "Prevê inadimplência antes de acontecer, a partir do comportamento de pagamento de cada cliente.",
    secoes: [
      {
        titulo: "Os blocos da tela",
        itens: [
          { nome: "Score da carteira", desc: "Exposição, vencido, inadimplência esperada e score consolidado.", match: "Score da carteira" },
          { nome: "Heatmap de risco", desc: "Clientes ordenados por score; clique para abrir o perfil.", match: "Heatmap de risco" },
          { nome: "Perfil do cliente", desc: "Por que o risco (fatores), early-warning, recuperação e recomendação.", match: "Por que esse risco" },
          { nome: "Segmentação", desc: "Bom pagador / sazonal / deteriorando / crônico.", match: "Segmentação da carteira" },
        ],
      },
    ],
  },

  "/orquestracao": {
    titulo: "Orquestração — Financial Operating System",
    intro: "Toda ação vira evento e propaga pela cascata. Dispare um evento e veja o sistema reagir.",
    secoes: [
      {
        titulo: "Os blocos da tela",
        itens: [
          { nome: "Disparar evento", desc: "Escolha tipo/valor/contraparte (ou um preset) e clique Orquestrar.", match: "Disparar evento" },
          { nome: "Cascata", desc: "Event Store → Ledger → recálculo → decisão → auditoria → antifraude → webhook.", match: "Cascata de orquestração" },
          { nome: "Event Store", desc: "Histórico imutável encadeado por hash (denuncia adulteração).", match: "histórico imutável" },
          { nome: "Ledger", desc: "Lançamentos de dupla partida (débito/crédito) e saldos.", match: "dupla partida" },
          { nome: "Grafo financeiro", desc: "Clientes → empresa → fornecedores e os fluxos.", match: "Grafo financeiro" },
        ],
      },
    ],
  },

  "/infraestrutura": {
    titulo: "Infraestrutura financeira",
    intro: "A fundação bancária: ledger como verdade absoluta, idempotência, fila e observabilidade.",
    secoes: [
      {
        titulo: "Os blocos da tela",
        itens: [
          { nome: "Domínios", desc: "Os 10 domínios financeiros e onde vivem no produto.", match: "Arquitetura de domínios" },
          { nome: "Ledger Core", desc: "Dupla partida; saldo derivado; trial balance fechado; rejeita transação desbalanceada.", match: "Ledger Core" },
          { nome: "Payment Orchestrator", desc: "Processe um pagamento; repita a chave (idempotência); simule falha + retry.", match: "Payment Orchestrator" },
          { nome: "Fila", desc: "Jobs com status/tentativas e replay; dedup por idempotency key.", match: "Fila financeira" },
          { nome: "Observabilidade", desc: "Invariantes em tempo real: integridade do ledger, divergência, jobs em falha.", match: "Observabilidade financeira" },
        ],
      },
    ],
  },

  "/arquitetura": {
    titulo: "Arquitetura institucional",
    intro: "A visão de financial operating infrastructure: 10 camadas, serviços, tesouraria e resiliência.",
    secoes: [
      {
        titulo: "Os blocos da tela",
        itens: [
          { nome: "10 camadas", desc: "O mapa institucional do sistema.", match: "Arquitetura institucional" },
          { nome: "Serviços distribuídos", desc: "Os serviços financeiros (latência/throughput).", match: "Serviços financeiros distribuídos" },
          { nome: "Treasury Core", desc: "Posição consolidada, concentração bancária (HHI), liquidez, cash positioning, stress.", match: "Treasury Core" },
          { nome: "Reliability", desc: "Rode o cenário de falha: circuit breaker / DLQ / lock em ação, sem duplicar dinheiro.", match: "Reliability layer" },
          { nome: "Observabilidade", desc: "Métricas da plataforma em tempo real.", match: "Observability platform" },
        ],
      },
    ],
  },

  "/dados": {
    titulo: "Inteligência de dados — moat",
    intro: "Cada empresa vira sinal de uma rede que aprende junto (cross-tenant).",
    secoes: [
      {
        titulo: "Os blocos da tela",
        itens: [
          { nome: "DNA financeiro", desc: "Arquétipo (agressiva/conservadora/sazonal…) + traços.", match: "DNA financeiro" },
          { nome: "Modelo auto-aprendiz", desc: "Acurácia/AUC + curva de aprendizado: fica mais preciso com mais empresas.", match: "Modelo proprietário" },
          { nome: "Benchmark vs setor", desc: "Seu valor vs mediana e percentil dos pares.", match: "Benchmark vs setor" },
          { nome: "Modelo comportamental", desc: "Vizinhos semelhantes e % que entraram em stress.", match: "Modelo comportamental" },
          { nome: "Credit intelligence", desc: "Probabilidade de inadimplência + limite recomendado + confiabilidade.", match: "Credit intelligence" },
        ],
      },
    ],
  },

  "/governanca": {
    titulo: "Governança institucional",
    intro: "Governança de nível bancário: auditoria imutável, RBAC e fluxo de aprovação.",
    secoes: [
      {
        titulo: "Os blocos da tela",
        itens: [
          { nome: "Trilha de auditoria", desc: "Eventos encadeados por SHA-256 + flags before/after. Teste a adulteração.", match: "Trilha de auditoria" },
          { nome: "Policy engine", desc: "Mude usuário/valor/método/país/hora/IP e veja a decisão.", match: "Policy engine" },
          { nome: "Matriz RBAC", desc: "Quem pode fazer o quê (papel × ação).", match: "Permissões granulares" },
          { nome: "Escada de aprovação", desc: "Fluxo por faixa de valor + biometria.", match: "Fluxo de aprovação" },
          { nome: "SLA", desc: "Tempo médio por etapa de aprovação.", match: "SLA de aprovação" },
        ],
      },
    ],
  },

  "/conciliacao": {
    titulo: "Conciliação",
    intro: "Matching probabilístico de transações para conciliar automaticamente o que for seguro (filas auto/sugestão/exceção, por confidence).",
    secoes: [],
  },
  "/automacoes": {
    titulo: "Automações",
    intro: "Motor de regras low-code (gatilho + condições + ações) com auditoria e ponte para o risco.",
    secoes: [],
  },
  "/vendas": {
    titulo: "Vendas",
    intro: "Documentos de venda/compra/orçamento. Use 'novo' para abrir o formulário (itens, totais, converter em venda).",
    secoes: [],
  },
  "/produtos": {
    titulo: "Produtos",
    intro: "Cadastro de produtos: nome, SKU, unidade, marca, preço de venda/custo e estoque.",
    secoes: [],
  },
  "/servicos": {
    titulo: "Serviços",
    intro: "Cadastro de serviços: nome, código, unidade e preço.",
    secoes: [],
  },
  "/contatos": {
    titulo: "Contatos",
    intro: "Clientes, fornecedores e transportadoras, com validação de CPF/CNPJ e busca de endereço por CEP (ViaCEP).",
    secoes: [],
  },
  "/recebiveis": {
    titulo: "A receber",
    intro: "Lista dos movimentos de entrada (recebíveis) por status e vencimento; vencidos em destaque.",
    secoes: [],
  },
  "/pagaveis": {
    titulo: "A pagar",
    intro: "Lista dos movimentos de saída (pagáveis) por status e vencimento.",
    secoes: [],
  },
};

/** Resolve o guia da rota (match exato ou prefixo mais longo). */
export function guideForPath(pathname: string): Guide | null {
  if (GUIDES[pathname]) return GUIDES[pathname];
  let best: string | null = null;
  for (const key of Object.keys(GUIDES)) {
    if (key === "/") continue;
    if (pathname.startsWith(key) && (!best || key.length > best.length)) best = key;
  }
  return best ? GUIDES[best] : null;
}

/** Passos do tour (todos os itens, em ordem) — box com `match` ganha spotlight. */
export function tourSteps(g: Guide): GuideItem[] {
  return g.secoes.flatMap((s) => s.itens);
}
