/**
 * Quattro — Fechamento contábil contínuo (Continuous Close)
 * ---------------------------------------------------------
 * Inspirado no módulo de close do Campfire: o fechamento mensal vira revisão e
 * aprovação, não construção do zero. Monta um checklist do período com tarefas
 * automáticas ("de IA") já resolvidas — lançamentos faltantes (recorrentes que
 * sumiram), provisões/accruals sugeridos, pendências a baixar — e tarefas
 * manuais (revisar, conciliar, aprovar, travar). Puro, tipado, demo-safe.
 * Reusa o mesmo RiskInput (movements). Períodos travados são um controle.
 */
import type { RiskInput, RiskMovement } from "@/core/risk-engine/types";
import type { LedgerEntryInput } from "@/core/ledger";

export const VERSAO_CLOSE = "close/1.0.0";

export interface CloseMetricas {
  receita: number;
  despesa: number;
  resultado: number;
  lancamentos: number;
  pendentes: number; // ainda não baixados (status pendente) no mês
}

export interface CloseSugestao {
  tipo: "lancamento_faltante" | "provisao";
  categoria: string;
  valorSugerido: number;
  motivo: string;
}

export interface CloseTarefa {
  id: string;
  titulo: string;
  descricao: string;
  tipo: "auto" | "manual";
  status: "ok" | "pendente" | "atencao";
  detalhe?: string;
  href?: string;
}

export interface FechamentoReport {
  mes: string;       // YYYY-MM
  mesLabel: string;  // "maio de 2026"
  travado: boolean;
  metricas: CloseMetricas;
  tarefas: CloseTarefa[];
  sugestoes: CloseSugestao[];
  prontidao: number; // 0..1 (tarefas ok / total)
  versao: string;
}

