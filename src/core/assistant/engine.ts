/**
 * Motor de resposta NATIVO do assistente (Quattro IA) — responde perguntas em
 * linguagem natural calculando os números REAIS dos dados do cliente
 * (movements, contas, clientes) na hora, sem depender de chave de LLM. É o que
 * faz a IA "funcionar de verdade" mesmo offline: entende intenção (quanto/quem/
 * quando/quais) e devolve resposta + números + fontes (explainability).
 *
 * Cobre: saldo, gastos/receita/resultado do período, maiores gastos por
 * categoria, a receber/a pagar, vencimentos, inadimplência, maior cliente,
 * comparação mês a mês, ticket médio, contagem de vendas, runway/burn/score.
 * Perguntas consultivas/abertas (contratação, investir, expansão) NÃO casam
 * aqui (retorna null) e sobem para o Claude / motor consultivo.
 *
 * Determinístico, puro, demo/live idêntico (roda sobre o RiskInput).
 */
import type { RiskInput, RiskMovement } from "@/core/risk-engine/types";
import { classificarDespesa } from "@/core/indicadores/classificacao";
import type { ExecutiveContext, RespostaCopiloto } from "@/core/executive/types";
import { simularFinanciamento, antecipar, equivalenteAnual, equivalenteMensal } from "@/core/financing";
import { simularAquisicao, situacaoDe, presetPor, VEREDITO_LABEL, RESERVA_IDEAL, type TipoDecisao } from "@/core/aquisicao";
import { precoPorMargem, precoPorMarkup, analisarPreco, pontoEquilibrioUnidades, precoComImpostos } from "@/core/pricing";
import { valorFuturo, payback, tempoParaMeta } from "@/core/investment";
import { provisaoTrabalhista } from "@/core/payroll";
import { calcularSimplesNacional, type AnexoSimples } from "@/core/tax";
import { calcularMora } from "@/core/late-fee";
import { comVoz, textoDeOrigem } from "@/core/glossario";
// ⚠️ A cascata do DRE é a ÚNICA fonte de linha de resultado no produto. A IA
// entra aqui como consumidora, não como uma segunda implementação — ver o
// bloco do EBITDA e `scripts/contrato-resultado.mts`.
import { cascataDRE, type CascataDRE, type LinhaCascata } from "@/core/relatorios/cascata";
// ⚠️ Runway, burn e a ausência deles vêm da camada CANÔNICA — a mesma que o
// Fluxo de caixa e o DRE mostram. A IA lia o `ctx.runwayMeses` do quant, que
// copiava só o `.valor` do canônico: "runway de 0 meses" para uma empresa com
// R$ 2,2 milhões que gera caixa, ao lado de uma tela dizendo "não há queima".
import { runway as runwayCanonico, burn as burnCanonico, geracaoCaixaMensal, formaCurta, JANELA_RITMO_DIAS, foraDaBaseTributavel } from "@/core/indicadores";
import { ehTransferenciaEntreContas } from "@/core/indicadores/convencoes";
import { fraseRunway, classificar } from "@/core/quant/score";
import type { ClassificacaoSaude } from "@/core/quant/types";
import { avisoDeSaturacao } from "@/core/metodologia";
// A semana é SEGUNDA a DOMINGO, a mesma dos painéis de contas a pagar e a
// receber. A IA usava domingo a sábado: "o que vence esta semana?" deixava de
// fora o título do domingo que a tela "Essa semana" mostrava.
import { periodoSemana } from "@/core/contas-pagar";
// "A receber" é CONTA a receber — a mesma regra do painel de Contas a receber.
// Transferência entre contas próprias, resgate, empréstimo e rendimento entram
// no extrato como ENTRADA e não são algo que alguém deve à empresa: a IA os
// somava ao "a receber" e à lista de devedores, e a tela não.
import { ehContaAReceber } from "@/core/contas-receber";

import { deLancamentos as L, sobreLancamentos as B, naTela as T, simulado, completarPorRotulo, type NumeroResposta } from "@/core/assistant/numero";

import { formatBRL, decimalBR, pct as pctBR } from "@/lib/format";
const fmt = (v: number) => formatBRL(v);
const pad = (n: number) => String(n).padStart(2, "0");
const MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const dia = (ds: string) => ds.slice(0, 10).split("-").reverse().join("/");
/** Dias corridos de a → b (positivo = b depois de a). */
const diasEntre = (a: string, b: string) => Math.round((new Date(b.slice(0, 10) + "T00:00:00").getTime() - new Date(a.slice(0, 10) + "T00:00:00").getTime()) / 86400000);

interface Janela { label: string; from: string; to: string }

function janela(p: string, hojeISO: string): Janela {
  const hoje = new Date(hojeISO + "T00:00:00");
  const y = hoje.getFullYear(), m = hoje.getMonth(), d = hoje.getDate();
  const iso = (dt: Date) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  if (/\bhoje\b/.test(p)) return { label: "hoje", from: hojeISO, to: hojeISO };
  if (/ontem/.test(p)) { const o = new Date(y, m, d - 1); return { label: "ontem", from: iso(o), to: iso(o) }; }
  if (/amanh[ãa]/.test(p)) { const o = new Date(y, m, d + 1); return { label: "amanhã", from: iso(o), to: iso(o) }; }
  const ult = p.match(/[úu]ltim[oa]s?\s+(\d+)\s+dias/);
  if (ult) { const n = +ult[1]; const a = new Date(y, m, d - n + 1); return { label: `nos últimos ${n} dias`, from: iso(a), to: hojeISO }; }
  if (/semana/.test(p)) { const sem = periodoSemana(hojeISO); return { label: "nesta semana", from: sem.de, to: sem.ate }; }
  if (/m[êe]s passad|m[êe]s anterior|[úu]ltimo m[êe]s/.test(p)) { const f = new Date(y, m - 1, 1); const t = new Date(y, m, 0); return { label: `em ${MES[f.getMonth()]}`, from: iso(f), to: iso(t) }; }
  if (/\bano\b|anual|no ano|do ano|12 meses/.test(p)) return { label: `em ${y}`, from: `${y}-01-01`, to: `${y}-12-31` };
  // "últimos N meses" = janela ROLANTE (N meses até hoje), não trimestre/semestre
  // calendário (que seria quase todo futuro no começo do trimestre).
  const ultMes = p.match(/[úu]ltim[oa]s?\s+(\d+)\s+m(?:es|eses)\b/);
  if (ultMes) { const n = +ultMes[1]; const a = new Date(y, m - n + 1, 1); return { label: `nos últimos ${n} meses`, from: iso(a), to: hojeISO }; }
  // trimestre/semestre = janela TRAILING (últimos 3/6 meses até hoje). O trimestre
  // CALENDÁRIO seria quase todo futuro no começo do período (ex.: em julho, Q3 =
  // jul–set → só julho tem dado), devolvendo um número enganosamente pequeno para
  // "como foi meu trimestre/semestre" (pergunta retrospectiva).
  if (/trimestre|\b3 meses\b/.test(p)) { return { label: "no trimestre", from: iso(new Date(y, m - 2, 1)), to: hojeISO }; }
  if (/semestre|[úu]ltimos?\s+6\s+meses|\b6 meses\b/.test(p)) { return { label: "no semestre", from: iso(new Date(y, m - 5, 1)), to: hojeISO }; }
  // mês NOMEADO ("em março", "de janeiro") — limite de palavra p/ maio≠maior.
  if (!/m[êe]s passad|m[êe]s anterior/.test(p)) {
    const mi = MES.findIndex((nm) => new RegExp(`(^|[^a-zà-ú])${nm}([^a-zà-ú]|$)`, "i").test(p));
    if (mi >= 0) {
      const yy = mi > m ? y - 1 : y; // mês no futuro → ano passado
      const f = new Date(yy, mi, 1), t = new Date(yy, mi + 1, 0);
      return { label: `em ${MES[mi]}${yy !== y ? `/${yy}` : ""}`, from: iso(f), to: iso(t) };
    }
  }
  const f = new Date(y, m, 1); const t = new Date(y, m + 1, 0); return { label: `em ${MES[m]}`, from: iso(f), to: iso(t) };
}

/**
 * "em média 2 dias antes do vencimento" / "no dia do vencimento".
 * ⚠️ Com média ZERO a frase montada saía "0 dia(s) no do vencimento" — português
 * quebrado exatamente na resposta boa ("pagam em dia").
 */
const emMediaAoVencimento = (dias: number): string =>
  dias < 0 ? `em média ${Math.abs(dias)} dia(s) antes do vencimento` : "em média no dia do vencimento";

const within = (ds: string | null | undefined, w: Janela) => !!ds && ds.slice(0, 10) >= w.from && ds.slice(0, 10) <= w.to;
const cashDate = (m: RiskMovement) => (m.paid_date || m.due_date || "").slice(0, 10);
const ativos = (ms: RiskMovement[]) => ms.filter((m) => m.status !== "cancelado");
/** Os lançamentos PAGOS de um tipo na janela, pela data de caixa. */
const pagosNa = (ms: RiskMovement[], tipo: "entrada" | "saida", w: Janela) =>
  ms.filter((m) => m.type === tipo && m.status === "pago" && within(cashDate(m), w));
const somaAbs = (ms: readonly RiskMovement[]) => ms.reduce((s, m) => s + Math.abs(m.amount), 0);
const IMPOSTO_RE = /imposto|tribut|\bdas\b|irpj|csll|\biss\b|icms|\bpis\b|cofins|simples nacional/;

/*
 * ⚠️ RECEITA não é "toda entrada", e GASTO não é "toda saída" (revisão de
 * 01/10/2026). A IA respondia "quanto faturei?" somando empréstimo, resgate,
 * rendimento e transferência entre contas próprias — "Principal origem:
 * Empréstimo bancário" — e "quanto gastei?" com a perna de saída da
 * transferência. As telas (DRE, base do imposto, Contas a receber) já separam:
 * a regra é a mesma `foraDaBaseTributavel` / `ehTransferenciaEntreContas`.
 * O que fica de fora não some: a resposta o DIZ, separado, porque entrou ou
 * saiu do caixa de verdade.
 */
const ehReceitaDeVenda = (m: RiskMovement) => m.type === "entrada" && !foraDaBaseTributavel(m.category);
const ehGastoReal = (m: RiskMovement) => m.type === "saida" && !ehTransferenciaEntreContas(m.category);
/** "Fora da receita, entraram também R$ X (empréstimo, transferência…)". */
function foraDaReceita(ms: RiskMovement[]): string {
  if (!ms.length) return "";
  const tot = ms.reduce((s, m) => s + Math.abs(m.amount), 0);
  const cats = Array.from(new Set(ms.map((m) => (m.category || "sem categoria").trim()))).slice(0, 3).join(", ");
  return ` Fora da receita, entraram também ${formatBRL(tot)} que não são faturamento (${cats}).`;
}

/**
 * Agrupa e soma — e GUARDA os lançamentos de cada grupo (Rodada 9): o número
 * "Marketing R$ 12.400" que a IA cita abre exatamente as linhas que o somam.
 */
function agrupar(ms: RiskMovement[], chave: (m: RiskMovement) => string) {
  const map = new Map<string, { valor: number; movs: RiskMovement[] }>();
  for (const m of ms) {
    const k = chave(m);
    const g = map.get(k) ?? map.set(k, { valor: 0, movs: [] }).get(k)!;
    g.valor += Math.abs(m.amount); g.movs.push(m);
  }
  return Array.from(map.entries());
}
function topCategorias(ms: RiskMovement[], n = 5) {
  return agrupar(ms, (m) => (m.category || "Outros").trim() || "Outros")
    .map(([nome, g]) => ({ nome: cap(nome), ...g })).sort((a, b) => b.valor - a.valor).slice(0, n);
}
function topClientes(ms: RiskMovement[], nomes: Record<string, string> | undefined, n = 5) {
  return agrupar(ms, (m) => m.party_id || "—")
    .map(([id, g]) => ({ nome: (nomes?.[id]) || (id === "—" ? "Sem cliente" : "Cliente"), ...g })).sort((a, b) => b.valor - a.valor).slice(0, n);
}
/**
 * Série mensal dos últimos `n` meses (do mais antigo ao atual), em ordem
 * cronológica — é o que um gráfico de linha precisa. `metrica` escolhe entre
 * receita, despesa e resultado; só entram lançamentos PAGOS (visão de caixa).
 */
function serieMensal(ms: RiskMovement[], hojeISO: string, n: number, metrica: "receita" | "despesa" | "resultado") {
  const base = new Date(hojeISO + "T00:00:00");
  const chaves: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    chaves.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
  }
  const acc = new Map<string, { rec: number; desp: number }>(chaves.map((k) => [k, { rec: 0, desp: 0 }]));
  for (const m of ms) {
    if (m.status !== "pago") continue;
    const k = cashDate(m).slice(0, 7);
    const cur = acc.get(k);
    if (!cur) continue;
    if (m.type === "entrada") cur.rec += Math.abs(m.amount); else cur.desp += Math.abs(m.amount);
  }
  return chaves.map((k) => {
    const v = acc.get(k)!;
    const [, mm] = k.split("-");
    return {
      nome: MES[Number(mm) - 1].slice(0, 3),
      valor: metrica === "receita" ? v.rec : metrica === "despesa" ? v.desp : v.rec - v.desp,
    };
  });
}

/** party_id da contraparte de maior volume (|valor|) numa lista — ignora nulos. */
function topId(ms: RiskMovement[]): string | undefined {
  const map = new Map<string, number>();
  for (const m of ms) { if (!m.party_id) continue; map.set(m.party_id, (map.get(m.party_id) || 0) + Math.abs(m.amount)); }
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
}
/**
 * Série opcional que acompanha uma resposta — quando a pergunta é sobre uma
 * DISTRIBUIÇÃO (por categoria, por contraparte) ou uma EVOLUÇÃO (mês a mês),
 * o número sozinho conta metade da história. Puro dado: quem desenha é o chat.
 * `tom` escolhe a cor semântica (entrada/saída/neutro) sem o motor conhecer CSS.
 */
export interface GraficoResposta {
  tipo: "barras" | "linha";
  titulo: string;
  tom: "entrada" | "saida" | "neutro";
  dados: { nome: string; valor: number }[];
}

/** Resposta do motor nativo — `RespostaCopiloto` + os extras da camada local. */
export type RespostaLocal = Omit<RespostaCopiloto, "numeros"> & {
  numeros: NumeroResposta[];
  contatoId?: string;
  grafico?: GraficoResposta;
};

const R = (
  resposta: string,
  numeros: NumeroResposta[],
  fontes: string[],
  confianca = 0.9,
  grafico?: GraficoResposta,
): RespostaLocal => ({ resposta, numeros, fontes, confianca, ...(grafico ? { grafico } : {}) });

/**
 * Resposta de CALCULADORA: todo número nasceu da pergunta (parcela, markup,
 * DAS), então nenhum vira link — a bolha os marca como simulação.
 */
const S = (...a: Parameters<typeof R>): RespostaLocal => {
  const r = R(...a);
  return { ...r, numeros: r.numeros.map((n) => simulado(n.label, n.valor)) };
};

/** Série de barras a partir de um `{nome, valor}[]` já ordenado. */
const barras = (titulo: string, tom: GraficoResposta["tom"], dados: { nome: string; valor: number }[], n = 5): GraficoResposta | undefined =>
  dados.length >= 2 ? { tipo: "barras", titulo, tom, dados: dados.slice(0, n).map(({ nome, valor }) => ({ nome, valor })) } : undefined;

/* ── O DRE, lido da cascata (a mesma função que desenha o relatório) ─────── */

/** As linhas que SOMAM lançamentos até o EBITDA — as "=" saem de fórmula. */
const LINHAS_ATE_EBITDA: readonly LinhaCascata[] = [
  "receita_bruta", "deducoes", "custos_variaveis", "despesas_variaveis", "despesas_operacionais",
];
/** …e até o resultado líquido. */
const LINHAS_DO_RESULTADO: readonly LinhaCascata[] = [
  ...LINHAS_ATE_EBITDA, "depreciacao_amortizacao", "resultado_financeiro", "impostos_lucro", "nao_operacional",
];

/**
 * A frase de origem de um número do DRE ("Período · regime · N lançamentos").
 *
 * ⚠️ O número de lançamentos é a UNIÃO dos que formaram as linhas de soma. A
 * procedência de uma linha "=" (EBITDA, resultado) vem VAZIA — ela sai de
 * fórmula, nenhum lançamento pertence a ela —, e a IA escrevia "0 lançamentos"
 * embaixo de um EBITDA de R$ 391 mil. Frase de origem que diz zero sobre um
 * número que tem base é a origem mentindo.
 */
function origemDaCascata(c: CascataDRE, w: Janela, linhas: readonly LinhaCascata[]): string {
  const ids = new Set<string>();
  for (const l of linhas) for (const id of c.linhas[l].procedencia.movimentos ?? []) ids.add(id);
  const base = c.linhas.resultado_liquido.procedencia;
  return textoDeOrigem({ ...base, lancamentos: ids.size, janela: { ...base.janela, label: w.label } });
}

/** A cascata do DRE sobre a janela da pergunta, por competência (o padrão do relatório). */
const dreDaJanela = (input: RiskInput, w: Janela): CascataDRE =>
  cascataDRE(input, { intervalo: { de: w.from, ate: w.to }, regime: "competencia" });

/* ── Runway e burn: a leitura da TELA (camada canônica, janela de 90 dias) ── */

/**
 * O runway e o burn que o Fluxo de caixa e o DRE mostram — com a AUSÊNCIA
 * dita. `meses` é `null` quando o canônico é indisponível; a pílula de número
 * usa a mesma forma curta do `ValorIndicador` ("— não há queima").
 */
function leituraRitmo(input: RiskInput) {
  const r = runwayCanonico(input);
  const b = burnCanonico(input);
  const meses = r.indisponivel ? null : Math.round((r.valor / 30) * 10) / 10;
  const chip = meses !== null ? `${decimalBR(meses)} m` : `— ${formaCurta(r.indisponivel!)}`;
  return { r, b, meses, dias: r.indisponivel ? null : r.valor, codigo: r.indisponivel?.codigo, chip };
}

/** A pílula do runway do contexto (o mesmo rótulo da Quant e da Decisão). */
const rotuloRunwayCtx = (c: Pick<ExecutiveContext, "runwayMeses" | "runwayMotivo">): string =>
  c.runwayMeses !== null ? `${decimalBR(c.runwayMeses)} m` : `— ${c.runwayMotivo ? formaCurta(c.runwayMotivo) : "sem base de cálculo"}`;

/** A classificação do score na frase — a MESMA faixa da tela Quant (`classificar`). */
const SAUDE_NA_FRASE: Record<ClassificacaoSaude, string> = {
  excelente: "excelente", saudavel: "saudável", atencao: "em atenção", risco: "em risco elevado", critico: "crítica",
};

/**
 * A resposta do motor com a ORIGEM de cada número resolvida (Rodada 9).
 *
 * Quem calcula diz de onde o número sai (`L` soma lançamentos, `T` aponta a
 * tela, `S` marca a calculadora). O que sobrar sem origem passa pelo mapa de
 * rótulos FIXOS da Rodada 5 — e o que nem ele conhece fica sem link, que é
 * melhor que um link para a tela errada. A guarda `ia-origem` cobra que, no
 * corpus inteiro, nenhum número fique nessa terceira situação.
 */
export function responderLocal(pergunta: string, input: RiskInput, ctx?: ExecutiveContext): RespostaLocal | null {
  const r = responderBruto(pergunta, input, ctx);
  if (!r) return null;
  return { ...r, numeros: completarPorRotulo(r.numeros) };
}

