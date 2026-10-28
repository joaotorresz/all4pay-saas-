/**
 * O CONTEXTO DA TELA para o botão "Pergunte à Quattro AI" do rodapé
 * (pedido do dono, 19/10/2026): em qualquer tela, o botão abre a conversa já
 * sabendo ONDE a pessoa está — "O que você quer saber sobre o seu fluxo de
 * caixa?" — com caminhos daquela tela: SABER (uma pergunta), VER FALHAS (a
 * pergunta que procura o problema) e ADICIONAR (abre a tela que cria).
 *
 * ⚠️ As perguntas são as que o motor nativo da IA JÁ responde
 * (`core/assistant/engine`): uma sugestão que cai em "não entendi" é pior que
 * nenhuma. A guarda `npm run ia-contexto` dispara cada uma no motor.
 *
 * ⚠️ Este arquivo não decide RESPOSTA nenhuma: ele só escolhe a saudação e os
 * caminhos. A inteligência da conversa continua toda em `useChatIA`.
 *
 * Puro, sem imports de tela. Versão ia-contexto-tela/1.0.0.
 */

export const CONTEXTO_TELA_VERSION = "ia-contexto-tela/1.0.0";

/** O tipo do caminho, que decide o rótulo do grupo e o efeito do clique. */
export type TipoCaminho = "saber" | "falhas" | "adicionar";

export interface CaminhoTela {
  id: string;
  tipo: TipoCaminho;
  /** O que aparece no chip. */
  curto: string;
  /** Chave do `Icon`. */
  icone: string;
  /** "saber"/"falhas": a pergunta que vai para a conversa. */
  pergunta?: string;
  /** "adicionar": a tela que cria (o chat fecha e navega). */
  href?: string;
}

export interface ContextoTela {
  /** O prefixo de rota que casou. */
  rota: string;
  /** O nome da tela, para o "Lendo …" da varredura. */
  nome: string;
  /** A pergunta com que a conversa abre. */
  abertura: string;
  caminhos: CaminhoTela[];
}

interface Molde {
  rota: string;
  nome: string;
  /** "o seu fluxo de caixa" — entra na frase de abertura. */
  assunto: string;
  caminhos: CaminhoTela[];
}

const saber = (id: string, curto: string, pergunta: string, icone = "sparkles"): CaminhoTela =>
  ({ id, tipo: "saber", curto, pergunta, icone });
const falhas = (id: string, curto: string, pergunta: string, icone = "triangle-alert"): CaminhoTela =>
  ({ id, tipo: "falhas", curto, pergunta, icone });
const adicionar = (id: string, curto: string, href: string): CaminhoTela =>
  ({ id, tipo: "adicionar", curto, href, icone: "plus" });

/**
 * ⚠️ A ORDEM importa: o prefixo mais longo vem primeiro, senão
 * `/contas-a-pagar` pegaria `/contas-a-pagar/folha`.
 */
