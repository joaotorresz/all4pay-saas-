/**
 * DASHBOARDS CUSTOMIZADOS — o modelo e as fontes de dados (puro, tipado).
 *
 * Um dashboard é: nome + descrição + PÁGINAS, e cada página tem WIDGETS. Cada
 * widget aponta para uma FONTE — e é aqui que está o valor: a fonte não é um
 * número solto, é uma função pura sobre o MESMO `RiskInput` que alimenta o
 * resto do sistema. Widget montado à mão e número do DRE nunca divergem.
 *
 * Três famílias de fonte, uma por formato de widget:
 *   • métrica    → um número (KPI)
 *   • série      → pontos no tempo (linha/barras)
 *   • categoria  → fatias (pizza/rosca)
 *
 * Versão dashboards/1.0.0.
 */

export const DASHBOARDS_VERSION = "dashboards/1.1.0";

import type { RiskInput } from "@/core/risk-engine/types";
import {
  saldo as saldoCanonico, entradas, saidas, resultado, burn as burnCanonico, runwayMeses,
  type Indicador,
} from "@/core/indicadores";
import { janelaDoMesDe } from "@/core/indicadores/janela";

/* ------------------------------- o modelo ------------------------------- */

export type TipoWidget = "kpi" | "texto" | "serie" | "pizza" | "saldos" | "semana";
/** Quantas colunas o widget ocupa na grade de 3. */
export type Largura = 1 | 2 | 3;

interface Base {
  id: string;
  titulo: string;
  largura: Largura;
}
export interface WidgetKPI extends Base { tipo: "kpi"; fonte: string }
export interface WidgetTexto extends Base { tipo: "texto"; texto: string }
export interface WidgetSerie extends Base { tipo: "serie"; fonte: string; formato: "linha" | "barras" }
export interface WidgetPizza extends Base { tipo: "pizza"; fonte: string }
export interface WidgetSaldos extends Base { tipo: "saldos" }
export interface WidgetSemana extends Base { tipo: "semana"; direcao: "pagar" | "receber" | "ambos" }

export type Widget = WidgetKPI | WidgetTexto | WidgetSerie | WidgetPizza | WidgetSaldos | WidgetSemana;

export interface PaginaDashboard {
  id: string;
  titulo: string;
  widgets: Widget[];
}

export interface DashboardCustom {
  id: string;
  nome: string;
  descricao: string;
  /** "pessoal" = só deste usuário · "empresa" = compartilhado com a organização. */
  escopo: "pessoal" | "empresa";
  /** Os widgets sempre leem a empresa ATIVA; isto só decide se o dashboard aparece nas outras. */
  todasEmpresas: boolean;
  /** Quem criou — decide quem vê um painel "pessoal" (estado é da organização). */
  dono?: string;
  /** Cor de destaque do dashboard (aparência). */
  cor: string;
  paginas: PaginaDashboard[];
  criadoEm: string;
}

/* ---------------------------- o catálogo ---------------------------- */

export interface ItemCatalogo {
  tipo: TipoWidget;
  nome: string;
  descricao: string;
}

export const CATALOGO: ItemCatalogo[] = [
  { tipo: "kpi", nome: "KPI", descricao: "Indicador numérico simples a partir de uma fonte de métricas." },
  { tipo: "texto", nome: "Texto livre", descricao: "Bloco de texto fixo (notas, lembretes, links)." },
  { tipo: "serie", nome: "Gráfico de série", descricao: "Gráfico de linha ou barras para qualquer fonte que retorne uma série temporal." },
  { tipo: "pizza", nome: "Gráfico de pizza/rosca", descricao: "Donut chart para qualquer fonte que retorne uma série categórica (status, categorias, etc.)." },
  { tipo: "saldos", nome: "Saldos das contas", descricao: "Lista de contas bancárias com saldo atual e total." },
  { tipo: "semana", nome: "Lista da semana (CP/CR)", descricao: "Lançamentos da semana agrupados por status." },
];

/* ----------------------------- as fontes ----------------------------- */

interface MovimentoBase {
  type: "entrada" | "saida";
  amount: number;
  status?: string;
  due_date: string;
  paid_date?: string | null;
  category?: string | null;
}
/**
 * A entrada das fontes é o MESMO `RiskInput` do resto do sistema — era um
 * recorte próprio (hoje · saldo · movimentos), e foi esse recorte que deixou
 * cada fonte livre para ter a sua conta.
 */
export type EntradaFontes = RiskInput;

/** O valor de uma fonte de métrica — ou a AUSÊNCIA dele, com o motivo. */
export interface ValorFonte {
  valor: number;
  /** Preenchido: o número NÃO deve ser exibido; o motivo ocupa o lugar (ONDA 4). */
  indisponivel?: { motivo: string };
}

