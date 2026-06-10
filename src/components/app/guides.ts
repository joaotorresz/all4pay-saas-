/**
 * Conteúdo dos guias por página. Cada rota tem um guia explicando o que dá
 * para fazer, as variáveis/métricas e o que é cada bloco da tela. Consumido
 * por PageGuide (painel de ajuda embutido).
 */
export interface GuideItem {
  nome: string;
  desc: string;
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
          { nome: "Novo depósito", desc: "Botão no topo: abre o menu com 16 ações (lançamentos, vendas/compras, cadastros) e atalhos Alt+letra." },
          { nome: "Trocar período do fluxo", desc: "No gráfico de fluxo de caixa, alterne o intervalo projetado." },
        ],
      },
      {
        titulo: "Os blocos da tela",
        itens: [
          { nome: "A receber / A pagar", desc: "Hero VENCIDO (em vermelho) + VENCE HOJE (verde) e o restante do mês." },
          { nome: "Saldo consolidado", desc: "Soma das contas + selo de conciliação por conta." },
          { nome: "Fluxo de caixa diário", desc: "Barras divergentes (entradas/saídas) + linha de saldo acumulado." },
          { nome: "Vendas (12 meses)", desc: "Evolução do faturamento mês a mês." },
        ],
      },
    ],
  },

  "/copiloto": {
    titulo: "Copiloto — IA executiva",
    intro:
      "O sistema operando como analista + FP&A + tesouraria: responde o que vai acontecer, o que priorizar e o que está errado.",
    secoes: [
      {
        titulo: "O que dá para fazer",
        itens: [
          { nome: "Perguntar", desc: "Digite ou use as perguntas sugeridas (contratação, investimento, cliente de risco, despesas, expansão). A resposta vem com números + fontes." },
          { nome: "Simulador", desc: "Mexa nos sliders (receita/despesa/inadimplência) e veja runway e score recalcularem." },
        ],
      },
      {
        titulo: "Os blocos da tela",
        itens: [
          { nome: "Briefing executivo", desc: "Resumo diário: saldo, runway, alertas, oportunidades, risco de ruptura." },
          { nome: "Insights priorizados", desc: "Ordenados por impacto × urgência × probabilidade × criticidade." },
          { nome: "Anomalias", desc: "Despesas fora do padrão (z-score), duplicidade, pagamento atípico." },
          { nome: "Motor preditivo", desc: "Fluxo líquido projetado (barras histórico vs previsto) + janela de pressão." },
          { nome: "Memória da operação", desc: "Padrões aprendidos: sazonalidade, despesas recorrentes, clientes críticos." },
        ],
      },
    ],
  },

  "/dre": {
    titulo: "DRE Intelligence Center",
    intro:
      "Centro de resultado: quanto ganhou, por quê, onde, qual cliente/linha, qual tendência e a projeção.",
    secoes: [
      {
        titulo: "O que dá para fazer",
        itens: [
          { nome: "Período", desc: "Mês atual / anterior / YTD / 12 meses — recalcula tudo." },
          { nome: "Regime", desc: "Competência (por vencimento) ou Caixa (por pagamento realizado)." },
          { nome: "Drill-down", desc: "Clique nas linhas com ▸ para abrir a composição por categoria." },
        ],
      },
      {
        titulo: "Variáveis / métricas",
        itens: [
          { nome: "EBITDA", desc: "Lucro operacional antes de juros, impostos, depreciação e amortização." },
          { nome: "Margem EBITDA / líquida", desc: "EBITDA e lucro líquido como % da receita líquida." },
          { nome: "Runway", desc: "Meses que o caixa sustenta a operação no ritmo atual." },
        ],
      },
      {
        titulo: "Os blocos da tela",
        itens: [
          { nome: "Waterfall gerencial", desc: "Receita bruta → impostos → líquida → CMV → lucro bruto → opex → EBITDA → financeiro → lucro líquido." },
          { nome: "DRE financeiro", desc: "Visão caixa: fluxos operacional/financeiro/livre + burn." },
          { nome: "Comparativo", desc: "Mês atual × anterior × YTD × 12m, com variações." },
          { nome: "Por linha / por cliente", desc: "Rentabilidade por linha de receita e por cliente (receita, margem, risco, vencido)." },
          { nome: "Projetado", desc: "Receita média × margem atual para 30/90/180/360 dias." },
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
          { nome: "Liquidez corrente", desc: "Ativo de curto prazo ÷ passivo de curto prazo." },
          { nome: "Burn multiple", desc: "Caixa queimado ÷ nova receita líquida (eficiência de queima)." },
          { nome: "Eficiência operacional", desc: "Receita ÷ custos, em índice 0–10." },
          { nome: "Qualidade da receita", desc: "0–100: recorrência, previsibilidade, inadimplência e concentração." },
        ],
      },
      {
        titulo: "Os blocos da tela",
        itens: [
          { nome: "Score de saúde", desc: "0–100 ponderado (liquidez, runway, margem, inadimplência…) + tendência." },
          { nome: "Radar executivo", desc: "7 dimensões (liquidez, eficiência, crescimento, previsibilidade, risco, rentabilidade, governança)." },
          { nome: "Evolução do score", desc: "Score mês a mês." },
          { nome: "Cenários preditivos", desc: "Choques (receita/despesa/inadimplência) → score projetado + prazo." },
          { nome: "Benchmark", desc: "Margem/eficiência/inadimplência/crescimento vs o setor." },
          { nome: "CFO digital", desc: "Interpretação executiva automática." },
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
          { nome: "Brief executivo", desc: "Headline: causa + sugestão (ex.: 'antecipar recebíveis → +X no score')." },
          { nome: "Matriz de risco", desc: "8 dimensões probabilísticas (caixa, liquidez, inadimplência, concentração, fornecedor, operacional, sazonal, crescimento) + stress agregado." },
          { nome: "Previsão Monte Carlo", desc: "Probabilidade de o caixa ficar negativo em 90 dias + bandas p10/p50/p90." },
          { nome: "Recomendações", desc: "Cada ação re-roda o motor de risco e mede o impacto real (Δrunway, Δscore, Δrisco)." },
          { nome: "Plano autônomo", desc: "Resposta coordenada com guardrails (automático / proposto / requer aprovação)." },
          { nome: "Feature store", desc: "As variáveis estruturadas que alimentam os modelos." },
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
          { nome: "Próxima melhor ação", desc: "A decisão de maior prioridade no momento." },
          { nome: "Decisões financeiras", desc: "Tipadas (cobrança/pagamento/capital/risco) com confiança, fatores e risco de execução." },
          { nome: "Human-in-the-loop", desc: "Guardrails: ações reversíveis executam sozinhas; mover dinheiro > R$2k vai para aprovação." },
          { nome: "Políticas SE→ENTÃO", desc: "Regras que a empresa define e a IA executa (mostra quais dispararam)." },
          { nome: "Cobrança autônoma", desc: "Canal, horário, estratégia e tom por cliente." },
          { nome: "Roteamento de pagamento", desc: "De qual conta/banco pagar para preservar liquidez." },
        ],
      },
    ],
  },

  "/risco": {
    titulo: "Risco de caixa",
    intro: "Motor proprietário de risco operacional: score, runway, ruptura, stress — explicável.",
    secoes: [
      {
        titulo: "Variáveis / métricas",
        itens: [
          { nome: "Score de risco", desc: "0–100 (maior = mais saudável), ponderado por 8 pilares." },
          { nome: "Probabilidade de ruptura", desc: "Chance de o caixa ficar negativo no horizonte." },
          { nome: "Runway", desc: "Dias/meses de sobrevivência em 3 cenários (otimista/base/pessimista)." },
        ],
      },
      {
        titulo: "Os blocos da tela",
        itens: [
          { nome: "Interpretação executiva", desc: "Narrativa + fatores críticos." },
          { nome: "Liquidez projetada", desc: "Saldo dia a dia (60d), marca a ruptura se houver." },
          { nome: "Pilares do score", desc: "Composição auditável (peso + nota de cada pilar)." },
          { nome: "Stress testing", desc: "Impacto de choques (queda de receita, atraso, despesa)." },
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
          { nome: "Resumo da carteira", desc: "Exposição em aberto, vencido, inadimplência esperada, score da carteira." },
          { nome: "Heatmap de risco", desc: "Clientes ordenados por score; clique para abrir o perfil." },
          { nome: "Perfil do cliente", desc: "Por que o risco (fatores explicados), early-warning, recuperação e recomendação de crédito." },
          { nome: "Segmentação", desc: "Bom pagador / sazonal / deteriorando / crônico." },
        ],
      },
    ],
  },

  "/orquestracao": {
    titulo: "Orquestração — Financial Operating System",
    intro: "Toda ação vira evento e propaga pela cascata. Dispare um evento e veja o sistema reagir.",
    secoes: [
      {
        titulo: "O que dá para fazer",
        itens: [
          { nome: "Disparar evento", desc: "Escolha tipo/valor/contraparte (ou um preset) e clique Orquestrar." },
        ],
      },
      {
        titulo: "Os blocos da tela",
        itens: [
          { nome: "Estado consolidado", desc: "Caixa, runway, score e prob. de ruptura — ao vivo." },
          { nome: "Cascata", desc: "Event Store → Ledger → recálculo → decisão → auditoria → antifraude → webhook, com os deltas." },
          { nome: "Event Store", desc: "Histórico imutável encadeado por hash (denuncia adulteração)." },
          { nome: "Ledger", desc: "Lançamentos de dupla partida (débito/crédito) e saldos." },
          { nome: "Grafo financeiro", desc: "Clientes → empresa → fornecedores e os fluxos." },
        ],
      },
    ],
  },

  "/infraestrutura": {
    titulo: "Infraestrutura financeira",
    intro: "A fundação bancária: ledger como verdade absoluta, idempotência, fila e observabilidade.",
    secoes: [
      {
        titulo: "O que dá para fazer",
        itens: [
          { nome: "Processar pagamento", desc: "Dispare um pagamento; repita a mesma chave para testar idempotência; simule falha + retry." },
        ],
      },
      {
        titulo: "Os blocos da tela",
        itens: [
          { nome: "Domínios", desc: "Os 10 domínios financeiros e onde vivem no produto." },
          { nome: "Ledger Core", desc: "Dupla partida; saldo derivado; trial balance fechado (D=C); transação desbalanceada é rejeitada." },
          { nome: "Fila", desc: "Jobs com status/tentativas e replay; dedup por idempotency key." },
          { nome: "Observabilidade", desc: "Invariantes em tempo real: integridade do ledger, divergência de saldo, jobs em falha." },
        ],
      },
    ],
  },

  "/arquitetura": {
    titulo: "Arquitetura institucional",
    intro: "A visão de financial operating infrastructure: 10 camadas, serviços, tesouraria e resiliência.",
    secoes: [
      {
        titulo: "O que dá para fazer",
        itens: [
          { nome: "Rodar cenário de falha", desc: "No bloco Reliability: vê circuit breaker, retries, dead-letter queue e lock em ação." },
        ],
      },
      {
        titulo: "Os blocos da tela",
        itens: [
          { nome: "10 camadas / serviços", desc: "O mapa institucional e os serviços distribuídos (latência/throughput)." },
          { nome: "Treasury Core", desc: "Posição consolidada, concentração bancária (HHI), liquidez em buckets, cash positioning, stress." },
          { nome: "Reliability", desc: "Circuit breaker / DLQ / lock — garante consistência sem duplicar dinheiro." },
          { nome: "Observabilidade & tenancy", desc: "Métricas da plataforma e isolamento multi-tenant." },
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
          { nome: "DNA financeiro", desc: "Arquétipo (agressiva/conservadora/sazonal…) + traços." },
          { nome: "Modelo auto-aprendiz", desc: "Acurácia/AUC + curva de aprendizado: fica mais preciso com mais empresas." },
          { nome: "Benchmark vs setor", desc: "Seu valor vs mediana e percentil dos pares." },
          { nome: "Modelo comportamental", desc: "Vizinhos semelhantes e % que entraram em stress." },
          { nome: "Credit intelligence", desc: "Probabilidade de inadimplência + limite recomendado + confiabilidade." },
        ],
      },
    ],
  },

  "/governanca": {
    titulo: "Governança institucional",
    intro: "Governança de nível bancário: auditoria imutável, RBAC e fluxo de aprovação.",
    secoes: [
      {
        titulo: "O que dá para fazer",
        itens: [
          { nome: "Testar adulteração", desc: "Na trilha de auditoria, simula a alteração de um evento e mostra a cadeia de hash quebrando." },
          { nome: "Policy engine", desc: "Mude usuário/valor/método/país/hora/IP e veja a decisão (aprovar/MFA/escalar/bloquear)." },
        ],
      },
      {
        titulo: "Os blocos da tela",
        itens: [
          { nome: "Trilha de auditoria", desc: "Eventos encadeados por SHA-256 + flags de before/after (alteração crítica)." },
          { nome: "Matriz RBAC", desc: "Quem pode fazer o quê (papel × ação)." },
          { nome: "Escada de aprovação", desc: "Fluxo por faixa de valor + SLA por etapa." },
        ],
      },
    ],
  },

  "/conciliacao": {
    titulo: "Conciliação",
    intro: "Matching probabilístico de transações para conciliar automaticamente o que for seguro.",
    secoes: [
      {
        titulo: "Os blocos da tela",
        itens: [
          { nome: "Filas", desc: "Auto (≥90% de confiança), sugestão (≥70%) e exceção (revisão manual)." },
          { nome: "Confidence", desc: "Score ponderado por valor/data/documento/contraparte/categoria." },
        ],
      },
    ],
  },

  "/automacoes": {
    titulo: "Automações",
    intro: "Motor de regras low-code: gatilho + condições + ações, com auditoria.",
    secoes: [
      {
        titulo: "Os blocos da tela",
        itens: [
          { nome: "Regras", desc: "FinancialRule = trigger + condições + ações (enviar cobrança, bloquear, alertar…)." },
          { nome: "Execuções & auditoria", desc: "O que cada regra disparou e o registro." },
          { nome: "Ponte risco", desc: "Quando um custo varia, recalcula o risco e emite alerta executivo." },
        ],
      },
    ],
  },

  "/vendas": {
    titulo: "Vendas",
    intro: "Documentos de venda/compra/orçamento.",
    secoes: [{ titulo: "O que dá para fazer", itens: [{ nome: "Novo", desc: "Abre o formulário de venda/compra/orçamento (itens, totais, converter em venda)." }] }],
  },
  "/produtos": {
    titulo: "Produtos",
    intro: "Cadastro de produtos.",
    secoes: [{ titulo: "O que dá para fazer", itens: [{ nome: "Novo produto", desc: "Nome, SKU, unidade, marca, preço de venda/custo, estoque." }] }],
  },
  "/servicos": {
    titulo: "Serviços",
    intro: "Cadastro de serviços.",
    secoes: [{ titulo: "O que dá para fazer", itens: [{ nome: "Novo serviço", desc: "Nome, código, unidade e preço." }] }],
  },
  "/contatos": {
    titulo: "Contatos",
    intro: "Clientes, fornecedores e transportadoras.",
    secoes: [{ titulo: "O que dá para fazer", itens: [{ nome: "Novo contato", desc: "PF/PJ com validação de CPF/CNPJ e busca de endereço por CEP (ViaCEP)." }] }],
  },
  "/recebiveis": {
    titulo: "A receber",
    intro: "Movimentos de entrada (recebíveis).",
    secoes: [{ titulo: "Os blocos da tela", itens: [{ nome: "Lista", desc: "Recebíveis por status e vencimento; vencidos em destaque." }] }],
  },
  "/pagaveis": {
    titulo: "A pagar",
    intro: "Movimentos de saída (pagáveis).",
    secoes: [{ titulo: "Os blocos da tela", itens: [{ nome: "Lista", desc: "Pagáveis por status e vencimento." }] }],
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