const MESES_PT = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export function mesLabel(mesISO: string): string {
  const [y, m] = mesISO.split("-").map(Number);
  return `${MESES_PT[(m || 1) - 1]} de ${y}`;
}
function mesAnterior(mesISO: string, n: number): string {
  const [y, m] = mesISO.split("-").map(Number);
  const d = new Date(y, (m - 1) - n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
const mesDe = (m: RiskMovement) => (m.due_date || "").slice(0, 7);

function metricasDoMes(movs: RiskMovement[]): CloseMetricas {
  let receita = 0, despesa = 0, pendentes = 0;
  for (const m of movs) {
    if (m.type === "entrada") receita += m.amount; else despesa += m.amount;
    if (m.status === "pendente") pendentes++;
  }
  return { receita, despesa, resultado: receita - despesa, lancamentos: movs.length, pendentes };
}

/** Categorias de despesa presentes em ≥60% dos últimos 6 meses → recorrentes.
 *  Se a recorrente NÃO aparece no mês de fechamento, é candidata a lançamento
 *  faltante + provisão (accrual) pela média mensal histórica. */
function recorrentesFaltantes(input: RiskInput, mesISO: string): CloseSugestao[] {
  const refMeses = Array.from({ length: 6 }, (_, i) => mesAnterior(mesISO, i + 1));
  const refSet = new Set(refMeses);
  const presencaPorCat = new Map<string, Set<string>>();
  const totalPorCat = new Map<string, number>();
  const noMes = new Set<string>();

  for (const m of input.movements) {
    if (m.type !== "saida" || m.status === "cancelado") continue;
    const cat = m.category || "Sem categoria";
    const mes = mesDe(m);
    if (mes === mesISO) { noMes.add(cat); continue; }
    if (refSet.has(mes)) {
      if (!presencaPorCat.has(cat)) presencaPorCat.set(cat, new Set());
      presencaPorCat.get(cat)!.add(mes);
      totalPorCat.set(cat, (totalPorCat.get(cat) || 0) + m.amount);
    }
  }

  const out: CloseSugestao[] = [];
  for (const [cat, meses] of Array.from(presencaPorCat.entries())) {
    if (meses.size >= 4 && !noMes.has(cat)) {
      const media = (totalPorCat.get(cat) || 0) / meses.size;
      out.push({
        tipo: "provisao",
        categoria: cat,
        valorSugerido: Math.round(media),
        motivo: `Recorrente em ${meses.size}/6 meses e ausente em ${mesLabel(mesISO)} — provisione a média.`,
      });
    }
  }
  return out.sort((a, b) => b.valorSugerido - a.valorSugerido).slice(0, 6);
}

export function montarFechamento(
  input: RiskInput,
  mesISO: string,
  opts: { travado: boolean; tarefasManuais: Record<string, boolean> },
): FechamentoReport {
  const movs = input.movements.filter((m) => mesDe(m) === mesISO && m.status !== "cancelado");
  const metricas = metricasDoMes(movs);
  const sugestoes = recorrentesFaltantes(input, mesISO);

  const manual = (id: string, titulo: string, descricao: string, href?: string): CloseTarefa => ({
    id, titulo, descricao, tipo: "manual", href,
    status: opts.tarefasManuais[id] ? "ok" : "pendente",
  });

  const tarefas: CloseTarefa[] = [
    {
      id: "lancamentos_faltantes",
      titulo: "Lançamentos faltantes (IA)",
      descricao: "Despesas recorrentes que não apareceram no mês.",
      tipo: "auto",
      status: sugestoes.length === 0 ? "ok" : "atencao",
      detalhe: sugestoes.length === 0 ? "Nada faltando." : `${sugestoes.length} recorrente(s) ausente(s) — ver provisões.`,
    },
    {
      id: "pendencias",
      titulo: "Pendências a baixar (IA)",
      descricao: "Lançamentos do mês ainda em aberto (não liquidados).",
      tipo: "auto",
      status: metricas.pendentes === 0 ? "ok" : "atencao",
      detalhe: metricas.pendentes === 0 ? "Tudo baixado." : `${metricas.pendentes} lançamento(s) pendente(s).`,
      href: "/contas-a-receber/titulos",
    },
    {
      id: "provisoes",
      titulo: "Provisões / accruals (IA)",
      descricao: "Provisões sugeridas pela média histórica das recorrentes.",
      tipo: "auto",
      status: sugestoes.length === 0 ? "ok" : "pendente",
      detalhe: sugestoes.length === 0 ? "Sem provisões sugeridas." : `${sugestoes.length} provisão(ões) sugerida(s).`,
    },
    manual("conciliacao", "Conciliação bancária", "Confira o extrato e concilie os movimentos do mês.", "/dashboard/financial/reconciliation"),
    manual("variancia", "Explicar a variação do mês", "Revise o que mudou contra o mês anterior e o comentário gerado, na análise de variação.", "/dashboard/reports/variance"),
    manual("aprovacao", "Revisar e aprovar lançamentos", "Revise os lançamentos do mês e aprove o resultado.", "/dashboard/reports/dre"),
  ];

  const total = tarefas.length;
  const ok = tarefas.filter((t) => t.status === "ok").length;
  return {
    mes: mesISO,
    mesLabel: mesLabel(mesISO),
    travado: opts.travado,
    metricas,
    tarefas,
    sugestoes,
    prontidao: total ? ok / total : 0,
    versao: VERSAO_CLOSE,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * PROVISÃO COM ESTORNO AUTOMÁTICO (accrual + reversal)
 *
 * ⚠️ Uma provisão sem estorno CONTA A DESPESA DUAS VEZES. Provisiona-se em
 * setembro a conta de luz que ainda não chegou; em outubro a conta chega e é
 * lançada de verdade — e, se ninguém desfizer a provisão, setembro e outubro
 * carregam a mesma despesa. O estorno no dia 1º do mês seguinte é o que anula a
 * provisão no instante em que o lançamento real passa a existir. Fazê-lo à mão
 * é o passo que todo fechamento esquece; por isso as DUAS partidas nascem do
 * mesmo gesto.
 *
 * A provisão é datada no ÚLTIMO dia do mês (é despesa daquele mês), e o estorno
 * no PRIMEIRO dia do seguinte. As datas são montadas fatiando a string — um
 * `Date` do dia 1º em UTC-3 cai no mês anterior. A chave externa das duas é
 * derivada do mês e da categoria, então lançar de novo não duplica nada.
 * ──────────────────────────────────────────────────────────────────────────── */


/** Conta de despesa genérica das provisões e a conta de passivo que as acumula. */
export const CONTA_PROVISAO_DESPESA = "4.1.09";
export const CONTA_PROVISOES_A_PAGAR = "2.1.99";

/** Último dia do mês `YYYY-MM`, como `YYYY-MM-DD`. */
export function ultimoDiaDoMes(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  const dias = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${mes}-${String(dias).padStart(2, "0")}`;
}

/** Primeiro dia do mês seguinte a `YYYY-MM` — dezembro vira janeiro do ano seguinte. */
export function primeiroDiaDoMesSeguinte(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

export function provisaoComEstorno(
  mes: string,
  categoria: string,
  valor: number,
  contaDespesa: string = CONTA_PROVISAO_DESPESA,
): [LedgerEntryInput, LedgerEntryInput] {
  const v = Math.round(valor * 100) / 100;
  const chave = `${mes}:${categoria}`;
  const provisao: LedgerEntryInput = {
    entryDate: ultimoDiaDoMes(mes),
    description: `Provisão: ${categoria}`,
    source: "system",
    externalKey: `prov:${chave}`,
    lines: [{ accountId: contaDespesa, debit: v }, { accountId: CONTA_PROVISOES_A_PAGAR, credit: v }],
  };
  const estorno: LedgerEntryInput = {
    entryDate: primeiroDiaDoMesSeguinte(mes),
    description: `Estorno da provisão: ${categoria}`,
    source: "system",
    externalKey: `prov-estorno:${chave}`,
    lines: [{ accountId: CONTA_PROVISOES_A_PAGAR, debit: v }, { accountId: contaDespesa, credit: v }],
  };
  return [provisao, estorno];
}
