/**
 * AS SUGESTÕES DA CAIXA DA QUATTRO AI (Home, 14/10/2026).
 *
 * Abaixo da caixa da IA a Home oferece até SEIS perguntas prontas. Elas eram
 * três frases fixas; agora saem de um catálogo e são escolhidas pelo CONTEXTO
 * da empresa: o perfil do onboarding (setor, modelo, como recebe, onde gasta)
 * e o que os números dizem hoje (runway, burn, vencidos, pendências, dia do
 * mês).
 *
 * Esta é a ETAPA 1 da Home adaptativa: a escolha é por REGRAS, explicável e
 * sem rede. A etapa seguinte põe a IA para reordenar o MESMO catálogo — e ela
 * só escolhe ids daqui, nunca escreve pergunta nova, para a Home não exibir
 * algo que o assistente não sabe responder.
 *
 * ⚠️ Nenhum número nasce aqui: os sinais chegam prontos (do snapshot da Home,
 * que só chama a camada canônica). Sinal AUSENTE (`null`) não dispara regra
 * nenhuma — "não sei quantas notas faltam" não é "faltam zero", e muito menos
 * "faltam muitas".
 *
 * Puro, tipado, sem relógio (o dia vem de `hoje`).
 */

import type { Exibicao } from "./preferencias";
import type { RiskInput } from "@/core/risk-engine/types";
import { inadimplencia, temValor, type Indicador } from "@/core/indicadores";
import type { HomeSnapshot, NumeroHome } from "./snapshot";
import { redigirSegredos } from "@/core/ajuda/segredos";

export const SUGESTOES_HOME_VERSION = "home-sugestoes/1.2.0";

/** Quantas sugestões a Home mostra — decisão do dono. */
export const LIMITE_SUGESTOES = 6;
/** No máximo duas do mesmo tema, senão seis perguntas viram seis jeitos de perguntar a mesma coisa. */
export const MAX_POR_TEMA = 2;

export type TemaSugestao =
  | "fechamento" | "caixa" | "despesa" | "receber" | "pagar" | "recorrencia" | "vendas" | "inicio" | "pessoal";

export interface PerfilSinais {
  setor?: string;
  modelo?: string;
  receitaPrincipal?: string;
  frequencia?: string;
  funcionarios?: string;
  meiosRecebimento?: string[];
  despesas?: string[];
  /** O que a pessoa escreveu no onboarding sobre a empresa (texto livre, etapa 3). */
  descricao?: string;
}

export type { Exibicao };

export interface SinaisHome {
  hoje: string;
  tipoConta: "empresa" | "pessoal";
  perfil: PerfilSinais | null;
  /** A empresa tem algum lançamento? Sem dado, só regras de perfil disparam. */
  temLancamentos: boolean;
  caixa: number | null;
  /** Variação de 30 dias (fração: −0,12 = caiu 12%). */
  caixaVar: number | null;
  burnMensal: number | null;
  burnVar: number | null;
  runwayMeses: number | null;
  /** O código de `runwayMeses` indisponível ("sem_queima", "caixa_negativo"…). */
  runwayMotivo: string | null;
  arr: number | null;
  receber30: number | null;
  pagar30: number | null;
  receberVencido: number | null;
  qtdReceberVencidos: number | null;
  pendencias: {
    conciliar: number | null;
    notas: number | null;
    compras: number | null;
    aprovacoes: number | null;
    boletos: number | null;
  };
  /** Fração do checklist de fechamento concluída (0..1), ou null sem checklist. */
  fechamento: number | null;
  /** O que o cliente disse ser mais importante no dia a dia (ids de `INTERESSES`). */
  interesses?: string[];
  /** Quantas vezes cada sugestão foi clicada (id → vezes). */
  cliques?: Record<string, number>;
  /**
   * Por quantos DIAS cada sugestão apareceu na Home sem ser clicada, e o
   * último deles (etapa 5: o que a pessoa ignora desce). O clique zera.
   */
  exibidas?: Record<string, Exibicao>;
}

export interface Sugestao {
  id: string;
  texto: string;
  tema: TemaSugestao;
  publico: "empresa" | "pessoal";
  /** Relevância de partida (0..1). As perguntas sempre úteis têm base maior. */
  base: number;
  /** Cada regra que casa soma `peso` e dá o motivo da escolha. */
  regras: Regra[];
}

interface Regra {
  peso: number;
  motivo: string;
  casa: (s: SinaisHome) => boolean;
}

export interface SugestaoEscolhida {
  id: string;
  texto: string;
  /** O rótulo do chip (`ROTULOS`); a pergunta inteira é `texto`. */
  curto: string;
  icone: string;
  tema: TemaSugestao;
  pontos: number;
  /** Por que ela está na tela — o motivo da regra de maior peso, ou "pergunta frequente". */
  motivo: string;
}

/* ------------------------------ leitura dos sinais ------------------------------ */

const dia = (s: SinaisHome) => Number(s.hoje.slice(8, 10));
const n = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);
const tem = (lista: string[] | undefined, ...xs: string[]) => !!lista && xs.some((x) => lista.includes(x));
const setor = (s: SinaisHome, ...xs: string[]) => !!s.perfil?.setor && xs.includes(s.perfil.setor);
const modelo = (s: SinaisHome, ...xs: string[]) => !!s.perfil?.modelo && xs.includes(s.perfil.modelo);
const receita = (s: SinaisHome, ...xs: string[]) => !!s.perfil?.receitaPrincipal && xs.includes(s.perfil.receitaPrincipal);
const gasta = (s: SinaisHome, ...xs: string[]) => tem(s.perfil?.despesas, ...xs);
const recebePor = (s: SinaisHome, ...xs: string[]) => tem(s.perfil?.meiosRecebimento, ...xs);
const pend = (v: number | null) => n(v) && v > 0;
const runwayCurto = (s: SinaisHome, meses: number) =>
  (n(s.runwayMeses) && s.runwayMeses < meses) || s.runwayMotivo === "caixa_negativo";