export interface FonteMetrica {
  id: string;
  label: string;
  /** "moeda" formata em BRL; "numero" é contagem; "meses" é prazo. */
  unidade: "moeda" | "numero" | "meses";
  calcular: (i: EntradaFontes) => ValorFonte;
}

const dia = (m: MovimentoBase) => (m.paid_date || m.due_date || "").slice(0, 10);
const vivos = (ms: MovimentoBase[]) => ms.filter((m) => m.status !== "cancelado");
const mesDe = (iso: string) => iso.slice(0, 7);

/** Soma do que está pendente (em aberto), por tipo. */
function emAberto(i: EntradaFontes, tipo: "entrada" | "saida"): number {
  return vivos(i.movements)
    .filter((m) => m.type === tipo && m.status === "pendente")
    .reduce((s, m) => s + Math.abs(m.amount), 0);
}
/** Pendente já vencido, por tipo. */
function vencido(i: EntradaFontes, tipo: "entrada" | "saida"): number {
  return vivos(i.movements)
    .filter((m) => m.type === tipo && m.status === "pendente" && (m.due_date || "").slice(0, 10) < i.hoje)
    .reduce((s, m) => s + Math.abs(m.amount), 0);
}

/** Um indicador canônico vira valor de fonte SEM perder a ausência. */
const doIndicador = (ind: Indicador): ValorFonte =>
  ind.indisponivel ? { valor: 0, indisponivel: { motivo: ind.indisponivel.motivo } } : { valor: ind.valor };
const numero = (valor: number): ValorFonte => ({ valor });

/*
 * ⚠️ **AS MÉTRICAS SAEM DA CAMADA CANÔNICA, e era isto que o cabeçalho deste
 * arquivo prometia sem cumprir.** "Widget montado à mão e número do DRE nunca
 * divergem" — mas cada fonte tinha a sua conta:
 *
 *   - **Burn** era a MÉDIA DAS SAÍDAS (bruta), não a queima: uma empresa que
 *     fatura mais do que gasta via "Burn mensal R$ 38 mil" no dashboard dela
 *     enquanto o Fluxo de caixa, o Investor Update e a Quattro AI diziam
 *     "burn zero, gera caixa". Mesmo rótulo, duas grandezas.
 *   - **Runway** dividia o saldo pela despesa bruta e devolvia **0 meses**
 *     quando não havia despesa — "o caixa acaba agora" para quem não gasta. E
 *     sobre saldo negativo, um runway negativo.
 *   - **Receita/despesa/resultado do mês** devolviam R$ 0,00 para um mês sem
 *     lançamento — o zero mudo que a ONDA 4 tirou do resto do sistema.
 *
 * Agora: saldo, entradas, saídas, resultado, burn e runway são os de
 * `core/indicadores`, com a ausência atravessando até a tela.
 */
export const FONTES_METRICA: FonteMetrica[] = [
  { id: "saldo", label: "Saldo em caixa", unidade: "moeda", calcular: (i) => doIndicador(saldoCanonico(i)) },
  { id: "receita_mes", label: "Receita do mês", unidade: "moeda", calcular: (i) => doIndicador(entradas(i, janelaDoMesDe(i.hoje), "caixa")) },
  { id: "despesa_mes", label: "Despesa do mês", unidade: "moeda", calcular: (i) => doIndicador(saidas(i, janelaDoMesDe(i.hoje), "caixa")) },
  { id: "resultado_mes", label: "Resultado do mês", unidade: "moeda", calcular: (i) => doIndicador(resultado(i, janelaDoMesDe(i.hoje), "caixa")) },
  { id: "a_receber", label: "Total a receber", unidade: "moeda", calcular: (i) => numero(emAberto(i, "entrada")) },
  { id: "a_pagar", label: "Total a pagar", unidade: "moeda", calcular: (i) => numero(emAberto(i, "saida")) },
  { id: "vencido_receber", label: "Vencido a receber", unidade: "moeda", calcular: (i) => numero(vencido(i, "entrada")) },
  { id: "vencido_pagar", label: "Vencido a pagar", unidade: "moeda", calcular: (i) => numero(vencido(i, "saida")) },
  { id: "burn", label: "Burn mensal (queima líquida)", unidade: "moeda", calcular: (i) => doIndicador(burnCanonico(i)) },
  { id: "runway", label: "Runway", unidade: "meses", calcular: (i) => doIndicador(runwayMeses(i)) },
  {
    id: "qtd_pendentes", label: "Títulos em aberto", unidade: "numero",
    calcular: (i) => numero(vivos(i.movements).filter((m) => m.status === "pendente").length),
  },
  {
    id: "ticket_medio", label: "Ticket médio de venda", unidade: "moeda",
    calcular: (i) => {
      const e = vivos(i.movements).filter((m) => m.type === "entrada" && m.status === "pago");
      return e.length > 0
        ? numero(e.reduce((s, m) => s + Math.abs(m.amount), 0) / e.length)
        : { valor: 0, indisponivel: { motivo: "nenhuma entrada recebida para medir o ticket" } };
    },
  },
];

