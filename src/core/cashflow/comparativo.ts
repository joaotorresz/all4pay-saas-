/**
 * Comparativo de período — o motor por trás dos cards "Resultado líquido",
 * "Gastos", "Receitas" e do Sankey "Para onde foi" da página /fluxo-caixa.
 *
 * A ideia central é a MESMA em todos: uma janela RETROATIVA (os últimos N dias)
 * confrontada com a janela IMEDIATAMENTE ANTERIOR de mesmo tamanho. Daí saem o
 * valor-herói, a variação percentual e a linha tracejada de comparação.
 *
 * Puro, tipado e demo-safe: roda idêntico sobre o seed e sobre os dados vivos.
 * Versão `cashflow-comparativo/1.0.0`.
 */
import type { RiskInput, RiskMovement } from "@/core/risk-engine/types";

export const COMPARATIVO_VERSION = "cashflow-comparativo/1.0.0";

export type RegimeComp = "competencia" | "caixa" | "hibrido";
export type VisaoComp = "previsto" | "realizado" | "consolidado";
export type Granularidade = "dia" | "semana" | "mes";

/** Um ponto do gráfico: o bucket atual + o valor do bucket equivalente na janela anterior. */
export interface PontoComparado {
  key: string;            // chave do bucket (ISO do início)
  label: string;          // rótulo do eixo
  valor: number;          // métrica na janela ATUAL
  anterior: number;       // métrica no bucket equivalente da janela ANTERIOR
  porCategoria: Record<string, number>; // composição (usada nas barras empilhadas)
}

/** Uma métrica comparada — o conteúdo de um card. */
export interface SerieComparada {
  total: number;
  totalAnterior: number;
  /** Variação relativa. `null` quando a base anterior é zero (não há % possível). */
  variacao: number | null;
  pontos: PontoComparado[];
}

export interface JanelaISO { de: string; ate: string }

export interface ComparativoFluxo {
  janela: JanelaISO;
  janelaAnterior: JanelaISO;
  granularidade: Granularidade;
  resultado: SerieComparada;
  gastos: SerieComparada;
  receitas: SerieComparada;
  /** Categorias de despesa ordenadas por peso — barras empilhadas + legenda. */
  categorias: string[];
  sankey: SankeyDados;
}

/* ------------------------------ Sankey ------------------------------ */
export interface SankeyNo { name: string; valor: number; nivel: 0 | 1 | 2 | 3 }
export interface SankeyLigacao { source: number; target: number; value: number }
export interface SankeyDados { nodes: SankeyNo[]; links: SankeyLigacao[]; total: number }

/* ---------------------------- utilidades ---------------------------- */
/** Soma dias a uma data ISO sem cair na armadilha de fuso (fatia a string). */
function addDias(iso: string, n: number): string {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  const dt = new Date(a, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

const MES_ABBR = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "2026-07-28" → "28 jul 2026" (pt-BR, sem Date: a string já basta). */
export function rotuloData(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${Number(d)} ${MES_ABBR[Number(m) - 1]} ${a}`;
}

/** Escolhe o tamanho do balde pela largura da janela (a referência usa meses). */
function granularidadeDe(dias: number): Granularidade {
  if (dias <= 14) return "dia";
  if (dias <= 45) return "semana";
  return "mes";
}

/** Chave do balde a que uma data pertence. */
function bucketKey(iso: string, g: Granularidade): string {
  if (g === "mes") return `${iso.slice(0, 7)}-01`;
  if (g === "dia") return iso.slice(0, 10);
  // semana: recua até domingo
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  const dt = new Date(a, m - 1, d);
  dt.setDate(dt.getDate() - dt.getDay());
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function bucketLabel(key: string, g: Granularidade): string {
  const [a, m, d] = key.split("-");
  if (g === "mes") return `${MES_ABBR[Number(m) - 1]} ${a.slice(2)}`;
  return `${Number(d)}/${m}`;
}

/** Lista ordenada das chaves de balde que cobrem [de, ate]. */
function bucketsDaJanela(de: string, ate: string, g: Granularidade): string[] {
  const keys: string[] = [];
  let cur = bucketKey(de, g);
  let guard = 0;
  while (cur <= ate && guard++ < 800) {
    keys.push(cur);
    const passo = g === "dia" ? 1 : g === "semana" ? 7 : 0;
    if (passo) cur = addDias(cur, passo);
    else {
      const [a, m] = cur.split("-").map(Number);
      const dt = new Date(a, m, 1); // primeiro dia do mês seguinte
      cur = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-01`;
    }
  }
  return keys;
}

/** Variação relativa protegida: sem base anterior não existe percentual. */
function variacaoDe(atual: number, anterior: number): number | null {
  if (!anterior) return null;
  return (atual - anterior) / Math.abs(anterior);
}

const CATEGORIA_PADRAO = "Sem categoria";