const recorrente = (s: SinaisHome) =>
  modelo(s, "SaaS", "Assinatura", "Recorrência") || receita(s, "Mensalidade") || (n(s.arr) && s.arr > 0);
const equipeGrande = (s: SinaisHome) => !!s.perfil?.funcionarios && s.perfil.funcionarios !== "1-10";

const r = (peso: number, motivo: string, casa: (s: SinaisHome) => boolean): Regra => ({ peso, motivo, casa });

/* ------------------------------ o catálogo ------------------------------ */

export const CATALOGO_SUGESTOES: Sugestao[] = [
  // ── fechamento e contabilidade
  { id: "fechar-mes", texto: "O que falta para fechar o mês?", tema: "fechamento", publico: "empresa", base: 0.5, regras: [
    r(1.2, "fim de mês: hora de fechar", (s) => dia(s) >= 25),
    r(1.0, "o mês anterior ainda está fechando", (s) => dia(s) <= 7 && n(s.fechamento) && s.fechamento < 1),
    r(0.6, "o checklist de fechamento está aberto", (s) => n(s.fechamento) && s.fechamento > 0 && s.fechamento < 1),
  ] },
  { id: "conciliar", texto: "Quais transações ainda estão sem conciliação?", tema: "fechamento", publico: "empresa", base: 0.2, regras: [
    r(1.0, "há transações a conciliar", (s) => pend(s.pendencias.conciliar)),
    r(0.6, "muitas transações paradas na conciliação", (s) => n(s.pendencias.conciliar) && s.pendencias.conciliar >= 20),
  ] },
  { id: "notas", texto: "Quais vendas ainda estão sem nota fiscal?", tema: "fechamento", publico: "empresa", base: 0.1, regras: [
    r(1.1, "há notas a emitir", (s) => pend(s.pendencias.notas)),
  ] },
  { id: "aprovacoes", texto: "O que está esperando a minha aprovação?", tema: "pagar", publico: "empresa", base: 0.1, regras: [
    r(1.1, "há pedidos esperando aprovação", (s) => pend(s.pendencias.aprovacoes) || pend(s.pendencias.compras)),
  ] },
  { id: "resultado-mes", texto: "Como está o resultado do mês até aqui?", tema: "fechamento", publico: "empresa", base: 0.45, regras: [
    r(0.4, "o mês já tem dias suficientes para ler o resultado", (s) => s.temLancamentos && dia(s) >= 10 && dia(s) < 25),
  ] },
  { id: "variacao-dre", texto: "O que mais mudou no resultado contra o mês passado?", tema: "fechamento", publico: "empresa", base: 0.25, regras: [
    r(0.9, "o mês passado acabou de fechar", (s) => s.temLancamentos && dia(s) <= 10),
  ] },
  { id: "impostos", texto: "Quanto vou pagar de impostos este mês?", tema: "pagar", publico: "empresa", base: 0.15, regras: [
    r(0.7, "as guias do mês vencem na segunda quinzena", (s) => dia(s) >= 12 && dia(s) <= 25),
    r(0.3, "impostos estão entre as despesas da empresa", (s) => gasta(s, "Impostos")),
  ] },

  // ── caixa
  { id: "fluxo-13-semanas", texto: "Monte um fluxo de caixa de 13 semanas", tema: "caixa", publico: "empresa", base: 0.4, regras: [
    r(1.2, "o runway está abaixo de 6 meses", (s) => runwayCurto(s, 6)),
    r(0.6, "o caixa caiu mais de 10% em 30 dias", (s) => n(s.caixaVar) && s.caixaVar <= -0.1),
  ] },
  { id: "fluxo-3-semanas", texto: "Mostre o fluxo de caixa das próximas 3 semanas", tema: "caixa", publico: "empresa", base: 0.3, regras: [
    r(1.0, "vai sair mais do que entrar nos próximos 30 dias", (s) => n(s.pagar30) && n(s.receber30) && s.pagar30 > s.receber30),
  ] },
  { id: "runway", texto: "Por quanto tempo o caixa aguenta no ritmo atual?", tema: "caixa", publico: "empresa", base: 0.2, regras: [
    r(1.0, "o runway está abaixo de 12 meses", (s) => n(s.runwayMeses) && s.runwayMeses < 12),
  ] },
  { id: "caixa-caiu", texto: "Por que o caixa caiu nos últimos 30 dias?", tema: "caixa", publico: "empresa", base: 0, regras: [
    r(1.3, "o caixa caiu em 30 dias", (s) => n(s.caixaVar) && s.caixaVar <= -0.05),
  ] },
  { id: "caixa-subiu", texto: "De onde veio o aumento de caixa do mês?", tema: "caixa", publico: "empresa", base: 0, regras: [
    r(1.0, "o caixa subiu em 30 dias", (s) => n(s.caixaVar) && s.caixaVar >= 0.05),
  ] },
  { id: "caixa-negativo", texto: "Como cobrir o caixa negativo?", tema: "caixa", publico: "empresa", base: 0, regras: [
    r(2.5, "o caixa está negativo", (s) => s.runwayMotivo === "caixa_negativo" || (n(s.caixa) && s.caixa < 0)),
  ] },
  { id: "posso-gastar", texto: "Quanto posso gastar este mês sem apertar o caixa?", tema: "caixa", publico: "empresa", base: 0.2, regras: [
    r(0.6, "há folga de caixa", (s) => (n(s.runwayMeses) && s.runwayMeses >= 6) || s.runwayMotivo === "sem_queima"),
  ] },
  { id: "aplicar-sobra", texto: "Onde aplicar o caixa que está sobrando?", tema: "caixa", publico: "empresa", base: 0, regras: [
    r(1.0, "a empresa está gerando caixa", (s) => s.runwayMotivo === "sem_queima" || (n(s.runwayMeses) && s.runwayMeses >= 18)),
  ] },

  // ── despesa e burn
  { id: "burn-mudou", texto: "O que explica a mudança no burn?", tema: "despesa", publico: "empresa", base: 0.3, regras: [
    r(1.3, "o burn mudou mais de 10% em 30 dias", (s) => n(s.burnVar) && Math.abs(s.burnVar) >= 0.1),
  ] },
  { id: "cortar-despesas", texto: "Onde dá para cortar despesas sem afetar a operação?", tema: "despesa", publico: "empresa", base: 0.1, regras: [
    r(1.0, "o runway está curto", (s) => runwayCurto(s, 6)),
    r(0.6, "o burn subiu mais de 15%", (s) => n(s.burnVar) && s.burnVar >= 0.15),
  ] },
  { id: "maiores-gastos", texto: "Quais foram os maiores gastos do mês?", tema: "despesa", publico: "empresa", base: 0.35, regras: [
    r(0.2, "há lançamentos no mês", (s) => s.temLancamentos),
  ] },
  { id: "softwares", texto: "Quais assinaturas e softwares a empresa paga todo mês?", tema: "despesa", publico: "empresa", base: 0, regras: [
    r(0.7, "software está entre as despesas da empresa", (s) => gasta(s, "Software")),
    r(0.4, "empresa de tecnologia", (s) => setor(s, "Tecnologia") || modelo(s, "SaaS")),
  ] },
  { id: "folha", texto: "Quanto a folha pesa sobre a receita?", tema: "despesa", publico: "empresa", base: 0, regras: [
    r(0.6, "folha está entre as despesas da empresa", (s) => gasta(s, "Folha")),
    r(0.5, "a equipe tem mais de 10 pessoas", equipeGrande),
  ] },
  { id: "combustivel-frete", texto: "Quanto foi gasto com combustível e frete no mês?", tema: "despesa", publico: "empresa", base: 0, regras: [
    r(0.8, "combustível e logística pesam na operação", (s) => gasta(s, "Combustível", "Logística")),
    r(0.5, "setor que roda na estrada", (s) => setor(s, "Logística", "Agronegócio", "Construção", "Aviação")),
  ] },
  { id: "marketing", texto: "Quanto custa conquistar cada cliente novo?", tema: "despesa", publico: "empresa", base: 0, regras: [
    r(0.7, "marketing está entre as despesas da empresa", (s) => gasta(s, "Marketing")),
    r(0.4, "venda direta ao consumidor", (s) => modelo(s, "B2C") || setor(s, "E-commerce")),
  ] },

  // ── a receber
  { id: "quem-deve", texto: "Quem está devendo e há quanto tempo?", tema: "receber", publico: "empresa", base: 0, regras: [
    r(1.4, "há recebimentos vencidos", (s) => n(s.receberVencido) && s.receberVencido > 0),
  ] },
  { id: "cobrar-primeiro", texto: "Qual cliente devo cobrar primeiro?", tema: "receber", publico: "empresa", base: 0, regras: [
    r(1.1, "três ou mais títulos vencidos", (s) => n(s.qtdReceberVencidos) && s.qtdReceberVencidos >= 3),
  ] },
  { id: "receber-semana", texto: "O que tenho para receber nesta semana?", tema: "receber", publico: "empresa", base: 0.15, regras: [
    r(0.6, "há recebimentos nos próximos 30 dias", (s) => n(s.receber30) && s.receber30 > 0),
  ] },
  { id: "concentracao", texto: "Quanto da receita depende dos maiores clientes?", tema: "receber", publico: "empresa", base: 0, regras: [
    r(0.7, "venda para empresas ou por projeto", (s) => modelo(s, "B2B", "Projeto")),
    r(0.3, "receita de serviço", (s) => receita(s, "Venda de serviço")),
  ] },
  { id: "melhores-clientes", texto: "Quem são os clientes que mais faturaram no ano?", tema: "vendas", publico: "empresa", base: 0.1, regras: [
    r(0.5, "venda para empresas", (s) => modelo(s, "B2B", "Marketplace")),
  ] },

  // ── a pagar
  { id: "pagar-semana", texto: "O que vence para pagar nesta semana?", tema: "pagar", publico: "empresa", base: 0.2, regras: [
    r(0.6, "há contas a pagar nos próximos 30 dias", (s) => n(s.pagar30) && s.pagar30 > 0),
    r(0.6, "há boletos a pagar", (s) => pend(s.pendencias.boletos)),
  ] },
  { id: "fornecedores", texto: "Quais fornecedores concentram as compras?", tema: "pagar", publico: "empresa", base: 0, regras: [
    r(0.6, "fornecedores estão entre as despesas da empresa", (s) => gasta(s, "Fornecedores")),
    r(0.4, "setor que compra insumo", (s) => setor(s, "Indústria", "Construção", "E-commerce", "Agronegócio")),
  ] },
  { id: "renegociar", texto: "Quais contas a pagar dá para renegociar?", tema: "pagar", publico: "empresa", base: 0, regras: [
    r(1.1, "o caixa aperta e vai sair mais do que entrar", (s) => runwayCurto(s, 6) && n(s.pagar30) && n(s.receber30) && s.pagar30 > s.receber30),
  ] },

  // ── receita recorrente
  { id: "arr-evolucao", texto: "Como evoluiu a receita recorrente nos últimos meses?", tema: "recorrencia", publico: "empresa", base: 0, regras: [
    r(1.3, "a empresa vive de receita recorrente", recorrente),
  ] },
  { id: "churn", texto: "Quantos clientes cancelaram a assinatura este mês?", tema: "recorrencia", publico: "empresa", base: 0, regras: [
    r(0.9, "modelo de assinatura", (s) => modelo(s, "SaaS", "Assinatura") || receita(s, "Mensalidade")),
  ] },
  { id: "investidores", texto: "Monte o resumo do mês para os investidores", tema: "recorrencia", publico: "empresa", base: 0, regras: [
    r(0.6, "empresa que presta contas a investidores", (s) => modelo(s, "SaaS", "Holding") || setor(s, "Tecnologia")),
    r(0.4, "início do mês: hora do relatório", (s) => dia(s) <= 10),
  ] },

  // ── vendas e operação
  { id: "taxas-cartao", texto: "Quanto foi pago em taxas de cartão no mês?", tema: "vendas", publico: "empresa", base: 0, regras: [
    r(0.9, "a empresa recebe por cartão", (s) => recebePor(s, "Cartão", "Link de pagamento")),
  ] },
  { id: "antecipar", texto: "Vale a pena antecipar os recebíveis de cartão?", tema: "vendas", publico: "empresa", base: 0, regras: [
    r(1.2, "recebe por cartão e o caixa aperta", (s) => recebePor(s, "Cartão") && runwayCurto(s, 6)),
  ] },
  { id: "sazonalidade", texto: "Como a sazonalidade afeta o caixa ao longo do ano?", tema: "vendas", publico: "empresa", base: 0, regras: [
    r(0.9, "negócio sazonal", (s) => s.perfil?.frequencia === "Sazonal" || setor(s, "Agronegócio", "Educação")),
  ] },
  { id: "ticket-medio", texto: "Qual o ticket médio das vendas do mês?", tema: "vendas", publico: "empresa", base: 0, regras: [
    r(0.8, "venda direta ao consumidor", (s) => modelo(s, "B2C", "Marketplace") || setor(s, "E-commerce")),
  ] },
  { id: "margem-produto", texto: "Qual a margem por produto ou serviço?", tema: "vendas", publico: "empresa", base: 0.05, regras: [
    r(0.7, "a empresa vende produto", (s) => receita(s, "Venda de produto") || setor(s, "Indústria", "E-commerce")),
  ] },
  { id: "saude", texto: "Qual a saúde financeira da empresa hoje?", tema: "caixa", publico: "empresa", base: 0.3, regras: [] },

  // ── primeiro uso
  { id: "importar-extrato", texto: "Como importo o extrato do banco?", tema: "inicio", publico: "empresa", base: 0, regras: [
    r(3, "ainda não há lançamentos", (s) => !s.temLancamentos),
  ] },
  { id: "o-que-faz", texto: "O que a Quattro AI consegue responder?", tema: "inicio", publico: "empresa", base: 0, regras: [
    r(2.5, "primeiro uso", (s) => !s.temLancamentos),
  ] },

  // ── pessoa física
  { id: "pf-gastos-mes", texto: "Quanto gastei este mês e com o quê?", tema: "pessoal", publico: "pessoal", base: 0.6, regras: [] },
  { id: "pf-orcamento", texto: "Estou dentro do orçamento do mês?", tema: "pessoal", publico: "pessoal", base: 0.5, regras: [] },
  { id: "pf-contas-semana", texto: "Quais contas vencem esta semana?", tema: "pessoal", publico: "pessoal", base: 0.3, regras: [
    r(0.6, "há contas nos próximos 30 dias", (s) => n(s.pagar30) && s.pagar30 > 0),
  ] },
  { id: "pf-guardar", texto: "Quanto consigo guardar por mês?", tema: "pessoal", publico: "pessoal", base: 0.4, regras: [] },
  { id: "pf-subiu", texto: "Quais gastos subiram contra o mês passado?", tema: "pessoal", publico: "pessoal", base: 0.3, regras: [
    r(0.8, "os gastos mudaram em 30 dias", (s) => n(s.burnVar) && Math.abs(s.burnVar) >= 0.1),
  ] },
  { id: "pf-assinaturas", texto: "Quais assinaturas eu pago todo mês?", tema: "pessoal", publico: "pessoal", base: 0.3, regras: [] },
];

