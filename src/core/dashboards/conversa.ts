/**
 * PAINÉIS MONTADOS PELA CONVERSA (Fase 4.6 do plano, 04/11/2026).
 *
 * "Coloca o saldo em cima e tira o runway": o pedido escrito vira mudanças
 * nos widgets do painel, do mesmo jeito que a Home já se ajusta pela conversa.
 * O editor de arrastar continua lá, mas deixa de ser o único caminho.
 *
 * ⚠️ Só monta com as fontes que JÁ existem (`FONTES_*` de `core/dashboards`):
 * o número de cada widget sai do mesmo cálculo do editor. Pedido de indicador
 * que não está no catálogo ("EBITDA") volta como "ainda não tenho", com a
 * lista do que dá para pôr, e não vira widget de outra coisa com o nome dele.
 *
 * Puro, sem I/O. O id dos widgets novos vem de `novoId`.
 */
import {
  FONTES_CATEGORIA, FONTES_METRICA, FONTES_SERIE, novoId, sugerirWidgets, type Widget,
} from "./index";

type Alvo =
  | { tipo: "kpi"; fonte: string }
  | { tipo: "serie"; fonte: string }
  | { tipo: "pizza"; fonte: string }
  | { tipo: "saldos" }
  | { tipo: "semana" };

const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * O que a pessoa diz → a fonte. ⚠️ A ORDEM É A PRIORIDADE: o mais específico
 * antes ("saldo acumulado" antes de "saldo", "vencido a receber" antes de "a
 * receber", a série antes do número do mês).
 */
const VOCABULARIO: { re: RegExp; alvo: Alvo }[] = [
  { re: /saldo acumulado|evolucao do saldo/, alvo: { tipo: "serie", fonte: "saldo_acumulado" } },
  { re: /saldos? (das|de cada|por) contas?|contas bancarias/, alvo: { tipo: "saldos" } },
  { re: /despesas? por categoria|onde (o dinheiro|eu gasto|gasto)|gastos? por categoria/, alvo: { tipo: "pizza", fonte: "despesa_categoria" } },
  { re: /receitas? por categoria|de onde vem/, alvo: { tipo: "pizza", fonte: "receita_categoria" } },
  { re: /titulos? por status/, alvo: { tipo: "pizza", fonte: "status_titulos" } },
  { re: /(receita|faturamento|vendas?)( dos)? (12|doze|ultimos) mes|(grafico|evolucao) d[ao] (receita|faturamento)|(receita|faturamento) mes a mes/, alvo: { tipo: "serie", fonte: "receita_12m" } },
  { re: /despesas?( dos)? (12|doze|ultimos) mes|(grafico|evolucao) da despesa|despesas? mes a mes/, alvo: { tipo: "serie", fonte: "despesa_12m" } },
  { re: /(resultado|lucro)( dos)? (12|doze|ultimos) mes|(grafico|evolucao) do (resultado|lucro)|(resultado|lucro) mes a mes/, alvo: { tipo: "serie", fonte: "resultado_12m" } },
  { re: /(vencid|atrasad)[oa]s? a receber|inadimpl|quem (me )?deve/, alvo: { tipo: "kpi", fonte: "vencido_receber" } },
  { re: /(vencid|atrasad)[oa]s? a pagar|contas atrasadas/, alvo: { tipo: "kpi", fonte: "vencido_pagar" } },
  { re: /a receber/, alvo: { tipo: "kpi", fonte: "a_receber" } },
  { re: /a pagar/, alvo: { tipo: "kpi", fonte: "a_pagar" } },
  { re: /(receita|faturamento|quanto entrou)( do mes)?/, alvo: { tipo: "kpi", fonte: "receita_mes" } },
  { re: /(despesa|gasto|quanto saiu)s?( do mes)?/, alvo: { tipo: "kpi", fonte: "despesa_mes" } },
  { re: /(resultado|lucro)( do mes)?/, alvo: { tipo: "kpi", fonte: "resultado_mes" } },
  { re: /\bburn\b|queima/, alvo: { tipo: "kpi", fonte: "burn" } },
  { re: /runway|folego|quantos meses/, alvo: { tipo: "kpi", fonte: "runway" } },
  { re: /titulos? em aberto|pendentes/, alvo: { tipo: "kpi", fonte: "qtd_pendentes" } },
  { re: /ticket/, alvo: { tipo: "kpi", fonte: "ticket_medio" } },
  { re: /(vence|vencimentos?|lancamentos?) d?a? ?semana|esta semana/, alvo: { tipo: "semana" } },
  { re: /\bsaldo\b|\bcaixa\b/, alvo: { tipo: "kpi", fonte: "saldo" } },
];

/** Indicador conhecido que o painel ainda não tem: dito, nunca trocado por outro. */
const FORA_DO_CATALOGO = /\b(ebitda|margem|dre|cac|ltv|churn|mrr|nps)\b/;

const ADICIONAR = /\b(coloca|coloque|poe|ponha|bota|adiciona|adicione|inclui|inclua|acrescenta|mostra|mostre|quero ver|quero)\b/;
const REMOVER = /\b(tira|tire|remove|remova|apaga|apague|esconde|esconda|exclui|exclua)\b/;
const TOPO = /\b(em cima|no topo|primeiro|na frente|no comeco|no inicio)\b/;
const FIM = /\b(embaixo|em baixo|no fim|no final|por ultimo)\b/;
const SUGERIR = /como estou|sugere|sugira|sugestao|do zero|monta (um|o) painel|painel padrao/;

function alvoDe(trecho: string): Alvo | null {
  const t = sem(trecho);
  return VOCABULARIO.find((v) => v.re.test(t))?.alvo ?? null;
}

const mesmoAlvo = (w: Widget, a: Alvo) =>
  w.tipo === a.tipo && ("fonte" in a ? "fonte" in w && w.fonte === a.fonte : true);

function rotuloDe(a: Alvo): string {
  if (a.tipo === "kpi") return FONTES_METRICA.find((f) => f.id === a.fonte)?.label ?? a.fonte;
  if (a.tipo === "serie") return FONTES_SERIE.find((f) => f.id === a.fonte)?.label ?? a.fonte;
  if (a.tipo === "pizza") return FONTES_CATEGORIA.find((f) => f.id === a.fonte)?.label ?? a.fonte;
  return a.tipo === "saldos" ? "Saldos das contas" : "Lista da semana";
}

function widgetDe(a: Alvo): Widget {
  const id = novoId("w");
  const titulo = rotuloDe(a);
  if (a.tipo === "kpi") return { id, tipo: "kpi", titulo, largura: 1, fonte: a.fonte };
  if (a.tipo === "serie") return { id, tipo: "serie", titulo, largura: 2, fonte: a.fonte, formato: "barras" };
  if (a.tipo === "pizza") return { id, tipo: "pizza", titulo, largura: 1, fonte: a.fonte };
  if (a.tipo === "saldos") return { id, tipo: "saldos", titulo, largura: 1 };
  return { id, tipo: "semana", titulo, largura: 2, direcao: "ambos" };
}

export interface ResultadoPedidoPainel {
  widgets: Widget[];
  /** O que mudou, uma frase por mudança, para a conversa contar. */
  mudancas: string[];
  /** Indicadores pedidos que o painel ainda não tem. */
  naoTenho: string[];
}

/** As fontes que a conversa sabe pôr, para responder "o que dá para pôr?". */
export const O_QUE_DA_PARA_POR: readonly string[] = [
  ...FONTES_METRICA.map((f) => f.label), ...FONTES_SERIE.map((f) => f.label),
  ...FONTES_CATEGORIA.map((f) => f.label), "Saldos das contas", "Lista da semana",
];

/**
 * Aplica o pedido aos widgets de UMA página. Cada trecho ("coloca o saldo em
 * cima", "tira o runway") é lido sozinho; o trecho sem verbo herda o anterior
 * ("coloca o saldo e o a receber").
 */
export function aplicarPedidoPainel(texto: string, atuais: readonly Widget[]): ResultadoPedidoPainel {
  let widgets = [...atuais];
  const mudancas: string[] = [];
  const naoTenho: string[] = [];
  const t = sem(texto);

  if (SUGERIR.test(t)) {
    const novos = sugerirWidgets().filter((n) => !widgets.some((w) => w.tipo === n.tipo && "fonte" in n && "fonte" in w && w.fonte === n.fonte));
    widgets = [...widgets, ...novos];
    if (novos.length) mudancas.push(`Pus o painel básico: ${novos.map((n) => n.titulo).join(", ")}.`);
    return { widgets, mudancas, naoTenho };
  }

  let verbo: "por" | "tirar" | null = null;
  for (const trecho of t.split(/,|;|\s+e\s+|\s+depois\s+/)) {
    if (REMOVER.test(trecho)) verbo = "tirar";
    else if (ADICIONAR.test(trecho) || TOPO.test(trecho) || FIM.test(trecho)) verbo = "por";
    const fora = trecho.match(FORA_DO_CATALOGO);
    if (fora) { naoTenho.push(fora[1].toUpperCase()); continue; }
    const alvo = alvoDe(trecho);
    if (!alvo || !verbo) continue;
    const rotulo = rotuloDe(alvo);
    const i = widgets.findIndex((w) => mesmoAlvo(w, alvo));

    if (verbo === "tirar") {
      if (i >= 0) { widgets.splice(i, 1); mudancas.push(`Tirei ${rotulo}.`); }
      continue;
    }
    const w = i >= 0 ? widgets.splice(i, 1)[0] : widgetDe(alvo);
    if (TOPO.test(trecho)) { widgets.unshift(w); mudancas.push(i >= 0 ? `Levei ${rotulo} para cima.` : `Pus ${rotulo} em cima.`); }
    else if (FIM.test(trecho) || i < 0) { widgets.push(w); mudancas.push(i >= 0 ? `Levei ${rotulo} para o fim.` : `Pus ${rotulo}.`); }
    else widgets.splice(i, 0, w); // já estava e não pediu lugar: fica onde está
  }
  return { widgets, mudancas, naoTenho };
}

/** A resposta da conversa sobre o pedido. */
export function respostaDoPedidoPainel(r: ResultadoPedidoPainel): { abertura: string; mudancas: string[]; fecho: string } {
  const falta = r.naoTenho.length
    ? `${Array.from(new Set(r.naoTenho)).join(" e ")} ainda não ${r.naoTenho.length > 1 ? "estão" : "está"} entre os indicadores do painel. `
    : "";
  if (!r.mudancas.length) {
    return {
      abertura: falta ? falta.trim() : "Não entendi o que mudar no painel.",
      mudancas: [],
      fecho: `Dá para pôr, tirar ou levar para cima: ${O_QUE_DA_PARA_POR.slice(0, 8).join(", ")} e outros.`,
    };
  }
  return { abertura: "Pronto, arrumei o painel.", mudancas: r.mudancas, fecho: `${falta}Salve o painel quando ele estiver do seu jeito.`.trim() };
}
