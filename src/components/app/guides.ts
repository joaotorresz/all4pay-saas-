/**
 * Conteúdo dos guias por página. Cada rota explica: O QUE É, o que cada box faz,
 * COMO USAR e um EXEMPLO. Consumido por PageGuide (painel lateral) e Tour
 * (passo a passo com spotlight). `match` = substring da legenda visível do box,
 * usada pelo Tour para destacar o elemento na própria tela.
 */
export interface GuideItem {
  nome: string;
  desc: string;        // o que o box faz
  match?: string;      // âncora para o Tour
  exemplo?: string;    // exemplo de uso do box (opcional)
}
export interface GuideSection {
  titulo: string;
  itens: GuideItem[];
}
export interface Guide {
  titulo: string;
  intro: string;       // o que é / o que faz a página
  comoUsar?: string;   // passo a passo curto
  exemplo?: string;    // exemplo concreto de uso
  secoes: GuideSection[];
}

const acoes = (itens: GuideItem[]): GuideSection => ({ titulo: "O que dá para fazer", itens });
const blocos = (itens: GuideItem[]): GuideSection => ({ titulo: "Os blocos da tela", itens });

export const GUIDES: Record<string, Guide> = {
  "/": {
    titulo: "Início — visão geral financeira",
    intro: "Painel de comando: o estado do seu dinheiro hoje, em widgets independentes (cada um carrega, falha e atualiza sozinho). É a tela inicial e a referência de composição do sistema.",
    comoUsar: "Use a pílula de período no topo para mudar a janela (hoje/7/14/30 dias). Clique nos cards de A receber/A pagar para abrir as listas. Use 'Personalizar Home' para ligar/desligar e reordenar widgets, e o botão 'Nova transação' para lançar.",
    exemplo: "Quer saber quanto entra essa semana? Veja o card 'A receber' (hero = recebido hoje, secundários = essa semana e esse mês) e clique para abrir Entradas.",
    secoes: [
      acoes([
        { nome: "Nova transação", desc: "Porta única de lançamento: Recebi / Paguei / Vou receber / Vou pagar.", exemplo: "Clique em 'Nova transação' → 'Paguei' → preencha fornecedor e valor." },
        { nome: "Período global", desc: "Pílula no topo (Hoje · 7 · 14 · 30 dias · Personalizável) que reescala os widgets de período.", match: "Período" },
        { nome: "Personalizar Home", desc: "Liga/desliga widgets e reordena por arrastar; monta seu cockpit." },
      ]),
      blocos([
        { nome: "A receber", desc: "Hero = recebido hoje (neutro) + a receber essa semana e esse mês.", match: "A Receber" },
        { nome: "A pagar", desc: "Mesma leitura para saídas: pago hoje + a pagar na semana/mês.", match: "A Pagar" },
        { nome: "Contas financeiras", desc: "Saldo consolidado + selo de conciliação por conta.", match: "Contas Financeiras" },
        { nome: "Fluxo de caixa", desc: "Barras divergentes (entradas/saídas) + linha de saldo acumulado.", match: "Fluxo de caixa" },
        { nome: "Faturamento", desc: "Evolução do faturamento mês a mês.", match: "Faturamento" },
      ]),
    ],
  },

  /* ----------------------------- Contabilidade (razão) ----------------------------- */
  "/contabilidade?aba=razao": {
    titulo: "Razão (General Ledger)",
    intro: "A fonte única da verdade: razão de dupla entrada. Todo lançamento tem débito = crédito (validado no banco). É a base contábil auditável de todo o sistema.",
    comoUsar: "Clique em 'Backfill do histórico' para derivar lançamentos dos seus movimentos; ou 'Novo lançamento' para postar um manual (débito × crédito). Abra cada lançamento para ver as linhas por conta.",
    exemplo: "Primeiro acesso: clique 'Backfill do histórico' → o balancete fecha (∑Débito = ∑Crédito) e os lançamentos aparecem; depois abra /relatorios para ver DRE e Balanço.",
    secoes: [
      acoes([
        { nome: "Backfill do histórico", desc: "Deriva lançamentos de dupla entrada dos seus movimentos (idempotente).", match: "Backfill" },
        { nome: "Novo lançamento", desc: "Posta um lançamento manual balanceado (débito × crédito).", match: "Novo lançamento", exemplo: "Débito Caixa R$ 500 × Crédito Receita de vendas R$ 500." },
        { nome: "Importar Open Finance", desc: "Em live, traz transações do banco (Pluggy) para o razão, categorizadas.", match: "Importar Open Finance" },
      ]),
      blocos([
        { nome: "Balancete", desc: "Saldo por conta (por natureza) + selo 'Razão balanceado' (∑D = ∑C).", match: "Balancete" },
        { nome: "Lançamentos", desc: "Cada lançamento abre as linhas: conta · débito · crédito.", match: "Lançamentos" },
      ]),
    ],
  },
  "/contabilidade?aba=relatorios": {
    titulo: "Relatórios (Razão)",
    intro: "Relatórios calculados direto do razão de dupla entrada: DRE gerencial, Balanço patrimonial, Orçado × Realizado e pivot por dimensão. O razão é a fonte da verdade.",
    comoUsar: "Escolha o intervalo (De / Até). Para o orçamento, abra 'Editar orçamento' e informe o valor mensal por conta. Troque a dimensão do pivot (contraparte/centro).",
    exemplo: "Para ver se o mês fechou no azul: ajuste De/Até para o mês e veja a linha 'Resultado' do DRE e o selo 'Ativo = Passivo + PL'.",
    secoes: [
      blocos([
        { nome: "DRE do razão", desc: "Receita − despesa por conta no período.", match: "DRE gerencial · do razão" },
        { nome: "Orçado × Realizado", desc: "Variância R$/% por conta + narrativa (flux); realizado vem do razão.", match: "Orçado × Realizado", exemplo: "Orçou R$ 10k de marketing e gastou R$ 13k → desvio +30% desfavorável." },
        { nome: "Balanço patrimonial", desc: "Ativo = Passivo + PL + resultado, com selo de fechamento.", match: "Balanço patrimonial" },
        { nome: "Pivot por dimensão", desc: "Resultado por contraparte ou centro de custo.", match: "Pivot por dimensão" },
      ]),
    ],
  },

  /* ----------------------------- Relatórios gerenciais ----------------------------- */
  "/dashboard/reports/dre": {
    titulo: "DRE Intelligence Center",
    intro: "Centro de resultado gerencial: quanto ganhou, por quê, onde, qual cliente/linha, qual tendência e a projeção. Roda sobre os movimentos.",
    comoUsar: "Defina o intervalo De/Até, a cadência (mensal/trimestral/semestral/anual — ajusta os meses do range) e o regime (competência/caixa). Clique nas linhas com ▸ para o drill-down.",
    exemplo: "Para comparar trimestres: cadência 'Trimestral' → a tabela 'Evolução' mostra receita/EBITDA/lucro por trimestre.",
    secoes: [
      acoes([
        { nome: "Período (intervalo)", desc: "De / Até definem o intervalo observado.", match: "De" },
        { nome: "Cadência", desc: "Mensal/Trimestral/Semestral/Anual — agrupa a evolução e ajusta os meses.", match: "Cadência" },
        { nome: "Regime", desc: "Competência (vencimento) ou Caixa (pagamento).", match: "Regime" },
      ]),
      blocos([
        { nome: "Waterfall gerencial", desc: "Receita → impostos → líquida → CMV → lucro bruto → opex → EBITDA → financeiro → lucro.", match: "DRE gerencial" },
        { nome: "DRE financeiro", desc: "Visão caixa: fluxos operacional/financeiro/livre + burn.", match: "DRE financeiro" },
        { nome: "Evolução por cadência", desc: "Receita, EBITDA, margem e lucro por período.", match: "Evolução" },
        { nome: "Por linha / cliente / centro", desc: "Rentabilidade por produto, cliente e centro de custo.", match: "DRE por cliente" },
        { nome: "Projetado", desc: "Receita média × margem para 30/90/180/360 dias.", match: "DRE projetado" },
      ]),
    ],
  },
  "/fluxo-caixa": {
    titulo: "Fluxo de Caixa",
    intro: "O centro operacional do caixa: 14 blocos (executivo, fluxo inteligente, previsto×realizado, calendário, projeção Monte Carlo, cenários, heatmap, waterfall, copiloto, what-if, eventos, confiança, digital twin) montados em uma execução.",
    comoUsar: "No header, escolha período, conta, regime (competência/caixa/híbrido) e visão (previsto/realizado/consolidado) — tudo reprocessa a página. Expanda as linhas do fluxo inteligente para descer no detalhe.",
    exemplo: "Para um 'e se' rápido: use o bloco What-If e arraste o slider de inadimplência para +10% e veja o runway reagir.",
    secoes: [
      acoes([
        { nome: "Filtros do header", desc: "Período · conta · regime · visão — reprocessam tudo.", match: "Período" },
        { nome: "What-If", desc: "Sliders de receita/despesa/inadimplência/folha recalculam ao vivo.", match: "What-If" },
      ]),
      blocos([
        { nome: "Resumo executivo", desc: "Caixa, entradas/saídas previstas, geração, burn, runway, ruptura, score.", match: "Executive" },
        { nome: "Projeção ML", desc: "Monte Carlo 7/30/90/180/365 + bandas p10/p50/p90.", match: "Projeção" },
        { nome: "Calendário / Heatmap", desc: "Recebe/paga/saldo por dia; liquidez verde/amarelo/vermelho.", match: "Heat" },
      ]),
    ],
  },

  /* ----------------------------- Campfire (engines locais) ----------------------------- */
  "/orcamento": {
    titulo: "Orçamento vs Realizado",
    intro: "Compara cada linha do resultado contra o orçamento e EXPLICA o desvio até a categoria e a transação (flux analysis). Sem orçamento manual, usa baseline automático (run-rate).",
    comoUsar: "Escolha período e regime. Em 'Editar orçamento', informe o valor mensal por linha (em branco = automático). Abra cada linha para ver categorias e transações que explicam o desvio.",
    exemplo: "Defina R$ 8k/mês de Folha; se o realizado vier R$ 9,5k, a linha mostra +19% desfavorável e as transações que puxaram.",
    secoes: [
      blocos([
        { nome: "Resumo", desc: "Receita, EBITDA e Lucro: realizado vs orçado + desvio.", match: "EBITDA" },
        { nome: "Análise de variação", desc: "Narrativa: maior desvio desfavorável e destaque favorável.", match: "Análise de variação" },
        { nome: "Tabela por linha", desc: "Orçado · realizado · desvio R$ · % com drill-down.", match: "Linha" },
      ]),
    ],
  },
  "/contabilidade?aba=fechamento": {
    titulo: "Fechamento contábil",
    intro: "Fechamento contínuo: o mês vira revisão e aprovação, não construção do zero. Tarefas de IA já vêm resolvidas; você trava o período quando fecha.",
    comoUsar: "Escolha o mês, marque as tarefas manuais (conciliar/variância/aprovar), lance as provisões sugeridas no razão e clique 'Travar período' para proteger os lançamentos.",
    exemplo: "Ao fechar maio: confira que 0 pendências, lance a provisão de aluguel ausente e clique 'Travar período' — depois o razão recusa postagens em maio.",
    secoes: [
      acoes([
        { nome: "Travar período", desc: "Protege os lançamentos do mês (e o razão rejeita postagens no banco).", match: "Travar período" },
        { nome: "Lançar provisão", desc: "Posta a provisão sugerida no razão (despesa × provisões a pagar)." },
      ]),
      blocos([
        { nome: "Prontidão", desc: "% das tarefas concluídas + métricas do mês.", match: "pronto" },
        { nome: "Checklist", desc: "Tarefas de IA (faltantes, pendências, provisões) + manuais.", match: "Checklist de fechamento" },
        { nome: "Provisões sugeridas", desc: "Accruals pela média histórica das recorrentes ausentes.", match: "Provisões sugeridas" },
      ]),
    ],
  },
  "/contabilidade?aba=cronogramas": {
    titulo: "Cronogramas (amortização/depreciação)",
    intro: "Despesas antecipadas (amortização) e ativo imobilizado (depreciação) vivem aqui; os cronogramas consolidam num único lançamento mensal para o razão.",
    comoUsar: "Crie um cronograma (tipo, valor total, vida útil em meses, início, residual). Escolha o mês e clique 'Lançar no razão' para postar a parcela consolidada.",
    exemplo: "Notebook de R$ 18.000, 36 meses, residual R$ 1.800 → R$ 450/mês de depreciação lançados automaticamente.",
    secoes: [
      acoes([
        { nome: "Novo cronograma", desc: "Tipo, valor, vida útil, início e (depreciação) residual.", match: "Cronogramas" },
        { nome: "Lançar no razão", desc: "Posta o lançamento mensal consolidado (depreciação/amortização × acumulada).", match: "Lançar no razão" },
      ]),
      blocos([
        { nome: "Resumo da carteira", desc: "Ativos no mês, lançamento do mês, saldo a amortizar/depreciar.", match: "Saldo a amortizar" },
        { nome: "Lançamento consolidado", desc: "Amortização + depreciação do mês = um lançamento para aprovar.", match: "Lançamento mensal consolidado" },
      ]),
    ],
  },
  "/contabilidade?aba=receita": {
    titulo: "Reconhecimento de receita",
    intro: "Reconhece a receita ao longo da obrigação (IFRS 15/CPC 47), a partir dos contratos de recorrência: MRR/ARR, receita diferida e waterfall de MRR.",
    comoUsar: "Crie/ative recorrências em /recorrencias. Aqui, clique 'Reconhecer competência no razão' para postar a parcela do mês de cada contrato (receita diferida → receita).",
    exemplo: "Contrato anual de R$ 12.000 cobrado à vista → reconhece R$ 1.000/mês; o resto fica como receita diferida (passivo).",
    secoes: [
      acoes([
        { nome: "Reconhecer competência", desc: "Posta no razão a receita do mês de cada contrato ativo.", match: "Reconhecer competência" },
      ]),
      blocos([
        { nome: "Resumo", desc: "MRR, ARR, receita diferida e reconhecida no mês.", match: "Receita diferida" },
        { nome: "Waterfall de MRR", desc: "Trajetória do MRR mês a mês; novos contratos elevam a barra.", match: "Waterfall de receita recorrente" },
        { nome: "Por contrato", desc: "MRR, diferida e progresso do ciclo atual.", match: "Contrato" },
      ]),
    ],
  },
  "/contabilidade?aba=dimensoes": {
    titulo: "Dimensões & Tags",
    intro: "Pivota os movimentos por qualquer dimensão e desce da agregação até a transação. Marque tags por transação para criar dimensões ilimitadas.",
    comoUsar: "Escolha a dimensão (categoria/centro/contraparte/tag), o período e o regime. Abra uma linha e use '+ tag' para etiquetar uma transação.",
    exemplo: "Crie a tag 'Projeto X' em algumas transações → escolha a dimensão 'Tag' e veja receita/despesa/resultado do Projeto X.",
    secoes: [
      blocos([
        { nome: "Pivot", desc: "Receita/despesa/resultado por valor da dimensão.", match: "Categoria" },
        { nome: "Drill-down + tags", desc: "Cada transação com data, contraparte, valor e suas tags.", match: "lançamento" },
      ]),
    ],
  },

  /* ----------------------------- All 4 Pay AI ----------------------------- */
  // ⚠️ UM guia, porque é UMA tela: a conversa e os quatro painéis dos motores
  // (Quant, Decisão, Risco, Autônomo) vivem no mesmo destino desde a fusão do
  // mapa de consolidação (item 6). Dois guias na mesma rota fariam a busca da
  // Central de Ajuda escolher um deles por ordem de arquivo.
  "/all4pay-ai": {
    titulo: "All 4 Pay AI",
    intro: "A superfície ÚNICA de IA: a aba Conversa responde sobre os seus números, e as abas Quant, Decisão, Risco e Autônomo são os motores — score de saúde, Monte Carlo, runway e plano supervisionado. É a mesma IA do botão flutuante; aqui cabe a conversa longa, o gráfico grande e o histórico do lado.",
    comoUsar: "Pergunte em português normal (“quanto gastei esse mês?”, “estou crescendo?”). A resposta passa pelas etapas de análise e vem com os números, as fontes do cálculo e, quando ajuda, um gráfico. As conversas ficam salvas à esquerda, agrupadas por data.",
    exemplo: "“Quais meus maiores gastos?” → o total do mês, as três maiores categorias com percentual e um gráfico de barras. Depois: “e no mês passado?” — ela lembra do contexto.",
    secoes: [
      acoes([
        { nome: "Perguntar", desc: "Conceitos (“o que é runway?”), números reais (saldo, margem, inadimplência) e simulações (financiamento, Simples, precificação).", match: "Envie uma mensagem" },
        { nome: "Retomar uma conversa", desc: "Clique no histórico à esquerda — Hoje, Últimos 7 dias, Últimos 30 dias.", match: "Nova conversa" },
        { nome: "Conferir a fonte", desc: "Cada resposta mostra os motores usados; o polegar 👍/👎 ensina a IA a priorizar suas perguntas." },
      ]),
    ],
  },

  /* ----------------------------- Upload / ingestão ----------------------------- */
  "/upload": {
    titulo: "Entrada de dados",
    intro: "A esteira única de ingestão, em três abas: Conectar (Open Finance/bancos + posição por conta), Enviar (extratos CSV/OFX e documentos por OCR via FDIP) e Conciliar (casa o que entrou com os títulos previstos, baixa única). Tudo o que entra no sistema passa por aqui.",
    comoUsar: "Escolha a aba: em Conectar, autorize o banco; em Enviar, arraste arquivos (ou cole/use a amostra) e confirme; em Conciliar, revise as filas (auto/sugestão/exceção) e dê baixa.",
    exemplo: "Conecte o banco (Conectar) → o extrato entra → em Conciliar, um PIX de R$ 1.200 casa com a fatura de R$ 1.200 do cliente; ou arraste um CSV em Enviar → revise e confirme.",
    secoes: [
      acoes([
        { nome: "Conectar", desc: "Open Finance (Pluggy): bancos, extrato e posição consolidada por conta." },
        { nome: "Enviar", desc: "CSV/OFX/TXT em lote ou PNG/JPG/PDF por OCR; cadastra contatos/categorias e cria os lançamentos." },
        { nome: "Conciliar", desc: "Matching probabilístico (auto/sugestão/exceção) → baixa do título previsto, sem contar o dinheiro 2x." },
      ]),
    ],
  },
  "/automacoes": {
    titulo: "Automações",
    intro: "Motor de regras low-code (gatilho + condições + ações) com auditoria e ponte para o risco. Cada evento financeiro pode disparar uma ação.",
    comoUsar: "Crie/edite regras (SE evento E condição ENTÃO ação). As execuções ficam auditadas; em live, rodam sobre eventos derivados do estado real.",
    exemplo: "SE saldo < R$ 5.000 ENTÃO notificar no WhatsApp; SE despesa variar > 30% ENTÃO recalcular risco e alertar.",
    secoes: [],
  },

  /* ----------------------------- Receber ----------------------------- */
  "/recebiveis": {
    titulo: "Entradas",
    intro: "Tela unificada das entradas (recebíveis): um filtro segmentado reúne tudo num lugar só — em aberto, já realizado e recorrente.",
    comoUsar: "Troque a aba (Em aberto · Realizado · Recorrente). No 'Em aberto', edite valor/vencimento ou envie para a Lixeira. Lançamentos de mês travado ficam bloqueados.",
    exemplo: "Quer ver o que já caiu? Aba 'Realizado' mostra os recebimentos com a data de liquidação.",
    secoes: [
      acoes([
        { nome: "Filtrar", desc: "Em aberto (a receber) · Realizado (recebido) · Recorrente (contratos)." },
        { nome: "Editar / excluir", desc: "Só no 'Em aberto'; respeita período travado." },
      ]),
    ],
  },
  "/dashboard/financial/accounts-and-transfers?tab=receivables": {
    titulo: "Central de recebimentos",
    intro: "Executa as entradas lançadas (dar baixa no que foi recebido), agrupadas por dia/semana/mês, com busca e conta de entrada.",
    comoUsar: "Filtre/agrupe, selecione os títulos recebidos e dê baixa; o saldo da conta só sobe na liquidação.",
    exemplo: "Recebeu 3 boletos hoje → selecione-os e confirme o recebimento para o saldo refletir.",
    secoes: [],
  },
  "/recebimentos?aba=recorrencias": {
    titulo: "Recorrências / Contratos",
    intro: "Motor de receita previsível (MRR): um contrato (cliente + itens do catálogo + ciclo) projeta as próximas faturas como entradas previstas no hub.",
    comoUsar: "Crie uma recorrência (cliente, itens, ciclo) e Ative — as faturas futuras entram no fluxo previsto. Pausar/Cancelar (churn) remove do fluxo.",
    exemplo: "Mensalidade de R$ 990 para o cliente Acme, ciclo mensal → projeta R$ 990/mês em A receber e no MRR.",
    secoes: [
      blocos([{ nome: "Dashboard de assinatura", desc: "MRR, ativas, ticket médio e churn." }]),
    ],
  },
  "/dashboard/financial/overdue": {
    titulo: "Inadimplência — inteligência de crédito",
    intro: "Prevê inadimplência antes de acontecer, a partir do comportamento de pagamento de cada cliente (não de status estático). Explicável: cada fator carrega sua contribuição.",
    comoUsar: "Veja o score da carteira, abra o heatmap para um cliente e leia o porquê do risco (fatores) + a ação de cobrança recomendada.",
    exemplo: "Um cliente que vem atrasando mais e reduzindo ticket sobe no heatmap → a tela sugere cobrança e limite menor.",
    secoes: [
      blocos([
        { nome: "Score da carteira", desc: "Exposição, vencido, inadimplência esperada e score.", match: "Score da carteira" },
        { nome: "Heatmap de risco", desc: "Clientes ordenados por score; clique para abrir o perfil.", match: "Heatmap de risco" },
        { nome: "Perfil do cliente", desc: "Fatores, early-warning, recuperação e recomendação.", match: "Por que esse risco" },
      ]),
    ],
  },
  "/dashboard/financial/boletos": {
    titulo: "Boleto",
    intro: "Boletos colados ao recebível (no jsonb do movimento): gera/registra o boleto vinculado à entrada.",
    comoUsar: "Emita ou cole o boleto no recebível correspondente; o pagamento concilia e fecha o ciclo receita → caixa.",
    exemplo: "Gere o boleto da fatura do cliente Acme → quando pago, baixa automaticamente.",
    secoes: [],
  },
  "/vendas?aba=notas": {
    titulo: "Notas fiscais (NFS-e)",
    intro: "Emissão e controle de NFS-e (serviços), com os impostos brasileiros (ISS) e vínculo ao recebível/recorrência.",
    comoUsar: "Emita a NFS-e a partir de uma venda/recorrência; acompanhe número, código de verificação e status.",
    exemplo: "Emita a NFS-e do serviço de consultoria de R$ 5.000 → o ISS é calculado e a nota fica vinculada.",
    secoes: [],
  },

  /* ----------------------------- Pagar ----------------------------- */
  "/pagaveis": {
    titulo: "Saídas",
    intro: "Tela unificada das saídas (pagáveis), espelhando Entradas: filtro Em aberto · Realizado · Recorrente sobre o mesmo hub.",
    comoUsar: "Troque a aba (Em aberto · Realizado · Recorrente). No 'Em aberto', edite ou exclua; respeita período travado.",
    exemplo: "Aba 'Em aberto' lista o que vence; selecione um título e edite o vencimento se renegociou.",
    secoes: [
      acoes([{ nome: "Filtrar", desc: "Em aberto (a pagar) · Realizado (pago) · Recorrente." }]),
    ],
  },
  "/dashboard/financial/accounts-and-transfers?tab=payables": {
    titulo: "Central de pagamentos",
    intro: "Executa os títulos de saída lançados, agrupados por período, com seleção múltipla, conta de saída e método. Idempotente (reenviar não paga 2x).",
    comoUsar: "Selecione os títulos, escolha a conta/método e pague (por linha ou em lote); anexe o comprovante. Títulos acima da alçada ficam bloqueados até aprovação.",
    exemplo: "Pague 5 fornecedores de uma vez via PIX → o saldo só cai na liquidação; o card 'Contas pagas' registra.",
    secoes: [
      acoes([
        { nome: "Pagar (lote/linha)", desc: "Confirmar pagamento + anexar comprovante.", match: "Pagar" },
        { nome: "Gate de alçada", desc: "Acima do limite → bloqueado, com link para aprovações." },
      ]),
    ],
  },
  "/aprovacoes": {
    titulo: "Solicitações & aprovações",
    intro: "Gate de alçada de nível bancário: títulos acima do limite precisam de aprovação, com sugestão de IA, trilha e segregação de funções.",
    comoUsar: "Nas abas (fila/minhas/todas), abra uma solicitação e Aprove / Rejeite / Devolva. A IA sugere com base no histórico do favorecido.",
    exemplo: "Pagamento de R$ 8.000 (acima de R$ 5k) entra na fila → o aprovador confere e aprova; só então pode ser pago.",
    secoes: [],
  },
  "/dashboard/financial/reimbursements": {
    titulo: "Reembolsos",
    intro: "Reembolso do colaborador: formulário + itens (com OCR do comprovante) + chave Pix. Roteia pelo mesmo motor de alçada e, ao aprovar, gera uma saída por item.",
    comoUsar: "O colaborador lança os itens (foto do comprovante extrai os campos) e a chave Pix; ao aprovar, vira saída na Central de pagamentos.",
    exemplo: "3 notas de despesa de viagem → cada uma vira um lançamento de saída na categoria certa (reflete no DRE).",
    secoes: [],
  },
  "/lixeira": {
    titulo: "Lixeira",
    intro: "Lançamentos cancelados, recuperáveis: nada é apagado de verdade — dá para restaurar ou expurgar.",
    comoUsar: "Abra a Lixeira, restaure o que foi cancelado por engano ou expurgue em definitivo.",
    exemplo: "Excluiu um pagável errado em /pagaveis? Ele está aqui — clique 'Restaurar'.",
    secoes: [],
  },

  /* ----------------------------- Cadastrar ----------------------------- */
  "/dashboard/registrations/clients": {
    titulo: "Contatos",
    intro: "Clientes, fornecedores e transportadoras, com validação de CPF/CNPJ e busca de endereço por CEP (ViaCEP). Editável (clicar numa linha abre o cadastro).",
    comoUsar: "Use 'Novo' para cadastrar (o CNPJ/CPF é validado e o CEP preenche o endereço). Clique numa linha para editar — ex.: adicionar o telefone que alimenta a cobrança.",
    exemplo: "Cadastre o fornecedor pelo CNPJ → o sistema valida e você completa o endereço pelo CEP.",
    secoes: [],
  },
  // ⚠️ UM guia para a tela, porque é UMA tela: produtos e serviços são o mesmo
  // cadastro com um filtro visível separando os dois (mapa de consolidação,
  // item 1). Dois guias apontando para a mesma rota fariam a busca da Central
  // de Ajuda escolher um deles por ordem de arquivo.
  "/dashboard/registrations/products": {
    titulo: "Produtos e serviços",
    intro: "O catálogo do que você vende. O segmentado no topo separa PRODUTOS (nome, SKU, unidade, marca, preço de venda/custo) de SERVIÇOS (nome, código, unidade, preço). Alimenta vendas, recorrências, NFS-e e o DRE por linha.",
    comoUsar: "Escolha Produtos ou Serviços no topo e use 'Novo' para cadastrar. O tipo fiscal decide o que sai na nota.",
    exemplo: "Em Produtos, cadastre 'Camiseta P' a R$ 49,90 com custo R$ 20 → a margem aparece no DRE por linha. Em Serviços, cadastre 'Consultoria mensal' a R$ 990 → use numa recorrência para virar MRR.",
    secoes: [],
  },
  "/vendas": {
    titulo: "Vendas",
    intro: "Documentos de venda/compra/orçamento: itens, totais e conversão de orçamento em venda. Escreve sales_docs + itens (+ movimento quando não é orçamento).",
    comoUsar: "Use 'Novo' para abrir o formulário (produto/serviço, itens, totais). 'Converter em venda' transforma um orçamento aprovado.",
    exemplo: "Orçamento de 10 camisetas → cliente aprova → 'Converter em venda' gera o recebível.",
    secoes: [],
  },

  /* ----------------------------- Central POS ----------------------------- */
  "/vendas?aba=pos-taxas": {
    titulo: "Configuração de taxas all4pay",
    intro: "Simulador POS (maquininha): modela MDR + antecipação + online por MCC × range × bandeira, com o spread (margem) editável. Salva a configuração da sua operação.",
    comoUsar: "Escolha MCC, range, SELIC e ligue antecipação/online; edite o spread por grupo. A taxa final ao EC recalcula por parcela.",
    exemplo: "Restaurante (MCC 5812), range 1, com antecipação → veja a taxa final de crédito em 12x.",
    secoes: [],
  },
  "/vendas?aba=pos": {
    titulo: "Simulador de venda (POS)",
    intro: "Simula uma venda na maquininha usando as taxas configuradas: calcula o líquido ao EC e registra o recebível líquido (e a tarifa como custo no DRE).",
    comoUsar: "Informe valor, bandeira e parcelas; veja o líquido e conclua para gerar o recebível (e a 'Tarifa de adquirência' como custo).",
    exemplo: "Venda de R$ 1.000 em 3x crédito → o líquido cai em Recebimentos e a taxa entra como despesa.",
    secoes: [],
  },

  /* ----------------------------- Inteligência (Pro) ----------------------------- */
  "/inteligencia": {
    titulo: "Inteligência — camada quantitativa",
    intro: "O 'Bloomberg para PMEs': transforma lançamentos em métricas executivas, score de saúde, radar, projeção e interpretação de CFO digital.",
    comoUsar: "Leia o score e o radar; abra os KPIs e os cenários preditivos; compare com o benchmark do setor.",
    exemplo: "Score caiu? Veja qual pilar (liquidez/margem/concentração) puxou e o cenário de choque.",
    secoes: [
      blocos([
        { nome: "Score de saúde", desc: "0–100 ponderado + tendência.", match: "Score de saúde" },
        { nome: "Radar executivo", desc: "7 dimensões (liquidez, eficiência, crescimento…).", match: "Radar executivo" },
        { nome: "Cenários / Benchmark", desc: "Choques → score projetado; comparação com o setor.", match: "Benchmark setorial" },
      ]),
    ],
  },
  "/risco": {
    titulo: "Risco de caixa",
    intro: "Motor proprietário de risco operacional: score, runway, ruptura e stress — explicável (cada pilar com peso e nota).",
    comoUsar: "Leia o score e a probabilidade de ruptura; veja o runway por cenário e rode o stress testing.",
    exemplo: "Stress: 'queda de 20% na receita' → o runway por cenário pessimista mostra quando o caixa zera.",
    secoes: [
      blocos([
        { nome: "Score de risco", desc: "0–100 (maior = mais saudável) + prob. de ruptura + runway.", match: "Score de risco de caixa" },
        { nome: "Liquidez projetada", desc: "Saldo dia a dia (60d), marca a ruptura.", match: "Liquidez projetada" },
        { nome: "Stress testing", desc: "Impacto de choques (queda de receita, atraso, despesa).", match: "Stress testing" },
      ]),
    ],
  },
  "/decisao": {
    titulo: "Decisão — Financial Decision Layer",
    intro: "Industrializa a inteligência: interpreta, pontua risco (matriz probabilística), prevê (Monte Carlo) e recomenda com impacto quantificado (re-roda o motor de risco).",
    comoUsar: "Leia o headline, a matriz de risco e a previsão; cada recomendação mostra Δrunway/Δscore reais — aprove o plano autônomo conforme os guardrails.",
    exemplo: "'Antecipar recebíveis de X' → a recomendação mostra +12 dias de runway.",
    secoes: [
      blocos([
        { nome: "Matriz de risco", desc: "8 dimensões probabilísticas + stress agregado.", match: "Matriz de risco" },
        { nome: "Previsão Monte Carlo", desc: "Prob. de caixa negativo em 90d + bandas p10/p50/p90.", match: "Previsão de caixa" },
        { nome: "Recomendações", desc: "Cada ação re-roda o risco e mede o impacto real.", match: "Recomendações" },
      ]),
    ],
  },
  "/autonomo": {
    titulo: "Autônomo — operação supervisionada",
    intro: "O salto de 'informar o problema' para decidir e executar, com você como supervisor: políticas SE→ENTÃO, cobrança e roteamento de pagamento autônomos.",
    comoUsar: "Veja a próxima melhor ação e as decisões tipadas; ações reversíveis executam sozinhas, mover dinheiro acima do limite vai para aprovação (HITL).",
    exemplo: "Cliente de alto risco vencido → a cobrança autônoma escolhe canal/horário/tom e dispara.",
    secoes: [
      blocos([
        { nome: "Next best action", desc: "A decisão de maior prioridade no momento.", match: "Operação financeira autônoma" },
        { nome: "Human-in-the-loop", desc: "Reversível executa; mover dinheiro > limite vai p/ aprovação.", match: "Human-in-the-loop" },
        { nome: "Cobrança / Roteamento", desc: "Canal/horário/tom por cliente; conta que preserva liquidez.", match: "Cobrança autônoma" },
      ]),
    ],
  },

  /* ----------------------------- Equipe / Plataforma ----------------------------- */
  "/governanca": {
    titulo: "Governança institucional",
    intro: "Governança de nível bancário: trilha de auditoria imutável (hash-chain), RBAC + policy engine e fluxo de aprovação.",
    comoUsar: "Teste a adulteração da trilha, simule o policy engine (usuário/valor/método/país/hora/IP) e veja a escada de aprovação por faixa de valor.",
    exemplo: "Mude o valor de uma transação na simulação → a policy engine responde 'exigir MFA' ou 'escalar'.",
    secoes: [
      blocos([
        { nome: "Trilha de auditoria", desc: "Eventos encadeados por SHA-256 + flags before/after.", match: "Trilha de auditoria" },
        { nome: "Policy engine / RBAC", desc: "Decisão por contexto; matriz papel × ação.", match: "Policy engine" },
        { nome: "Escada de aprovação", desc: "Fluxo por faixa de valor + biometria + SLA.", match: "Fluxo de aprovação" },
      ]),
    ],
  },

  /* ----------------------------- Configurações ----------------------------- */
  "/configuracoes": {
    titulo: "Empresa / Configurações",
    intro: "Tela de empresa: nome da organização (do Supabase), identidade jurídica editável, perfil empresarial, governança (participantes) e estrutura financeira.",
    comoUsar: "Edite a identidade jurídica e salve. Em Governança, adicione/edite participantes (papel, permissões, limite de aprovação); em live, grava nos membros da organização.",
    exemplo: "Defina um participante como 'Gestor' que aprova até R$ 5.000 → ele passa a aparecer no gate de alçada.",
    secoes: [
      blocos([
        { nome: "Identidade jurídica", desc: "Razão social, CNPJ, regime, representante — editável." },
        { nome: "Governança · participantes", desc: "Papel + permissões + limite por membro; proprietário protegido.", match: "Governança" },
        { nome: "Estrutura financeira", desc: "Contas, centros, unidades e visões de DRE do onboarding." },
      ]),
    ],
  },

  /* ----------------------------- Painel de vendas ----------------------------- */
  "/vendas?aba=painel": {
    titulo: "Painel de vendas",
    intro: "O dashboard comercial: faturamento, ticket, mix e evolução das vendas num só painel — a leitura executiva do lado da receita.",
    comoUsar: "Acompanhe os KPIs do topo e a evolução mês a mês; use os filtros de período para reescalar. Clique numa venda para abrir o documento.",
    exemplo: "Caiu o faturamento do mês? Compare o mix produto × serviço e veja qual linha recuou.",
    secoes: [
      blocos([
        { nome: "KPIs de venda", desc: "Faturamento, ticket médio e volume do período." },
        { nome: "Evolução", desc: "Vendas mês a mês — tendência e sazonalidade." },
      ]),
    ],
  },

  /* ----------------------------- Plano de Contas ----------------------------- */
  "/contabilidade?aba=plano-de-contas": {
    titulo: "Plano de Contas",
    intro: "A espinha dorsal da classificação: hierarquia Grupo → Categoria (verde = receita · vermelho = despesa · cinza = resultado), no plano padrão para negócios digitais.",
    comoUsar: "Navegue pela hierarquia para entender onde cada lançamento cai. A aba 'Uso padrão' mostra o dicionário de auto-classificação (função do motor → categoria).",
    exemplo: "Quer saber por que 'combustível' caiu em Logística? Veja a categoria correspondente na aba Uso padrão.",
    secoes: [
      blocos([
        { nome: "Hierarquia", desc: "Grupos e categorias codificados por cor, com o código contábil." },
        { nome: "Uso padrão", desc: "Qual categoria o sistema usa automaticamente em cada fluxo (venda, tarifa, imposto…).", match: "Uso padrão" },
      ]),
    ],
  },

  /* ----------------------------- Nova venda ----------------------------- */
  "/vendas?aba=nova": {
    titulo: "Nova venda",
    intro: "A venda como documento-mãe: itens do catálogo, condição de pagamento e os efeitos em cascata (recebível, NF, imposto, DRE).",
    comoUsar: "Escolha cliente e itens (produtos/serviços), defina a condição (à vista/parcelado) e salve — o recebível e o resultado saem daqui.",
    exemplo: "Venda de R$ 3.000 em 3x → 3 recebíveis de R$ 1.000 aparecem em Contas a receber e a receita no DRE.",
    secoes: [
      blocos([
        { nome: "Itens", desc: "Linhas de produto/serviço com quantidade, preço e desconto." },
        { nome: "Condição de pagamento", desc: "À vista, parcelado ou orçamento (sem efeito financeiro até converter)." },
      ]),
    ],
  },

  /* ----------------------------- Projetos ----------------------------- */
  "/dashboard/registrations/projects": {
    titulo: "Projetos",
    intro: "Dimensão de rateio: associe receitas e despesas a projetos para enxergar margem por projeto no DRE.",
    comoUsar: "Cadastre o projeto e use-o no rateio dos lançamentos (splits). O resultado por projeto sai no DRE por dimensão.",
    secoes: [
      blocos([{ nome: "Lista de projetos", desc: "Projetos ativos com os lançamentos vinculados." }]),
    ],
  },

  /* ----------------------------- Centros de Custo ----------------------------- */
  "/dashboard/registrations/cost-centers": {
    titulo: "Centros de Custo",
    intro: "A segunda dimensão de rateio: cada lançamento pode apontar um centro (Comercial, Operação, ADM…) e o DRE abre por centro de custo.",
    comoUsar: "Cadastre os centros e selecione-os nos lançamentos/vendas; o DRE por centro mostra onde o dinheiro é consumido.",
    exemplo: "Folha rateada 60% Operação / 40% ADM → o DRE por centro reflete o peso real de cada área.",
    secoes: [
      blocos([{ nome: "Lista de centros", desc: "Centros cadastrados e uso nos lançamentos." }]),
    ],
  },

  /* ----------------------------- Impostos ----------------------------- */
  "/dashboard/sales-invoices/tax-provisioning": {
    titulo: "Impostos",
    intro: "A visão fiscal: guias e tributos do período (DAS/Simples, retenções), com o peso da carga tributária sobre a receita.",
    comoUsar: "Acompanhe as guias do mês e os vencimentos; a carga tributária (% da receita) sai do motor de DRE.",
    exemplo: "Pergunte à IA 'quanto pago de Simples faturando 500 mil por ano?' para simular por anexo.",
    secoes: [
      blocos([
        { nome: "Guias do período", desc: "Tributos lançados com vencimento e status." },
        { nome: "Carga tributária", desc: "Impostos ÷ receita bruta do período." },
      ]),
    ],
  },

  /* ----------------------------- Contabilidade (integração) ----------------------------- */
  "/contabilidade": {
    titulo: "Contabilidade — envio ao contador",
    intro: "A ponte com o escritório contábil: exporta o movimento (TXT Domínio) e as NFs do período para importação direta no sistema do contador.",
    comoUsar: "Escolha o período, gere o arquivo TXT e envie ao contador; as NFs seguem no mesmo pacote.",
    secoes: [
      blocos([
        { nome: "Exportação TXT", desc: "Arquivo no layout Domínio com o movimento do período." },
        { nome: "Notas fiscais", desc: "NFs do período incluídas no envio." },
      ]),
    ],
  },

  /* ----------------------------- Consolidado multiempresa ----------------------------- */
  "/contabilidade?aba=consolidado": {
    titulo: "Consolidado (multiempresa)",
    intro: "A posição agregada das organizações em que você é membro: saldo, receita, despesa e resultado lado a lado (sem eliminações intercompany na v1).",
    comoUsar: "Compare as empresas e clique numa linha para entrar no contexto dela.",
    secoes: [
      blocos([{ nome: "Tabela consolidada", desc: "Uma linha por organização com os KPIs do período." }]),
    ],
  },

  /* ----------------------------- Investor update ----------------------------- */
  "/investidores": {
    titulo: "Investor update",
    intro: "O relatório mensal para investidores, gerado dos seus números reais: caixa, burn, runway, receita, crescimento, MRR, margem e score — mais destaques e riscos automáticos, num texto pronto para colar no e-mail.",
    comoUsar: "Confira as métricas do mês (saem dos motores, nada digitado à mão), escreva os destaques do fundador e os pedidos aos investidores, e clique em 'Copiar texto'.",
    exemplo: "Todo dia 1º: abra a página, escreva 2 linhas de destaques, copie o texto e envie ao seu grupo de investidores — 5 minutos, números consistentes.",
    secoes: [
      blocos([
        { nome: "Métricas do update", desc: "Os KPIs que investidor espera, derivados dos lançamentos.", match: "Métricas" },
        { nome: "Sua parte", desc: "Destaques do mês e asks — o que só o fundador sabe.", match: "Sua parte" },
        { nome: "Texto pronto", desc: "O e-mail montado ao vivo; 'Copiar texto' leva tudo.", match: "Texto pronto" },
      ]),
    ],
  },

  /* ----------------------------- Plano de contratações ----------------------------- */
  "/contratacoes": {
    titulo: "Plano de contratações",
    intro: "Headcount planning × runway: monte o plano de vagas e veja o impacto REAL no caixa antes de contratar — cada vaga entra com salário + 13º + férias com 1/3 + FGTS (~1,3× o salário).",
    comoUsar: "Adicione as vagas (cargo, salário, quantidade, mês de início). O painel ao lado recalcula custo do plano, runway e score antes/depois, e projeta o caixa mês a mês por 12 meses.",
    exemplo: "2 engenheiros de R$ 12 mil a partir do mês 3 → custo real ~R$ 31 mil/mês; se o caixa projetado ficar negativo em algum mês, o plano avisa.",
    secoes: [
      blocos([
        { nome: "Vagas do plano", desc: "As contratações simuladas, com custo real por vaga.", match: "Vagas do plano" },
        { nome: "Impacto no caixa", desc: "Custo do plano, runway/score antes → depois e o caixa projetado M1–M12.", match: "Impacto no caixa" },
      ]),
    ],
  },

  /* ----------------------------- Administração (super-admin) ----------------------------- */
  "/admin": {
    titulo: "Administração da plataforma",
    intro: "Visão cross-tenant do dono do SaaS: clientes (orgs), assinaturas/MRR, usuários, crescimento e trilha de auditoria das ações administrativas.",
    comoUsar: "Edite plano/status de uma org para definir o MRR; use 'Logar como' para ver o ambiente do cliente (auditado); acompanhe o gráfico de MRR mês a mês.",
    secoes: [
      blocos([
        { nome: "KPIs", desc: "Orgs, ativas, trials, inadimplentes, usuários, MRR/ARR." },
        { nome: "Clientes", desc: "Uma linha por organização com plano/status editáveis." },
        { nome: "Usuários", desc: "Contas com último acesso; clique abre o drill-in cadastral." },
      ]),
    ],
  },
};