/* ------------------------------ motor ------------------------------ */
export function compararFluxo(
  input: RiskInput,
  opts: { dias: number; conta?: string; regime?: RegimeComp; visao?: VisaoComp },
): ComparativoFluxo {
  const hoje = input.hoje.slice(0, 10);
  const dias = Math.max(1, opts.dias);
  const regime: RegimeComp = opts.regime ?? "hibrido";
  const visao: VisaoComp = opts.visao ?? "consolidado";
  const g = granularidadeDe(dias);

  // Janela atual (retroativa, terminando hoje) e a anterior de mesmo tamanho.
  const janela: JanelaISO = { de: addDias(hoje, -(dias - 1)), ate: hoje };
  const janelaAnterior: JanelaISO = { de: addDias(janela.de, -dias), ate: addDias(janela.de, -1) };

  // Mesmas regras de regime/visão/conta do resto da página (não divergir).
  const dataRef = (m: RiskMovement) =>
    (regime === "caixa" ? (m.paid_date ?? m.due_date)
      : regime === "competencia" ? m.due_date
        : (m.status === "pago" ? (m.paid_date ?? m.due_date) : m.due_date)).slice(0, 10);
  const passaVisao = (m: RiskMovement) =>
    visao === "previsto" ? m.status === "pendente"
      : visao === "realizado" ? m.status === "pago"
        : m.status !== "cancelado";
  const escopoConta = !!opts.conta && opts.conta !== "todas";

  const elegiveis = input.movements.filter(
    (m) => m.status !== "cancelado" && passaVisao(m) && (!escopoConta || m.accountId === opts.conta),
  );

  const keysAtual = bucketsDaJanela(janela.de, janela.ate, g);
  const keysAnterior = bucketsDaJanela(janelaAnterior.de, janelaAnterior.ate, g);

  // Acumuladores por balde.
  type Acc = { receita: number; despesa: number; cat: Record<string, number> };
  const zero = (): Acc => ({ receita: 0, despesa: 0, cat: {} });
  const atual = new Map<string, Acc>(keysAtual.map((k) => [k, zero()]));
  const anterior = new Map<string, Acc>(keysAnterior.map((k) => [k, zero()]));
  const pesoCat: Record<string, number> = {};

  for (const m of elegiveis) {
    const d = dataRef(m);
    const dentroAtual = d >= janela.de && d <= janela.ate;
    const dentroAnterior = d >= janelaAnterior.de && d <= janelaAnterior.ate;
    if (!dentroAtual && !dentroAnterior) continue;
    const alvo = dentroAtual ? atual : anterior;
    const acc = alvo.get(bucketKey(d, g));
    if (!acc) continue;
    if (m.type === "entrada") acc.receita += m.amount;
    else {
      acc.despesa += m.amount;
      const cat = m.category || CATEGORIA_PADRAO;
      acc.cat[cat] = (acc.cat[cat] ?? 0) + m.amount;
      if (dentroAtual) pesoCat[cat] = (pesoCat[cat] ?? 0) + m.amount;
    }
  }

  // As categorias que aparecem nas barras empilhadas, das maiores para as menores.
  const categorias = Object.entries(pesoCat).sort((a, b) => b[1] - a[1]).map(([c]) => c);

  /** Monta uma métrica comparando balde a balde (posição i ↔ posição i). */
  const montar = (metrica: (a: Acc) => number, comCategorias = false): SerieComparada => {
    const pontos: PontoComparado[] = keysAtual.map((k, i) => {
      const a = atual.get(k) ?? zero();
      const p = anterior.get(keysAnterior[i]) ?? zero();
      return {
        key: k,
        label: bucketLabel(k, g),
        valor: metrica(a),
        anterior: metrica(p),
        porCategoria: comCategorias ? a.cat : {},
      };
    });
    const total = pontos.reduce((s, p) => s + p.valor, 0);
    // O total anterior soma a janela inteira (não só os baldes pareados) —
    // senão um mês a mais na janela anterior sumiria da comparação.
    const totalAnterior = keysAnterior.reduce((s, k) => s + metrica(anterior.get(k) ?? zero()), 0);
    return { total, totalAnterior, variacao: variacaoDe(total, totalAnterior), pontos };
  };

  return {
    janela,
    janelaAnterior,
    granularidade: g,
    resultado: montar((a) => a.receita - a.despesa),
    gastos: montar((a) => a.despesa, true),
    receitas: montar((a) => a.receita),
    categorias,
    sankey: montarSankey(elegiveis, dataRef, janela, input.partyNames ?? {}),
  };
}

/* ------------------------------ Sankey ------------------------------ */
/**
 * "Para onde foi": Receita → Despesas → categoria → contraparte.
 * O primeiro elo carrega o total de despesas (a parcela da receita que virou
 * saída), exatamente como a referência — daí o "100%" no primeiro nó.
 */
