/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O MAPA DE CONSOLIDAÇÃO — qual rota é a verdadeira, e o que precisa ser
 * PORTADO antes de a outra ser aposentada.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **Fundir não é apagar.** A rota legada existe porque alguém a construiu, e
 * quase sempre ela faz UMA coisa melhor que a canônica. Apagá-la sem portar
 * essa coisa é uma perda funcional que ninguém registra — o usuário só descobre
 * meses depois, procurando um painel que sumiu, e nesse ponto já não há quem
 * lembre que ele existia.
 *
 * Este arquivo é a decisão, escrita antes da refatoração. Cada par declara:
 *  - **`canonico`** — a rota que fica;
 *  - **`aposentar`** — a que vira alias;
 *  - **`portar`** — o que a legada faz melhor e PRECISA existir na canônica
 *    antes do desligamento, cada item com `feito: false` até alguém portar.
 *
 * A guarda da matriz de consistência cobra a invariante que dá valor a tudo
 * isso: **nenhuma rota entra em `ALIASES` enquanto tiver item pendente aqui.**
 * Sem essa trava, o mapa vira intenção, e intenção não impede perda.
 *
 * Puro, sem imports. Versão consolidacao/1.0.0.
 */

export const CONSOLIDACAO_VERSION = "consolidacao/1.0.0";

export interface ItemAPortar {
  /** O que a rota legada faz melhor, em uma frase. */
  o_que: string;
  /** Por que perder isso dói — o custo concreto de simplesmente apagar. */
  custo_de_perder: string;
  /** `true` só quando já existe na canônica. */
  feito: boolean;
}

export interface Fusao {
  id: string;
  assunto: string;
  canonico: string;
  /** As rotas que serão aposentadas (viram alias para a canônica). */
  aposentar: string[];
  /** Por que ESTA é a canônica — a decisão, não o gosto. */
  porque: string;
  portar: ItemAPortar[];
}

/** `true` quando tudo que a legada fazia melhor já existe na canônica. */
export const prontaParaAposentar = (f: Fusao): boolean => f.portar.every((p) => p.feito);

/** O que ainda falta portar, para a tela de status e para a guarda. */
export const pendencias = (f: Fusao): ItemAPortar[] => f.portar.filter((p) => !p.feito);

/* ========================================================================== */