/* ------------------------------ prioridades e uso ------------------------------ */

/**
 * O RÓTULO CURTO e o ícone de cada pergunta — o chip mostra isto ("Fechar o
 * mês"), e a pergunta inteira é o que vai para a conversa. Modelo do dono
 * (14/10/2026): chips curtos com ícone, como no protótipo de referência.
 * Os ícones são chaves do `Icon` do DS. A guarda exige um rótulo por pergunta.
 */
export const ROTULOS: Record<string, { curto: string; icone: string }> = {
  "fechar-mes": { curto: "Fechar o mês", icone: "list-checks" },
  "conciliar": { curto: "Conciliar", icone: "check" },
  "notas": { curto: "Notas a emitir", icone: "file-text" },
  "aprovacoes": { curto: "Minhas aprovações", icone: "shield-check" },
  "resultado-mes": { curto: "Resultado do mês", icone: "activity" },
  "variacao-dre": { curto: "O que mudou?", icone: "arrow-left-right" },
  "impostos": { curto: "Impostos do mês", icone: "receipt" },
  "fluxo-13-semanas": { curto: "Fluxo 13 semanas", icone: "calendar" },
  "fluxo-3-semanas": { curto: "Fluxo 3 semanas", icone: "calendar" },
  "runway": { curto: "Quanto aguento?", icone: "gauge" },
  "caixa-caiu": { curto: "Por que caiu?", icone: "trending-down" },
  "caixa-subiu": { curto: "De onde veio?", icone: "trending-up" },
  "caixa-negativo": { curto: "Cobrir o caixa", icone: "triangle-alert" },
  "posso-gastar": { curto: "Posso gastar?", icone: "credit-card" },
  "aplicar-sobra": { curto: "Aplicar a sobra", icone: "target" },
  "burn-mudou": { curto: "Mudança no burn", icone: "activity" },
  "cortar-despesas": { curto: "Cortar despesas", icone: "minus" },
  "maiores-gastos": { curto: "Maiores gastos", icone: "shopping-cart" },
  "softwares": { curto: "Assinaturas", icone: "repeat" },
  "folha": { curto: "Peso da folha", icone: "users" },
  "combustivel-frete": { curto: "Combustível e frete", icone: "workflow" },
  "marketing": { curto: "Custo por cliente", icone: "target" },
  "quem-deve": { curto: "Quem me deve?", icone: "users" },
  "cobrar-primeiro": { curto: "Cobrar primeiro", icone: "mail" },
  "receber-semana": { curto: "Receber na semana", icone: "inbox" },
  "concentracao": { curto: "Dependência de clientes", icone: "network" },
  "melhores-clientes": { curto: "Melhores clientes", icone: "trending-up" },
  "pagar-semana": { curto: "Pagar na semana", icone: "calendar" },
  "fornecedores": { curto: "Fornecedores", icone: "building" },
  "renegociar": { curto: "Renegociar contas", icone: "rotate-ccw" },
  "arr-evolucao": { curto: "Receita recorrente", icone: "repeat" },
  "churn": { curto: "Cancelamentos", icone: "trending-down" },
  "investidores": { curto: "Resumo p/ investidores", icone: "mail" },
  "taxas-cartao": { curto: "Taxas de cartão", icone: "credit-card" },
  "antecipar": { curto: "Antecipar recebíveis", icone: "arrow-up-right" },
  "sazonalidade": { curto: "Sazonalidade", icone: "calendar" },
  "ticket-medio": { curto: "Ticket médio", icone: "receipt" },
  "margem-produto": { curto: "Margem por produto", icone: "layers" },
  "saude": { curto: "Saúde financeira", icone: "gauge" },
  "importar-extrato": { curto: "Importar extrato", icone: "upload" },
  "o-que-faz": { curto: "O que você faz?", icone: "help-circle" },
  "pf-gastos-mes": { curto: "Gastos do mês", icone: "shopping-cart" },
  "pf-orcamento": { curto: "Meu orçamento", icone: "target" },
  "pf-contas-semana": { curto: "Contas da semana", icone: "calendar" },
  "pf-guardar": { curto: "Guardar dinheiro", icone: "database" },
  "pf-subiu": { curto: "O que subiu?", icone: "trending-up" },
  "pf-assinaturas": { curto: "Assinaturas", icone: "repeat" },
};