function montarSankey(
  movs: RiskMovement[],
  dataRef: (m: RiskMovement) => string,
  janela: JanelaISO,
  partyNames: Record<string, string>,
): SankeyDados {
  const noPeriodo = movs.filter((m) => {
    const d = dataRef(m);
    return d >= janela.de && d <= janela.ate;
  });

  // categoria → contraparte → valor
  const arvore = new Map<string, Map<string, number>>();
  let totalDespesa = 0;
  /**
   * ⚠️ **A RECEITA É MEDIDA, não copiada da despesa.**
   *
   * O nó "Receita" recebia `totalDespesa` — o MESMO número da despesa e do
   * total do widget. Medido na base real: o card exibia R$ 1.307.891,17 de
   * "Receita" quando a receita do período era R$ 523.147,94; os R$ 1.307.891,17
   * eram as SAÍDAS. Três números iguais na tela porque eram a mesma variável.
   *
   * Vinha de uma convenção de Sankey — "o primeiro elo carrega a parcela da
   * receita que virou saída, daí os 100%" — que é defensável como FLUXO e
   * indefensável como RÓTULO: quem lê "Receita R$ 1,3 milhão" entende
   * faturamento, não "quanto da receita virou despesa".
   *
   * Agora a receita sai dos lançamentos de entrada do mesmo recorte, e
   * reconcilia com a Receita Bruta do DRE no mesmo período (conferido: os dois
   * dão R$ 523.147,94 em 365 dias e R$ 37.770,27 em 90).
   */
  let totalReceita = 0;
  for (const m of noPeriodo) {
    if (m.type === "entrada") { totalReceita += m.amount; continue; }
    if (m.type !== "saida") continue;
    totalDespesa += m.amount;
    const cat = m.category || CATEGORIA_PADRAO;
    const parte = (m.party_id && partyNames[m.party_id]) || m.costCenter || cat;
    const sub = arvore.get(cat) ?? new Map<string, number>();
    sub.set(parte, (sub.get(parte) ?? 0) + m.amount);
    arvore.set(cat, sub);
  }

  const nodes: SankeyNo[] = [];
  const links: SankeyLigacao[] = [];
  if (!totalDespesa) return { nodes, links, total: 0 };

  const idxReceita = nodes.push({ name: "Receita", valor: totalReceita, nivel: 0 }) - 1;
  const idxDespesa = nodes.push({ name: "Despesas", valor: totalDespesa, nivel: 1 }) - 1;
  /**
   * ⚠️ **O elo não pode carregar mais do que a fonte tem.** Num Sankey, o que
   * sai de um nó é limitado pelo que entrou nele: mandar R$ 1,3 milhão para
   * fora de uma "Receita" de R$ 523 mil desenha dinheiro que não existiu.
   *
   * Quando a despesa supera a receita — que é o caso de toda empresa que queima
   * caixa, ou seja, exatamente quando alguém abre esta tela — a diferença tem
   * uma origem, e ela é o CAIXA. Nomeá-la é o que torna o desenho honesto: o
   * gráfico passa a mostrar que parte do gasto NÃO foi paga pelo faturamento
   * do período.
   */
  links.push({ source: idxReceita, target: idxDespesa, value: Math.min(totalReceita, totalDespesa) });
  if (totalDespesa > totalReceita) {
    const idxCaixa = nodes.push({
      name: "Caixa (déficit do período)", valor: totalDespesa - totalReceita, nivel: 0,
    }) - 1;
    links.push({ source: idxCaixa, target: idxDespesa, value: totalDespesa - totalReceita });
  }

  // Categorias das maiores para as menores; no máximo 8 (o resto vira "Outras").
  const cats = Array.from(arvore.entries())
    .map(([cat, sub]) => ({ cat, sub, total: Array.from(sub.values()).reduce((s, v) => s + v, 0) }))
    .sort((a, b) => b.total - a.total);
  const principais = cats.slice(0, 8);
  const resto = cats.slice(8);
  const folhas = new Map<string, number>(); // contraparte → índice do nó (dedup)

  for (const { cat, sub, total } of principais) {
    const idxCat = nodes.push({ name: cat, valor: total, nivel: 2 }) - 1;
    links.push({ source: idxDespesa, target: idxCat, value: total });
    // Só abre o 3º nível quando há mais de uma contraparte (senão duplicaria o nó).
    const partes = Array.from(sub.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4);
    if (partes.length > 1) {
      for (const [nome, valor] of partes) {
        // A MESMA contraparte pode aparecer em várias categorias; reusa o nó
        // (senão o gráfico repete "Folha de Pagamento" três vezes).
        let idxSub = folhas.get(nome);
        if (idxSub === undefined) {
          idxSub = nodes.push({ name: nome, valor: 0, nivel: 3 }) - 1;
          folhas.set(nome, idxSub);
        }
        nodes[idxSub].valor += valor;
        links.push({ source: idxCat, target: idxSub, value: valor });
      }
    }
  }
  if (resto.length) {
    const total = resto.reduce((s, r) => s + r.total, 0);
    const idx = nodes.push({ name: "Outras", valor: total, nivel: 2 }) - 1;
    links.push({ source: idxDespesa, target: idx, value: total });
  }

  return { nodes, links, total: totalDespesa };
}