const MOLDES: Molde[] = [
  {
    rota: "/fluxo-caixa", nome: "Fluxo de caixa", assunto: "o seu fluxo de caixa",
    caminhos: [
      saber("fc-mes", "Como está o mês", "Como está o meu fluxo de caixa este mês?", "trending-up"),
      saber("fc-previsao", "Previsão até o fim do mês", "Qual a previsão de caixa para o fim do mês?", "calendar"),
      falhas("fc-negativo", "Quando o caixa aperta", "Quando o meu caixa pode ficar negativo?"),
      falhas("fc-gastos", "Onde economizar", "Onde posso economizar?"),
      adicionar("fc-novo-pagar", "Lançar uma saída", "/dashboard/financial/payables/new"),
      adicionar("fc-novo-receber", "Lançar uma entrada", "/dashboard/financial/receivables/new"),
    ],
  },
  {
    rota: "/contas-a-pagar/folha", nome: "Folha salarial", assunto: "a sua folha salarial",
    caminhos: [
      saber("fo-custo", "Quanto custa a folha", "Qual o custo da folha?", "users"),
      falhas("fo-pagar", "O que vence", "O que vence esta semana?"),
      adicionar("fo-novo", "Cadastrar colaborador", "/dashboard/financial/payables/new"),
    ],
  },
  {
    rota: "/contas-a-pagar/recorrentes", nome: "Contas recorrentes", assunto: "as suas contas recorrentes",
    caminhos: [
      saber("cr-gastos", "Maiores gastos", "Quais são os meus maiores gastos?"),
      falhas("cr-economizar", "Onde economizar", "Onde posso economizar?"),
      adicionar("cr-novo", "Nova conta recorrente", "/dashboard/financial/payables/new"),
    ],
  },
  {
    rota: "/contas-a-pagar/painel-de-despesas", nome: "Painel de despesas", assunto: "as suas despesas",
    caminhos: [
      saber("cp-total", "Quanto tenho a pagar", "Quanto eu tenho a pagar?", "credit-card"),
      saber("cp-semana", "O que vence esta semana", "O que vence esta semana?", "calendar"),
      falhas("cp-fornecedores", "Para quem mais pago", "Quem são meus maiores fornecedores?"),
      falhas("cp-economizar", "Onde economizar", "Onde posso economizar?"),
      adicionar("cp-novo", "Nova conta a pagar", "/dashboard/financial/payables/new"),
      adicionar("cp-compra", "Nova compra", "/dashboard/purchases/new"),
    ],
  },
  {
    rota: "/contas-a-receber", nome: "Contas a receber", assunto: "as suas contas a receber",
    caminhos: [
      saber("crc-total", "Quanto tenho a receber", "Quanto eu tenho a receber?", "credit-card"),
      saber("crc-cliente", "Maior cliente", "Quem é meu maior cliente?", "users"),
      falhas("crc-atraso", "Quem está em atraso", "Quem são os clientes em atraso?"),
      falhas("crc-concentracao", "Dependência de clientes", "Qual a concentração de receita?"),
      adicionar("crc-novo", "Nova conta a receber", "/dashboard/financial/receivables/new"),
    ],
  },
  {
    rota: "/dashboard/financial/overdue", nome: "Cobrança e inadimplência", assunto: "a sua cobrança",
    caminhos: [
      saber("in-total", "Quanto está em atraso", "Quanto está em atraso?", "credit-card"),
      falhas("in-quem", "Quem está em atraso", "Quem são os clientes em atraso?"),
      falhas("in-taxa", "Como está a inadimplência", "Como está a minha inadimplência?"),
    ],
  },
  {
    rota: "/dashboard/reports/dre", nome: "DRE", assunto: "o seu resultado",
    caminhos: [
      saber("dre-resultado", "Resultado do mês", "Qual o meu resultado do mês?", "trending-up"),
      saber("dre-ebitda", "EBITDA", "Qual o meu EBITDA?", "activity"),
      saber("dre-margem", "Margem", "Qual a minha margem?", "gauge"),
      falhas("dre-impostos", "Peso dos impostos", "Qual a minha carga tributária?"),
      falhas("dre-economizar", "Onde economizar", "Onde posso economizar?"),
    ],
  },
  {
    rota: "/dashboard/reports/dfc", nome: "DFC", assunto: "o seu fluxo de caixa do período",
    caminhos: [
      saber("dfc-mes", "Como está o mês", "Como está o meu fluxo de caixa este mês?", "trending-up"),
      saber("dfc-saldo", "Saldo", "Qual o meu saldo?", "credit-card"),
      falhas("dfc-negativo", "Quando o caixa aperta", "Quando o meu caixa pode ficar negativo?"),
    ],
  },
  {
    rota: "/dashboard/reports", nome: "Relatórios", assunto: "os seus relatórios",
    caminhos: [
      saber("rel-resultado", "Resultado do mês", "Qual o meu resultado do mês?", "trending-up"),
      saber("rel-margem", "Margem", "Qual a minha margem?", "gauge"),
      falhas("rel-economizar", "Onde economizar", "Onde posso economizar?"),
    ],
  },
  {
    rota: "/dashboard/sales-invoices/tax-provisioning", nome: "Impostos e obrigações", assunto: "os seus impostos",
    caminhos: [
      saber("imp-pago", "Quanto pago de imposto", "Quanto pago de imposto?", "receipt"),
      falhas("imp-carga", "Carga tributária", "Qual a minha carga tributária?"),
    ],
  },
  {
    rota: "/contas-a-receber/painel-de-vendas", nome: "Painel de vendas", assunto: "as suas vendas",
    caminhos: [
      saber("ve-faturei", "Quanto faturei", "Quanto eu faturei este mês?", "trending-up"),
      saber("ve-ticket", "Ticket médio", "Qual o meu ticket médio?", "receipt"),
      falhas("ve-concentracao", "Dependência de clientes", "Qual a concentração de receita?"),
      adicionar("ve-nova", "Nova venda", "/dashboard/sales-invoices/new"),
    ],
  },
  {
    rota: "/dashboard/registrations/clients", nome: "Clientes", assunto: "os seus clientes",
    caminhos: [
      saber("cl-maior", "Maior cliente", "Quem é meu maior cliente?", "users"),
      falhas("cl-atraso", "Quem está em atraso", "Quem são os clientes em atraso?"),
      falhas("cl-concentracao", "Dependência de clientes", "Qual a concentração de receita?"),
    ],
  },
  {
    rota: "/dashboard/registrations/suppliers", nome: "Fornecedores", assunto: "os seus fornecedores",
    caminhos: [
      saber("fn-maiores", "Para quem mais pago", "Quem são meus maiores fornecedores?", "users"),
      falhas("fn-economizar", "Onde economizar", "Onde posso economizar?"),
    ],
  },
  {
    rota: "/dashboard/financial", nome: "Movimentações", assunto: "as suas movimentações",
    caminhos: [
      saber("mv-saldo", "Saldo", "Qual o meu saldo?", "credit-card"),
      saber("mv-mes", "Resumo do mês", "Resumo do mês", "trending-up"),
      falhas("mv-semana", "O que vence esta semana", "O que vence esta semana?"),
    ],
  },
  {
    rota: "/orcamento", nome: "Orçamento", assunto: "o seu orçamento",
    caminhos: [
      saber("or-gastei", "Quanto gastei", "Quanto gastei este mês?", "credit-card"),
      falhas("or-economizar", "Onde economizar", "Onde posso economizar?"),
      saber("or-previsao", "Previsão do mês", "Qual a previsão de caixa para o fim do mês?", "calendar"),
    ],
  },
];