/**
 * As duas perguntas FIXAS de cada público — aparecem antes de qualquer
 * interação, inclusive no primeiro acesso, e sempre nas duas primeiras
 * posições. Decisão do dono (14/10/2026): "antes do chat, duas sugestões
 * básicas e o resto de acordo com o que o cliente for interagindo".
 */
export const BASICAS: Record<SinaisHome["tipoConta"], string[]> = {
  empresa: ["saude", "fechar-mes"],
  pessoal: ["pf-gastos-mes", "pf-orcamento"],
};

export interface Interesse {
  id: string;
  rotulo: string;
  publico: "empresa" | "pessoal";
  /** As sugestões que esta prioridade puxa para cima. */
  sugestoes: string[];
}

/** A pergunta do primeiro acesso: "o que é mais importante no seu dia a dia?". */
export const INTERESSES: Interesse[] = [
  { id: "calendario-pagamentos", rotulo: "Calendário de pagamentos", publico: "empresa", sugestoes: ["pagar-semana", "aprovacoes", "renegociar", "impostos"] },
  { id: "vendas", rotulo: "Gestão de vendas", publico: "empresa", sugestoes: ["melhores-clientes", "ticket-medio", "margem-produto", "notas", "taxas-cartao"] },
  { id: "fluxo-caixa", rotulo: "Fluxo de caixa", publico: "empresa", sugestoes: ["fluxo-3-semanas", "fluxo-13-semanas", "runway", "posso-gastar"] },
  { id: "cobranca", rotulo: "Cobrança e recebimentos", publico: "empresa", sugestoes: ["quem-deve", "cobrar-primeiro", "receber-semana", "concentracao"] },
  { id: "despesas", rotulo: "Controle de despesas", publico: "empresa", sugestoes: ["maiores-gastos", "burn-mudou", "cortar-despesas", "softwares"] },
  { id: "fechamento", rotulo: "Fechamento e contabilidade", publico: "empresa", sugestoes: ["conciliar", "variacao-dre", "resultado-mes", "notas"] },
  { id: "recorrente", rotulo: "Receita recorrente", publico: "empresa", sugestoes: ["arr-evolucao", "churn", "investidores"] },
  { id: "impostos", rotulo: "Impostos", publico: "empresa", sugestoes: ["impostos", "notas"] },
  { id: "pf-gastos", rotulo: "Controlar gastos", publico: "pessoal", sugestoes: ["pf-subiu", "pf-assinaturas"] },
  { id: "pf-contas", rotulo: "Contas a pagar", publico: "pessoal", sugestoes: ["pf-contas-semana"] },
  { id: "pf-guardar", rotulo: "Guardar dinheiro", publico: "pessoal", sugestoes: ["pf-guardar"] },
];