export const FUSOES: Fusao[] = [
  /* ------------------------------------------------------------------ 1 --- */
  {
    id: "cadastros",
    assunto: "Cadastros",
    canonico: "/dashboard/registrations",
    aposentar: ["/cadastros"],
    porque:
      "As oito páginas de `registrations` têm rota própria, endereço compartilhável e cabem no padrão do resto do produto. `/cadastros` é um hub que existe para encurtar o menu, não para ser destino.",
    portar: [
      {
        o_que: "A aba Serviços — `registrations` tem `products` e NÃO tem `services`.",
        custo_de_perder:
          "É a perda funcional silenciosa que este mapa existe para impedir. Quem vende serviço perde o cadastro inteiro, e o produto passa a mentir que ele nunca existiu. Serviços vira um FILTRO EXPLÍCITO e visível dentro de Produtos — não uma aba escondida, senão a perda só muda de lugar.",
        // Feito: segmentado Produtos | Serviços no topo de
        // `ProdutosRegistroView`, com contagem em cada lado. A tela se chama
        // "Produtos e serviços" no menu, no título e no inventário.
        feito: true,
      },
      {
        o_que: "A aba Orçamento, que em `registrations` está em `budgets` mas fora do fluxo do hub.",
        custo_de_perder: "Quem chegava ao orçamento pelo hub perde o caminho e não descobre o novo.",
        feito: true,
      },
    ],
  },

  /* ------------------------------------------------------------------ 2 --- */
  {
    id: "titulos",
    assunto: "Contas a receber e a pagar",
    canonico: "/dashboard/financial/accounts-and-transfers",
    aposentar: ["/recebimentos", "/pagamentos"],
    porque:
      "A tela canônica trata receber, pagar e transferir como o mesmo problema espelhado, com abas — que é o que eles são. As duas legadas duplicam metade disso cada uma.",
    portar: [
      {
        o_que:
          "O CARROSSEL DE SAZONALIDADE: doze períodos (mês ou semana) com o resultado líquido de cada um, ligados por uma linha, com o período atual já centralizado.",
        custo_de_perder:
          "É a única superfície do produto que responde 'como este mês se compara aos onze anteriores' sem abrir um relatório. A tela canônica mostra estoque de títulos e não tem noção de tempo. Perder isto é perder a leitura sazonal inteira.",
        // Feito: `CarrosselSazonalidade` extraído do extrato e montado no topo
        // da `TitulosView`. EXTRAÍDO, não copiado — duas cópias divergiriam no
        // primeiro ajuste e o mesmo mês mostraria resultados diferentes.
        feito: true,
      },
      {
        o_que: "A baixa NA PRÓPRIA LINHA (clicar na transação → confirmar → anexar comprovante).",
        custo_de_perder:
          "A canônica só tem baixa em lote, que exige marcar caixinhas. Para dar baixa em um título — o caso mais comum — o lote é o caminho mais longo.",
        // Feito: `ModalBaixa` extraído do extrato; clicar na linha da
        // `TitulosView` abre a confirmação. A checkbox para a propagação para
        // não abrir o modal ao marcar em lote.
        feito: true,
      },
      {
        // ⚠️ DESCOBERTO ao portar os outros itens — não estava no mapa original.
        // Registrar em vez de desligar assim mesmo é o ponto inteiro deste
        // arquivo: eu ia aposentar o hub e levar três telas junto.
        o_que:
          "As abas Inadimplência, Boletos (em Receber) e Reembolsos (em Pagar) — a canônica não as tem.",
        custo_de_perder:
          "São três telas inteiras que só existem dentro dos hubs legados. Desligar o hub sem lhes dar rota própria as apagaria do produto, e ninguém notaria até alguém procurar 'boletos' e não achar.",
        // Feito: `/dashboard/financial/overdue`, `/boletos` e `/reimbursements`
        // ganharam rota própria, com os aliases de aba apontando para elas.
        feito: true,
      },
      {
        o_que: "A faixa `EscopoDaTela`, que declara posição × fluxo e liga as duas leituras.",
        custo_de_perder:
          "Sem ela volta o P0-16: dois números para a mesma pergunta e nada explicando a diferença.",
        feito: true,
      },
    ],
  },

  /* ------------------------------------------------------------------ 3 --- */
  {
    id: "dre",
    assunto: "DRE",
    canonico: "/dashboard/reports/dre",
    aposentar: ["/dre"],
    porque:
      "O relatório de `reports` tem a estrutura fixa e explícita da cascata (`ESTRUTURA_DRE`), AV/AH, exportação e multiempresa. É o DRE que um contador reconhece.",
    portar: [
      {
        o_que: "Os cartões de EBITDA, Margem EBITDA, Lucro líquido e Runway no topo.",
        custo_de_perder:
          "São a leitura de dez segundos. Sem eles, responder 'a empresa deu lucro?' exige ler a cascata inteira.",
        // Feito: `CartoesExecutivos` no topo do relatório, alimentado por
        // `dreGerencial` + `core/indicadores` — os mesmos motores da tabela.
        feito: true,
      },
      {
        o_que: "O drill-down por linha até a categoria e daí até os lançamentos.",
        custo_de_perder:
          "Um número de DRE que não abre é um número que não se confere — e conferir é o que se faz num fechamento.",
        // Já existia na canônica: `TabelaRelatorio onCelula` + `GavetaTransacoes`,
        // que abre com os ids dos movimentos que formaram a célula.
        feito: true,
      },
      {
        o_que: "O período padrão AMPLO (12 meses), em vez de abrir no mês corrente.",
        custo_de_perder:
          "Abrir no mês corrente mostra um DRE quase vazio no dia 2 e faz o usuário concluir que não há dados.",
        // Feito: preset `doze_meses`, e ele é o `filtroPadrao`.
        feito: true,
      },
    ],
  },

  /* ------------------------------------------------------------------ 4 --- */
  {
    id: "saldo",
    assunto: "Fluxo de caixa e saldo",
    canonico: "/fluxo-caixa",
    // ⚠️ Aqui NÃO se aposenta rota: as três telas respondem perguntas
    // diferentes e todas têm razão de existir. O defeito é não declararem a
    // base. Ver `core/indicadores` (ONDA 1) — a função de saldo já é uma só.
    aposentar: [],
    porque:
      "A fonte única de saldo já existe desde a ONDA 1: `core/indicadores.saldo`, que lê o `balance` das contas e usa os movimentos apenas para deslocar esse nível. O que faltava não era unificar o cálculo — era cada tela DIZER qual recorte usa.",
    portar: [
      {
        o_que: "Cada uma das três telas declara, no topo, qual saldo mostra e sob que regime.",
        custo_de_perder:
          "Três telas respondendo números diferentes para 'quanto eu tenho' sem nenhuma declarar a base é o defeito que a auditoria descreveu — e ele não é de cálculo, é de rótulo.",
        // Feito: `BaseDoSaldo` no fluxo de caixa (projeção), no extrato
        // (variação) e no painel financeiro (posição), cada uma mostrando as
        // outras duas ao lado.
        feito: true,
      },
    ],
  },

  /* ------------------------------------------------------------------ 5 --- */
  {
    id: "impostos",
    assunto: "Impostos",
    canonico: "/dashboard/sales-invoices/tax-provisioning",
    aposentar: ["/impostos"],
    porque:
      "A apuração por venda é a que gera CONTA A PAGAR de verdade, tem alíquota editável (ISS varia por município, ICMS por estado) e vencimento por tributo. `/impostos` projeta a carga com alíquotas CRAVADAS de Lucro Presumido serviços — não apura nada e não sobrevive a uma empresa do Simples.",
    portar: [
      {
        o_que: "A PROJEÇÃO da carga tributária para os próximos meses, a partir da receita.",
        custo_de_perder:
          "A canônica olha para trás (o que foi vendido); a projeção olha para frente, e é ela que responde 'quanto vou pagar de imposto no trimestre'.",
        // Feito: `ProjecaoCarga` no topo da tela canônica, projetando sobre a
        // RECEITA TRIBUTÁVEL canônica (que já exclui transferência, resgate e
        // empréstimo — projetar sobre "todas as entradas" inflaria o imposto).
        feito: true,
      },
      {
        o_que: "O regime tributário como CONFIGURAÇÃO da empresa, não como constante de arquivo.",
        custo_de_perder:
          "Os dois módulos assumem regimes conflitantes entre si (`/impostos` crava Lucro Presumido; `core/tax` calcula Simples Nacional). Escolher um sem tornar o regime configurável só troca de erro.",
        // Feito: `core/tax/regime.ts` — o perfil sai do `RegimeTributario` da
        // empresa. Simples e MEI declaram que NÃO têm tabela fixa (faixa e
        // valor fixo), em vez de fingir um percentual que não existe.
        feito: true,
      },
    ],
  },

  /* ------------------------------------------------------------------ 6 --- */
  {
    id: "ia",
    assunto: "Inteligência artificial",
    canonico: "/all4pay-ai",
    aposentar: ["/copiloto"],
    porque:
      "A conversa é a porta que as pessoas procuram — 'onde eu falo com a IA' tem de ter uma resposta só. As quatro abas do copiloto (quant, decisão, risco, autônomo) são RELATÓRIOS que a conversa deve saber abrir, não um segundo lugar para conversar.",
    portar: [
      {
        o_que: "As quatro abas (Quant, Decisão, Risco, Autônomo) como painéis dentro do assistente.",
        custo_de_perder:
          "São os motores proprietários inteiros. Aposentar `/copiloto` sem trazê-los apaga a parte do produto que mais difere de uma planilha.",
        // Feito: `AssistenteShell` — Conversa + Quant + Decisão + Risco +
        // Autônomo, só a aba ativa montando (os motores são caros).
        feito: true,
      },
      {
        o_que: "Histórico de conversa POR USUÁRIO e POR EMPRESA, no servidor.",
        custo_de_perder:
          "Hoje o histórico é do DISPOSITIVO (`a4p_ia_conversas` no navegador): a conversa não acompanha a pessoa e não é vista por mais ninguém da empresa. Ver `store-org` — a chave já está classificada como dado de negócio.",
        // Feito: `lib/ia-conversas` grava por `store-org` num mapa
        // `usuário → conversas`. A ORG vem da RLS de `org_state`; o USUÁRIO vem
        // da chave dentro do valor — acompanha a pessoa entre máquinas e não
        // vaza para os colegas, as duas coisas ao mesmo tempo.
        feito: true,
      },
      {
        o_que: "O botão flutuante fora das telas onde cobre conteúdo.",
        custo_de_perder: "Ele cobria o campo de mensagem nas próprias telas de IA.",
        feito: true,
      },
    ],
  },

  /* ------------------------------------------------------------------ 7 --- */
  {
    id: "assinaturas",
    assunto: "Assinaturas",
    canonico: "/dashboard/sales-invoices/subscriptions",
    aposentar: ["/recebimentos?aba=recorrencias"],
    porque:
      "A lista dos contratos é a entidade; o dashboard é uma leitura dela. A terceira entrada, dentro de Receber, era a MESMA lista num terceiro lugar — e a que menos gente encontrava.",
    portar: [
      {
        o_que: "O dashboard passa a REFERENCIAR a lista canônica em vez de conviver com ela.",
        custo_de_perder: "Três recortes sem link entre si é o P2-18.",
        feito: true,
      },
      {
        o_que: "As faturas projetadas no fluxo de caixa continuam saindo dos contratos.",
        custo_de_perder:
          "É o vínculo entre a assinatura e o dinheiro previsto; sem ele o MRR vira um número de vitrine.",
        feito: true,
      },
    ],
  },

  /* ------------------------------------------------------------------ 8 --- */
  {
    id: "conciliacao",
    assunto: "Conciliação",
    canonico: "/upload?aba=conciliar",
    aposentar: ["/conciliacao", "/conciliacao-bancaria"],
    porque:
      "Conciliar é a última etapa da esteira de ingestão — separá-la da entrada de dados obriga a atravessar o produto no meio de uma tarefa contínua.",
    portar: [
      {
        o_que: "Os aliases soltos na raiz respondem com 308 para a aba canônica.",
        custo_de_perder: "Endereço vivo que ninguém documentou é endereço que quebra sem ninguém ver.",
        feito: true,
      },
    ],
  },
];

/* ========================================================================== */

export const fusaoDe = (id: string): Fusao | undefined => FUSOES.find((f) => f.id === id);

/** Todas as rotas que este mapa manda aposentar. */
export const ROTAS_A_APOSENTAR: string[] = FUSOES.flatMap((f) => f.aposentar);

/** As que já podem ser desligadas hoje — tudo portado. */
export const PRONTAS: Fusao[] = FUSOES.filter(prontaParaAposentar);

/** As que ainda NÃO podem, e o que falta em cada uma. */
export const BLOQUEADAS: { fusao: Fusao; falta: ItemAPortar[] }[] = FUSOES
  .filter((f) => !prontaParaAposentar(f))
  .map((f) => ({ fusao: f, falta: pendencias(f) }));

/** Quantos itens faltam no total — o tamanho da dívida, em um número. */
export const ITENS_PENDENTES = FUSOES.reduce((s, f) => s + pendencias(f).length, 0);