/** Resolve o guia da rota (match exato ou prefixo mais longo). */
/**
 * Guia da tela atual. Com a consolidação em hubs, cada ABA tem o seu guia:
 * a chave passou a ser `"/hub?aba=x"`. Resolve nesta ordem:
 *   1) a aba exata (`/contabilidade?aba=razao`);
 *   2) o hub inteiro  (`/contabilidade`);
 *   3) o prefixo mais longo (sub-rotas).
 * `aba` vem do `?aba=` da URL; sem ela, o hub cai na primeira aba — por isso
 * `padraoDoHub` mapeia o hub para a aba que ele abre por padrão.
 */
const PADRAO_DO_HUB: Record<string, string> = {
  "/contabilidade": "razao",
  "/dashboard/registrations/clients": "contatos",
  "/vendas": "lista",
  "/dashboard/financial/accounts-and-transfers?tab=receivables": "titulos",
  "/dashboard/financial/accounts-and-transfers?tab=payables": "titulos",
};

/* --------- telas de Compras, Contabilidade, Administração e Ajuda --------- */

Object.assign(GUIDES, {
  "/dashboard/purchases": {
    titulo: "Compras — pedidos com aprovação",
    intro: "A compra nasce como PEDIDO, não como despesa. Ela só vira conta a pagar quando alguém aprova — é isso que separa esta tela de Contas a pagar.",
    comoUsar: "Use os filtros de vencimento (caixa) e de competência (resultado) para achar o pedido. Aprove ou reprove na linha: aprovar coloca as parcelas no fluxo, reprovar as retira. Clique em '3×' para ver as parcelas que serão criadas.",
    exemplo: "Um pedido de R$ 30 mil em 3× aguardando aprovação NÃO aparece no fluxo de caixa. Aprovado, entram três títulos de R$ 10 mil.",
    secoes: [
      acoes([
        { nome: "Nova compra", desc: "Abre o pedido: fornecedor, conta, categoria, as duas datas e o valor.", match: "Nova compra" },
        { nome: "Aprovar / reprovar", desc: "A decisão que move o dinheiro. Reprovar retira os títulos do fluxo." },
        { nome: "Exportar XLSX", desc: "Baixa os pedidos do filtro atual." },
      ]),
      blocos([
        { nome: "Cards de status", desc: "Aprovadas · aguardando · reprovadas ou canceladas · total, com a fatia de cada uma.", match: "Aprovadas" },
        { nome: "Data de vencimento/pagamento", desc: "A janela do CAIXA: quando o dinheiro sai. Compra paga entra pela data do pagamento.", match: "Data de vencimento" },
        { nome: "Data de competência", desc: "A janela do RESULTADO: de que mês é a despesa no DRE.", match: "Data de competência" },
        { nome: "Parcelas", desc: "O resto dos centavos vai na última parcela; a competência não se parcela.", match: "Pagamento" },
      ]),
    ],
  },
  "/dashboard/purchases/received-boletos": {
    titulo: "Boletos recebidos (DDA)",
    intro: "Os boletos emitidos contra o seu CNPJ. O DDA depende de adesão bancária, mas o boleto não depende de ninguém: a linha digitável carrega banco, valor e vencimento.",
    comoUsar: "Cole a linha digitável (47 dígitos) ou o código de barras (44) em 'Adicionar boleto pelo número': o sistema lê tudo e confere os quatro dígitos verificadores. Depois use a seta para lançar em contas a pagar.",
    exemplo: "Colando a linha de um boleto do Itaú, a tela mostra banco 341, R$ 3.456,70 e vencimento 15/09/2026 antes de você gravar qualquer coisa.",
    secoes: [
      acoes([
        { nome: "Adicionar boleto pelo número", desc: "Lê e valida a linha digitável sem depender de integração.", match: "Adicionar boleto" },
        { nome: "Lançar em contas a pagar", desc: "O boleto é a cobrança; virar título é o que o coloca no fluxo." },
      ]),
      blocos([
        { nome: "Cards", desc: "Boletos, valor total, a vencer, vencidos e pagos.", match: "BOLETOS" },
        { nome: "Buscar", desc: "Beneficiário, pagador ou código de barras — a busca ignora a pontuação.", match: "Buscar" },
      ]),
    ],
  },
  "/dashboard/purchases/received-invoices": {
    titulo: "NFs recebidas (SEFAZ)",
    intro: "As notas fiscais emitidas contra a sua empresa. A captura automática exige certificado digital; a chave de acesso impressa no DANFE, não.",
    comoUsar: "Cole a chave de 44 dígitos em 'Lançar nota pela chave de acesso': o sistema lê UF, mês, CNPJ do emitente, modelo, série e número, e confere o dígito. Use os filtros e clique em Aplicar — com volume de SEFAZ, refiltrar a cada tecla custa caro.",
    secoes: [
      acoes([
        { nome: "Lançar nota pela chave", desc: "Os 44 dígitos dizem quem emitiu, quando e qual documento é.", match: "Lançar nota" },
        { nome: "Aprovar / recusar", desc: "A avaliação do usuário — o que ainda não foi avaliado conta como pendente." },
      ]),
      blocos([
        { nome: "Cards", desc: "NFs no filtro, valor total e pendentes de validação.", match: "NFS NO FILTRO" },
        { nome: "Filtros", desc: "Emissão, valor, tipo, status, fornecedor, categoria e avaliação.", match: "Filtros" },
      ]),
    ],
  },
  "/dashboard/accounting/nfe-export": {
    titulo: "Envio de NFs ao contador",
    intro: "O pacote mensal com os XMLs das notas de entrada e de saída, enviado para os e-mails do contador no dia 1º.",
    comoUsar: "Adicione o e-mail do contador; ele precisa clicar no link de confirmação para começar a receber. Enquanto não houver um e-mail verificado o envio fica Inativo — e nada é arquivado.",
    exemplo: "Sem destinatário verificado, o card do mês mostra as notas mas '0 arquivadas': o sistema conta, mas não retém XML para enviar.",
    secoes: [
      acoes([
        { nome: "Adicionar e-mail", desc: "Até 5 destinatários; cada um confirma pelo link.", match: "Adicionar e-mail" },
      ]),
      blocos([
        { nome: "Status", desc: "Ativo só com pelo menos um e-mail verificado.", match: "Status" },
        { nome: "Mês corrente", desc: "Notas de entrada e de saída do mês, e quantas foram arquivadas.", match: "Mês corrente" },
        { nome: "Destinatários", desc: "O teto de 5 é de escopo: o pacote leva a escrituração inteira.", match: "Destinatários" },
      ]),
    ],
  },
  "/dashboard/accounting/dominio-export": {
    titulo: "Gerar TXT contábil — Domínio",
    intro: "Exporta o extrato bancário no formato Partidas Simples (lanctos.txt) para importação direta no Domínio. É o consumidor do 'Código contábil (Domínio)' das contas e centros de custo.",
    comoUsar: "Escolha a conta bancária e o mês, clique em Carregar lançamentos e confira a lista e a prévia do arquivo antes de gerar. O que estiver sem código contábil aparece como pendência e fica FORA do arquivo.",
    exemplo: "O arquivo sai em ANSI (Windows-1252) com quebras CRLF — um arquivo UTF-8 importa e os valores batem, mas todo acento vira lixo no histórico.",
    secoes: [
      acoes([
        { nome: "Carregar lançamentos", desc: "Traz os movimentos liquidados da conta no mês.", match: "Carregar lançamentos" },
        { nome: "Gerar lanctos.txt", desc: "Baixa o arquivo em ANSI, pronto para importar.", match: "Gerar lanctos" },
      ]),
      blocos([
        { nome: "Conferência", desc: "Lançamentos, débitos, créditos e o líquido do período.", match: "Lançamentos" },
        { nome: "Prévia do arquivo", desc: "As linhas exatas — confira contra a tela de importação do escritório.", match: "Prévia do arquivo" },
      ]),
    ],
  },
  "/dashboard/administration/subscription": {
    titulo: "Assinatura e plano",
    intro: "O plano, a empresa ativa, quantos usuários têm acesso e o que já está conectado.",
    comoUsar: "Veja os dias restantes da assinatura, quantas contas bancárias estão em Open Finance e quais integrações fiscais estão ativas. Clique em 'Usuários ativos' para abrir a gestão de usuários.",
    secoes: [
      blocos([
        { nome: "Plano", desc: "ID da empresa, plano contratado e data de expiração com os dias restantes.", match: "ID da empresa" },
        { nome: "Contas bancárias", desc: "Cadastradas, em Open Finance e elegíveis sem conexão.", match: "Contas bancárias" },
        { nome: "Notas fiscais", desc: "Recebimento e emissão automática — cada um leva à configuração.", match: "Notas fiscais" },
      ]),
    ],
  },
  "/dashboard/administration/company-data": {
    titulo: "Dados da empresa",
    intro: "O cadastro da empresa: identificação, dados fiscais, endereço, canais e contatos. É o mesmo perfil que o onboarding preencheu — não há um segundo cadastro.",
    comoUsar: "Preencha o CEP para o endereço se completar sozinho. O regime tributário DECIDE se a empresa é optante pelo Simples — não há uma segunda caixinha. Salve com 'Salvar alterações'.",
    secoes: [
      blocos([
        { nome: "Logo da empresa", desc: "PNG, JPG ou WebP até 5 MB; abaixo de 200×200px aparece borrado nos relatórios.", match: "Logo da empresa" },
        { nome: "Identificação", desc: "Tipo de pessoa, documento, razão social, fundação, segmento e status.", match: "Identificação" },
        { nome: "Dados fiscais", desc: "Inscrições, contribuinte de ICMS, regime e regime especial de NFS-e.", match: "Dados fiscais" },
        { nome: "Contatos", desc: "Contato principal e contato financeiro, na segunda aba.", match: "Contatos" },
      ]),
    ],
  },
  "/dashboard/administration/users": {
    titulo: "Gerenciar usuários",
    intro: "Quem tem acesso a esta empresa e com qual perfil.",
    comoUsar: "Convide pelo e-mail (o convidado precisa ter conta) e escolha o perfil. Troque o perfil direto na linha. O último administrador não pode ser removido nem rebaixado — a empresa ficaria sem quem convida outro.",
    secoes: [
      acoes([
        { nome: "Convidar usuário", desc: "Vincula um e-mail existente à empresa com um perfil.", match: "Convidar usuário" },
        { nome: "Perfil", desc: "Admin, financeiro, operacional ou leitura." },
      ]),
    ],
  },
  "/dashboard/administration/audit-logs": {
    titulo: "Logs de auditoria",
    intro: "O histórico de alterações feitas pelos usuários, com o 'de X para Y' de cada mudança. Fica disponível pelos últimos 30 dias.",
    comoUsar: "Escolha o período e clique em Aplicar. Use 'Buscar no conteúdo' para achar pelo valor que mudou, não só pelo nome da entidade. Pedir antes dos 30 dias faz a tela avisar — o que está fora foi descartado.",
    secoes: [
      blocos([
        { nome: "Filtros", desc: "Período, usuário, conteúdo, ação, origem, tipo e entidade específica.", match: "Período" },
        { nome: "Exportar XLSX", desc: "Baixa o histórico filtrado." },
      ]),
    ],
  },
  "/dashboard/administration/integrations": {
    titulo: "Integrações",
    intro: "Os oito conectores da plataforma: vendas, emissão e recebimento de NF, contabilidade, DDA, Open Finance, APIs e MCP.",
    comoUsar: "Abra o cartão para configurar. Chave de API e token aparecem UMA vez, no momento em que nascem — copie na hora. O consentimento do Open Finance vale 12 meses e a tela avisa antes de vencer.",
    exemplo: "Certificado A1 vencido para a captura de NF em silêncio: a tela de NFs recebidas continua abrindo, só não chega nada.",
    secoes: [
      blocos([
        { nome: "Plataformas de vendas", desc: "18 conectores para importar vendas automaticamente.", match: "Plataformas de vendas" },
        { nome: "Open Finance", desc: "Sincroniza extrato e saldo; o consentimento renova a cada 12 meses.", match: "Open Finance" },
        { nome: "APIs", desc: "Chave por header X-API-Key e webhook de vendas.", match: "APIs" },
        { nome: "MCP", desc: "Acesso de IAs com escopo controlado — escrita só se a IA precisar agir.", match: "MCP" },
      ]),
    ],
  },
  "/dashboard/administration/exported-reports": {
    titulo: "Relatórios exportados",
    intro: "A fila das exportações grandes de Contas a pagar e Contas a receber, processadas em segundo plano.",
    comoUsar: "PDF com mais de 300 linhas e XLSX com mais de 5.000 entram aqui; menores baixam na hora e não aparecem na lista. O arquivo fica disponível por 15 dias e depois é marcado como expirado.",
    secoes: [
      blocos([
        { nome: "Filtros", desc: "Período, formato e relatório.", match: "Período" },
        { nome: "Status", desc: "Processando, pronto, erro ou expirado — o expirado continua na lista.", match: "Status" },
      ]),
    ],
  },
  "/dashboard/help": {
    titulo: "Central de ajuda",
    intro: "Chat com a base de ajuda, tours guiados por tela e os anúncios do produto.",
    comoUsar: "Pergunte 'como faço X' no chat; se a resposta não existir, abra um chamado. Em Tours guiados, procure a tela e clique em Iniciar — o tour roda na própria tela apontando cada bloco.",
    exemplo: "Senha, chave de API, cartão e CPF são detectados na sua mensagem antes do envio e removidos: a dúvida chega ao suporte, o segredo não.",
    secoes: [
      blocos([
        { nome: "Chat online", desc: "Responde sobre uso do sistema e escala para chamado.", match: "Chat online" },
        { nome: "Tours guiados", desc: "Um tour por tela, com progresso e filtro por status.", match: "Tours guiados" },
        { nome: "Anúncios", desc: "Novidades e avisos da plataforma.", match: "Anúncios" },
      ]),
    ],
  },
} as Record<string, Guide>);

export function guideForPath(pathname: string, aba?: string | null): Guide | null {
  const tab = aba || PADRAO_DO_HUB[pathname];
  if (tab && GUIDES[`${pathname}?aba=${tab}`]) return GUIDES[`${pathname}?aba=${tab}`];
  if (GUIDES[pathname]) return GUIDES[pathname];
  let best: string | null = null;
  for (const key of Object.keys(GUIDES)) {
    if (key === "/" || key.includes("?")) continue;
    if (pathname.startsWith(key) && (!best || key.length > best.length)) best = key;
  }
  return best ? GUIDES[best] : null;
}

/** Passos do tour (todos os itens, em ordem) — box com `match` ganha spotlight. */
export function tourSteps(g: Guide): GuideItem[] {
  return g.secoes.flatMap((s) => s.itens);
}