/** Peso de uma prioridade declarada: vence regra de perfil, perde para urgência (caixa negativo, primeiro uso). */
const PESO_INTERESSE = 1.5;
/**
 * Peso de uma prioridade LIDA da descrição livre: abaixo da marcada (a pessoa
 * escolher na lista é mais forte que uma palavra no meio de um parágrafo).
 */
const PESO_DESCRICAO = 1;
/** Cada clique soma um pouco, até um teto — senão uma pergunta clicada no 1º dia fica para sempre. */
const PESO_CLIQUE = 0.25;
const TETO_CLIQUES = 4;

/* ------------------------------ o que a pessoa ignora desce (etapa 5) ------------------------------ */

/** Dias de exibição sem clique que ainda não custam nada — ninguém clica em tudo no primeiro dia. */
export const DIAS_DE_GRACA = 3;
/** Quanto cada dia ignorado além da graça tira da pontuação. */
const PESO_IGNORADA = 0.4;
/**
 * O teto do desconto. Alto o bastante para a ignorada DESCER de verdade (a
 * soma das regras comuns chega a ~2,5); quem não pode descer é a urgência,
 * isenta à parte (`PESO_URGENTE`), e a volta é garantida pela janela.
 */
export const TETO_IGNORADA = 2;
/**
 * A partir deste peso a regra é URGÊNCIA (caixa negativo, primeiro uso) e a
 * pergunta não desce por ser ignorada. ⚠️ Só o teto não bastava — medido na
 * guarda: com o caixa negativo, "Como cobrir o caixa negativo?" descontada
 * perdia a vaga do tema caixa para "Fluxo 13 semanas" e saía da tela. Ignorar
 * o alarme não desliga o alarme.
 */