/** Telas onde o botão não aparece: a Home já tem a caixa, e a IA é a própria conversa. */
const SEM_BOTAO = ["/quattro-ai", "/login", "/criar-conta", "/comecar", "/redefinir-senha", "/segundo-fator", "/admin"];

/** O botão aparece nesta rota? A Home ("/") já tem a caixa da IA no alto. */
export function botaoNaTela(pathname: string): boolean {
  if (!pathname || pathname === "/") return false;
  return !SEM_BOTAO.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

const casa = (pathname: string, rota: string) => pathname === rota || pathname.startsWith(`${rota}/`);

/**
 * O contexto de uma rota. Sem molde próprio, a abertura usa o nome da tela
 * (`nomeDaTela`, vindo do inventário) e os caminhos gerais — saldo, resumo e
 * o que vence —, que valem em qualquer lugar.
 */
export function contextoDaTela(pathname: string, nomeDaTela?: string): ContextoTela {
  const m = MOLDES.find((x) => casa(pathname, x.rota));
  if (m) return { rota: m.rota, nome: nomeDaTela || m.nome, abertura: `O que você quer saber sobre ${m.assunto}?`, caminhos: m.caminhos };
  const nome = nomeDaTela || "esta tela";
  return {
    rota: pathname,
    nome,
    abertura: nomeDaTela ? `O que você quer saber sobre ${nomeDaTela}?` : "O que você quer saber sobre esta tela?",
    caminhos: [
      saber("geral-saldo", "Saldo", "Qual o meu saldo?", "credit-card"),
      saber("geral-mes", "Resumo do mês", "Resumo do mês", "trending-up"),
      falhas("geral-semana", "O que vence esta semana", "O que vence esta semana?"),
      falhas("geral-atraso", "O que está em atraso", "Quanto está em atraso?"),
    ],
  };
}

/** Todos os moldes, para a guarda. */
export const MOLDES_DE_TELA: readonly Molde[] = MOLDES;