export interface PontoSerie { label: string; valor: number }
export interface FonteSerie {
  id: string;
  label: string;
  calcular: (i: EntradaFontes, meses?: number) => PontoSerie[];
}

const MES_ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Últimos N meses (rótulo "jan/26") somando o tipo pedido. */
function serieMensal(i: EntradaFontes, meses: number, fn: (ms: MovimentoBase[]) => number): PontoSerie[] {
  const base = new Date(i.hoje + "T00:00:00");
  const out: PontoSerie[] = [];
  for (let k = meses - 1; k >= 0; k--) {
    const d = new Date(base.getFullYear(), base.getMonth() - k, 1);
    const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const doMes = vivos(i.movements).filter((m) => mesDe(dia(m)) === chave);
    out.push({ label: `${MES_ABREV[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`, valor: Math.round(fn(doMes) * 100) / 100 });
  }
  return out;
}
const somaPagos = (tipo: "entrada" | "saida") => (ms: MovimentoBase[]) =>
  ms.filter((m) => m.type === tipo && m.status === "pago").reduce((s, m) => s + Math.abs(m.amount), 0);

export const FONTES_SERIE: FonteSerie[] = [
  { id: "receita_12m", label: "Receita (12 meses)", calcular: (i, n = 12) => serieMensal(i, n, somaPagos("entrada")) },
  { id: "despesa_12m", label: "Despesa (12 meses)", calcular: (i, n = 12) => serieMensal(i, n, somaPagos("saida")) },
  {
    id: "resultado_12m", label: "Resultado (12 meses)",
    calcular: (i, n = 12) => serieMensal(i, n, (ms) => somaPagos("entrada")(ms) - somaPagos("saida")(ms)),
  },
  {
    id: "saldo_acumulado", label: "Saldo acumulado (12 meses)",
    calcular: (i, n = 12) => {
      const res = serieMensal(i, n, (ms) => somaPagos("entrada")(ms) - somaPagos("saida")(ms));
      // Reconstrói para trás a partir do saldo de hoje, para a linha terminar nele.
      const total = res.reduce((s, p) => s + p.valor, 0);
      let acc = i.saldoAtual - total;
      return res.map((p) => { acc += p.valor; return { label: p.label, valor: Math.round(acc * 100) / 100 }; });
    },
  },
];

export interface FatiaCategoria { nome: string; valor: number }
export interface FonteCategoria {
  id: string;
  label: string;
  /** "moeda" soma dinheiro; "numero" conta títulos — o total NÃO leva R$. */
  unidade: "moeda" | "numero";
  calcular: (i: EntradaFontes) => FatiaCategoria[];
}

/** Agrupa por categoria e devolve as maiores primeiro. */
function porCategoria(ms: MovimentoBase[]): FatiaCategoria[] {
  const mapa = new Map<string, number>();
  for (const m of ms) {
    const c = (m.category || "Sem categoria").trim() || "Sem categoria";
    mapa.set(c, (mapa.get(c) ?? 0) + Math.abs(m.amount));
  }
  return Array.from(mapa, ([nome, valor]) => ({ nome, valor: Math.round(valor * 100) / 100 }))
    .sort((a, b) => b.valor - a.valor);
}

/**
 * Janela de 12 meses das fatias — a MESMA das séries.
 *
 * Sem janela a pizza somava o histórico inteiro e ficava ao lado de um KPI
 * "Despesa do mês": R$442 mil contra R$38 mil, sem nada explicando a
 * diferença. Com a janela casada, o total da pizza bate com a soma da série.
 */
function ultimos12Meses(i: EntradaFontes, ms: MovimentoBase[]): MovimentoBase[] {
  const base = new Date(i.hoje + "T00:00:00");
  const inicio = new Date(base.getFullYear(), base.getMonth() - 11, 1);
  const corte = `${inicio.getFullYear()}-${String(inicio.getMonth() + 1).padStart(2, "0")}`;
  return ms.filter((m) => mesDe(dia(m)) >= corte);
}