export const PESO_URGENTE = 2.5;
/**
 * Depois de tantos dias SEM aparecer, o desconto some e a pergunta volta a
 * ter a chance dela. Sem isso, o que desceu uma vez nunca mais seria visto —
 * e não aparecer de novo não é sinal de nada.
 */
export const JANELA_IGNORADA = 14;

const diasEntre = (de: string, ate: string): number | null => {
  const ok = (x: string) => /^\d{4}-\d{2}-\d{2}$/.test(x);
  if (!ok(de) || !ok(ate)) return null;
  const t = (x: string) => Date.UTC(Number(x.slice(0, 4)), Number(x.slice(5, 7)) - 1, Number(x.slice(8, 10)));
  return Math.round((t(ate) - t(de)) / 86_400_000);
};

/**
 * Quanto a sugestão perde por ter sido ignorada. As BÁSICAS nunca perdem (são
 * fixas). ⚠️ O dia de HOJE só conta amanhã: a exibição de hoje é gravada com a
 * Home aberta, e se ela mudasse o desconto de hoje os chips trocariam de lugar
 * diante de quem está olhando.
 */
export function descontoPorIgnorar(s: SinaisHome, id: string): number {
  if (BASICAS[s.tipoConta].includes(id)) return 0;
  const e = s.exibidas?.[id];
  if (!e || !Number.isFinite(e.dias) || e.dias <= 0) return 0;
  const desde = diasEntre(e.ultimo, s.hoje);
  if (desde === null || desde > JANELA_IGNORADA) return 0;
  const dias = desde <= 0 ? e.dias - 1 : e.dias;
  return Math.min(TETO_IGNORADA, Math.max(0, dias - DIAS_DE_GRACA) * PESO_IGNORADA);
}

/** Ignorada até o teto: nem a escolha da Quattro AI a põe de volta na frente. */
export const cansada = (s: SinaisHome, id: string) => descontoPorIgnorar(s, id) >= TETO_IGNORADA;

/* ------------------------------ a descrição livre do onboarding (etapa 3) ------------------------------ */

/** Quanto do texto livre vai à IA. A ordem de quatro perguntas não precisa de mais que um parágrafo. */
export const TETO_DESCRICAO = 500;

const semAcento = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * O texto livre como ele pode sair para a IA: espaços colapsados, segredos
 * cobertos (CPF, CNPJ, cartão, chave, senha — `redigirSegredos`, o MESMO
 * detector da Central de Ajuda) e corte em `TETO_DESCRICAO`. Vazio é `null`,
 * nunca "".
 *
 * ⚠️ Quem escreve um parágrafo sobre a empresa costuma colar o CNPJ, o PIX ou
 * o e-mail do sócio. Nada disso muda a ordem das sugestões e nada disso
 * precisa sair do navegador.
 */
export function descricaoParaIA(texto: unknown): string | null {
  if (typeof texto !== "string") return null;
  const limpo = redigirSegredos(texto.replace(/\s+/g, " ").trim());
  if (!limpo) return null;
  return limpo.length > TETO_DESCRICAO ? `${limpo.slice(0, TETO_DESCRICAO).trimEnd()}…` : limpo;
}

/**
 * As palavras que ligam a descrição livre a uma prioridade de `INTERESSES`.
 * ⚠️ Ancoradas em `\b` e sobre o texto SEM acento: "vendas" não pode casar
 * dentro de "revendas" nem "caixa" depender do til de quem digitou.
 */
const PALAVRAS_DO_INTERESSE: Record<string, RegExp> = {
  "calendario-pagamentos": /\b(fornecedor(es)?|boletos?|contas a pagar|pagamentos? (a|de) fornecedor\w*|vencimentos?)\b/,
  vendas: /\b(vendas?|vender|vendemos|loja|lojas|e-?commerce|varejo|ticket medio|comercial)\b/,
  "fluxo-caixa": /\b(fluxo de caixa|caixa|capital de giro|runway|liquidez|saldo)\b/,
  cobranca: /\b(cobranca|cobrar|inadimplen\w*|atrasos?|recebimentos?|receber)\b/,
  despesas: /\b(despesas?|custos?|gastos?|economizar|cortar)\b/,
  fechamento: /\b(fechamento|fechar o mes|contador|contabilidade|contabil|dre|conciliacao|conciliar)\b/,
  recorrente: /\b(assinaturas?|recorren\w*|mrr|arr|saas|churn|mensalidades?)\b/,
  impostos: /\b(impostos?|tributos?|tributari\w*|simples nacional|notas? fisca\w*|nf-?e|nfs-?e)\b/,
  "pf-gastos": /\b(gastos?|gastar|gasto|despesas?)\b/,
  "pf-contas": /\b(contas?|boletos?|vencimentos?|faturas?)\b/,
  "pf-guardar": /\b(guardar|poupar|economizar|reserva|investir|investimentos?)\b/,
};