function responderBruto(pergunta: string, input: RiskInput, ctx?: ExecutiveContext): RespostaLocal | null {
  const p = pergunta.toLowerCase();
  const hoje = input.hoje;
  const movs = ativos(input.movements);
  const nomes = input.partyNames;

  // ——— TOTAL EM ATRASO (ambos os lados) — só em frasear "total vencido/atraso" ———
  // Fica ANTES de a-receber/a-pagar/inadimplência para não roubar "quem deve".
  if (/total\s+(vencid|em atraso|atrasad|de vencid)|em atraso no total|atrasad[oa]s? no total|quanto (est[áa]|t[êe]m|tem).*atrasad.*total|total.*(vencid|em atraso)/.test(p)) {
    const vencidos = movs.filter((m) => m.status === "pendente" && m.due_date.slice(0, 10) < hoje);
    const rec = vencidos.filter((m) => m.type === "entrada");
    const pag = vencidos.filter((m) => m.type === "saida");
    const totRec = rec.reduce((s, m) => s + Math.abs(m.amount), 0);
    const totPag = pag.reduce((s, m) => s + Math.abs(m.amount), 0);
    const geral = totRec + totPag;
    if (vencidos.length === 0) return R("Nada está vencido no momento — não há títulos em atraso a receber nem a pagar.", [T("Total em atraso", fmt(0), "vencidos")], ["títulos vencidos"]);
    return R(
      `Há ${fmt(geral)} vencidos em ${vencidos.length} título(s): ${fmt(totRec)} a receber (${rec.length}) e ${fmt(totPag)} a pagar (${pag.length}).`,
      [L("A receber vencido", fmt(totRec), rec, "vencidos"), L("A pagar vencido", fmt(totPag), pag, "pagar"), L("Total em atraso", fmt(geral), vencidos, "vencidos")],
      ["recebíveis vencidos", "contas a pagar vencidas"]);
  }

  // ——— TOTAL ACUMULADO (todo o histórico realizado) ———
  if (/total (geral )?(que )?(j[áa] )?(entrou|saiu|recebi|paguei|movimentei|movimentou|entrei)|(movimentei|movimentou) (no total|ao todo|na vida|at[ée] agora)|total geral (de )?(entrada|sa[íi]da|movim)|total (de )?(entrada|sa[íi]da) (acumulad|no total|de tudo)/.test(p)) {
    const lEnt = movs.filter((m) => m.type === "entrada" && m.status === "pago");
    const lSai = movs.filter((m) => m.type === "saida" && m.status === "pago");
    const ent = lEnt.reduce((s, m) => s + Math.abs(m.amount), 0);
    const sai = lSai.reduce((s, m) => s + Math.abs(m.amount), 0);
    const soEnt = /entrou|recebi|entrada|entrei/.test(p) && !/saiu|paguei|sa[íi]da|movim/.test(p);
    const soSai = /saiu|paguei|sa[íi]da/.test(p) && !/entrou|recebi|movim/.test(p);
    if (soEnt) return R(`No total você já recebeu ${fmt(ent)} (todo o histórico realizado).`, [L("Total recebido", fmt(ent), lEnt, "extrato")], ["histórico realizado"]);
    if (soSai) return R(`No total você já pagou ${fmt(sai)} (todo o histórico realizado).`, [L("Total pago", fmt(sai), lSai, "extrato")], ["histórico realizado"]);
    return R(`No total você movimentou ${fmt(ent + sai)}: ${fmt(ent)} de entradas e ${fmt(sai)} de saídas (histórico realizado).`, [L("Entradas", fmt(ent), lEnt, "extrato"), L("Saídas", fmt(sai), lSai, "extrato"), L("Total", fmt(ent + sai), [...lEnt, ...lSai], "extrato")], ["histórico realizado"]);
  }

  // ——— VOU RECEBER / PAGAR no MÊS QUE VEM (janela FUTURA, pendentes) ———
  // Antes da receita-realizada: "vou receber mês que vem" é PREVISTO (pendente
  // com vencimento no mês seguinte), não o realizado do mês corrente.
  if (/(vou|irei|tenho (a|pra|para)|quanto (vou|tenho a)).*(receber|pagar|gastar).*(m[êe]s que vem|pr[óo]ximo m[êe]s|semana que vem|pr[óo]xima semana)|(m[êe]s que vem|pr[óo]ximo m[êe]s|semana que vem|pr[óo]xima semana).*(vou |irei )?(receber|pagar|gastar|receb\b|pag\b|gast\b)/.test(p)) {
    const base = new Date(hoje + "T00:00:00");
    const ehSemana = /semana que vem|pr[óo]xima semana/.test(p);
    let from: string, to: string, rotulo: string;
    if (ehSemana) {
      const diasAteSeg = ((8 - base.getDay()) % 7) || 7; // próxima segunda-feira
      const seg = new Date(base); seg.setDate(base.getDate() + diasAteSeg);
      const dom = new Date(seg); dom.setDate(seg.getDate() + 6);
      from = `${seg.getFullYear()}-${pad(seg.getMonth() + 1)}-${pad(seg.getDate())}`;
      to = `${dom.getFullYear()}-${pad(dom.getMonth() + 1)}-${pad(dom.getDate())}`;
      rotulo = "na semana que vem";
    } else {
      const nmEnd = new Date(base.getFullYear(), base.getMonth() + 2, 0); // último dia do mês seguinte
      from = `${nmEnd.getFullYear()}-${pad(nmEnd.getMonth() + 1)}-01`;
      to = `${nmEnd.getFullYear()}-${pad(nmEnd.getMonth() + 1)}-${pad(nmEnd.getDate())}`;
      rotulo = "no mês que vem";
    }
    const tipo: "entrada" | "saida" = /pagar|\bpag\b|pagament|gast/.test(p) ? "saida" : "entrada";
    const ab = movs.filter((m) => m.type === tipo && m.status === "pendente" && m.due_date >= from && m.due_date <= to);
    const total = ab.reduce((s, m) => s + Math.abs(m.amount), 0);
    const verbo = tipo === "entrada" ? "receber" : "pagar";
    if (!ab.length) return R(`Nada previsto para ${verbo} ${rotulo} (sem títulos pendentes nesse intervalo).`, [T("Previsto", fmt(0), tipo === "entrada" ? "receber" : "pagar")], ["previsto futuro"]);
    return R(`${rotulo.charAt(0).toUpperCase() + rotulo.slice(1)} você tem ${fmt(total)} a ${verbo} em ${ab.length} título(s).`, [L(`A ${verbo}`, fmt(total), ab, tipo === "entrada" ? "receber" : "pagar"), B("Títulos", String(ab.length), ab, tipo === "entrada" ? "receber" : "pagar")], ["previsto futuro"]);
  }

  // ——— POSSO COMPRAR? (decisão de aquisição sobre o MEU caixa) ———
  // Vem ANTES do simulador de financiamento: "posso comprar um carro de 150
  // mil em 48x" não é uma conta de parcela — é "isso cabe no meu caixa?".
  // A diferença está no enquadramento ("posso/consigo/vale a pena"), então a
  // regex exige o verbo de decisão; "financiamento de 150 mil em 48x" (conta
  // pura) continua caindo no simulador de financiamento logo abaixo.
  if (/\b(posso|consigo|d[áa] (pra|para)|tenho como|vale a pena|compensa)\s+(comprar|adquirir|financiar|trocar|pegar|investir)|cabe no (meu )?(caixa|bolso|or[çc]amento)/.test(p)) {
    const mMil = p.match(/r?\$?\s*(\d[\d.]*(?:,\d+)?)\s*(milh\w*|mil|k|\bmi\b)/i);
    const mRaw = p.match(/r\$\s*(\d[\d.]*(?:,\d+)?)/i);
    let valor = 0;
    if (mMil) { const b = parseFloat(mMil[1].replace(/\./g, "").replace(",", ".")); valor = b * (/milh|^mi$/i.test(mMil[2]) ? 1e6 : 1e3); }
    else if (mRaw) valor = parseFloat(mRaw[1].replace(/\./g, "").replace(",", "."));

    if (valor > 0) {
      // O tipo do bem vem da própria frase — e traz junto o custo de POSSE
      // típico (um carro não custa só a parcela: IPVA, seguro, combustível).
      const tipo: TipoDecisao =
        /carro|ve[íi]culo|moto|caminh|autom[óo]vel/.test(p) ? "veiculo"
        : /im[óo]vel|casa|apartament|terreno|sala comercial/.test(p) ? "imovel"
        : /m[áa]quina|equipament|maquin[áa]rio/.test(p) ? "equipamento"
        : /reforma|obra/.test(p) ? "reforma"
        : /viagem|viajar/.test(p) ? "viagem"
        : /estoque|mercadoria/.test(p) ? "estoque"
        : /unidade|filial|ponto|loja/.test(p) ? "unidade"
        : "outro";
      const pre = presetPor(tipo);
      const mParc = p.match(/(\d{1,3})\s*(x|vezes|parcelas)\b/i);
      const parcelas = mParc ? Math.max(1, parseInt(mParc[1], 10)) : pre.parcelasPadrao;
      const mTaxa = p.match(/(\d[\d.]*(?:,\d+)?)\s*%/);
      const taxa = mTaxa ? parseFloat(mTaxa[1].replace(",", ".")) / 100 : pre.taxaMensalPadrao;
      const mEnt = p.match(/(\d[\d.]*(?:,\d+)?)\s*(mil|k)?\s*de entrada/i);
      const entrada = mEnt
        ? parseFloat(mEnt[1].replace(/\./g, "").replace(",", ".")) * (mEnt[2] ? 1e3 : 1)
        : Math.round(valor * pre.entradaPct);

      const sit = situacaoDe(input);
      const r = simularAquisicao(sit, {
        tipo, valor, entrada, parcelas, taxaMensal: taxa,
        custoMensalExtra: Math.round((valor * pre.custoAnualPct) / 12),
      });

      const alt = r.alternativas.find((a) => a.veredito === "confortavel" || a.veredito === "aperta");
      const extra = r.veredito === "confortavel"
        ? ""
        : alt ? ` Alternativa: ${alt.titulo.toLowerCase()} — parcela ${fmt(alt.parcela)}.`
        : "";
      // O `resumo` do motor já abre com o veredito ("Cabe no seu caixa…"),
      // então NÃO repetir o rótulo aqui.
      const posse = pre.custoAnualPct > 0
        ? ` Já incluí ~${fmt(Math.round((valor * pre.custoAnualPct) / 12))}/mês de custo de manter.`
        : "";

      return S(
        `${r.resumo}${posse}${extra} Abra Orçamento → "Posso comprar?" para simular outras condições.`,
        [
          { label: "Parcela", valor: `${fmt(r.parcela)}/mês${parcelas > 0 ? ` × ${parcelas}` : ""}` },
          { label: "Peso no seu mês", valor: fmt(r.pesoMensal) },
          { label: "Sobra depois", valor: `${fmt(r.sobraDepois)}/mês` },
          { label: "Comprometimento da renda", valor: `${Math.round(r.comprometimentoRenda * 100)}%` },
          ...(r.mesAperto !== null ? [{ label: "Caixa fica negativo", valor: `no mês ${r.mesAperto}` }] : []),
        ],
        ["simulador de decisão (seu caixa, entradas e saídas reais)"],
      );
    }
  }

  // ——— SIMULAR EMPRÉSTIMO / FINANCIAMENTO / PARCELAMENTO ———
  // Antes de afordabilidade/gasto: "empréstimo de X em Nx a T%" é uma simulação.
  if (/empr[ée]stimo|financiament|financiar|parcel(ar|amento)|simul\w*.*(empr|financ|parcel)|quanto (fica|fica a|[ée] a|seria a|vai a) parcela|parcela de .{0,30}\d+\s*(x\b|vezes|parcelas)/.test(p)) {
    const pmMil = p.match(/r?\$?\s*(\d[\d.]*(?:,\d+)?)\s*(milh\w*|mil|k|\bmi\b)/i);
    const pmRaw = p.match(/r\$\s*(\d[\d.]*(?:,\d+)?)/i);
    let principal = 0;
    if (pmMil) { const base = parseFloat(pmMil[1].replace(/\./g, "").replace(",", ".")); principal = base * (/milh|^mi$/i.test(pmMil[2]) ? 1e6 : 1e3); }
    else if (pmRaw) principal = parseFloat(pmRaw[1].replace(/\./g, "").replace(",", "."));
    if (principal > 0) {
      const pn = p.match(/(\d{1,3})\s*(x|vezes|parcelas|meses|vés)\b/i);
      const parcelas = pn ? Math.max(1, parseInt(pn[1], 10)) : 12;
      const pt = p.match(/(\d[\d.]*(?:,\d+)?)\s*%/);
      const taxa = pt ? parseFloat(pt[1].replace(",", ".")) / 100 : 0;
      const r = simularFinanciamento(principal, taxa, parcelas, "price");
      if (taxa === 0) {
        return S(
          `Um parcelamento de ${fmt(principal)} em ${parcelas}x SEM juros fica em ${fmt(r.parcela)}/mês. Me diga a taxa mensal (ex.: "a 2% ao mês") para eu calcular o custo real com juros.`,
          [{ label: "Parcela (sem juros)", valor: `${fmt(r.parcela)}/mês` }, { label: "Parcelas", valor: `${parcelas}x` }], ["simulador de financiamento"]);
      }
      return S(
        `Empréstimo de ${fmt(principal)} em ${parcelas}x a ${Math.round(taxa * 10000) / 100}% ao mês (tabela Price): parcela fixa de ${fmt(r.parcela)}, total pago ${fmt(r.totalPago)} — ${fmt(r.jurosTotal)} de juros (${r.custoEfetivoPct}% sobre o valor emprestado).`,
        [{ label: "Parcela", valor: `${fmt(r.parcela)}/mês` }, { label: "Total pago", valor: fmt(r.totalPago) }, { label: "Juros total", valor: fmt(r.jurosTotal) }], ["simulador de financiamento"]);
    }
  }

  // ——— DESCONTO / ACRÉSCIMO sobre um valor ———
  // Específico (exige "desconto"/"acréscimo"/"a mais/menos") p/ não colidir.
  // Exclui frases de CRESCIMENTO/comparação ("faturei X, 20% a mais que junho") —
  // essas vão ao motor de crescimento, não à calculadora de desconto.
  if (/\d\s*%\s*(de\s*)?(desconto|off|acr[ée]scim|a mais|a menos)|(desconto|acr[ée]scim) de \d|com \d+\s*%\s*(de\s*)?(desconto|off)|(\d[\d.,]* )?(mais|menos)\s+\d+\s*%|\d+\s*%\s+(a\s+)?(mais|menos)/.test(p) && !/imposto|margem|markup|custo|receita|carga|faturei|fatur\w*|recebi|vendi|vend[aei]\w*|cresc\w*|a (mais|menos) que|do que|que (o )?m[êe]s|m[êe]s passado|ano passado/.test(p)) {
    const pctM = p.match(/(\d[\d.]*(?:,\d+)?)\s*%/);
    const pct = pctM ? parseFloat(pctM[1].replace(",", ".")) : 0;
    const nums = Array.from(p.matchAll(/r?\$?\s*(\d[\d.]*(?:,\d+)?)/g))
      .map((m) => parseFloat(m[1].replace(/\./g, "").replace(",", ".")))
      .filter((n) => Number.isFinite(n));
    const base = nums.find((n) => n !== pct) ?? 0;
    if (base > 0 && pct > 0) {
      const acrescimo = /acr[ée]scim|\bmais\b|\ba mais\b|\+|juros|aument/.test(p) && !/desconto|menos|off|a menos/.test(p);
      const resultado = acrescimo ? base * (1 + pct / 100) : base * (1 - pct / 100);
      const delta = Math.abs(resultado - base);
      return S(
        acrescimo
          ? `${fmt(base)} com ${pct % 1 === 0 ? pct : pct}% de acréscimo fica ${fmt(resultado)} (+${fmt(delta)}).`
          : `${fmt(base)} com ${pct % 1 === 0 ? pct : pct}% de desconto fica ${fmt(resultado)} (−${fmt(delta)}).`,
        [{ label: acrescimo ? "Com acréscimo" : "Com desconto", valor: fmt(resultado) }, { label: acrescimo ? "Acréscimo" : "Desconto", valor: fmt(delta) }], ["desconto/acréscimo"]);
    }
  }

  // ——— CONVERSÃO DE TAXA (mensal ↔ anual, juros compostos) ———
  if (/(\d[\d.,]*\s*%).*(ao (m[êe]s|ano)|a\.?\s*[ma]\.?|mensal|anual).*(em|por|equivale|d[áa]|vira|para|pra\b|convert).*(ao (ano|m[êe]s)|anual|mensal|juros ao (ano|m[êe]s))|convert\w* .*taxa|quanto (é|da|fica) \d[\d.,]*\s*% ao (m[êe]s|ano)/.test(p)) {
    const pt = p.match(/(\d[\d.]*(?:,\d+)?)\s*%/);
    if (pt) {
      const taxa = parseFloat(pt[1].replace(",", ".")) / 100;
      // A ORIGEM é a unidade logo após o % ("2% ao mês…" → mensal). Robusto
      // independente da ordem do resto da frase.
      const orig = p.match(/%\s*(?:ao\s*|\/\s*|a\.?\s*)?(m[êe]s|mensa\w*|ano|anua\w*)/);
      const origemMensal = orig ? /m[êe]s|mensa/.test(orig[1]) : true;
      if (origemMensal) {
        const anual = equivalenteAnual(taxa);
        return S(`${pt[1]}% ao mês equivale a ${Math.round(anual * 10000) / 100}% ao ANO (juros compostos: (1+${pt[1].replace(".", ",")}%)¹² − 1). Muita gente multiplica por 12 (daria ${Math.round(taxa * 12 * 10000) / 100}%), mas com juros sobre juros é mais.`,
          [{ label: "Ao mês", valor: `${pt[1]}%` }, { label: "Ao ano (efetiva)", valor: `${Math.round(anual * 10000) / 100}%` }], ["conversão de taxa"]);
      }
      const mensal = equivalenteMensal(taxa);
      return S(`${pt[1]}% ao ano equivale a ${Math.round(mensal * 10000) / 100}% ao MÊS (juros compostos: (1+${pt[1].replace(".", ",")}%)^(1/12) − 1).`,
        [{ label: "Ao ano", valor: `${pt[1]}%` }, { label: "Ao mês (efetiva)", valor: `${Math.round(mensal * 10000) / 100}%` }], ["conversão de taxa"]);
    }
  }

  // ——— ANTECIPAÇÃO DE RECEBÍVEIS / DESCONTO DE DUPLICATA ———
  if (/antecipar|antecipa[çc][ãa]o de receb|desconto de (duplicata|receb|t[íi]tulo)|receber (hoje|adiantad|antes).* (que vence|a prazo)|adiantar (o )?receb|vale a pena antecipar/.test(p)) {
    const valn = p.match(/r?\$?\s*(\d[\d.]*(?:,\d+)?)\s*(milh\w*|mil|k|\bmi\b)?/i);
    let valor = 0;
    if (valn) { const base = parseFloat(valn[1].replace(/\./g, "").replace(",", ".")); valor = valn[2] ? base * (/milh|^mi$/i.test(valn[2]) ? 1e6 : 1e3) : base; }
    if (valor > 0) {
      const pt = p.match(/(\d[\d.]*(?:,\d+)?)\s*%/);
      const taxa = pt ? parseFloat(pt[1].replace(",", ".")) / 100 : 0.03; // desconto típico ~3% a.m. se não informado
      const pm = p.match(/(?:vence|em|daqui|para|prazo de|faltam?)\s+(\d{1,3})\s*(meses|m[êe]s|dias?)/);
      const meses = pm ? (/dia/.test(pm[2]) ? parseInt(pm[1], 10) / 30 : parseInt(pm[1], 10)) : 1;
      const r = antecipar(valor, taxa, meses);
      const taxaInfo = pt ? "" : " (assumi ~3%/mês; me diga a taxa real pra precisar)";
      return S(
        `Antecipando ${fmt(valor)} que vence em ${meses % 1 === 0 ? meses : meses.toFixed(1)} ${meses === 1 ? "mês" : "meses"} a ${Math.round(taxa * 10000) / 100}% ao mês${taxaInfo}: cai ${fmt(r.liquido)} hoje — custo de ${fmt(r.custo)} (${r.custoPct}%). Vale se essa liquidez evita um crédito mais caro ou uma perda maior.`,
        [{ label: "Recebe hoje", valor: fmt(r.liquido) }, { label: "Custo (deságio)", valor: fmt(r.custo) }, { label: "Custo %", valor: `${r.custoPct}%` }], ["antecipação de recebíveis"]);
    }
  }

  // ——— PAYBACK: em quanto tempo um investimento se paga ———
  if (/(em quanto tempo|quando|quanto tempo (pra|para)).*(recuper|se paga|pago o investiment|retorna o investiment)|\bpayback\b|tempo de retorno (do|de um)? ?investiment|em quantos meses (recupero|se paga)/.test(p)) {
    const nums = Array.from(p.matchAll(/r?\$?\s*(\d[\d.]*(?:,\d+)?)\s*(milh\w*|mil|k|\bmi\b)?/gi)).map((m) => {
      const base = parseFloat(m[1].replace(/\./g, "").replace(",", "."));
      return m[2] ? base * (/milh|^mi$/i.test(m[2]) ? 1e6 : 1e3) : base;
    }).filter((n) => n > 0);
    // 1º número = investimento; 2º = retorno mensal (heurística "invisto X e ganho Y/mês")
    if (nums.length >= 2) {
      const r = payback(nums[0], nums[1]);
      return S(
        r.paga
          ? `Um investimento de ${fmt(nums[0])} que gera ${fmt(nums[1])} por mês se paga em ~${r.meses % 1 === 0 ? r.meses : r.meses.toFixed(1)} meses (${r.anos.toFixed(1)} anos). Depois disso, é lucro.`
          : `Sem retorno mensal positivo, o investimento de ${fmt(nums[0])} não se paga.`,
        [{ label: "Payback", valor: `${r.paga ? r.meses.toFixed(1) : "—"} meses` }, { label: "Investimento", valor: fmt(nums[0]) }, { label: "Retorno/mês", valor: fmt(nums[1]) }], ["payback de investimento"]);
    }
  }

  // ——— META DE POUPANÇA: em quanto tempo junto X guardando Y/mês ———
  // Antes do valor futuro: a pergunta é o TEMPO até uma meta, não o montante.
  if (/(quanto tempo|em quanto tempo|quantos? m[êe]s(es)?|em quantos meses|quando (eu )?(vou|consigo))\b.{0,45}(junt\w*|poupar|poupando|guardar|guardando|acumul\w*|chegar|alcan[çc]ar|ter|comprar)\b.{0,40}\d/.test(p) && !/recuper|se paga|investiment/.test(p)) {
    const vm = (re: RegExp): number | null => { const m = p.match(re); if (!m) return null; const base = parseFloat(m[1].replace(/\./g, "").replace(",", ".")); return m[2] ? base * (/milh|^mi$/i.test(m[2]) ? 1e6 : 1e3) : base; };
    // meta (alvo) e aporte mensal — âncoras distintas p/ não trocar os números.
    const meta = vm(/(?:juntar|acumular|ter|chegar a|meta de|comprar|poupar at[ée]|guardar at[ée]|alcan[çc]ar|juntar uns?)\s+r?\$?\s*(\d[\d.]*(?:,\d+)?)\s*(milh\w*|mil|k|\bmi\b)?/)
      ?? vm(/r?\$?\s*(\d[\d.]*(?:,\d+)?)\s*(milh\w*|mil|k|\bmi\b)?/);
    const aporte = vm(/(?:guardando|poupando|aplicando|investindo|guardar|poupar|separando|de)\s+r?\$?\s*(\d[\d.]*(?:,\d+)?)\s*(milh\w*|mil|k|\bmi\b)?\s*(?:por|todo|a cada|no|\/)\s*m[êe]s/)
      ?? vm(/r?\$?\s*(\d[\d.]*(?:,\d+)?)\s*(milh\w*|mil|k|\bmi\b)?\s*(?:por|\/)\s*m[êe]s/);
    const jm = p.match(/(\d[\d.]*(?:,\d+)?)\s*%/);
    const taxa = jm ? parseFloat(jm[1].replace(",", ".")) / 100 : 0;
    if (meta != null && meta > 0 && aporte != null && aporte > 0) {
      const r = tempoParaMeta(meta, aporte, taxa);
      if (!r.atingivel) {
        return S(`Sem aporte mensal nem rendimento, não dá para chegar a ${fmt(meta)}. Me diga quanto consegue guardar por mês.`, [], ["meta de poupança"]);
      }
      const anosTxt = r.meses >= 12 ? ` (${r.anos.toFixed(r.anos % 1 === 0 ? 0 : 1)} ${r.anos === 1 ? "ano" : "anos"})` : "";
      return S(`Guardando ${fmt(aporte)} por mês${taxa > 0 ? ` a ${Math.round(taxa * 1000) / 10}% ao mês` : ""}, você junta ${fmt(meta)} em ${r.meses} mes${r.meses === 1 ? "" : "es"}${anosTxt}. Você deposita ${fmt(r.totalAportado)}${r.jurosGanhos > 0 ? ` — os juros abatem ${fmt(r.jurosGanhos)}` : ""}.`,
        [{ label: "Tempo", valor: `${r.meses} meses` }, { label: "Você deposita", valor: fmt(r.totalAportado) }, ...(r.jurosGanhos > 0 ? [{ label: "Juros", valor: fmt(r.jurosGanhos) }] : [])], ["meta de poupança"]);
    }
  }

  // ——— POUPANÇA / APLICAÇÃO: valor futuro (guardar X por mês) ———
  if (/(quanto (rende|rendo|vou ter|acumul|fica|teria|junto)|se eu (guardar|poupar|aplicar|investir|juntar)|(guardar|poupar|aplicar|investir|juntar)\s+r?\$?\s*\d.*(por|todo|a cada|no) m[êe]s|rende (guardar|aplicar|poupar)|render.* aplicar)/.test(p) && /\d/.test(p)) {
    const val = (re: RegExp): number | null => { const m = p.match(re); if (!m) return null; const base = parseFloat(m[1].replace(/\./g, "").replace(",", ".")); return m[2] ? base * (/milh|^mi$/i.test(m[2]) ? 1e6 : 1e3) : base; };
    const valorMes = val(/(?:guardar|poupar|aplicar|investir|juntar|de)\s+r?\$?\s*(\d[\d.]*(?:,\d+)?)\s*(milh\w*|mil|k|\bmi\b)?\s*(?:por|todo|a cada|no|\/)\s*m[êe]s/);
    const soValor = val(/r?\$?\s*(\d[\d.]*(?:,\d+)?)\s*(milh\w*|mil|k|\bmi\b)?/);
    const aporte = valorMes ?? 0;
    const principal = valorMes == null ? (soValor ?? 0) : 0; // "por mês" = aporte; senão lump-sum
    const pt = p.match(/(\d[\d.]*(?:,\d+)?)\s*%/);
    const taxa = pt ? parseFloat(pt[1].replace(",", ".")) / 100 : 0;
    const pm = p.match(/(?:em|por|durante)\s+(\d{1,3})\s*(meses|m[êe]s|anos?|ano)/);
    const meses = pm ? (/ano/.test(pm[2]) ? parseInt(pm[1], 10) * 12 : parseInt(pm[1], 10)) : 12;
    if ((aporte > 0 || principal > 0)) {
      const r = valorFuturo(principal, aporte, taxa, meses);
      const comoStr = aporte > 0 ? `guardar ${fmt(aporte)}/mês` : `aplicar ${fmt(principal)}`;
      return S(
        taxa === 0
          ? `${comoStr[0].toUpperCase() + comoStr.slice(1)} por ${meses} meses junta ${fmt(r.montante)} (sem rendimento). Me diga a taxa mensal (ex.: "a 1% ao mês") para ver com juros.`
          : `${comoStr[0].toUpperCase() + comoStr.slice(1)} a ${Math.round(taxa * 10000) / 100}% ao mês por ${meses} meses vira ${fmt(r.montante)}: ${fmt(r.totalAportado)} aportados + ${fmt(r.jurosGanhos)} de juros.`,
        [{ label: "Montante", valor: fmt(r.montante) }, { label: "Aportado", valor: fmt(r.totalAportado) }, { label: "Juros", valor: fmt(r.jurosGanhos) }], ["valor futuro"]);
    }
  }

  // ——— PROVISÃO DE 13º / FÉRIAS / ENCARGOS ———
  if (/provision\w*|13[ºo]|d[ée]cimo terceiro|provis[ãa]o (de|do|pra|para) (13|f[ée]rias|folha)|quanto (guardar|separar|provisionar) (pro|para o|de) (13|f[ée]rias)|custo (real|total) da folha|quanto custa (a |minha )?folha (por ano|de verdade)/.test(p)) {
    const fm = p.match(/(?:folha|sal[áa]rio|folha de pagament)\s*(?:mensal |de |é |: )?r?\$?\s*(\d[\d.]*(?:,\d+)?)\s*(milh\w*|mil|k|\bmi\b)?/);
    let folha = 0;
    if (fm) { const base = parseFloat(fm[1].replace(/\./g, "").replace(",", ".")); folha = fm[2] ? base * (/milh|^mi$/i.test(fm[2]) ? 1e6 : 1e3) : base; }
    else { const any = p.match(/r?\$?\s*(\d[\d.]*(?:,\d+)?)\s*(mil|k)?/); if (any) { const base = parseFloat(any[1].replace(/\./g, "").replace(",", ".")); folha = any[2] ? base * 1e3 : base; } }
    if (folha > 0) {
      const r = provisaoTrabalhista(folha);
      const so13 = /13|d[ée]cimo/.test(p) && !/f[ée]rias|custo (real|total)|folha (por ano|de verdade)/.test(p);
      if (so13) {
        return S(`Para o 13º de uma folha de ${fmt(folha)}, provisione ${fmt(r.decimoTerceiroMes)} por mês (+ ${fmt(r.decimoTerceiroMes * 0.08)} de FGTS) — assim dezembro não vira aperto.`,
          [{ label: "Provisão 13º/mês", valor: fmt(r.decimoTerceiroMes) }, { label: "FGTS s/ 13º", valor: fmt(r.decimoTerceiroMes * 0.08) }], ["provisão trabalhista"]);
      }
      return S(`Uma folha de ${fmt(folha)}/mês pede ${fmt(r.provisaoTotalMes)}/mês de provisão (${fmt(r.decimoTerceiroMes)} de 13º + ${fmt(r.feriasMes)} de férias+1/3 + ${fmt(r.fgtsMes)} de FGTS). O custo real anual da folha é ${fmt(r.custoAnualFolha)} — bem mais que 12×${fmt(folha)}.`,
        [{ label: "Provisão/mês", valor: fmt(r.provisaoTotalMes) }, { label: "Custo anual real", valor: fmt(r.custoAnualFolha) }, { label: "13º/mês", valor: fmt(r.decimoTerceiroMes) }], ["provisão trabalhista"]);
    }
  }

  // ——— JUROS DE MORA + MULTA sobre título vencido (calculadora) ———
  // Só entra com fraseado inequívoco de encargo (não rouba "quanto tenho vencido").
  if (/juros de mora|multa (de|por) (mora|atraso)|encargos? (de|por) (mora|atraso|atrasad)|(corrigir|atualizar|cobrar) (de |a |o |um |uma )*(t[íi]tulo|boleto|valor|d[íi]vida|conta)\b.{0,25}(vencid|atrasad)|(boleto|t[íi]tulo|conta|d[íi]vida) de (r?\$ ?)?[\d.,]+ ?(mil|k|milh\w*)?\s*(vencid\w*|atrasad\w*) h[áa] \d/.test(p)) {
      const val = (re: RegExp): number | null => { const m = p.match(re); if (!m) return null; const base = parseFloat(m[1].replace(/\./g, "").replace(",", ".")); return m[2] ? base * (/milh|^mi$/i.test(m[2]) ? 1e6 : 1e3) : base; };
      // Principal: "boleto/título/valor/dívida de R$ X" ou o 1º valor monetário.
      const principal = val(/(?:boleto|t[íi]tulo|valor|d[íi]vida|conta|principal|cobran[çc]a)\s*(?:de |é |: |no valor de )?r?\$?\s*(\d[\d.]*(?:,\d+)?)\s*(milh\w*|mil|k|\bmi\b)?/)
        ?? val(/r?\$?\s*(\d[\d.]*(?:,\d+)?)\s*(milh\w*|mil|k|\bmi\b)?/);
      // Dias de atraso: "há 30 dias", "atrasado 30 dias", "2 meses", "1 mês".
      let dias: number | null = null;
      const dm = p.match(/(\d+)\s*(dias?|meses|m[êe]s|semanas?|anos?)/);
      if (dm) {
        const n = parseInt(dm[1], 10);
        dias = /m[êe]s|mes/.test(dm[2]) ? n * 30 : /semana/.test(dm[2]) ? n * 7 : /ano/.test(dm[2]) ? n * 365 : n;
      }
      // Percentuais opcionais (senão a praxe: 2% multa + 1% a.m. juros).
      const multaM = p.match(/multa\s*(?:de )?(\d+(?:[.,]\d+)?)\s*%/);
      const jurosM = p.match(/juros\s*(?:de |a )?(\d+(?:[.,]\d+)?)\s*%/);
      const multaPct = multaM ? parseFloat(multaM[1].replace(",", ".")) / 100 : 0.02;
      const jurosPct = jurosM ? parseFloat(jurosM[1].replace(",", ".")) / 100 : 0.01;
      if (principal != null && principal > 0 && dias != null && dias > 0) {
        const r = calcularMora(principal, dias, multaPct, jurosPct);
        return S(`Um título de ${fmt(principal)} vencido há ${dias} dia${dias > 1 ? "s" : ""} fica em ${fmt(r.totalCorrigido)}: ${fmt(principal)} + ${fmt(r.multa)} de multa (${Math.round(multaPct * 1000) / 10}%) + ${fmt(r.juros)} de juros de mora (${Math.round(jurosPct * 1000) / 10}% ao mês pro rata). São ${fmt(r.totalEncargos)} de encargos (${r.encargoPct}% sobre o valor).`,
          [{ label: "Total corrigido", valor: fmt(r.totalCorrigido) }, { label: "Multa", valor: fmt(r.multa) }, { label: "Juros de mora", valor: fmt(r.juros) }], ["juros de mora", "multa de mora"]);
      }
      if (principal != null && principal > 0) {
        return S(`Para calcular os encargos de ${fmt(principal)} eu preciso saber há quantos dias venceu. Ex.: "quanto cobrar de um boleto de ${fmt(principal)} vencido há 30 dias?". A praxe é multa de 2% + juros de mora de 1% ao mês (pro rata die).`,
          [], ["juros de mora"]);
      }
  }

  // ——— SIMPLES NACIONAL: alíquota efetiva + DAS ———
  // "das" é a contração de+as (das contas, das minhas…) — NÃO o imposto. Só trata
  // como DAS-tributo quando seguido de qualificador fiscal ou fim de frase.
  if (/simples nacional|al[íi]quota efetiv|\bdas\b(?=\s*(?:do simples|nacional|mensal|do m[êe]s|deste m[êe]s|[?.!,]|$))|quanto (pago|pagaria|paga|é|fica|de imposto) (no|do|pelo|de) simples|imposto (no|do|pelo) simples|anexo (i{1,3}\b|v\b|um\b|dois\b|tr[êe]s\b|cinco\b)/.test(p)) {
      const val = (re: RegExp): number | null => { const m = p.match(re); if (!m) return null; const base = parseFloat(m[1].replace(/\./g, "").replace(",", ".")); return m[2] ? base * (/milh|^mi$/i.test(m[2]) ? 1e6 : 1e3) : base; };
      // Anexo: número romano/por extenso, ou pela atividade.
      let anexo: AnexoSimples = "III";
      if (/anexo (i\b|um\b|1\b|com[ée]rci)|com[ée]rcio|revend|loja/.test(p)) anexo = "I";
      else if (/anexo (ii\b|dois\b|2\b)|ind[úu]stri|f[áa]brica|fabric/.test(p)) anexo = "II";
      else if (/anexo (v\b|cinco\b|5\b)|intelectu|t[ée]cnic|advocaci|engenhari|consultori/.test(p)) anexo = "V";
      else if (/anexo (iii\b|tr[êe]s\b|3\b)|servi[çc]/.test(p)) anexo = "III";
      // RBT12 = faturamento anual / dos últimos 12 meses.
      const rbt12 = val(/(?:rbt12|rbt 12|faturament\w*|receita|fatur\w*)\s*(?:bruta )?(?:anual|dos? (?:[úu]ltimos )?12 meses|do ano|por ano|em 12 meses)?\s*(?:de |é |: )?r?\$?\s*(\d[\d.]*(?:,\d+)?)\s*(milh\w*|mil|k|\bmi\b)?/)
        ?? val(/r?\$?\s*(\d[\d.]*(?:,\d+)?)\s*(milh\w*|mil|k|\bmi\b)?\s*(?:por ano|anual|ao ano|\/ano|no ano|em 12 meses)/);
      const receitaMes = val(/(?:receita|fatur\w*|vend\w*)\s*(?:d[eo] )?m[êe]s\s*(?:de |é |: )?r?\$?\s*(\d[\d.]*(?:,\d+)?)\s*(milh\w*|mil|k|\bmi\b)?/)
        ?? val(/r?\$?\s*(\d[\d.]*(?:,\d+)?)\s*(milh\w*|mil|k|\bmi\b)?\s*(?:por m[êe]s|no m[êe]s|\/m[êe]s|mensa\w*)/);
      if (rbt12 != null && rbt12 > 0) {
        const mes = receitaMes != null && receitaMes > 0 ? receitaMes : rbt12 / 12;
        const r = calcularSimplesNacional(rbt12, mes, anexo);
        const nomeAnexo = { I: "Anexo I (comércio)", II: "Anexo II (indústria)", III: "Anexo III (serviços)", V: "Anexo V (serviços técnicos)" }[anexo];
        const efPct = Math.round(r.aliquotaEfetiva * 1000) / 10;
        if (r.acimaDoTeto) {
          return S(`Com faturamento de ${fmt(rbt12)} nos últimos 12 meses você ESTOURA o teto do Simples Nacional (${fmt(4800000)}/ano) — precisa migrar para Lucro Presumido/Real. Só para referência, a alíquota efetiva na última faixa do ${nomeAnexo} seria ~${efPct}%.`,
            [{ label: "RBT12", valor: fmt(rbt12) }, { label: "Teto do Simples", valor: fmt(4800000) }, { label: "Alíquota efetiva", valor: `${efPct}%` }], ["Simples Nacional"]);
        }
        return S(`No ${nomeAnexo}, com ${fmt(rbt12)} de faturamento nos últimos 12 meses (faixa ${r.faixa}), sua alíquota EFETIVA é ${efPct}% — não os ${Math.round(r.aliquotaNominal * 1000) / 10}% da tabela. Sobre uma receita de ${fmt(mes)} no mês, o DAS fica em ${fmt(r.das)}.`,
          [{ label: "Alíquota efetiva", valor: `${efPct}%` }, { label: "DAS do mês", valor: fmt(r.das) }, { label: "Faixa", valor: `${r.faixa}ª` }], ["Simples Nacional", "alíquota efetiva"]);
      }
      return S(`Para calcular seu Simples Nacional eu preciso do faturamento dos últimos 12 meses (RBT12) e do anexo. Ex.: "quanto pago de Simples no Anexo III com faturamento de 500 mil por ano e 40 mil no mês?". A alíquota efetiva não é a da tabela — ela sobe suave dentro da faixa.`,
        [], ["Simples Nacional"]);
  }

  // ——— PONTO DE EQUILÍBRIO EM UNIDADES ———
  if (/quant[ao]s? (unidades?|pe[çc]as?|produtos?|itens|vendas?) .*(empatar|equil[íi]brio|cobrir|pagar (o|os) (custo|fixo)|preciso vender)|ponto de equil[íi]brio em unidade|quant[ao]s? .* pra (empatar|não ter preju)/.test(p)) {
    const val = (re: RegExp): number | null => { const m = p.match(re); if (!m) return null; const base = parseFloat(m[1].replace(/\./g, "").replace(",", ".")); return m[2] ? base * (/milh|^mi$/i.test(m[2]) ? 1e6 : 1e3) : base; };
    const custoFixo = val(/(?:custo fixo|custos fixos|despesa fixa|\bfixo\b)\s*(?:de |é |: )?r?\$?\s*(\d[\d.]*(?:,\d+)?)\s*(milh\w*|mil|k|\bmi\b)?/)
      ?? val(/r?\$?\s*(\d[\d.]*(?:,\d+)?)\s*(milh\w*|mil|k|\bmi\b)?\s*(?:de |em |em de )?(?:custos? fix|despesa fix)/);
    const margemUnit = val(/margem\s*(?:de |por unidade |unit[áa]ria )?(?:de |é )?r?\$?\s*(\d[\d.]*(?:,\d+)?)/);
    const preco = val(/(?:vend\w* (?:a|por)|pre[çc]o (?:de )?)\s*r?\$?\s*(\d[\d.]*(?:,\d+)?)\s*(mil|k)?/);
    const custoVar = val(/cust[ao] (?:vari[áa]vel |unit[áa]ri[ao] |por unidade )(?:de |é )?r?\$?\s*(\d[\d.]*(?:,\d+)?)\s*(mil|k)?/);
    const mc = margemUnit != null ? margemUnit : (preco != null && custoVar != null ? preco - custoVar : null);
    if (custoFixo != null && mc != null) {
      const r = pontoEquilibrioUnidades(custoFixo, mc, preco ?? 0);
      return S(
        Number.isFinite(r.unidades)
          ? `Com ${fmt(custoFixo)} de custo fixo e ${fmt(mc)} de margem por unidade, você empata vendendo ${r.unidades} unidade(s)${r.faturamentoEquilibrio > 0 ? ` (${fmt(r.faturamentoEquilibrio)} de faturamento)` : ""}. A partir daí, é lucro.`
          : `Com margem por unidade ${mc <= 0 ? "zero ou negativa" : "indefinida"}, não há ponto de equilíbrio — cada venda não cobre o custo. Reveja preço/custo.`,
        [{ label: "Unidades p/ empatar", valor: Number.isFinite(r.unidades) ? String(r.unidades) : "—" }, { label: "Custo fixo", valor: fmt(custoFixo) }, { label: "Margem/unid.", valor: fmt(mc) }], ["ponto de equilíbrio (unidades)"]);
    }
  }

  // ——— PRECIFICAÇÃO: preço / margem / markup ———
  // "que preço vender custo X com margem Y%" — resolve margem × markup.
  if (/(que |qual )?pre[çc]o (de venda|pra vender|para vender|vender|cobrar|colocar|botar)|precific|por quanto (vend\w*|devo vender)|margem (se|com|de um|quando|l[íi]quida)|markup (pra|para|de|com)|(qual (a|minha) )?margem (real )?(se|com|vendendo)/.test(p)) {
    const numA = (re: RegExp): number | null => { const m = p.match(re); if (!m) return null; const v = m.slice(1).find((g) => g != null); return v == null ? null : parseFloat(v.replace(/\./g, "").replace(",", ".")); };
    // % de um conceito nas DUAS ordens: "margem de 20%" e "20% de margem".
    const pct = (kwSrc: string): number | null => {
      const a = p.match(new RegExp(kwSrc + "\\s*(?:l[íi]quida\\s*)?(?:de |: )?(\\d[\\d.]*(?:,\\d+)?)\\s*%"));
      if (a) return parseFloat(a[1].replace(/\./g, "").replace(",", "."));
      const b = p.match(new RegExp("(\\d[\\d.]*(?:,\\d+)?)\\s*%\\s*(?:de |em )?(?:l[íi]quida )?" + kwSrc));
      if (b) return parseFloat(b[1].replace(/\./g, "").replace(",", "."));
      return null;
    };
    const custo = numA(/cust[oa]\w*\s*(?:de |é |: )?r?\$?\s*(\d[\d.]*(?:,\d+)?)/);
    const margemPct = pct("margem");
    const markupPct = pct("markup");
    const precoPrat = numA(/(?:vendo por|vender por|pre[çc]o de|por)\s*r?\$?\s*(\d[\d.]*(?:,\d+)?)/);
    const impostoPct = pct("(?:imposto|tribut\\w*|simples)");
    // Gross-up: margem LÍQUIDA alvo DEPOIS do imposto (embute o imposto no preço).
    if (custo != null && margemPct != null && impostoPct != null) {
      const r = precoComImpostos(custo, impostoPct / 100, margemPct / 100);
      if (!r.viavel) {
        return S(`Não dá: margem de ${Math.round(margemPct)}% + imposto de ${Math.round(impostoPct)}% já passa de 100% do preço — não existe preço que feche essa conta. Reduza a margem alvo ou o imposto.`,
          [{ label: "Margem alvo", valor: `${Math.round(margemPct)}%` }, { label: "Imposto", valor: `${Math.round(impostoPct)}%` }], ["precificação com impostos"]);
      }
      return S(`Para sobrar ${Math.round(margemPct)}% de margem LÍQUIDA depois de ${Math.round(impostoPct)}% de imposto, venda um custo de ${fmt(custo)} por ${fmt(r.preco)}: dá ${fmt(r.imposto)} de imposto e ${fmt(r.lucroLiquido)} de lucro líquido. (Não basta somar — o imposto incide sobre o preço, então tem que embutir.)`,
        [{ label: "Preço de venda", valor: fmt(r.preco) }, { label: "Imposto", valor: fmt(r.imposto) }, { label: "Lucro líquido", valor: fmt(r.lucroLiquido) }], ["precificação com impostos"]);
    }
    if (custo != null && margemPct != null) {
      const r = precoPorMargem(custo, margemPct / 100);
      return S(`Para ${Math.round(margemPct)}% de margem sobre um custo de ${fmt(custo)}, venda por ${fmt(r.preco)} — isso é um markup de ${Math.round(r.markup * 100)}% e ${fmt(r.lucroUnitario)} de lucro por unidade. (Cuidado: margem ≠ markup — pôr "${Math.round(margemPct)}% em cima do custo" daria menos margem.)`,
        [{ label: "Preço de venda", valor: fmt(r.preco) }, { label: "Markup", valor: `${Math.round(r.markup * 100)}%` }, { label: "Lucro/unid.", valor: fmt(r.lucroUnitario) }], ["precificação"]);
    }
    if (custo != null && markupPct != null) {
      const r = precoPorMarkup(custo, markupPct / 100);
      return S(`Custo ${fmt(custo)} com markup de ${Math.round(markupPct)}% dá preço ${fmt(r.preco)} — mas isso é só ${Math.round(r.margem * 100)}% de MARGEM (sobre o preço), não ${Math.round(markupPct)}%. Lucro de ${fmt(r.lucroUnitario)}/unidade.`,
        [{ label: "Preço de venda", valor: fmt(r.preco) }, { label: "Margem real", valor: `${Math.round(r.margem * 100)}%` }, { label: "Lucro/unid.", valor: fmt(r.lucroUnitario) }], ["precificação"]);
    }
    if (custo != null && precoPrat != null) {
      const r = analisarPreco(custo, precoPrat);
      return S(`Vendendo por ${fmt(precoPrat)} um item de custo ${fmt(custo)}: margem de ${Math.round(r.margem * 100)}% (markup de ${Math.round(r.markup * 100)}%), lucro de ${fmt(r.lucroUnitario)} por unidade.`,
        [{ label: "Margem", valor: `${Math.round(r.margem * 100)}%` }, { label: "Markup", valor: `${Math.round(r.markup * 100)}%` }, { label: "Lucro/unid.", valor: fmt(r.lucroUnitario) }], ["precificação"]);
    }
  }

  // ——— PONTUALIDADE DE RECEBIMENTO (atraso médio dos clientes / DSO) ———
  // ANTES de A RECEBER: "para receber" contém a substring "a receber".
  if (/quanto tempo (demoro|levo|leva|demora)( para| pra)? receber|prazo m[ée]dio de recebiment|atraso m[ée]dio (dos |de )?clientes?|(meus )?clientes? (pagam?|est[ãa]o pagando|andam pagando)( em dia| no prazo| atrasad| com atraso| adiantad)|clientes? pagam em dia|recebo (em dia|no prazo|com atraso)|clientes? (atrasam|est[ãa]o atrasad|demoram)|(meus )?clientes? (s[ãa]o|est[ãa]o) pontuai?s|pontualidade (dos |de )?(clientes|recebiment)/.test(p)) {
    const pagos = movs.filter((m) => m.type === "entrada" && m.status === "pago" && m.paid_date && m.due_date);
    if (!pagos.length) return R("Ainda não há recebimentos liquidados para medir a pontualidade dos clientes.", [], ["recebimentos liquidados"]);
    const atrasos = pagos.map((m) => diasEntre(m.due_date, m.paid_date as string));
    const media = atrasos.reduce((s, d) => s + d, 0) / atrasos.length;
    const noPrazo = atrasos.filter((d) => d <= 0).length;
    const pctPrazo = Math.round((noPrazo / atrasos.length) * 100);
    const arred = Math.round(media);
    const frase = arred <= 0
      ? `Os clientes pagam em dia: ${emMediaAoVencimento(arred)}. ${pctPrazo}% dos títulos foram pagos no prazo.`
      : `Os clientes pagam com ${arred} dia(s) de atraso em média. Só ${pctPrazo}% foram pagos no prazo — Recomenda-se intensificar a cobrança.`;
    return R(frase, [B("Atraso médio", `${arred} d`, pagos, "receber"), B("Pagos no prazo", `${pctPrazo}%`, pagos, "receber"), B("Títulos", String(atrasos.length), pagos, "receber")], ["comportamento de pagamento dos clientes"], 0.88);
  }

  // ——— PONTUALIDADE DE PAGAMENTO (atraso médio com que EU pago / DPO) ———
  if (/pago (minhas |as )?(contas?|fornecedores?|boletos?)( em dia| no prazo| atrasad| com atraso| adiantad)|(estou |ando )?pagando (em dia|no prazo|atrasad|com atraso)|prazo m[ée]dio de pagament|atraso m[ée]dio (que eu pago|de pagament|dos meus pagament)|pago (tudo )?em dia|estou pagando em dia/.test(p)) {
    const pagos = movs.filter((m) => m.type === "saida" && m.status === "pago" && m.paid_date && m.due_date);
    if (!pagos.length) return R("Ainda não há pagamentos liquidados para medir sua pontualidade.", [], ["pagamentos liquidados"]);
    const atrasos = pagos.map((m) => diasEntre(m.due_date, m.paid_date as string));
    const media = atrasos.reduce((s, d) => s + d, 0) / atrasos.length;
    const noPrazo = atrasos.filter((d) => d <= 0).length;
    const pctPrazo = Math.round((noPrazo / atrasos.length) * 100);
    const arred = Math.round(media);
    const frase = arred <= 0
      ? `Os pagamentos são feitos em dia: ${emMediaAoVencimento(arred)} (${pctPrazo}% no prazo). Disciplina adequada; ainda assim, pagar exatamente no vencimento preserva mais caixa.`
      : `Os pagamentos saem com ${arred} dia(s) de atraso em média (${pctPrazo}% no prazo). Atrasos recorrentes geram multa e juros e comprometem o relacionamento com fornecedores.`;
    return R(frase, [B("Atraso médio", `${arred} d`, pagos, "pagar"), B("Pagos no prazo", `${pctPrazo}%`, pagos, "pagar"), B("Títulos", String(atrasos.length), pagos, "pagar")], ["comportamento de pagamento a fornecedores"], 0.88);
  }

  // ——— A RECEBER (total) — "quem deve/devendo" cai na inadimplência abaixo ———
  // "quem ... dev" é pergunta de QUEM (lista de devedores) → cai na inadimplência.
  if (/a receber|contas? a receber|receb[íi]veis|tenho a receber|me devem\b|me deve\b|v[ãa]o me pagar|ainda (vou|tenho a|falta) receber|falta (eu )?receber|quanto falta (eu )?receber/.test(p) && !/quem.*\bdev/.test(p)) {
    const ab = movs.filter((m) => ehContaAReceber(m) && m.status === "pendente");
    const total = ab.reduce((s, m) => s + Math.abs(m.amount), 0);
    const vencidos = ab.filter((m) => m.due_date.slice(0, 10) < hoje);
    const totVenc = vencidos.reduce((s, m) => s + Math.abs(m.amount), 0);
    const prox = ab.filter((m) => m.due_date.slice(0, 10) >= hoje).sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
    /**
     * ⚠️ **QUEM PERGUNTA POR "VENCIDO" TEM DE OUVIR O VENCIDO PRIMEIRO — e
     * ouvir ZERO quando é zero.**
     *
     * Medido sobre 408 lançamentos reais: a pergunta "quanto tenho a receber
     * vencido" era respondida com *"Há R$237.161,67 a receber em 10 títulos. O
     * próximo vence em 21/08"*. O número não estava errado — não havia nada
     * vencido, e o R$ 0,00 aparecia num campo lateral. Errada estava a FORMA:
     * a pergunta é sobre atraso e a resposta lidera com a carteira inteira e
     * termina falando de FUTURO. Quem lê rápido guarda duzentos e trinta e sete
     * mil como se fosse dívida vencida.
     *
     * É a doutrina da ONDA 4 aplicada à prosa: zero é RESPOSTA, e a resposta
     * tem de responder a pergunta feita.
     */
    const perguntouVencido = /vencid|atrasad|em atraso|venceu|no vermelho com|inadimpl/.test(p);
    if (perguntouVencido) {
      return R(
        totVenc > 0
          ? `Há ${fmt(totVenc)} vencidos, em ${vencidos.length} título(s). O total a receber, incluindo o que ainda não venceu, é ${fmt(total)}.`
          : `Não há nada vencido a receber. O total em aberto é ${fmt(total)} em ${ab.length} título(s), todos ainda no prazo.`,
        [L("Vencido", fmt(totVenc), vencidos, "vencidos"), B("Títulos vencidos", String(vencidos.length), vencidos, "vencidos"), L("Total a receber", fmt(total), ab, "receber")],
        ["recebíveis vencidos"]);
    }
    return R(
      `Há ${fmt(total)} a receber em ${ab.length} título(s)${totVenc > 0 ? `, dos quais ${fmt(totVenc)} já estão vencidos (${vencidos.length})` : ""}.${prox ? ` O próximo vence em ${dia(prox.due_date)} (${fmt(Math.abs(prox.amount))}).` : ""}`,
      [L("Total a receber", fmt(total), ab, "receber"), L("Vencido", fmt(totVenc), vencidos, "vencidos"), B("Títulos", String(ab.length), ab, "receber")],
      ["recebíveis em aberto"]);
  }

  // ——— A PAGAR ———
  if (/a pagar|contas? a pagar|pag[áa]veis|pagamento[s]? (j[áa] )?(vencid|em atraso|atrasad)|(vencid|atrasad)\w* (a|pra|para) pagar|(boleto|fornecedor|conta)\w* (a pagar )?(j[áa] )?(vencid|atrasad|em atraso)|quanto.*(devo|tenho (que|a) pagar|preciso pagar)|quem (eu )?(preciso|tenho que|devo) pagar|quais? (boletos?|contas? (a pagar|em aberto|pra pagar))|(meus |os )?boletos?\b|tenho boletos?|(abre|abrir|ver|mostra|me mostra|lista) (meus |os )?(pagamentos|pag[áa]veis|contas a pagar)|minhas? d[íi]vidas?|t[áa] tudo pago|tudo (est[áa] )?pago|paguei tudo|falta (algo|alguma conta) (pra|para) pagar|tem conta em aberto|(muita|muito|quanta) d[íi]vida|tenho d[íi]vida|vou ter que pagar|vou pagar (de )?conta|(t[ôo]|to|estou|ando) devendo|quanto (eu )?devo\b|contas? (t[ãa]o|est[ãa]o) (em dia|pagas)|(minhas )?contas em dia|endividament\w*|qual (o |meu )?(n[íi]vel de )?endivida|quanto estou devendo/.test(p)) {
    const ab = movs.filter((m) => m.type === "saida" && m.status === "pendente");
    const total = ab.reduce((s, m) => s + Math.abs(m.amount), 0);
    const vencidos = ab.filter((m) => m.due_date.slice(0, 10) < hoje);
    const totVenc = vencidos.reduce((s, m) => s + Math.abs(m.amount), 0);
    const prox = ab.filter((m) => m.due_date.slice(0, 10) >= hoje).sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
    return R(
      `Há ${fmt(total)} a pagar em ${ab.length} título(s)${totVenc > 0 ? `, sendo ${fmt(totVenc)} já vencidos (${vencidos.length})` : ""}.${prox ? ` O próximo vence em ${dia(prox.due_date)} (${fmt(Math.abs(prox.amount))}).` : ""}`,
      [L("Total a pagar", fmt(total), ab, "pagar"), L("Vencido", fmt(totVenc), vencidos, "pagar"), B("Títulos", String(ab.length), ab, "pagar")],
      ["contas a pagar em aberto"]);
  }

  // ——— VENCIMENTOS no período ———
  if (/(o que|quais|qual|quanto|tem algo).*(vence|vencer|vencimento)|vence (hoje|amanh[ãa]|essa semana|esse m[êe]s)|a vencer|vencimentos?|(o que|quais).*(preciso|tenho que|vou|devo) (pagar|receber)|(pagar|receber) (essa semana|amanh[ãa]|hoje|esse m[êe]s)/.test(p)) {
    // Detecta período explícito (inclui mês NOMEADO, trimestre/semestre/ano) —
    // senão o default é "nesta semana". Antes, "o que vence em março?" caía no
    // default de semana por não ter token semana/mês/dia.
    const temPeriodo = /semana|m[êe]s|hoje|ontem|amanh|dias|trimestre|semestre|\bano\b|passad|anterior/.test(p)
      || MES.some((nm) => new RegExp(`(^|[^a-zà-ú])${nm}([^a-zà-ú]|$)`, "i").test(p));
    const w = temPeriodo ? janela(p, hoje) : { label: "nesta semana", ...semanaDe(hoje) };
    const venc = movs.filter((m) => m.status === "pendente" && within(m.due_date, w) && (m.type !== "entrada" || ehContaAReceber(m))).sort((a, b) => a.due_date.localeCompare(b.due_date));
    const lRec = venc.filter((m) => m.type === "entrada"), lPag = venc.filter((m) => m.type === "saida");
    const receb = lRec.reduce((s, m) => s + Math.abs(m.amount), 0);
    const pagar = lPag.reduce((s, m) => s + Math.abs(m.amount), 0);
    if (venc.length === 0) return R(`Nada vence ${w.label}. Sem títulos pendentes nesse intervalo.`, [], ["agenda de vencimentos"]);
    return R(
      `${w.label.charAt(0).toUpperCase() + w.label.slice(1)} vencem ${venc.length} título(s): ${fmt(receb)} a receber e ${fmt(pagar)} a pagar — resultado de ${fmt(receb - pagar)} no caixa.`,
      [L("A receber", fmt(receb), lRec, "receber"), L("A pagar", fmt(pagar), lPag, "pagar"), L("Líquido", fmt(receb - pagar), venc, "fluxoMes")],
      ["agenda de vencimentos"]);
  }

  // ——— INADIMPLÊNCIA / quem está atrasado ———
  if (/inadimpl|em atraso|atrasad|quem.*dev|devendo|devedor|clientes? devendo|vencid|caloteir|pior (cliente|pagador)|cliente que (mais )?(atrasa|deve)/.test(p)) {
    const venc = movs.filter((m) => ehContaAReceber(m) && m.status === "pendente" && m.due_date.slice(0, 10) < hoje);
    const total = venc.reduce((s, m) => s + Math.abs(m.amount), 0);
    if (venc.length === 0) return R("Nenhum recebível está vencido no momento — sua carteira está em dia.", [T("Em atraso", fmt(0), "vencidos")], ["recebíveis vencidos"]);
    const porCliente = topClientes(venc, nomes, 3);
    const lista = porCliente.map((c) => `${c.nome} (${fmt(c.valor)})`).join(", ");
    return {
      ...R(
        `Há ${fmt(total)} vencidos e não pagos em ${venc.length} título(s). Os maiores devedores: ${lista}. Vale priorizar a cobrança desses clientes.`,
        porCliente.slice(0, 3).map((c) => L(c.nome, fmt(c.valor), c.movs, "vencidos")),
        ["recebíveis vencidos", "motor de inadimplência"]),
      ...(topId(venc) ? { contatoId: topId(venc) } : {}),
    };
  }

  // ——— MAIOR / MELHOR CLIENTE ———
  // Defere frases de concentração/dependência ("quanto representa meu maior
  // cliente") para o intent de CONCENTRAÇÃO abaixo — senão "maior cliente" as
  // rouba por substring.
  if (/(maior(es)?|melhor(es)?|principa(l|is)) clientes?|cliente (mais |que mais )?(rent[áa]ve|lucrativ|valioso|importante)|quem (mais|s[ãa]o) (paga|compra|fatura|me paga|meus? (melhor|maior))|quem (me )?paga mais|qual cliente (mais )?(compr\w*|pag\w*|fatur\w*|vend\w*|gast\w*)|cliente que (mais )?(compr\w*|pag\w*)|quem (mais )?compr\w* (comigo|de mim|aqui|mais)|top clientes?|melhores clientes|(quero ver|mostra|me mostra|lista|ver) (meus |os )?clientes/.test(p) && !/representa|depend|concentra|forneced|quant(os|as)/.test(p)) {
    const w = janela(p, hoje);
    const ent = movs.filter((m) => ehReceitaDeVenda(m) && m.status === "pago" && within(cashDate(m), w));
    const top = topClientes(ent, nomes, 4).filter((c) => c.valor > 0 && c.nome !== "Sem cliente").slice(0, 3);
    if (top.length === 0) return R(`Não há receita paga por cliente identificado ${w.label}.`, [], ["receita por cliente"]);
    const tot = ent.reduce((s, m) => s + Math.abs(m.amount), 0);
    const share = tot > 0 ? Math.round((top[0].valor / tot) * 100) : 0;
    return {
      ...R(
        `O maior cliente ${w.label} é ${top[0].nome}, com ${fmt(top[0].valor)} — ${share}% da receita do período. Na sequência: ${top.slice(1).map((c) => `${c.nome} (${fmt(c.valor)})`).join(", ") || "—"}.`,
        top.map((c) => L(c.nome, fmt(c.valor), c.movs, "extrato")),
        ["receita por cliente"], 0.9,
        barras(`Receita por cliente ${w.label}`, "entrada", top)),
      ...(topId(ent) ? { contatoId: topId(ent) } : {}),
    };
  }

  // ——— CONCENTRAÇÃO / DEPENDÊNCIA de cliente (risco) — últimos 6 meses ———
  if (/concentra[çc][ãa]o|\bdependo\b|depend[êe]ncia (de|dos|do)|risco de concentra|quanto (representa|vale) (o )?meu maior cliente|quanto (cada cliente|meus clientes) (representa|vale)|representatividade (dos?|de) client|participa[çc][ãa]o (dos?|de) client|(muito )?dependente de (algum |um )?cliente|um cliente s[óo]/.test(p)) {
    const base = new Date(hoje + "T00:00:00"); base.setMonth(base.getMonth() - 5);
    const from = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-01`;
    const w: Janela = { label: "nos últimos 6 meses", from, to: hoje };
    const ent = movs.filter((m) => m.type === "entrada" && m.status === "pago" && within(cashDate(m), w));
    const top = topClientes(ent, nomes, 5).filter((c) => c.valor > 0 && c.nome !== "Sem cliente");
    const tot = ent.reduce((s, m) => s + Math.abs(m.amount), 0);
    if (!top.length || tot <= 0) return R("Ainda não há receita por cliente identificado suficiente para medir concentração.", [], ["receita por cliente"]);
    const share = Math.round((top[0].valor / tot) * 100);
    const top3 = Math.round((top.slice(0, 3).reduce((s, c) => s + c.valor, 0) / tot) * 100);
    const alerta = share >= 30
      ? `Atenção: ${share}% da sua receita depende de ${top[0].nome} — concentração alta, um risco se esse cliente sair.`
      : `Saudável: seu maior cliente (${top[0].nome}) é ${share}% da receita, sem dependência crítica.`;
    return {
      ...R(
        `${alerta} Os 3 maiores respondem por ${top3}% da receita dos últimos 6 meses.`,
        [B(`Maior (${top[0].nome})`, `${share}%`, top[0].movs, "extrato"), B("Top 3", `${top3}%`, top.slice(0, 3).flatMap((c) => c.movs), "extrato"), L("Receita 6m", fmt(tot), ent, "extrato")],
        ["receita por cliente", "índice de concentração"], 0.88,
        barras("Receita por cliente · últimos 6 meses", "entrada", top)),
      ...(topId(ent) ? { contatoId: topId(ent) } : {}),
    };
  }

  // ——— MIX DE RECEITA: PRODUTO vs SERVIÇO ("recebo mais de produto ou serviço?") ———
  // Antes da comparação mês a mês (senão "mais" a puxa p/ comparação de meses).
  if (/(produto|vend\w*|mercadoria)\w*\s*(ou|vs|versus|contra|x|ou de)\s*servi|servi\w*\s*(ou|vs|versus|contra|x)\s*(produto|vend|mercadoria)|(produto|vend|servi)\w*.{0,18}(ou|vs).{0,18}(produto|vend|servi)/.test(p)) {
    const w = janela(p, hoje);
    const ent = movs.filter((m) => m.type === "entrada" && m.status === "pago" && within(cashDate(m), w));
    const cat = (m: RiskMovement) => (m.category || "").toLowerCase();
    const lProd = ent.filter((m) => /venda|produto|mercadoria/.test(cat(m))), lServ = ent.filter((m) => /servi/.test(cat(m)));
    const prod = lProd.reduce((s, m) => s + Math.abs(m.amount), 0);
    const serv = lServ.reduce((s, m) => s + Math.abs(m.amount), 0);
    if (prod > 0 || serv > 0) {
      const maior = prod === serv ? "empate" : prod > serv ? "mais de produtos" : "mais de serviços";
      return R(
        `${w.label.charAt(0).toUpperCase() + w.label.slice(1)} você recebeu ${fmt(prod)} de produtos e ${fmt(serv)} de serviços — ${maior}.`,
        [L("Produtos", fmt(prod), lProd, "extrato"), L("Serviços", fmt(serv), lServ, "extrato")],
        ["receita por tipo (produto/serviço)"]);
    }
  }

  // ——— COMPARAÇÃO ENTRE DOIS MESES NOMEADOS ("gastei mais em maio ou junho?") ———
  {
    const achados = MES.map((_, i) => i).filter((i) => new RegExp(`(^|[^a-zà-ú])${MES[i]}([^a-zà-ú]|$)`, "i").test(p));
    if (achados.length === 2 && /(mais|menos|compar|\bou\b|vs|versus|diferen)/.test(p)) {
      const hojeD = new Date(hoje + "T00:00:00"); const cm = hojeD.getMonth(), cy = hojeD.getFullYear();
      const pad = (n: number) => String(n).padStart(2, "0");
      const winOf = (mi: number): Janela => { const yy = mi > cm ? cy - 1 : cy; return { label: `${MES[mi]}${yy !== cy ? `/${yy}` : ""}`, from: `${yy}-${pad(mi + 1)}-01`, to: `${yy}-${pad(mi + 1)}-${new Date(yy, mi + 1, 0).getDate()}` }; };
      const tipo: "entrada" | "saida" = /receb|receita|fatur|entr|vend/.test(p) ? "entrada" : "saida";
      const [wa, wb] = [winOf(achados[0]), winOf(achados[1])];
      const doMes = (w: Janela) => movs.filter((m) => m.type === tipo && m.status === "pago" && within(cashDate(m), w));
      const soma = (l: RiskMovement[]) => l.reduce((s, m) => s + Math.abs(m.amount), 0);
      const la = doMes(wa), lb = doMes(wb);
      const va = soma(la), vb = soma(lb);
      const verbo = tipo === "entrada" ? "recebidos" : "pagos";
      const maior = va >= vb ? wa : wb;
      return R(
        `Foram ${verbo} ${fmt(va)} em ${wa.label} e ${fmt(vb)} em ${wb.label} — ${va === vb ? "empate" : `mais em ${maior.label} (${fmt(Math.abs(va - vb))} de diferença)`}.`,
        [L(cap(wa.label), fmt(va), la, "extrato"), L(cap(wb.label), fmt(vb), lb, "extrato")],
        ["comparação por mês"]);
    }
  }

  // ——— POR CONTRAPARTE (cliente/fornecedor citado na pergunta) ———
  if (nomes && /(quanto|gast|paguei|recebi|receb|devo|deve|com|para|pro|pra|hist[óo]rico|mostr|abr[ai]|ficha|ver o|dados d|perfil d)/.test(p)) {
    // casa o nome como PALAVRA (limites), não substring solto — evita
    // "Sol"⊂"saldo"/"Casa"⊂"na casa" sequestrarem perguntas genéricas.
    const alvo = Object.entries(nomes).find(([, n]) => {
      const t = (n || "").toLowerCase().trim();
      if (t.length < 4) return false;
      const esc = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`(^|[^a-zà-ú0-9])${esc}([^a-zà-ú0-9]|$)`, "i").test(p);
    });
    if (alvo) {
      const [id, nome] = alvo;
      // Escopo por período SÓ quando a pergunta cita um ("recebi da Alpha em maio");
      // sem período, mostra o histórico completo da contraparte.
      const temPeriodo = /hoje|ontem|amanh|semana|m[êe]s|\bano\b|trimestre|semestre|\bdias\b|passad|anterior|[úu]ltim/.test(p)
        || MES.some((nm) => new RegExp(`(^|[^a-zà-ú])${nm}([^a-zà-ú]|$)`, "i").test(p));
      const jw = temPeriodo ? janela(p, hoje) : null;
      const doParty = movs.filter((m) => m.party_id === id && (!jw || within(cashDate(m), jw)));
      const janelaTxt = jw ? ` ${jw.label}` : "";
      const lRec = doParty.filter((m) => m.type === "entrada" && m.status === "pago");
      const lPag = doParty.filter((m) => m.type === "saida" && m.status === "pago");
      const recebido = lRec.reduce((s, m) => s + Math.abs(m.amount), 0);
      const pago = lPag.reduce((s, m) => s + Math.abs(m.amount), 0);
      const aberto = doParty.filter((m) => m.status === "pendente").reduce((s, m) => s + (m.type === "entrada" ? Math.abs(m.amount) : -Math.abs(m.amount)), 0);
      const partes: string[] = [];
      if (recebido > 0) partes.push(`recebeu ${fmt(recebido)}`);
      if (pago > 0) partes.push(`pagou ${fmt(pago)}`);
      const abertoTxt = Math.abs(aberto) > 0.5 ? ` Em aberto: ${fmt(Math.abs(aberto))} ${aberto > 0 ? "a receber" : "a pagar"}.` : "";
      return {
        ...R(
          `Com ${nome}${janelaTxt} você ${partes.join(" e ") || "não teve movimento realizado"} em ${doParty.length} lançamento(s).${abertoTxt}`,
          [...(recebido > 0 ? [L("Recebido", fmt(recebido), lRec, "extrato")] : []), ...(pago > 0 ? [L("Pago", fmt(pago), lPag, "extrato")] : [])],
          ["histórico por contraparte"]),
        contatoId: id,
      };
    }
  }

  // ——— MAIOR GASTO INDIVIDUAL (singular) ———
  if (/maior (gasto|despesa|conta|pagamento|sa[íi]da)\b|gasto mais (alto|caro)|meu maior gasto/.test(p)) {
    const w = janela(p, hoje);
    const sai = movs.filter((m) => m.type === "saida" && m.status === "pago" && within(cashDate(m), w));
    if (!sai.length) return R(`Nenhum gasto pago ${w.label}.`, [], ["despesas realizadas"]);
    const maior = sai.reduce((a, b) => (Math.abs(b.amount) > Math.abs(a.amount) ? b : a));
    const nome = (maior.party_id && nomes?.[maior.party_id]) || maior.category || "Despesa";
    return {
      ...R(
        `O maior gasto ${w.label} foi ${fmt(Math.abs(maior.amount))} — ${cap(String(nome))}${maior.category ? ` (${maior.category})` : ""}, em ${dia(cashDate(maior))}.`,
        [L("Maior gasto", fmt(Math.abs(maior.amount)), [maior], "extrato")], ["despesas realizadas"]),
      ...(maior.party_id ? { contatoId: maior.party_id } : {}),
    };
  }

  // ——— MAIOR RECEBIMENTO INDIVIDUAL (singular) ———
  if (/maior (recebimento|entrada|venda|receita|dep[óo]sito)\b|recebimento mais (alto|caro)|maior (valor )?recebido|minha maior (venda|entrada)/.test(p)) {
    const w = janela(p, hoje);
    const ent = movs.filter((m) => m.type === "entrada" && m.status === "pago" && within(cashDate(m), w));
    if (!ent.length) return R(`Nenhum recebimento pago ${w.label}.`, [], ["receita realizada"]);
    const maior = ent.reduce((a, b) => (Math.abs(b.amount) > Math.abs(a.amount) ? b : a));
    const nome = (maior.party_id && nomes?.[maior.party_id]) || maior.category || "Recebimento";
    return {
      ...R(
        `O maior recebimento ${w.label} foi ${fmt(Math.abs(maior.amount))} — ${cap(String(nome))}${maior.category ? ` (${maior.category})` : ""}, em ${dia(cashDate(maior))}.`,
        [L("Maior recebimento", fmt(Math.abs(maior.amount)), [maior], "extrato")], ["receita realizada"]),
      ...(maior.party_id ? { contatoId: maior.party_id } : {}),
    };
  }

  // ——— DE ONDE VEM A RECEITA (top categorias de entradas pagas) ———
  if (/(de onde|da onde).*(vem|v[êe]m|veio|vier).*(receita|dinheiro|faturamento|grana|entra)|origem (da|das) receita|receita por categoria|categorias? de (receita|entrada|faturamento)|de onde (vem|veio) (o|a) (dinheiro|receita)|(maior|principal) fonte de (receita|renda|faturamento)|fonte de (receita|renda)/.test(p)) {
    const w = janela(p, hoje);
    const pagas = movs.filter((m) => m.type === "entrada" && m.status === "pago" && within(cashDate(m), w));
    const ent = pagas.filter(ehReceitaDeVenda);
    const top = topCategorias(ent, 5);
    const tot = ent.reduce((s, m) => s + Math.abs(m.amount), 0);
    if (top.length === 0) return R(`Não encontrei receita paga ${w.label}.${foraDaReceita(pagas.filter((m) => !ehReceitaDeVenda(m)))}`, [], ["receita por categoria"]);
    const lista = top.slice(0, 3).map((c) => `${c.nome} (${fmt(c.valor)}, ${tot > 0 ? Math.round((c.valor / tot) * 100) : 0}%)`).join(", ");
    return R(
      `A receita apurada ${w.label} soma ${fmt(tot)} e concentra-se em: ${lista}.${foraDaReceita(pagas.filter((m) => !ehReceitaDeVenda(m)))}`,
      top.slice(0, 4).map((c) => L(c.nome, fmt(c.valor), c.movs, "extrato")),
      ["receita por categoria"], 0.9,
      barras(`Receita por categoria ${w.label}`, "entrada", top));
  }

  // ——— POR CENTRO DE CUSTO / PROJETO ———
  if (/centro de custo|por projeto|no projeto|custo por/.test(p)) {
    const w = janela(p, hoje);
    const arr = agrupar(movs.filter((m) => m.type === "saida" && m.status === "pago" && within(cashDate(m), w)),
      (m) => (m.costCenter || "Sem centro").trim() || "Sem centro").sort((a, b) => b[1].valor - a[1].valor);
    if (!arr.length) return R(`Não há gastos com centro de custo definido ${w.label}.`, [], ["despesas por centro de custo"]);
    const top = arr.slice(0, 3);
    return R(`Gastos por centro de custo ${w.label}: ${top.map(([n, g]) => `${cap(n)} (${fmt(g.valor)})`).join(", ")}.`, top.map(([n, g]) => L(cap(n), fmt(g.valor), g.movs, "extrato")), ["despesas por centro de custo"]);
  }

  // ——— PESO DE UMA CATEGORIA NA RECEITA ("quanto a folha pesa na receita?") ———
  // Antes do gasto-por-categoria: precisa de sinal de PROPORÇÃO + "receita".
  if (/(propor[çc][ãa]o|percentual|\bpes(a|o|am|ou)\b|quanto (%|por cento)|% (da |na )receita|representa .* (da |na )receita|quanto .* representa da receita)/.test(p) && /receita|faturament/.test(p) && /folha|pessoal|funcion|marketing|fornecedor|aluguel|imposto|luz|energia/.test(p)) {
    const w = janela(p, hoje);
    const jm = movs.filter((m) => m.status === "pago" && within(cashDate(m), w));
    const lReceita = jm.filter((m) => m.type === "entrada");
    const receita = lReceita.reduce((s, m) => s + Math.abs(m.amount), 0);
    const cats = Array.from(new Set(jm.filter((m) => m.type === "saida" && m.category).map((m) => (m.category as string).toLowerCase().trim())));
    let alvo = cats.find((c) => { const stem = c.replace(/e?s$/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); return new RegExp(`(^|[^a-zà-ú])${stem}`, "i").test(p); });
    if (!alvo) { const SIN2: [RegExp, RegExp][] = [[/pessoal|funcion|colaborador|folha/, /folha|pessoal|sal[áa]r/], [/\bluz\b|energia|\b[áa]gua\b|internet/, /utilidad|energia|\bluz\b/]]; for (const [wq, cq] of SIN2) { if (wq.test(p)) { const c = cats.find((x) => cq.test(x)); if (c) { alvo = c; break; } } } }
    if (receita > 0 && alvo) {
      const lGasto = jm.filter((m) => m.type === "saida" && (m.category || "").toLowerCase().trim() === alvo);
      const gasto = lGasto.reduce((s, m) => s + Math.abs(m.amount), 0);
      const pct = Math.round((gasto / receita) * 1000) / 10;
      return R(`${cap(alvo)} representa ${pct}% da sua receita ${w.label}: ${fmt(gasto)} de ${fmt(receita)} recebidos.`,
        [B(`${cap(alvo)} / receita`, `${pct}%`, [...lGasto, ...lReceita], "extrato"), L(cap(alvo), fmt(gasto), lGasto, "extrato"), L("Receita", fmt(receita), lReceita, "extrato")], ["custo sobre receita"]);
    }
  }

  // ——— GASTO COM UMA CATEGORIA ESPECÍFICA ("quanto gastei com marketing?") ———
  // Casa dinamicamente com QUALQUER categoria de despesa que o cliente tenha.
  {
    const cats = Array.from(new Set(movs.filter((m) => m.type === "saida" && m.category).map((m) => (m.category as string).toLowerCase().trim()))).filter((c) => c.length >= 3);
    let alvo = cats.sort((a, b) => b.length - a.length).find((c) => { const stem = c.replace(/e?s$/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); return new RegExp(`(^|[^a-zà-ú])${stem}(e?s)?([^a-zà-ú]|$)`, "i").test(p); });
    // Sinônimos → categoria: "gasto com pessoal" = Folha; "conta de luz" = utilidades.
    if (!alvo) {
      const SIN: { when: RegExp; cat: RegExp }[] = [
        { when: /pessoal|funcion[áa]ri|colaborador|\bequipe\b|sal[áa]ri|folha de pagament|m[ãa]o de obra/, cat: /folha|pessoal|sal[áa]r/ },
        { when: /\bluz\b|energia|\b[áa]gua\b|internet|telefone|conta de consumo|utilidade/, cat: /utilidad|energia|\bluz\b|[áa]gua|consumo/ },
        { when: /aluguel|loca[çc][ãa]o do (im[óo]vel|ponto)/, cat: /aluguel|loca[çc]/ },
      ];
      for (const sy of SIN) { if (sy.when.test(p)) { const c = cats.find((x) => sy.cat.test(x)); if (c) { alvo = c; break; } } }
    }
    // Guarda de direção: "quanto ENTRA/recebo de Vendas" é receita — não deixar
    // o "quanto" genérico puxar p/ gasto quando há uma saída com o mesmo nome de
    // categoria (ex.: uma despesa cadastrada como "Vendas"). Sinais de entrada
    // devolvem o controle ao bloco de RECEITA por categoria (logo abaixo).
    if (alvo && /(gast|paguei|despes|quanto|custo)/.test(p) && !/(entr|receb|receita|fatur|ganh|origem|vem de)/.test(p) && !/quant(os|as)\b/.test(p)) {
      const w = janela(p, hoje);
      const sai = movs.filter((m) => m.type === "saida" && m.status === "pago" && (m.category || "").toLowerCase().trim() === alvo && within(cashDate(m), w));
      const tot = sai.reduce((s, m) => s + Math.abs(m.amount), 0);
      return R(`Foram pagos ${fmt(tot)} em ${cap(alvo)} ${w.label}, em ${sai.length} pagamento(s).`, [L(cap(alvo), fmt(tot), sai, "extrato")], ["despesas da categoria"]);
    }
  }

  // ——— RECEITA DE UMA FONTE ESPECÍFICA ("quanto recebi de venda/serviço?") ———
  {
    const cats = Array.from(new Set(movs.filter((m) => m.type === "entrada" && m.category).map((m) => (m.category as string).toLowerCase().trim()))).filter((c) => c.length >= 3);
    const alvo = cats.sort((a, b) => b.length - a.length).find((c) => { const stem = c.replace(/e?s$/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); return new RegExp(`(^|[^a-zà-ú])${stem}(e?s)?([^a-zà-ú]|$)`, "i").test(p); });
    // guarda: perguntas de crescimento/tendência ("minhas vendas tão crescendo?")
    // vão para o intent de CRESCIMENTO abaixo, não para a soma da categoria.
    if (alvo && /(receb|recebi|receita|fatur|entr|vend)/.test(p) && !/cresc|subind|caind|aument|tend[êe]nci|desacelerand|melhorand/.test(p)) {
      const w = janela(p, hoje);
      const ent = movs.filter((m) => m.type === "entrada" && m.status === "pago" && (m.category || "").toLowerCase().trim() === alvo && within(cashDate(m), w));
      const tot = ent.reduce((s, m) => s + Math.abs(m.amount), 0);
      return R(`Foram recebidos ${fmt(tot)} de ${cap(alvo)} ${w.label}, em ${ent.length} entrada(s).`, [L(cap(alvo), fmt(tot), ent, "extrato")], ["receita da categoria"]);
    }
  }

  // ——— MAIORES GASTOS / por categoria ———
  if ((/(maior(es)?|principa|onde|com o que|em que).*(gast|despes|custo)|gast(ei|os)? com|gastando (muito )?com|com (o )?qu[êe].*(gast|despes)|gast.*com (o )?qu[êe]|por categoria|categorias? de (gasto|despesa)|no que.*gast|(com o que|no que|onde|em que) (eu )?mais torr|torro (dinheiro|grana|meu dinheiro)|onde (vai|est[áa] indo) (o |meu )?dinheiro|pra onde (vai|foi)|quais? categorias?|categorias?.*(gast|despes)|(despesa|categoria) (que )?(mais )?(pesa|pega|custa|consome|sai)|categoria que mais (pesa|custa|gasta|consome|sai)|o que (eu )?mais (pago|gasto)|no que (eu )?mais (gasto|pago)|(custos?|gastos?) fix|qual (o )?(meu )?(maior )?custo|(me )?(diz|mostra|lista) (os )?(meus )?gastos|(meus|os meus) gastos\b|custa (pra |para )?manter|custo (de |pra |para )?manter/.test(p)) && !/economiz|cortar|reduzir/.test(p)) {
    const w = janela(p, hoje);
    const sai = movs.filter((m) => m.type === "saida" && m.status === "pago" && within(cashDate(m), w));
    const top = topCategorias(sai, 5);
    const tot = sai.reduce((s, m) => s + Math.abs(m.amount), 0);
    if (top.length === 0) return R(`Não encontrei gastos pagos ${w.label}.`, [], ["despesas por categoria"]);
    const lista = top.slice(0, 3).map((c) => `${c.nome} (${fmt(c.valor)}, ${Math.round((c.valor / tot) * 100)}%)`).join(", ");
    return R(
      `Os maiores gastos ${w.label} totalizam ${fmt(tot)} e concentram-se em: ${lista}.`,
      top.slice(0, 4).map((c) => L(c.nome, fmt(c.valor), c.movs, "extrato")),
      ["despesas por categoria"], 0.9,
      barras(`Despesas por categoria ${w.label}`, "saida", top));
  }

  // ——— TOP FORNECEDORES ———
  /**
   * ⚠️ **FOLHA E PRÓ-LABORE NÃO SÃO FORNECEDOR, e responder que são derruba a
   * confiança no resto.** Medido numa organização real: "qual meu maior
   * fornecedor" respondia *"Folha Funcionarios (R$65.441,24), Pro Labore Socios
   * (R$18.000,00)"* — as duas maiores contrapartes de SAÍDA. Não é falso (o
   * dinheiro sai mesmo para elas), mas para um dono de empresa "fornecedor" é
   * quem lhe VENDE, não quem trabalha nele. Uma resposta que soa errada
   * contamina as nove certas ao lado.
   *
   * ⚠️ Quem decide o que é folha é o classificador CANÔNICO — o mesmo que o DRE
   * usa para montar a linha. Um regex próprio aqui criaria a segunda definição
   * de folha do produto, e no dia em que uma mudasse a IA e o DRE passariam a
   * discordar sobre a mesma despesa.
   *
   * A pergunta sobre folha continua com resposta: quem pergunta de folha cai no
   * bloco de despesa por categoria, que a soma inteira.
   */
  if (/(maior(es)?|principa|top|para quem|pra quem).*(fornecedor|fornec)|(fornecedor|fornec)\w*.*(cust|cobra|mais car|sai\w* mais|mais caro|gasto)|quem mais (recebo de mim|me cobra|eu pago)|p(a|ra) quem (eu )?(mais )?pago|quem eu mais pago/.test(p)) {
    const w = janela(p, hoje);
    const sai = movs.filter((m) =>
      m.type === "saida" && m.status === "pago" && within(cashDate(m), w)
      && classificarDespesa(m.category) !== "folha");
    const top = topClientes(sai, nomes, 4).filter((c) => c.valor > 0 && c.nome !== "Sem cliente").slice(0, 3);
    if (!top.length) return R(`Não há pagamentos a fornecedor identificado ${w.label}.`, [], ["pagamentos por fornecedor"]);
    return {
      ...R(`Os principais fornecedores ${w.label} são: ${top.map((c) => `${c.nome} (${fmt(c.valor)})`).join(", ")}.`,
        top.map((c) => L(c.nome, fmt(c.valor), c.movs, "extrato")), ["pagamentos por fornecedor"], 0.9,
        barras(`Pagamentos por fornecedor ${w.label}`, "saida", top)),
      ...(topId(sai) ? { contatoId: topId(sai) } : {}),
    };
  }

  // ——— QUANTOS clientes/fornecedores ———
  if (/quant(os|as) (clientes|fornecedores|contatos|parceiros|contrapartes)/.test(p)) {
    const forn = /fornecedor/.test(p);
    const tipo: "entrada" | "saida" = forn ? "saida" : "entrada";
    const comParte = movs.filter((m) => m.type === tipo && m.party_id);
    const set = new Set(comParte.map((m) => m.party_id as string));
    return R(`Há ${set.size} ${forn ? "fornecedor(es)" : "cliente(s)"} com movimento registrado.`, [B(forn ? "Fornecedores" : "Clientes", String(set.size), comParte, "extrato")], ["contrapartes"]);
  }

  // ——— ONDE ECONOMIZAR / CORTAR (categoria que mais cresceu MoM) ———
  if (/onde (posso |d[áa] (pra|para) )?(economiz|cortar|reduzir|cortar gasto)|como economizar|gastar menos|reduzir (custo|despesa|gasto)|onde estou gastando (mais|demais)|preciso (cortar|reduzir|economiz)|(devo|posso) cortar|cortar (os )?(gasto|custo|despesa)/.test(p)) {
    const wA = janela("mês", hoje), wB = janela("mês passado", hoje);
    const catW = (w: Janela) => new Map(agrupar(movs.filter((m) => m.type === "saida" && m.status === "pago" && within(cashDate(m), w)),
      (m) => (m.category || "Outros").trim() || "Outros"));
    const atual = catW(wA), ant = catW(wB);
    // ⚠️ Sem NENHUMA despesa paga no mês passado não há base de comparação — e
    // "Fornecedor subiu R$ 179 mil vs. o mês passado" é a categoria inteira
    // lida como aumento. Ausência de base é ausência de resposta (ONDA 4): diz
    // que não há como comparar e aponta onde o dinheiro está indo agora.
    if (ant.size === 0 && atual.size > 0) {
      const top = Array.from(atual.entries()).sort((x, y) => y[1].valor - x[1].valor).slice(0, 3);
      return R(
        `Não há despesa paga ${wB.label} para comparar, então não dá para dizer o que subiu. ${cap(wA.label)}, as maiores despesas pagas são: ${top.map(([c, g]) => `${cap(c)} (${fmt(g.valor)})`).join(", ")} — é por elas que um corte teria mais impacto.`,
        top.map(([c, g]) => L(cap(c), fmt(g.valor), g.movs, "extrato")),
        ["despesas por categoria (mês vs. mês)"]);
    }
    let melhor: { c: string; v: number; d: number; movs: RiskMovement[] } | null = null;
    for (const [c, g] of Array.from(atual)) { const d = g.valor - (ant.get(c)?.valor || 0); if (d > (melhor?.d ?? 0)) melhor = { c: cap(c), v: g.valor, d, movs: g.movs }; }
    if (melhor && melhor.d > 0) {
      return R(
        `Melhor lugar para cortar: ${melhor.c} subiu ${fmt(melhor.d)} vs. o mês passado (${fmt(melhor.v)} este mês). Reduzir aí tem o maior impacto imediato.`,
        [L(melhor.c, fmt(melhor.v), melhor.movs, "extrato"), T("Alta vs. mês ant.", `+${fmt(melhor.d)}`, "variacao")],
        ["despesas por categoria (mês vs. mês)"]);
    }
    return R("Nenhuma categoria de despesa cresceu vs. o mês passado — seus gastos estão controlados. Veja as maiores despesas para priorizar cortes.", [], ["despesas por categoria (mês vs. mês)"]);
  }

  // ——— MARGEM (a margem LÍQUIDA do DRE — a mesma conta do relatório) ———
  /*
   * ⚠️ Era a margem de CAIXA: (entradas − saídas pagas) ÷ entradas pagas. Medido
   * na demonstração, setembro/2026: a IA respondia "a margem é 39%" e o DRE do
   * mesmo mês, na coluna do Resultado Líquido, 56,4% (resultado ÷ receita
   * líquida). Mesma palavra, duas contas — e a de caixa nem se chamava de caixa.
   * O EBITDA já tinha migrado para a cascata pelo mesmo motivo; a margem ficou
   * para trás. Agora ela LÊ a cascata: nenhuma agregação própria.
   */
  if (/margem|lucratividade|% de lucro|percentual de lucro|quanto sobra de cada|quanto (me )?sobra (de|por) (real|venda)/.test(p)) {
    const w = janela(p, hoje);
    const c = dreDaJanela(input, w);
    const bruta = /\bbrut[ao]\b/.test(p);
    const linha = bruta ? c.linhas.lucro_bruto : c.linhas.resultado_liquido;
    const margem = bruta ? c.margemBruta : c.margemLiquida;
    const nome = bruta ? "margem bruta" : "margem líquida";
    const nomeLinha = bruta ? "lucro bruto" : "resultado líquido";
    const origem = origemDaCascata(c, w, bruta ? ["receita_bruta", "deducoes", "custos_variaveis"] : LINHAS_DO_RESULTADO);
    if (linha.indisponivel) {
      return R(`Não é possível afirmar a ${nome} ${w.label}: ${linha.indisponivel.motivo}.${linha.indisponivel.comoResolver ? ` ${linha.indisponivel.comoResolver}` : ""}`,
        [], ["DRE gerencial"]);
    }
    // ⚠️ Sem receita não existe margem — e "0%" leria "vendeu e não sobrou nada".
    if (margem.indisponivel) {
      return R(`Sem receita líquida ${w.label}, não existe ${nome} a calcular (${margem.indisponivel.motivo}). O ${nomeLinha} do período é ${fmt(linha.valor)}. ${origem}`,
        [T(cap(nomeLinha), fmt(linha.valor), "dre")], ["DRE gerencial"]);
    }
    const m = pctBR(margem.valor);
    return R(
      `A ${nome} ${w.label} é ${m}: ${nomeLinha} de ${fmt(linha.valor)} sobre ${fmt(c.linhas.receita_liquida.valor)} de receita líquida, pelo DRE (competência) — a mesma conta do relatório. ${origem}`,
      [T(cap(nome), m, "dre"), T("Receita líquida", fmt(c.linhas.receita_liquida.valor), "dre"), T(cap(nomeLinha), fmt(linha.valor), "dre")],
      ["DRE gerencial", nome]);
  }

  // ——— CRESCIMENTO da receita (mês atual vs. mês anterior) ———
  if (/(estou |est[áa] |venho |vem )?cresc|crescimento|cresci|em alta|em queda|desacelerand|(minhas? )?(receita|vendas?) (t[ãáa]o?|est[áa]|est[ãa]o|vem|v[ãa]o) (subindo|crescendo|caindo|melhorando)|(receita|faturament\w*|vendas?) (subiu|caiu|cresceu|aument\w*|diminuiu|melhorou|piorou|subindo|caindo)|(estou|t[ôo]|to) (vendendo|faturando) (mais|menos)|vendendo (mais|menos) que|tend[êe]ncia|(estou|t[ôo]|to) (melhorando|piorando)|melhorando ou piorando|indo (melhor|pior)|\b(piorei|melhorei)\b|(resultado|neg[óo]cio|situa[çc][ãa]o) (melhorou|piorou)|(melhorou|piorou) (esse|este|no) m[êe]s/.test(p)) {
    const atual = janela("mês", hoje), ant = janela("mês passado", hoje);
    const doMes = (w: Janela) => movs.filter((m) => m.type === "entrada" && m.status === "pago" && within(cashDate(m), w));
    const la = doMes(atual), lb = doMes(ant);
    const a = la.reduce((s, m) => s + Math.abs(m.amount), 0), b = lb.reduce((s, m) => s + Math.abs(m.amount), 0);
    if (b <= 0) return R(`Ainda não há receita no mês anterior para comparar o crescimento. Este mês você recebeu ${fmt(a)}.`, [L(cap(atual.label), fmt(a), la, "extrato")], ["receita realizada"]);
    const pct = Math.round(((a - b) / b) * 100);
    const dir = a > b ? "crescendo" : a < b ? "caindo" : "estável";
    return R(
      `A receita está ${dir}: ${fmt(a)} ${atual.label} contra ${fmt(b)} ${ant.label} — variação de ${pct >= 0 ? "+" : ""}${pct}% no mês. ${a >= b ? "Recomenda-se manter o ritmo comercial." : "Recomenda-se investigar a origem da queda."}`,
      [L(cap(atual.label), fmt(a), la, "extrato"), L(cap(ant.label), fmt(b), lb, "extrato"), B("Crescimento", `${pct >= 0 ? "+" : ""}${pct}%`, [...la, ...lb], "extrato")],
      ["receita realizada (mês vs. mês)"], 0.9,
      { tipo: "linha", titulo: "Receita mensal · últimos 6 meses", tom: "entrada", dados: serieMensal(movs, hoje, 6, "receita") });
  }

  // ——— PONTO DE EQUILÍBRIO / break-even (quanto faturar para empatar) ———
  // Nota: "pagar as contas" fica FORA do gatilho — "para pagar" contém a
  // substring "a pagar" e o intent A PAGAR (acima) o captura primeiro. Servimos
  // as frases limpas (empatar / fechar no zero / me pagar / não ter prejuízo).
  if (/ponto de equil[íi]brio|break.?even|equil[íi]brio|quanto preciso (faturar|vender|receber) (para|pra) (empatar|n[ãa]o ter preju[íi]zo|me pagar|fechar no zero)|quanto (tenho|preciso) (que )?(faturar|vender) (para|pra) (empatar|fechar|cobrir|n[ãa]o ter preju)/.test(p)) {
    const ult = agrupar(movs.filter((m) => m.type === "saida" && m.status === "pago" && cashDate(m)), (m) => cashDate(m).slice(0, 7))
      .sort((x, y) => x[0].localeCompare(y[0])).slice(-6);
    if (!ult.length) return R("Ainda não há despesas pagas suficientes para calcular seu ponto de equilíbrio.", [], ["despesas realizadas"]);
    const breakeven = ult.reduce((s, [, g]) => s + g.valor, 0) / ult.length;
    const baseBE = ult.flatMap(([, g]) => g.movs);
    const wMes = janela("mês", hoje);
    const lRecMes = movs.filter((m) => m.type === "entrada" && m.status === "pago" && within(cashDate(m), wMes));
    const recMes = lRecMes.reduce((s, m) => s + Math.abs(m.amount), 0);
    const falta = breakeven - recMes;
    return R(
      `O ponto de equilíbrio é ${fmt(breakeven)}/mês — é o faturamento necessário para cobrir as despesas. Este mês já recebeu ${fmt(recMes)}, ${falta > 0 ? `faltam ${fmt(falta)} para empatar` : `${fmt(-falta)} acima do equilíbrio (no lucro)`}.`,
      [B("Ponto de equilíbrio", fmt(breakeven), baseBE, "extrato"), L("Recebido no mês", fmt(recMes), lRecMes, "extrato"), B(falta > 0 ? "Falta" : "Acima", fmt(Math.abs(falta)), [...baseBE, ...lRecMes], "extrato")],
      ["despesa média mensal", "receita do mês"]);
  }

  // ——— RECEITA MÉDIA POR CLIENTE (LTV proxy) — antes de MÉDIA mensal ———
  // "receita média por cliente" tem "média"+"receita" e cairia na média mensal.
  if (/quanto cada cliente (me )?(rende|vale|gera|paga em m[ée]dia)|receita m[ée]dia por cliente|valor m[ée]dio por cliente|quanto (vale|rende) (cada|um) cliente|receita por cliente m[ée]dia|m[ée]dia por cliente|(recebo|ganho) (em m[ée]dia )?por cliente|por cliente em m[ée]dia|(receb\w*|ganho) de cada cliente|de cada cliente|por cada cliente/.test(p)) {
    const w = janela(p, hoje);
    const ent = movs.filter((m) => m.type === "entrada" && m.status === "pago" && within(cashDate(m), w) && m.party_id);
    const tot = ent.reduce((s, m) => s + Math.abs(m.amount), 0);
    const clientes = new Set(ent.map((m) => m.party_id as string)).size;
    if (!clientes) return R(`Não há receita paga por cliente identificado ${w.label} para calcular a média por cliente.`, [], ["receita por cliente"]);
    const porCliente = tot / clientes;
    return R(
      `Cada cliente rende em média ${fmt(porCliente)} ${w.label} — ${fmt(tot)} de ${clientes} cliente(s) que pagaram. É uma proxy do LTV no período.`,
      [B("Receita/cliente", fmt(porCliente), ent, "extrato"), B("Clientes", String(clientes), ent, "extrato"), L("Receita", fmt(tot), ent, "extrato")],
      ["receita por cliente"], 0.88);
  }

  // ——— MÉDIA mensal (gasto/receita) ———
  if (/m[ée]di[ao]/.test(p) && !/ticket/.test(p) && /(gast|despesa|receb|receita|entr|fatur|m[êe]s|mensal)/.test(p)) {
    // "faturo/faturamento/faturar" = receita → senão a média cai em "saida" (gasto).
    const tipo: "entrada" | "saida" = /receb|receita|entr|fatur/.test(p) ? "entrada" : "saida";
    const meses = agrupar(movs.filter((m) => m.type === tipo && m.status === "pago" && cashDate(m)), (m) => cashDate(m).slice(0, 7))
      .sort((a, b) => a[0].localeCompare(b[0])).slice(-6);
    if (!meses.length) return R("Ainda não há histórico suficiente para calcular a média mensal.", [], ["histórico mensal"]);
    const media = meses.reduce((s, [, g]) => s + g.valor, 0) / meses.length;
    return R(
      `A média ${tipo === "entrada" ? "de receita" : "de gasto"} é ${fmt(media)} por mês, considerando os últimos ${meses.length} ${meses.length === 1 ? "mês" : "meses"}.`,
      [B("Média mensal", fmt(media), meses.flatMap(([, g]) => g.movs), "extrato")], ["histórico mensal"]);
  }

  // ——— AFORDABILIDADE: posso gastar X? — o MESMO simulador da tela "Posso comprar?" ———
  /*
   * ⚠️ Esta resposta tinha regra PRÓPRIA: reserva = 3 × burn, e quando o burn
   * era zero (empresa que gera caixa) ela INVENTAVA um burn de 15% do saldo.
   * Medido na demonstração: "Reserva preservada: ~3 meses (R$ 1.011.982,73)" —
   * 45% do caixa travados por um número que não existe em lugar nenhum. E
   * "posso gastar 20 mil?" e "posso comprar algo de 20 mil?" podiam dar
   * vereditos opostos, porque o segundo já passava pelo simulador.
   * Agora os dois passam pelo `simularAquisicao` sobre o `situacaoDe` — a
   * mesma reserva da tela (3 meses de DESPESA média, não de burn).
   */
  if (/(posso|consigo|d[áa] (pra|para)|tenho como|cabe|compensa|vale a pena|devo|aguento|suporto).*(gastar|comprar|investir|investiment|pagar|gasto|contratar|tirar|retirar|sacar|distribuir|despesa|aumento|reajuste|sal[áa]rio|nova? (contrata|despesa|conta))|(posso|consigo|d[áa] (pra|para)) contratar|cabe (um|uma|no) (aumento|reajuste|sal[áa]rio|contrata|caixa|or[çc]amento)|tenho (dinheiro|grana|caixa) (pra|para)|(quanto )?tenho (pra|para) (investir|gastar|comprar)|reserva suficiente|tenho reserva|minha reserva (t[áa]|est[áa]|d[áa])|(t[áa]|est[áa]) reservad|quanto (t[áa]|est[áa]) reservad|quanto (guardei|reservei)/.test(p)) {
    const nm = p.replace(/r\$\s*/g, "").match(/(\d[\d.]*(,\d+)?)\s*(milh\w*|mil|k|mi)?/);
    const mult = nm && nm[3] ? (/milh|^mi$/.test(nm[3]) ? 1_000_000 : 1_000) : 1;
    const valor = nm ? parseFloat(nm[1].replace(/\./g, "").replace(",", ".")) * mult : 0;
    const sit = situacaoDe(input);
    const reserva = sit.despesaMensal * RESERVA_IDEAL;
    const folga = Math.max(0, sit.caixaAtual - reserva);
    const mesesTxt = (n: number) => (n >= 99 ? "mais de 99" : decimalBR(n));
    if (valor <= 0) {
      const cobre = sit.despesaMensal > 0 ? ` O caixa de ${fmt(sit.caixaAtual)} cobre ${mesesTxt(sit.caixaAtual / sit.despesaMensal)} meses da despesa média (${fmt(sit.despesaMensal)}/mês).` : "";
      return R(
        `Preservando ${RESERVA_IDEAL} meses de despesa média (${fmt(reserva)}), a folga do caixa é de ${fmt(folga)}.${cobre} Diga um valor que eu digo se cabe.`,
        [T("Folga segura", fmt(folga), "simulador"), T(`Reserva (${RESERVA_IDEAL} meses de despesa)`, fmt(reserva), "simulador")],
        ["simulador de decisão (seu caixa, entradas e saídas reais)"]);
    }
    // Contratar, dar aumento ou tirar pró-labore RECORRENTE é custo por mês, não
    // desembolso único — o simulador trata como custo mensal, sem entrada.
    const mensal = /contrat|sal[áa]ri|aumento|reajuste|por m[êe]s|todo m[êe]s|mensal/.test(p);
    const r = simularAquisicao(sit, mensal
      ? { tipo: "contratacao", valor: 0, entrada: 0, parcelas: 0, taxaMensal: 0, custoMensalExtra: valor }
      : { tipo: "outro", valor, entrada: valor, parcelas: 0, taxaMensal: 0 });
    const oQue = mensal ? `assumir ${fmt(valor)} por mês` : `gastar ${fmt(valor)} à vista`;
    const depois = mensal
      ? ` A sobra mensal passa de ${fmt(r.sobraAntes)} para ${fmt(r.sobraDepois)}.`
      : ` O caixa passa a ${fmt(r.caixaDepoisEntrada)}, que cobre ${mesesTxt(r.mesesDeReserva)} meses da despesa média (o ideal é ${RESERVA_IDEAL}).`;
    return R(
      `${VEREDITO_LABEL[r.veredito]}: ${oQue}.${depois} A folga acima da reserva de ${RESERVA_IDEAL} meses de despesa (${fmt(reserva)}) é de ${fmt(folga)} hoje. Abra Orçamento → "Posso comprar?" para simular outras condições.`,
      [
        simulado("Valor", mensal ? `${fmt(valor)}/mês` : fmt(valor)),
        ...(mensal
          ? [simulado("Sobra depois", `${fmt(r.sobraDepois)}/mês`)]
          : [simulado("Caixa depois", fmt(r.caixaDepoisEntrada)), simulado("Reserva depois", `${mesesTxt(r.mesesDeReserva)} meses`)]),
        T("Folga segura hoje", fmt(folga), "simulador"),
      ],
      ["simulador de decisão (seu caixa, entradas e saídas reais)"]);
  }

  // ——— MELHOR / PIOR MÊS (por resultado ou por receita) ———
  if (/(melhor|pior) m[êe]s|m[êe]s (que )?(mais|menos) (vend|fatur|receb|gast|lucr|preju)|meu (melhor|pior) m[êe]s|m[êe]s mais (forte|fraco|bom|ruim)|em que m[êe]s.*(mais|menos)|m[êe]s.*(vend|fatur|receb|gast|lucr|preju).*(mais|menos)|qual m[êe]s (eu )?(tive|teve|fiz|deu|foi|ganhei|lucrei|gastei|vendi|recebi).*(mais|menos)|m[êe]s.*(mais|menos).*(preju|lucr|result|sobr)/.test(p)) {
    // "mais prejuízo/perda" = PIOR mês (mesmo com "mais", não "menos").
    const pior = (/pior|menos|pi[oó]r/.test(p) || /(mais|maior|muito).{0,12}(preju|perda)/.test(p)) && !/melhor/.test(p);
    const porReceita = /(vend|fatur|receb|receita)/.test(p);
    const meses = new Map<string, { rec: number; desp: number; lRec: RiskMovement[]; lDesp: RiskMovement[] }>();
    for (const m of movs) {
      if (m.status !== "pago") continue;
      const k = cashDate(m).slice(0, 7); if (!k) continue;
      const cur = meses.get(k) || { rec: 0, desp: 0, lRec: [], lDesp: [] };
      if (m.type === "entrada") { cur.rec += Math.abs(m.amount); cur.lRec.push(m); } else { cur.desp += Math.abs(m.amount); cur.lDesp.push(m); }
      meses.set(k, cur);
    }
    const arr = Array.from(meses.entries()).map(([k, v]) => ({ k, valor: porReceita ? v.rec : v.rec - v.desp, ...v }));
    if (!arr.length) return R("Ainda não há histórico mensal suficiente para apontar o melhor ou o pior mês.", [], ["histórico mensal"]);
    arr.sort((a, b) => pior ? a.valor - b.valor : b.valor - a.valor);
    const alvo = arr[0];
    const [yy, mm] = alvo.k.split("-");
    const rotulo = `${MES[Number(mm) - 1]}/${yy}`;
    const metrica = porReceita ? "receita" : "resultado";
    return R(
      `O ${pior ? "pior" : "melhor"} mês por ${metrica} foi ${cap(rotulo)}, com ${fmt(alvo.valor)}${porReceita ? "" : ` (${fmt(alvo.rec)} de receita menos ${fmt(alvo.desp)} de despesa)`}.`,
      [L(cap(rotulo), fmt(alvo.valor), porReceita ? alvo.lRec : [...alvo.lRec, ...alvo.lDesp], "extrato"), L("Receita", fmt(alvo.rec), alvo.lRec, "extrato"), L("Despesa", fmt(alvo.desp), alvo.lDesp, "extrato")],
      ["histórico mensal realizado"], 0.88,
      { tipo: "linha", titulo: `${cap(metrica)} mensal · últimos 12 meses`, tom: porReceita ? "entrada" : "neutro", dados: serieMensal(movs, hoje, 12, porReceita ? "receita" : "resultado") });
  }

  // ——— GASTO MÉDIO POR DIA (burn diário) — antes do GASTO total ———
  // "quanto gasto por dia" casaria em "quanto.*gast" do GASTO total.
  if (/gasto (m[ée]dio )?(por|ao|no) dia|gasto di[áa]rio|quanto (gasto|gasta|sai|saem|torro) (por|ao|no) dia|burn di[áa]rio|quanto queimo por dia/.test(p)) {
    const fim = new Date(hoje + "T00:00:00");
    const ini = new Date(fim); ini.setDate(fim.getDate() - 29);
    const from = `${ini.getFullYear()}-${pad(ini.getMonth() + 1)}-${pad(ini.getDate())}`;
    const sai = movs.filter((m) => m.type === "saida" && m.status === "pago" && cashDate(m) >= from && cashDate(m) <= hoje);
    const tot = sai.reduce((s, m) => s + Math.abs(m.amount), 0);
    const porDia = tot / 30;
    if (tot <= 0) return R("Não houve gastos pagos nos últimos 30 dias para calcular o gasto diário.", [], ["despesas dos últimos 30 dias"]);
    return R(
      `O gasto médio é de ${fmt(porDia)} por dia — ${fmt(tot)} em despesas pagas nos últimos 30 dias. No mês, isso projeta ~${fmt(porDia * 30)}.`,
      [B("Gasto/dia", fmt(porDia), sai, "extrato"), L("30 dias", fmt(tot), sai, "extrato")],
      ["despesas dos últimos 30 dias"], 0.88);
  }

  // ——— GASTO total no período ———
  if ((/(quanto).*(gast|gastei|sa[íi]|paguei|despes|torr|queim)|gast(ei|os)? (esse|este|do|neste|no)\s*m[êe]s|gasto total|total de (gasto|despesa)|minhas? despesas?/.test(p)) && !/entra e sai|entradas? e sa|(entra\w*|entrada)\s*(vs|versus|\bx\b|ou|contra)\s*(quanto\s*)?(sai|sa[íi]da)/.test(p)) {
    const w = janela(p, hoje);
    const pagos = movs.filter((m) => m.type === "saida" && m.status === "pago" && within(cashDate(m), w));
    const sai = pagos.filter(ehGastoReal);
    const transf = pagos.filter((m) => !ehGastoReal(m)).reduce((s, m) => s + Math.abs(m.amount), 0);
    const tot = sai.reduce((s, m) => s + Math.abs(m.amount), 0);
    const top = topCategorias(sai, 3);
    return R(
      `Os gastos pagos ${w.label} somam ${fmt(tot)}, em ${sai.length} pagamento(s).${top.length ? ` Maior categoria: ${top[0].nome} (${fmt(top[0].valor)}).` : ""}${transf > 0 ? ` Não entram ${fmt(transf)} transferidos entre contas da própria empresa — o dinheiro só mudou de conta (no caixa saíram ${fmt(tot + transf)} ao todo).` : ""}`,
      [L(`Gasto ${w.label}`, fmt(tot), sai, "extrato"), ...top.slice(0, 2).map((c) => L(c.nome, fmt(c.valor), c.movs, "extrato"))],
      ["despesas realizadas"]);
  }

  // ——— RECEITA LÍQUIDA (receita bruta − impostos sobre a venda) ———
  // Antes da receita genérica: "receita líquida" contém "receita".
  if (/receita l[íi]quida|faturamento l[íi]quido|receita ap[óo]s (os )?impostos|receita menos (os )?impostos|l[íi]quido de impostos/.test(p)) {
    const w = janela(p, hoje);
    const ent = pagosNa(movs, "entrada", w);
    const bruta = somaAbs(ent);
    const lImp = pagosNa(movs, "saida", w).filter((m) => IMPOSTO_RE.test((m.category || "").toLowerCase()));
    const impostos = somaAbs(lImp);
    const liquida = bruta - impostos;
    if (bruta <= 0) return R(`Não houve receita paga ${w.label}, então não há receita líquida a calcular.`, [], ["receita líquida"]);
    return R(
      `A receita líquida ${w.label} é ${fmt(liquida)}: ${fmt(bruta)} de receita bruta menos ${fmt(impostos)} de impostos sobre a venda.`,
      [L("Receita líquida", fmt(liquida), [...ent, ...lImp], "extrato"), L("Receita bruta", fmt(bruta), ent, "extrato"), L("Impostos", fmt(impostos), lImp, "extrato")],
      ["receita líquida", "impostos sobre venda"]);
  }

  // ——— CARGA TRIBUTÁRIA (% da receita que vai em impostos) ———
  if (/carga tribut[áa]ria|(%|percentual|quanto por cento|quantos? por cento) (de |em |dos? )?imposto|peso dos impostos|imposto.*(sobre|em rela[çc]|na |da ).*(a )?(receita|faturament)|quanto (de |em |vai de )?imposto.*(sobre|na|da) (a |o )?(receita|faturament)/.test(p)) {
    const w = janela(p, hoje);
    const lBruta = pagosNa(movs, "entrada", w);
    const bruta = somaAbs(lBruta);
    const lImp = pagosNa(movs, "saida", w).filter((m) => IMPOSTO_RE.test((m.category || "").toLowerCase()));
    const impostos = somaAbs(lImp);
    if (bruta <= 0) return R(`Não houve receita paga ${w.label} para medir a carga tributária.`, [], ["carga tributária"]);
    const pct = Math.round((impostos / bruta) * 1000) / 10;
    return R(
      `A carga tributária ${w.label} é ${pct}%: ${fmt(impostos)} de impostos sobre ${fmt(bruta)} de receita.`,
      [B("Carga tributária", `${pct}%`, [...lImp, ...lBruta], "extrato"), L("Impostos", fmt(impostos), lImp, "extrato"), L("Receita", fmt(bruta), lBruta, "extrato")],
      ["carga tributária"]);
  }

  // ——— EBITDA (a cascata do DRE, não uma conta própria) ———
  /*
   * ⚠️ **Aqui morava a agregação mais perigosa do sistema**, e o perigo não era
   * o tamanho do erro: era o FORMATO. Este bloco somava os lançamentos por
   * conta própria — com uma cópia dos regex de "financeiro" e "imposto" — e
   * devolvia *"O EBITDA em agosto é R$ X (Y% da receita líquida)"* em prosa.
   * Número em texto é a apresentação com mais autoridade e menos
   * rastreabilidade que existe no produto: ninguém abre o DRE para conferir o
   * que a IA afirmou, e a frase não tem coluna, drill-down nem procedência.
   *
   * ⚠️ E a conta estava errada do mesmo jeito que os cartões do DRE estavam
   * antes da `cascataDRE`: `receita` somava TODA entrada, inclusive a receita
   * FINANCEIRA. Num período com juros relevantes o EBITDA saía inflado pelo
   * valor exato desses juros — e podia SAIR COM O SINAL TROCADO, afirmando
   * geração operacional onde havia queima. É o caso que a guarda de contrato
   * fixa (`scripts/contrato-resultado.mts`).
   *
   * Agora a IA não calcula: ela LÊ a mesma `cascataDRE` que desenha a tabela do
   * relatório. Zero agregação própria, zero regex duplicado.
   */
  if (/\bebitda\b|\blajida\b|gera[çc][ãa]o operacional de caixa/.test(p)) {
    const w = janela(p, hoje);
    const c = cascataDRE(input, { intervalo: { de: w.from, ate: w.to }, regime: "competencia" });
    const eb = c.linhas.ebitda;

    /*
     * ⚠️ A janela da cascata nasce rotulada "Período do relatório" — verdadeiro
     * e inútil numa conversa. O intervalo é o MESMO; só o nome humano vem de
     * quem entendeu a pergunta. Trocar o rótulo não troca o número: `de`/`ate`
     * seguem intactos, e é sobre eles que a origem afirma o regime.
     */
    const origem = origemDaCascata(c, w, LINHAS_ATE_EBITDA);

    /*
     * ⚠️ **Sem número, sem afirmação.** Se a cascata não tem resposta, a IA diz
     * POR QUE não tem — e não devolve zero. Um "R$ 0" de EBITDA lê como
     * "operou e não sobrou nada"; a verdade costuma ser "não houve lançamento
     * no período", que manda fazer o oposto.
     */
    if (eb.indisponivel) {
      const saida = eb.indisponivel.comoResolver ? ` ${eb.indisponivel.comoResolver}` : "";
      return R(
        `Não é possível afirmar o EBITDA ${w.label}: ${eb.indisponivel.motivo}.${saida}`,
        [], ["DRE gerencial"]);
    }

    const m = c.margemEbitda;
    // Uma casa decimal, pela regra de formato da ONDA 11: zero apaga a
    // diferença entre 12,4% e 12,9%, duas fingem precisão que o período não
    // tem. (Formatado aqui porque `core/` não importa de `lib/`.)
    const margemTxt = m.indisponivel
      ? `sem margem a calcular — ${m.indisponivel.motivo}`
      : `${(m.valor * 100).toFixed(1).replace(".", ",")}% da receita líquida`;

    return R(
      `O EBITDA ${w.label} é ${fmt(eb.valor)} (${margemTxt}): a geração operacional, `
      + `antes de juros, impostos sobre o lucro e depreciação. ${origem}`,
      [
        T("EBITDA", fmt(eb.valor), "dre"),
        T("Margem EBITDA", m.indisponivel ? "—" : `${(m.valor * 100).toFixed(1).replace(".", ",")}%`, "dre"),
        T("Receita líquida", fmt(c.linhas.receita_liquida.valor), "dre"),
      ],
      ["EBITDA", "DRE gerencial"]);
  }

  // ——— FLUXO DE CAIXA LIVRE (caixa operacional gerado no período) ———
  if (/fluxo (de caixa )?livre|caixa livre|free cash flow|\bfcf\b|gera[çc][ãa]o de caixa (livre)?/.test(p)) {
    const w = janela(p, hoje);
    const jm = movs.filter((m) => m.status === "pago" && within(cashDate(m), w));
    const ehFin = (c: string) => /empr[ée]stimo|financiamento|aporte|capital social|s[óo]cio|investiment/.test(c);
    const lEnt = jm.filter((m) => m.type === "entrada" && !ehFin((m.category || "").toLowerCase()));
    const lSai = jm.filter((m) => m.type === "saida" && !ehFin((m.category || "").toLowerCase()));
    const entradas = somaAbs(lEnt), saidas = somaAbs(lSai);
    const fcf = entradas - saidas;
    if (entradas <= 0 && saidas <= 0) return R(`Não houve movimento realizado ${w.label} para calcular o fluxo de caixa livre.`, [], ["fluxo de caixa livre"]);
    return R(
      `O fluxo de caixa livre ${w.label} é ${fmt(fcf)}: ${fmt(entradas)} de entradas operacionais menos ${fmt(saidas)} de saídas — o caixa que ${fcf >= 0 ? "sobrou para reservar ou reinvestir" : "faltou e precisou vir do saldo/de fora"}.`,
      [L("Fluxo livre", fmt(fcf), [...lEnt, ...lSai], "extrato"), L("Entradas", fmt(entradas), lEnt, "extrato"), L("Saídas", fmt(saidas), lSai, "extrato")],
      ["fluxo de caixa livre"]);
  }

  // ——— RECEITA / RECEBI no período ———
  if ((/(quanto).*(receb|recebi|entr|faturei|fatur|vend)|receita (do|desse|deste|este|esse|no)\s*m[êe]s|qual (a |o )?(minha |meu )?(receita|faturament)\b|\bminha receita\b|faturamento|quanto (vendi|entrou)|(o )?total que entrou|total de entradas?|total que (recebi|faturei)/.test(p)) && !/l[íi]quida|entra e sai|entradas? e sa|(entra\w*|entrada)\s*(vs|versus|\bx\b|ou|contra)\s*(quanto\s*)?(sai|sa[íi]da)/.test(p)) {
    const w = janela(p, hoje);
    const pagas = movs.filter((m) => m.type === "entrada" && m.status === "pago" && within(cashDate(m), w));
    const ent = pagas.filter(ehReceitaDeVenda);
    const tot = ent.reduce((s, m) => s + Math.abs(m.amount), 0);
    const topC = topCategorias(ent, 3);
    const fora = pagas.filter((m) => !ehReceitaDeVenda(m));
    const totCaixa = pagas.reduce((s, m) => s + Math.abs(m.amount), 0);
    // "Quanto recebi/entrou?" é pergunta de CAIXA (o "Entradas" da Visão geral,
    // toda entrada liquidada); "faturei/receita/vendi" é pergunta de RECEITA.
    // As duas respostas citam os dois números, com o nome certo em cada um.
    const perguntouReceita = /fatur|receita|vend/.test(p);
    if (!perguntouReceita && fora.length) {
      const totFora = totCaixa - tot;
      const cats = Array.from(new Set(fora.map((m) => (m.category || "sem categoria").trim()))).slice(0, 3).join(", ");
      return R(
        `Entraram ${fmt(totCaixa)} ${w.label}, em ${pagas.length} entrada(s): ${fmt(tot)} de receita e ${fmt(totFora)} que não são faturamento (${cats}).${topC.length ? ` Principal origem da receita: ${topC[0].nome} (${fmt(topC[0].valor)}).` : ""}`,
        [L(`Entradas ${w.label}`, fmt(totCaixa), pagas, "extrato"), L("Receita", fmt(tot), ent, "extrato"), L("Não é faturamento", fmt(totFora), fora, "extrato")],
        ["entradas realizadas", "receita realizada"]);
    }
    return R(
      `A receita recebida ${w.label} soma ${fmt(tot)}, em ${ent.length} entrada(s).${topC.length ? ` Principal origem: ${topC[0].nome} (${fmt(topC[0].valor)}).` : ""}${foraDaReceita(fora)}`,
      [L(`Receita ${w.label}`, fmt(tot), ent, "extrato"), ...topC.slice(0, 2).map((c) => L(c.nome, fmt(c.valor), c.movs, "extrato"))],
      ["receita realizada"]);
  }

  // ——— PREVISÃO: quanto vai sobrar no mês (antes do RESULTADO realizado) ———
  if (/(vai sobrar|vou sobrar|sobra prevista|previs[ãa]o|proje[çc][ãa]o|fech(a|ar|arei|o) o m[êe]s|fim do m[êe]s|vou conseguir pagar|(vou|vai) (fechar|terminar) o m[êe]s|fechar no (azul|positivo)|(t[ôo]|to|estou) conseguindo pagar|consigo pagar (as )?contas)/.test(p)) {
    const w = janela("mês", hoje);
    const lRealRec = pagosNa(movs, "entrada", w), lRealPag = pagosNa(movs, "saida", w);
    const lPrevRec = movs.filter((m) => m.type === "entrada" && m.status === "pendente" && within(m.due_date, w));
    const lPrevPag = movs.filter((m) => m.type === "saida" && m.status === "pendente" && within(m.due_date, w));
    const realRec = somaAbs(lRealRec), realPag = somaAbs(lRealPag), prevRec = somaAbs(lPrevRec), prevPag = somaAbs(lPrevPag);
    const ent = realRec + prevRec, sai = realPag + prevPag, proj = ent - sai;
    return R(
      `Projeção do mês: entradas ${fmt(ent)} (${fmt(realRec)} já entraram + ${fmt(prevRec)} previstas) e saídas ${fmt(sai)} — deve ${proj >= 0 ? `sobrar ${fmt(proj)}` : `faltar ${fmt(-proj)}`} no fim do mês.`,
      [L("Entradas (mês)", fmt(ent), [...lRealRec, ...lPrevRec], "fluxoMes"), L("Saídas (mês)", fmt(sai), [...lRealPag, ...lPrevPag], "fluxoMes"),
        L("Projeção", fmt(proj), [...lRealRec, ...lPrevRec, ...lRealPag, ...lPrevPag], "fluxoMes")],
      ["realizado + previsto do mês"]);
  }

  // ——— LUCRO / PREJUÍZO — o resultado LÍQUIDO do DRE, com a ponte para o caixa ———
  /*
   * ⚠️ "Qual meu lucro?" caía no bloco de RESULTADO DE CAIXA ("entraram X e
   * saíram Y — sobrou Z"), e quem lê "sobrou" depois de perguntar "lucro"
   * guarda o número como lucro. Na demonstração, setembro: a IA respondia
   * R$ 278.810,26 e o DRE, R$ 391.828,98 — os dois certos, sobre regimes
   * diferentes, e a resposta não dizia qual era qual. Lucro é linha do DRE
   * (competência); o caixa entra como PONTE, dito como caixa, com a frase que
   * explica por que os dois não batem. "Sobrou/resultado/fechei o mês" seguem
   * no bloco de caixa abaixo — é a pergunta da Visão geral, e lá o número é
   * esse.
   */
  if (/\blucro\b|lucrando|dando lucro|\blucrei\b|\blucrou\b|lucrativ|preju[íi]zo/.test(p) && !/fluxo de caixa|pelo caixa|sobr|entrou|entraram|sa[íi]ram/.test(p)) {
    const w = janela(p, hoje);
    const c = dreDaJanela(input, w);
    const bruto = /lucro brut/.test(p);
    const linha = bruto ? c.linhas.lucro_bruto : c.linhas.resultado_liquido;
    const nomeLinha = bruto ? "lucro bruto" : "resultado líquido";
    const origem = origemDaCascata(c, w, bruto ? ["receita_bruta", "deducoes", "custos_variaveis"] : LINHAS_DO_RESULTADO);
    if (linha.indisponivel) {
      return R(`Não é possível afirmar lucro ou prejuízo ${w.label}: ${linha.indisponivel.motivo}.${linha.indisponivel.comoResolver ? ` ${linha.indisponivel.comoResolver}` : ""}`,
        [], ["DRE gerencial"]);
    }
    const margem = bruto ? c.margemBruta : c.margemLiquida;
    const mTxt = margem.indisponivel ? "" : ` (margem ${bruto ? "bruta" : "líquida"} de ${pctBR(margem.valor)})`;
    const veredito = linha.valor > 0 ? "lucro" : linha.valor < 0 ? "prejuízo" : "resultado zero (empate)";
    const lEntC = pagosNa(movs, "entrada", w), lSaiC = pagosNa(movs, "saida", w);
    const entC = somaAbs(lEntC), saiC = somaAbs(lSaiC);
    const caixa = entC - saiC;
    const ponte = bruto ? ""
      : Math.abs(caixa - linha.valor) < 0.005
        ? " Pelo caixa o número é o mesmo."
        : ` Pelo caixa — o que efetivamente entrou e saiu — ${caixa >= 0 ? `sobraram ${fmt(caixa)}` : `faltaram ${fmt(-caixa)}`}: a diferença é o que foi faturado e ainda não recebido, ou lançado e ainda não pago.`;
    return R(
      `O DRE ${w.label} fecha com ${veredito}: ${nomeLinha} de ${fmt(linha.valor)}${mTxt}, por competência.${ponte} ${origem}`,
      [T(cap(nomeLinha), fmt(linha.valor), "dre"), ...(margem.indisponivel ? [] : [T(`Margem ${bruto ? "bruta" : "líquida"}`, pctBR(margem.valor), "dre")]),
        ...(bruto ? [] : [L("Resultado de caixa", fmt(caixa), [...lEntC, ...lSaiC], "extrato")])],
      ["DRE gerencial", ...(bruto ? [] : ["fluxo de caixa realizado"])]);
  }

  // ——— RESULTADO / sobrou (caixa — a pergunta da Visão geral) ———
  if (/(sobrou|sobra|resultado|lucro|lucrando|dando lucro|preju[íi]zo|fechei o m[êe]s|fech(ou|a) o m[êe]s|no azul|no vermelho|saldo do m[êe]s|ganhei mais do que gastei|lucrei|lucrou|lucrativ|t[ôo] no (azul|vermelho)|no lucro ou no preju|perdendo dinheiro|t[ôo] perdendo|ganhando (dinheiro|grana)|(t[ôo]|to|estou) ganhando|conseguindo poupar|consigo poupar|(t[ôo]|to|estou) poupando|(meu )?fluxo (t[áa]|est[áa]) (positiv|negativ)|(t[ôo]|to|estou) no positivo|no positivo esse m[êe]s|fechei no (positiv|azul|verde|negativ|vermelh|preju)|como (foi|fechou)(?!.*(dia|hoje)))/.test(p)) {
    const w = janela(p, hoje);
    const lEnt = pagosNa(movs, "entrada", w), lSai = pagosNa(movs, "saida", w);
    const ent = somaAbs(lEnt), sai = somaAbs(lSai);
    const res = ent - sai;
    return R(
      `${w.label.charAt(0).toUpperCase() + w.label.slice(1)} entraram ${fmt(ent)} e saíram ${fmt(sai)} — ${res >= 0 ? `sobrou ${fmt(res)} (no azul)` : `faltou ${fmt(-res)} (no vermelho)`}.`,
      [L("Recebido", fmt(ent), lEnt, "extrato"), L("Gasto", fmt(sai), lSai, "extrato"), L("Resultado", fmt(res), [...lEnt, ...lSai], "extrato")],
      ["fluxo de caixa realizado"]);
  }

  // ——— COMPARAÇÃO mês a mês ———
  if (/(gast|custo|despes|receb|fatur).*(mais|menos|comparad|aument|subir|subiram|subiu|cresceram|cresceu|que.*(m[êe]s passad|anterior))|comparad|vs\.?\s*m[êe]s/.test(p)) {
    const tipo = /receb|fatur|vend|receita/.test(p) ? "entrada" : "saida";
    const atual = janela("mês", hoje);
    const ant = janela("mês passado", hoje);
    const la = pagosNa(movs, tipo, atual), lb = pagosNa(movs, tipo, ant);
    const a = somaAbs(la), b = somaAbs(lb);
    const dlt = a - b; const pct = b > 0 ? Math.round((dlt / b) * 100) : 0;
    const verbo = tipo === "entrada" ? "recebidos" : "pagos";
    return R(
      `Foram ${verbo} ${fmt(a)} ${atual.label} vs. ${fmt(b)} ${ant.label} — ${dlt >= 0 ? "alta" : "queda"} de ${fmt(Math.abs(dlt))}${b > 0 ? ` (${Math.abs(pct)}%)` : ""}.`,
      [L(cap(atual.label), fmt(a), la, "extrato"), L(cap(ant.label), fmt(b), lb, "extrato"), T("Variação", `${dlt >= 0 ? "+" : "−"}${fmt(Math.abs(dlt))}`, "variacao")],
      ["fluxo de caixa realizado"]);
  }

  // ——— TICKET MÉDIO ———
  if (/ticket m[ée]dio|valor m[ée]dio.*(venda|compra|recebiment)/.test(p)) {
    const w = janela(p, hoje);
    const ent = movs.filter((m) => m.type === "entrada" && m.status === "pago" && within(cashDate(m), w));
    const tot = ent.reduce((s, m) => s + Math.abs(m.amount), 0);
    const tm = ent.length ? tot / ent.length : 0;
    return R(`O ticket médio ${w.label} é ${fmt(tm)} (${fmt(tot)} em ${ent.length} venda(s)).`, [B("Ticket médio", fmt(tm), ent, "extrato"), B("Vendas", String(ent.length), ent, "extrato")], ["receita realizada"]);
  }

  // ——— CONTAGEM de vendas/transações ———
  if (/quant(as|os).*(venda|transa[çc]|lan[çc]ament|movimenta|entrada|recebiment)/.test(p)) {
    const w = janela(p, hoje);
    const ent = movs.filter((m) => m.type === "entrada" && within(cashDate(m), w));
    return R(`Foram ${ent.length} entrada(s)/venda(s) ${w.label}, somando ${fmt(ent.reduce((s, m) => s + Math.abs(m.amount), 0))}.`, [B("Vendas", String(ent.length), ent, "extrato")], ["lançamentos"]);
  }

  // ——— RESUMO DO DIA / briefing ———
  if (/resumo (do|de) (dia|hoje)|como (foi|est[áa]|vai) (o |meu )?(dia|hoje)|briefing|o que (tem|rolou|entrou) hoje|meu dia/.test(p)) {
    const w: Janela = { label: "hoje", from: hoje, to: hoje };
    const lEntrou = pagosNa(movs, "entrada", w), lSaiu = pagosNa(movs, "saida", w);
    const entrou = somaAbs(lEntrou), saiu = somaAbs(lSaiu);
    const venc = movs.filter((m) => m.status === "pendente" && within(m.due_date, w));
    const vencVal = venc.reduce((s, m) => s + (m.type === "entrada" ? Math.abs(m.amount) : -Math.abs(m.amount)), 0);
    return R(
      `Hoje entraram ${fmt(entrou)} e saíram ${fmt(saiu)}${venc.length ? `; vencem ${venc.length} título(s) (líquido ${fmt(vencVal)})` : "; nada vence hoje"}. Saldo atual: ${fmt(input.saldoAtual)}.`,
      [L("Entrou hoje", fmt(entrou), lEntrou, "extrato"), L("Saiu hoje", fmt(saiu), lSaiu, "extrato"), T("Saldo", fmt(input.saldoAtual), "inicio")],
      ["resumo do dia"]);
  }

  // ——— RESUMO DO PERÍODO (mês/trimestre/semestre/ano) ———
  if (/resumo (do|de|deste|desse|do) (m[êe]s|per[íi]odo|ano|trimestre|semestre)|como (foi|est[áa]|vai) (o|meu|este|esse) (m[êe]s|ano|trimestre|semestre)|fechamento do (m[êe]s|ano|trimestre)|panorama (do|de) (m[êe]s|ano|per[íi]odo|trimestre|semestre)|n[úu]meros (do|de|deste|desse) (m[êe]s|per[íi]odo|ano|trimestre|semestre)|me d[áa] os n[úu]meros|os n[úu]meros do|resumo (financeiro|das? finan[çc])|entra e sai|entradas? e sa[íi]das?|(entra\w*|entrada)\s*(vs|versus|\bx\b|ou|contra)\s*(quanto\s*)?(sai|sa[íi]da)|(me )?explica (os )?(meus )?n[úu]meros|(meus )?n[úu]meros do neg|(qual (meu|o meu) )?desempenho|como (foi|fui) (meu|no) (m[êe]s|desempenho)|(mostra|ver|me mostra) (o )?fluxo de caixa|meu fluxo de caixa/.test(p)) {
    const w = janela(p, hoje);
    const lEntrou = pagosNa(movs, "entrada", w), lSaiu = pagosNa(movs, "saida", w);
    const entrou = somaAbs(lEntrou), saiu = somaAbs(lSaiu);
    const res = entrou - saiu;
    const aVencer = movs.filter((m) => m.status === "pendente" && within(m.due_date, w) && m.due_date.slice(0, 10) >= hoje);
    const aVencerVal = aVencer.reduce((s, m) => s + (m.type === "entrada" ? Math.abs(m.amount) : -Math.abs(m.amount)), 0);
    return R(
      `${cap(w.label)}: entraram ${fmt(entrou)} e saíram ${fmt(saiu)} — ${res >= 0 ? `sobrou ${fmt(res)}` : `faltou ${fmt(-res)}`}.${aVencer.length ? ` Ainda vencem ${aVencer.length} título(s) (líquido ${fmt(aVencerVal)}).` : ""}`,
      [L("Recebido", fmt(entrou), lEntrou, "extrato"), L("Gasto", fmt(saiu), lSaiu, "extrato"), L("Resultado", fmt(res), [...lEntrou, ...lSaiu], "extrato")],
      ["resumo do mês"]);
  }

  // ——— DATA PROVÁVEL DE RUPTURA (quando fico sem dinheiro) ———
  /*
   * ⚠️ Tinha conta PRÓPRIA: a média dos últimos 3 meses de calendário (o mês
   * corrente pela metade incluído). "Qual meu runway?" e "quando fico sem
   * dinheiro?" davam prazos diferentes na mesma conversa. Agora as duas saem do
   * runway canônico de 90 dias — o do Fluxo de caixa.
   */
  if (/quando (vou |eu )?(fico|ficar[ei]?|vou ficar|fica) (sem (dinheiro|caixa|grana|saldo)|no vermelho|negativ)|quando (acaba|zera|termina|some) (o |meu )?(caixa|dinheiro|saldo)|quando (o |meu )?(caixa|dinheiro|saldo) (acaba|zera|termina|some|vai acabar)|data (de|da) ruptura|quando (quebro|vou quebrar|estouro)|\bvou quebrar\b|vou falir|t[ôo] quebrando|at[ée] quando (o |meu )?(dinheiro|saldo|caixa) (dura|aguenta|vai durar)|risco de (eu |a gente |a empresa )?(quebrar|falir|fechar|quebra|insolv)|(perto|beira|risco) de (eu )?(quebrar|falir|fechar|ficar sem|acabar o (caixa|dinheiro))|(t[ôo]|to|estou) (quase | quase )?(perto de )?(ficar |ficando )?sem (dinheiro|caixa|grana)|vou aguentar|consigo sobreviver/.test(p)) {
    if (input.saldoAtual <= 0) return R(`O saldo já está em ${fmt(input.saldoAtual)} — o caixa está no limite agora, e não há fôlego a projetar (runway não se aplica). Recomenda-se priorizar entradas e conter saídas.`, [{ label: "Saldo", valor: fmt(input.saldoAtual) }, { label: "Runway", valor: `— ${formaCurta({ codigo: "caixa_negativo", motivo: "" })}` }], ["saldo", "runway (média dos últimos 90 dias)"]);
    const rt = leituraRitmo(input);
    if (rt.meses === null) {
      if (rt.codigo === "sem_queima") {
        const g = geracaoCaixaMensal(input);
        return R(`Sem previsão de ruptura: nos últimos ${JANELA_RITMO_DIAS} dias a empresa gerou caixa${g.valor > 0 ? ` (+${fmt(g.valor)}/mês em média)` : ""} — não há queima, então o saldo de ${fmt(input.saldoAtual)} não se esgota no ritmo atual. É a leitura do Fluxo de caixa: runway "não há queima".`,
          [{ label: "Runway", valor: rt.chip }, { label: "Saldo", valor: fmt(input.saldoAtual) }, ...(g.valor > 0 ? [T("Geração/mês", fmt(g.valor), "fluxo")] : [])],
          ["runway (média dos últimos 90 dias)", "saldo"], 0.85);
      }
      return R(`Ainda não há como projetar ruptura: ${rt.r.indisponivel?.motivo ?? "sem base de cálculo"}.${rt.r.indisponivel?.comoResolver ? ` ${rt.r.indisponivel.comoResolver}` : ""}`,
        [{ label: "Runway", valor: rt.chip }, { label: "Saldo", valor: fmt(input.saldoAtual) }], ["runway (média dos últimos 90 dias)", "saldo"], 0.7);
    }
    if (rt.r.procedencia.aviso) {
      return R(`Sem aperto à vista: no ritmo atual (queima de ${fmt(rt.b.valor)}/mês), o saldo de ${fmt(input.saldoAtual)} dura mais do que o cálculo alcança — ${rt.r.procedencia.aviso}.`,
        [{ label: "Queima/mês", valor: fmt(rt.b.valor) }, { label: "Saldo", valor: fmt(input.saldoAtual) }], ["runway (média dos últimos 90 dias)", "saldo"], 0.85);
    }
    const futuro = new Date(hoje + "T00:00:00"); futuro.setDate(futuro.getDate() + (rt.dias ?? 0));
    const dataStr = dia(`${futuro.getFullYear()}-${pad(futuro.getMonth() + 1)}-${pad(futuro.getDate())}`);
    return R(
      comVoz("projecao", `a ruptura de caixa viria por volta de ${dataStr}: a queima é de ${fmt(rt.b.valor)}/mês (média dos últimos ${JANELA_RITMO_DIAS} dias) e o saldo de ${fmt(input.saldoAtual)} dá cerca de ${decimalBR(rt.meses)} meses de runway, se nada mudar. Vale agir na cobrança e nas despesas.`),
      [{ label: "Queima/mês", valor: fmt(rt.b.valor) }, { label: "Ruptura", valor: dataStr }, { label: "Runway", valor: rt.chip }],
      ["runway (média dos últimos 90 dias)", "saldo", "projeção de caixa"], 0.85);
  }

  // ——— SALDO / quanto tenho ———
  if (/\bsaldo\b|meu caixa|qual (o )?meu caixa|quanto (eu )?tenho|quanto (h[áa]|tem) (no|em) caixa|quanto de (dinheiro|grana)|(dinheiro|grana) eu tenho|quanta grana|\ba grana\b|cad[êe] (minha |a |o )?(grana|dinheiro|saldo|caixa)|\bna conta\b|dindin|como (t[áa]|est[áa]) (a |o )?(grana|caixa|dinheiro|saldo)|(o |meu )?caixa,? como (t[áa]|est[áa]|anda|vai)|folga (n?o|de|em|d[oa]) (caixa|saldo)|tenho folga|situa[çc][ãa]o (do|de) (caixa|financeira|do dinheiro)|dispon[íi]vel|tenho em conta|meu dinheiro/.test(p)) {
    // ⚠️ Sem conta cadastrada não há saldo — a IA diz a MESMA ausência que a
    // tela, nunca "R$ 0,00" (Rodada 5).
    if (input.contas === 0) {
      return R("A empresa ainda não tem conta bancária cadastrada, então não há saldo para informar. Recomenda-se cadastrar a conta em Cadastros › Contas bancárias ou conectar o banco em Entrada de dados.",
        [{ label: "Saldo", valor: `— ${formaCurta({ codigo: "sem_conta", motivo: "" })}` }], ["contas bancárias cadastradas"], 0.95);
    }
    // ⚠️ O runway ao lado do saldo é o CANÔNICO (o do Fluxo de caixa). Vinha do
    // `ctx.runwayMeses` do quant e dizia "cobre cerca de 0 meses de operação"
    // sobre R$ 2,2 milhões de uma empresa que gera caixa.
    const rt = leituraRitmo(input);
    const extra = rt.meses !== null
      ? ` ${comVoz("projecao", `ele cobriria cerca de ${decimalBR(rt.meses)} meses de operação (queima média dos últimos ${JANELA_RITMO_DIAS} dias).`)}`
      : rt.codigo === "sem_queima"
        ? ` Nos últimos ${JANELA_RITMO_DIAS} dias a empresa gerou caixa — não há queima pela qual dividir o saldo, então não há prazo de runway a calcular.`
        : rt.codigo === "caixa_negativo" ? " Com o caixa negativo, não há fôlego a projetar." : "";
    return R(
      `O saldo consolidado é ${fmt(input.saldoAtual)}.${extra}`,
      [{ label: "Saldo atual", valor: fmt(input.saldoAtual) }, ...(rt.codigo === "sem_lancamentos" ? [] : [{ label: "Runway", valor: rt.chip }])],
      ["saldo consolidado"]);
  }

  // ——— RUNWAY — o canônico, o mesmo do Fluxo de caixa e do DRE ———
  if (/runway|f[oô]lego|quanto.*(dura|aguenta).*caixa|at[ée] quando.*caixa|quantos? dias (de |o )?(caixa|opera|f[ôo]lego)|dias de (caixa|opera|f[ôo]lego)|quantos? meses de (reserva|caixa|f[ôo]lego|opera)|meses de reserva|reserva (pra|para) quantos meses|(caixa|reserva) (aguenta|dura|cobre) quantos/.test(p)) {
    const rt = leituraRitmo(input);
    const saldoTxt = fmt(input.saldoAtual);
    if (rt.meses === null) {
      const ind = rt.r.indisponivel!;
      const txt = rt.codigo === "sem_queima"
        ? `Não há runway a calcular: nos últimos ${JANELA_RITMO_DIAS} dias a empresa gerou caixa, então não houve queima pela qual dividir o saldo de ${saldoTxt}. É a mesma leitura do Fluxo de caixa e do DRE ("não há queima").`
        : rt.codigo === "caixa_negativo"
          ? `O runway não se aplica: o caixa já está negativo (${saldoTxt}) — não há fôlego a projetar.${ind.comoResolver ? ` ${ind.comoResolver}` : ""}`
          : `Ainda não há como medir o runway: ${ind.motivo}.${ind.comoResolver ? ` ${ind.comoResolver}` : ""}`;
      return R(txt,
        [{ label: "Runway", valor: rt.chip }, { label: "Saldo", valor: saldoTxt }, ...(rt.b.indisponivel ? [] : [{ label: "Burn", valor: `${fmt(rt.b.valor)}/m` }])],
        ["runway (média dos últimos 90 dias)", "saldo"]);
    }
    const aviso = rt.r.procedencia.aviso ? ` Atenção: ${rt.r.procedencia.aviso}.` : "";
    if (/\bdias?\b/.test(p)) {
      return R(
        comVoz("projecao", `o caixa cobriria cerca de ${rt.dias} dias de operação (runway de ${decimalBR(rt.meses)} meses): saldo de ${saldoTxt} sobre o burn de ${fmt(rt.b.valor)}/mês.${aviso}`),
        [{ label: "Dias de caixa", valor: `${rt.dias} d` }, { label: "Runway", valor: rt.chip }, { label: "Saldo", valor: saldoTxt }],
        ["runway (média dos últimos 90 dias)"]);
    }
    return R(
      comVoz("projecao", `O runway seria de cerca de ${decimalBR(rt.meses)} meses: o saldo de ${saldoTxt} cobriria esse tempo sobre um burn de ${fmt(rt.b.valor)}/mês (média dos últimos ${JANELA_RITMO_DIAS} dias).${aviso}`),
      [{ label: "Runway", valor: rt.chip }, { label: "Saldo", valor: saldoTxt }, { label: "Burn", valor: `${fmt(rt.b.valor)}/m` }],
      ["runway (média dos últimos 90 dias)"]);
  }

  // ——— BURN — o canônico (o "Burn" do Fluxo de caixa) ———
  if (/burn|queima de caixa|consumo de caixa|quanto.*queim/.test(p)) {
    const rt = leituraRitmo(input);
    if (rt.b.indisponivel) {
      return R(`Não há como medir o burn: ${rt.b.indisponivel.motivo}.${rt.b.indisponivel.comoResolver ? ` ${rt.b.indisponivel.comoResolver}` : ""}`,
        [{ label: "Burn", valor: `— ${formaCurta(rt.b.indisponivel)}` }], ["burn (média dos últimos 90 dias)"]);
    }
    if (rt.b.valor <= 0) {
      return R(`O burn é de ${fmt(0)}/mês: nos últimos ${JANELA_RITMO_DIAS} dias entrou mais caixa do que saiu — a empresa gerou caixa, então não há queima (nem prazo de runway) a calcular.`,
        [{ label: "Burn", valor: `${fmt(0)}/m` }, { label: "Runway", valor: rt.chip }], ["burn (média dos últimos 90 dias)"]);
    }
    return R(
      `O burn é de ${fmt(rt.b.valor)}/mês — a média de (saídas − entradas) liquidadas dos últimos ${JANELA_RITMO_DIAS} dias. ${rt.meses !== null ? comVoz("projecao", `com o saldo de ${fmt(input.saldoAtual)}, isso daria cerca de ${decimalBR(rt.meses)} meses de runway.`) : `Runway: ${formaCurta(rt.r.indisponivel!)}.`}`,
      [{ label: "Burn", valor: `${fmt(rt.b.valor)}/m` }, { label: "Runway", valor: rt.chip }], ["burn (média dos últimos 90 dias)"]);
  }

  // ——— SCORE / saúde ———
  if (ctx && /score|sa[úu]de|como (est[áa]|vai) (minha )?(empresa|sa[úu]de|financ)|nota da empresa|empresa (t[áa]|est[áa]|anda) saud|saud[áa]vel|empresa vai bem|minha empresa (t[áa]|est[áa]|vai) bem|como (t[ãa]o|est[ãa]o|v[ãa]o) (as |minhas )?finan[çc]|como (t[áa]|est[áa]|v[ãa]o) (as |minhas )?finan|finan[çc]as (t[ãa]o|est[ãa]o|v[ãa]o)|(t[ôo]|to|estou) indo bem|as coisas (v[ãa]o|est[ãa]o) bem|meu neg[óo]cio (vai|est[áa]) bem|(maior|principal) problema|maior risco|o que (t[áa]|est[áa]) errado|maior preocupa|resumo geral|resum[ae] (a |minha )?(situa|financ|empresa)|situa[çc][ãa]o geral|vis[ãa]o geral|panorama|(finan[çc]as|empresa|situa[çc][ãa]o).* no geral|como (est[áa] )?tudo/.test(p)) {
    // ⚠️ A faixa é a MESMA da tela Quant (`classificar`): a IA tinha a própria
    // (80/60/40) e chamava de "excelente" um 82 que a Quant chama de "saudável".
    // E a chance de ruptura é a do motor de RISCO, de 60 dias — a IA a anunciava
    // como "em 90 dias", que é o horizonte de OUTRO número (o do quant).
    const nivel = SAUDE_NA_FRASE[classificar(ctx.scoreFinanceiro)];
    const sat = avisoDeSaturacao("chance-ruptura", ctx.probRuptura);
    return R(
      `A saúde financeira está ${nivel}: score ${ctx.scoreFinanceiro}/100; ${fraseRunway(ctx)}; ${pctBR(ctx.inadimplencia)} da carteira a receber vencida. Chance de ruptura de caixa em 60 dias: ${pctBR(ctx.probRuptura)}.${sat ? ` ${sat}` : ""}`,
      [T("Score", `${ctx.scoreFinanceiro}/100`, "quant"), { label: "Runway", valor: rotuloRunwayCtx(ctx) }, { label: "Prob. ruptura (60d)", valor: pctBR(ctx.probRuptura) }],
      ["motor quantitativo", "motor de risco"]);
  }

  // ——— PROJEÇÃO / vou ficar negativo ———
  if (ctx && /vou ficar (no )?negativo|caixa.*negativo|ruptura|quando.*(acaba|falta).*(dinheiro|caixa)|risco de caixa/.test(p)) {
    const risco = ctx.probRuptura >= 0.5 ? "alta" : ctx.probRuptura >= 0.25 ? "moderada" : "baixa";
    const sat = avisoDeSaturacao("chance-ruptura", ctx.probRuptura);
    return R(
      `A probabilidade de o caixa ficar negativo em 60 dias é ${risco} (${pctBR(ctx.probRuptura)}); ${fraseRunway(ctx)}, com saldo de ${fmt(ctx.saldoAtual)}. ${ctx.probRuptura >= 0.25 ? "Antecipar recebíveis e segurar despesas não essenciais reduz o risco." : "O caixa está sob controle no horizonte atual."}${sat ? ` ${sat}` : ""}`,
      [{ label: "Prob. ruptura (60d)", valor: pctBR(ctx.probRuptura) }, { label: "Runway", valor: rotuloRunwayCtx(ctx) }],
      ["motor de risco de caixa"]);
  }

  // ——— PRÓXIMO recebimento / pagamento ———
  if (/pr[óo]xim[oa].*(receb|entrada|pagament|sa[íi]da|conta|t[íi]tulo)|quando (recebo|vou receber|pago|vou pagar|cai)/.test(p)) {
    const tipo: "entrada" | "saida" = /pag|sa[íi]da|dev[oa]|contas? a pagar/.test(p) ? "saida" : "entrada";
    const prox = movs.filter((m) => m.type === tipo && m.status === "pendente" && m.due_date.slice(0, 10) >= hoje).sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
    if (!prox) return R(`Não há ${tipo === "entrada" ? "recebimentos" : "pagamentos"} futuros agendados.`, [], ["agenda de vencimentos"]);
    const nome = (prox.party_id && nomes?.[prox.party_id]) || prox.category || (tipo === "entrada" ? "Recebimento" : "Pagamento");
    return R(
      `O próximo ${tipo === "entrada" ? "recebimento" : "pagamento"} é ${fmt(Math.abs(prox.amount))} em ${dia(prox.due_date)} — ${cap(String(nome))}.`,
      [L("Valor", fmt(Math.abs(prox.amount)), [prox], tipo === "entrada" ? "receber" : "pagar"), B("Vence", dia(prox.due_date), [prox], tipo === "entrada" ? "receber" : "pagar")], ["agenda de vencimentos"]);
  }

  return null; // sem intenção concreta → sobe para Claude / motor consultivo
}

/** A semana de hoje — segunda a domingo, pela MESMA função dos painéis de títulos. */
function semanaDe(hojeISO: string): { from: string; to: string } {
  const sem = periodoSemana(hojeISO);
  return { from: sem.de, to: sem.ate };
}