export const FONTES_CATEGORIA: FonteCategoria[] = [
  {
    id: "despesa_categoria", label: "Despesas por categoria (12 meses)", unidade: "moeda",
    calcular: (i) => porCategoria(ultimos12Meses(i, vivos(i.movements).filter((m) => m.type === "saida" && m.status === "pago"))),
  },
  {
    id: "receita_categoria", label: "Receitas por categoria (12 meses)", unidade: "moeda",
    calcular: (i) => porCategoria(ultimos12Meses(i, vivos(i.movements).filter((m) => m.type === "entrada" && m.status === "pago"))),
  },
  {
    id: "status_titulos", label: "Títulos por status", unidade: "numero",
    calcular: (i) => {
      const ms = vivos(i.movements);
      const venc = ms.filter((m) => m.status === "pendente" && (m.due_date || "").slice(0, 10) < i.hoje).length;
      const aberto = ms.filter((m) => m.status === "pendente").length - venc;
      const pago = ms.filter((m) => m.status === "pago").length;
      return [
        { nome: "Liquidado", valor: pago },
        { nome: "Em aberto", valor: Math.max(0, aberto) },
        { nome: "Vencido", valor: venc },
      ].filter((f) => f.valor > 0);
    },
  },
];

export const fonteMetrica = (id: string) => FONTES_METRICA.find((f) => f.id === id) ?? FONTES_METRICA[0];
export const fonteSerie = (id: string) => FONTES_SERIE.find((f) => f.id === id) ?? FONTES_SERIE[0];
export const fonteCategoria = (id: string) => FONTES_CATEGORIA.find((f) => f.id === id) ?? FONTES_CATEGORIA[0];

/* ------------------------------ construtores ------------------------------ */

let seq = 0;
/** Id local e estável dentro da sessão (não vai para o banco). */
export const novoId = (p: string): string => `${p}_${Date.now().toString(36)}_${seq++}`;

/** Widget novo já com padrões sensatos, para entrar na página funcionando. */
export function widgetPadrao(tipo: TipoWidget): Widget {
  const id = novoId("w");
  switch (tipo) {
    case "kpi": return { id, tipo, titulo: "Saldo em caixa", largura: 1, fonte: "saldo" };
    case "texto": return { id, tipo, titulo: "Anotação", largura: 1, texto: "" };
    case "serie": return { id, tipo, titulo: "Receita (12 meses)", largura: 2, fonte: "receita_12m", formato: "barras" };
    case "pizza": return { id, tipo, titulo: "Despesas por categoria (12 meses)", largura: 1, fonte: "despesa_categoria" };
    case "saldos": return { id, tipo, titulo: "Saldos das contas", largura: 1 };
    default: return { id, tipo: "semana", titulo: "Lista da semana", largura: 2, direcao: "ambos" };
  }
}

export function dashboardVazio(nome = ""): DashboardCustom {
  return {
    id: novoId("d"),
    nome,
    descricao: "",
    escopo: "pessoal",
    todasEmpresas: false,
    cor: "#ECFD52",
    paginas: [{ id: novoId("p"), titulo: "Página 1", widgets: [] }],
    criadoEm: "",
  };
}

/**
 * Sugestão do assistente: o conjunto mínimo que responde "como estou hoje?" —
 * caixa, o que entra, o que sai, a série do resultado e onde o dinheiro foi.
 * Determinístico de propósito: uma sugestão que muda a cada clique não é
 * sugestão, é sorteio. Entra como ponto de partida editável.
 */
export function sugerirWidgets(): Widget[] {
  return [
    { id: novoId("w"), tipo: "kpi", titulo: "Saldo em caixa", largura: 1, fonte: "saldo" },
    { id: novoId("w"), tipo: "kpi", titulo: "Receita do mês", largura: 1, fonte: "receita_mes" },
    { id: novoId("w"), tipo: "kpi", titulo: "Despesa do mês", largura: 1, fonte: "despesa_mes" },
    { id: novoId("w"), tipo: "serie", titulo: "Resultado (12 meses)", largura: 2, fonte: "resultado_12m", formato: "barras" },
    { id: novoId("w"), tipo: "pizza", titulo: "Despesas por categoria (12 meses)", largura: 1, fonte: "despesa_categoria" },
  ];
}

/** Template pronto do print — o atalho para quem não quer montar do zero. */
export function templateAcompanhamentoSemanal(): DashboardCustom {
  const d = dashboardVazio("Acompanhamento Semanal");
  d.descricao = "O que entra, o que sai e o que vence nesta semana.";
  d.paginas = [{
    id: novoId("p"),
    titulo: "Semana",
    widgets: [
      { id: novoId("w"), tipo: "kpi", titulo: "Saldo em caixa", largura: 1, fonte: "saldo" },
      { id: novoId("w"), tipo: "kpi", titulo: "A receber", largura: 1, fonte: "a_receber" },
      { id: novoId("w"), tipo: "kpi", titulo: "A pagar", largura: 1, fonte: "a_pagar" },
      { id: novoId("w"), tipo: "semana", titulo: "Lançamentos da semana", largura: 2, direcao: "ambos" },
      { id: novoId("w"), tipo: "saldos", titulo: "Saldos das contas", largura: 1 },
      { id: novoId("w"), tipo: "serie", titulo: "Resultado (12 meses)", largura: 3, fonte: "resultado_12m", formato: "barras" },
    ],
  }];
  return d;
}