/**
 * As prioridades que a DESCRIÇÃO livre sugere, no público certo. É a ponte
 * determinística: sem chave de IA, o que a pessoa escreveu ainda pesa, e pesa
 * pelas MESMAS listas da pergunta do primeiro acesso.
 */
export function interessesDaDescricao(texto: unknown, publico: SinaisHome["tipoConta"]): string[] {
  if (typeof texto !== "string" || !texto.trim()) return [];
  const t = semAcento(texto);
  return INTERESSES.filter((i) => i.publico === publico && PALAVRAS_DO_INTERESSE[i.id]?.test(t)).map((i) => i.id);
}

/* ------------------------------ a escolha ------------------------------ */

/** O piso de quem foi descontado por ignorar: continua de pé, só lá atrás. */
const PISO_PONTOS = 0.01;

const rotuloDe = (c: Sugestao) => ROTULOS[c.id] ?? { curto: c.texto, icone: "sparkles" };

/**
 * Pontua o catálogo do público: base + regras + prioridades + cliques; zero
 * sai; o desconto por ignorar vem por último.
 *
 * ⚠️ O desconto REORDENA, não desliga: quem sai por pontuação zero é decidido
 * ANTES dele, e ele nunca leva a pontuação abaixo de um piso positivo. Uma
 * pergunta ignorada continua disponível para completar a lista; uma desligada
 * por sinal ausente não volta por causa dele.
 */
function avaliar(s: SinaisHome): SugestaoEscolhida[] {
  const daDescricao = interessesDaDescricao(s.perfil?.descricao, s.tipoConta);
  return CATALOGO_SUGESTOES
    .filter((c) => c.publico === s.tipoConta)
    .map((c, ordem) => {
      const casadas = c.regras.filter((g) => g.casa(s));
      const interesse = INTERESSES.find((i) => s.interesses?.includes(i.id) && i.sugestoes.includes(c.id));
      if (interesse) casadas.push(r(PESO_INTERESSE, `você marcou ${interesse.rotulo.toLowerCase()} como prioridade`, () => true));
      // A descrição só soma onde a prioridade marcada não somou: a mesma
      // vontade dita duas vezes não vale o dobro.
      const descrito = !interesse && INTERESSES.find((i) => daDescricao.includes(i.id) && i.sugestoes.includes(c.id));
      if (descrito) casadas.push(r(PESO_DESCRICAO, `você descreveu a empresa com foco em ${descrito.rotulo.toLowerCase()}`, () => true));
      const vezes = Math.min(TETO_CLIQUES, s.cliques?.[c.id] ?? 0);
      if (vezes > 0) casadas.push(r(PESO_CLIQUE * vezes, "você costuma perguntar isto", () => true));
      casadas.sort((a, b) => b.peso - a.peso);
      const bruto = c.base + casadas.reduce((t, g) => t + g.peso, 0);
      const urgente = casadas.some((g) => g.peso >= PESO_URGENTE);
      const pontos = bruto > 0 && !urgente ? Math.max(PISO_PONTOS, bruto - descontoPorIgnorar(s, c.id)) : bruto;
      return {
        ordem,
        e: { id: c.id, texto: c.texto, ...rotuloDe(c), tema: c.tema, pontos, motivo: casadas[0]?.motivo ?? "pergunta frequente" } as SugestaoEscolhida,
      };
    })
    .filter((x) => x.e.pontos > 0)
    .sort((a, b) => b.e.pontos - a.e.pontos || a.ordem - b.ordem)
    .map((x) => x.e);
}

/**
 * Escolhe até `limite` sugestões. As duas BÁSICAS vêm primeiro, sempre; depois,
 * no máximo `MAX_POR_TEMA` por tema, pela pontuação.
 *
 * ⚠️ `preferidas` é a ORDEM que a Quattro AI propôs (etapa 2). Ela é tratada
 * como dado de fora, não como ordem: só passa id que é texto, que existe no
 * catálogo, que é do público, que não é básica e que as REGRAS já deixaram de
 * pé (pontuação acima de zero). A IA só REORDENA — não ressuscita a sugestão
 * que um sinal ausente desligou, não inventa pergunta e não fura o teto por
 * tema. O que ela não preencher, as regras preenchem.
 */
export function recomendarSugestoes(s: SinaisHome, limite = LIMITE_SUGESTOES, preferidas?: unknown): SugestaoEscolhida[] {
  const avaliadas = avaliar(s);
  const basicas = BASICAS[s.tipoConta];
  const daIA = idsValidosDaIA(preferidas, avaliadas, basicas).filter((id) => !cansada(s, id));
  const ordenadas = [
    ...daIA.map((id) => avaliadas.find((e) => e.id === id)!),
    ...avaliadas,
  ];

  const out: SugestaoEscolhida[] = [];
  const porTema = new Map<TemaSugestao, number>();
  // As duas básicas primeiro, sempre — e entram na conta do tema.
  for (const id of basicas) {
    const c = CATALOGO_SUGESTOES.find((x) => x.id === id);
    if (!c || out.length >= limite) continue;
    out.push({ id: c.id, texto: c.texto, ...rotuloDe(c), tema: c.tema, pontos: 99, motivo: "sugestão básica" });
    porTema.set(c.tema, (porTema.get(c.tema) ?? 0) + 1);
  }
  for (const e of ordenadas) {
    if (out.some((o) => o.id === e.id)) continue;
    if (out.length >= limite) break;
    const k = porTema.get(e.tema) ?? 0;
    if (k >= MAX_POR_TEMA) continue;
    porTema.set(e.tema, k + 1);
    out.push(e);
  }
  for (const e of avaliadas) {
    if (out.length >= limite) break;
    if (!out.some((o) => o.id === e.id)) out.push(e);
  }
  return out;
}

function idsValidosDaIA(preferidas: unknown, avaliadas: SugestaoEscolhida[], basicas: string[]): string[] {
  if (!Array.isArray(preferidas)) return [];
  const vivas = new Set(avaliadas.map((e) => e.id));
  const out: string[] = [];
  for (const id of preferidas) {
    if (typeof id !== "string" || !vivas.has(id) || basicas.includes(id) || out.includes(id)) continue;
    out.push(id);
  }
  return out;
}

/* ------------------------------ a pergunta à Quattro AI (etapa 2) ------------------------------ */

/** Quantas candidatas vão à IA: as mais bem pontuadas pelas regras, sem as básicas. */
export const CANDIDATAS_IA = 14;

export interface CandidataIA { id: string; texto: string; curto: string; icone: string; tema: TemaSugestao; motivo: string }

/** As candidatas que a IA pode ordenar — só as que as regras deixaram de pé. */
export function candidatasParaIA(s: SinaisHome, teto = CANDIDATAS_IA): CandidataIA[] {
  const basicas = BASICAS[s.tipoConta];
  return avaliar(s)
    .filter((e) => !basicas.includes(e.id))
    .slice(0, teto)
    .map(({ id, texto, curto, icone, tema, motivo }) => ({ id, texto, curto, icone, tema, motivo }));
}

/**
 * O contexto que vai à IA: os SINAIS, já com o ausente como `null` (nunca
 * zero), o perfil do onboarding e o que a pessoa marcou e clicou. Nada de
 * lançamento, nome de cliente ou documento — a ordem de quatro perguntas não
 * precisa disso, e o que não sai não vaza.
 */
export function contextoParaIA(s: SinaisHome) {
  return {
    diaDoMes: dia(s),
    tipoConta: s.tipoConta,
    // A descrição livre sai SANEADA (segredos cobertos, corte no teto) — nunca crua.
    perfil: s.perfil ? { ...s.perfil, descricao: descricaoParaIA(s.perfil.descricao) } : null,
    temLancamentos: s.temLancamentos,
    caixa: s.caixa,
    variacaoCaixa30d: s.caixaVar,
    burnMensal: s.burnMensal,
    variacaoBurn30d: s.burnVar,
    runwayMeses: s.runwayMeses,
    runwayMotivo: s.runwayMotivo,
    arr: s.arr,
    aReceber30d: s.receber30,
    aPagar30d: s.pagar30,
    receberVencido: s.receberVencido,
    titulosVencidos: s.qtdReceberVencidos,
    pendencias: s.pendencias,
    fechamentoConcluido: s.fechamento,
    prioridades: s.interesses ?? [],
    cliques: s.cliques ?? {},
    // Só o que JÁ desceu por ser ignorado (id → dias sem clique); o resto não muda nada.
    ignoradas: Object.fromEntries(
      Object.entries(s.exibidas ?? {}).filter(([id]) => descontoPorIgnorar(s, id) > 0).map(([id, e]) => [id, e.dias]),
    ),
  };
}

/* ------------------------------ os sinais, a partir do que a Home já tem ------------------------------ */

const valorDe = (i: Indicador): number | null => (temValor(i) ? i.valor : null);
const pequeno = (snap: HomeSnapshot, id: NumeroHome["id"]) => snap.pequenos.find((p) => p.id === id);

/**
 * Monta os sinais a partir do snapshot da Home (camada canônica) e do vencido
 * a receber (`inadimplencia`). As pendências e o fechamento chegam de fora
 * porque moram em lojas próprias; `null` = ainda não carregou ou não existe.
 */
export function sinaisDaHome(args: {
  snap: HomeSnapshot;
  input: RiskInput;
  tipoConta: "empresa" | "pessoal";
  perfil: PerfilSinais | null;
  pendencias?: Partial<SinaisHome["pendencias"]>;
  fechamento?: number | null;
  interesses?: string[];
  cliques?: Record<string, number>;
  exibidas?: Record<string, Exibicao>;
}): SinaisHome {
  const { snap, input } = args;
  const burn = pequeno(snap, "burn");
  const runway = pequeno(snap, "runway");
  const vencido = inadimplencia(input);
  return {
    hoje: snap.hoje,
    tipoConta: args.tipoConta,
    perfil: args.perfil,
    temLancamentos: input.movements.length > 0,
    caixa: valorDe(snap.caixa.atual),
    caixaVar: snap.caixa.variacao,
    burnMensal: burn ? valorDe(burn.atual) : null,
    burnVar: burn?.variacao ?? null,
    runwayMeses: runway ? valorDe(runway.atual) : null,
    runwayMotivo: runway?.atual.indisponivel?.codigo ?? null,
    arr: valorDe(snap.arr.atual),
    receber30: (() => { const p = pequeno(snap, "receber"); return p ? valorDe(p.atual) : null; })(),
    pagar30: (() => { const p = pequeno(snap, "pagar"); return p ? valorDe(p.atual) : null; })(),
    receberVencido: valorDe(vencido),
    qtdReceberVencidos: temValor(vencido) ? vencido.procedencia.lancamentos : null,
    pendencias: {
      conciliar: args.pendencias?.conciliar ?? null,
      notas: args.pendencias?.notas ?? null,
      compras: args.pendencias?.compras ?? null,
      aprovacoes: args.pendencias?.aprovacoes ?? null,
      boletos: args.pendencias?.boletos ?? null,
    },
    fechamento: args.fechamento ?? null,
    interesses: args.interesses ?? [],
    cliques: args.cliques ?? {},
    exibidas: args.exibidas ?? {},
  };
}
