/**
 * all4pay — Orçamento & Análise de Variância (Flux Analysis)
 * ----------------------------------------------------------
 * Inspirado no "orçado vs. realizado + flux analysis" do Campfire (ERP nativo
 * de IA): compara cada linha do resultado contra o orçamento e EXPLICA o desvio
 * no nível da categoria e da transação. Puro, tipado, demo-safe. Reusa a
 * classificação de linhas do motor de DRE (mesma fonte da verdade).
 *
 * Orçamento: valores MENSAIS por linha. Sem orçamento manual, deriva um
 * baseline automático = média mensal da janela imediatamente anterior de mesmo
 * tamanho (run-rate). Assim a tela é útil já no primeiro acesso, e o usuário
 * pode sobrescrever qualquer linha.
 */
import type { RiskInput, RiskMovement } from "@/core/risk-engine/types";
import { classificarDespesa, movimentosNoPeriodo } from "@/core/dre/engine";
import type { Regime } from "@/core/dre/types";

export const VERSAO_ORCAMENTO = "orcamento/1.0.0";

export type LinhaOrcId = "receita" | "impostos" | "cmv" | "folha" | "opex" | "financeiro";
export type SinalVar = "favoravel" | "desfavoravel" | "neutro";
export type Severidade = "ok" | "atencao" | "critico";

/** Orçamento manual — VALORES MENSAIS por linha (qualquer linha é opcional). */
export type OrcamentoOverride = Partial<Record<LinhaOrcId, number>>;

export interface DriverVar { categoria: string; valor: number }
export interface TransacaoVar { categoria: string; data: string; valor: number; tipo: "entrada" | "saida" }

export interface LinhaVariancia {
  id: LinhaOrcId;
  label: string;
  tipo: "receita" | "despesa";
  orcado: number;
  realizado: number;
  varValor: number; // realizado − orçado
  varPct: number;   // fração (0.12 = 12%)
  sinal: SinalVar;
  severidade: Severidade;
  origemOrcado: "auto" | "manual";
  drivers: DriverVar[];      // top categorias da linha
  transacoes: TransacaoVar[]; // top transações da linha (flux nível transação)
}

export interface ResumoVariancia {
  receitaOrcado: number; receitaRealizado: number;
  ebitdaOrcado: number; ebitdaRealizado: number;
  lucroOrcado: number; lucroRealizado: number;
}

export interface VarianciaReport {
  periodoLabel: string;
  regime: Regime;
  de: string; ate: string; meses: number;
  linhas: LinhaVariancia[];
  resumo: ResumoVariancia;
  narrativa: string[];
  versao: string;
}

const LINHAS: { id: LinhaOrcId; label: string; tipo: "receita" | "despesa" }[] = [
  { id: "receita", label: "Receita bruta", tipo: "receita" },
  { id: "impostos", label: "Impostos sobre receita", tipo: "despesa" },
  { id: "cmv", label: "CMV / Fornecedores", tipo: "despesa" },
  { id: "folha", label: "Folha", tipo: "despesa" },
  { id: "opex", label: "Despesas operacionais", tipo: "despesa" },
  { id: "financeiro", label: "Resultado financeiro", tipo: "despesa" },
];

const linhaDe = (m: RiskMovement): LinhaOrcId =>
  m.type === "entrada" ? "receita" : (classificarDespesa(m.category) as LinhaOrcId);

function agregarPorLinha(movs: RiskMovement[]): Record<LinhaOrcId, number> {
  const r: Record<LinhaOrcId, number> = { receita: 0, impostos: 0, cmv: 0, folha: 0, opex: 0, financeiro: 0 };
  for (const m of movs) r[linhaDe(m)] += m.amount;
  return r;
}

function mesesEntre(de: string, ate: string): number {
  const a = new Date(de + "T00:00:00").getTime();
  const b = new Date(ate + "T00:00:00").getTime();
  const dias = Math.max(1, (b - a) / 86400000 + 1);
  return Math.max(1, dias / 30.44);
}
function addDias(iso: string, d: number): string {
  const dt = new Date(iso + "T00:00:00");
  dt.setDate(dt.getDate() + d);
  return dt.toISOString().slice(0, 10);
}

/** Baseline mensal por linha = média da janela imediatamente anterior. */
function baselineMensal(input: RiskInput, regime: Regime, de: string, ate: string): Record<LinhaOrcId, number> {
  const mesesJanela = mesesEntre(de, ate);
  const dur = Math.max(1, Math.round(mesesJanela * 30.44));
  const movs = movimentosNoPeriodo(input, regime, addDias(de, -dur), addDias(de, -1));
  const agg = agregarPorLinha(movs);
  const out = {} as Record<LinhaOrcId, number>;
  (Object.keys(agg) as LinhaOrcId[]).forEach((k) => { out[k] = agg[k] / mesesJanela; });
  return out;
}

const arred = (v: number) => Math.round(v);
const fmt = (v: number) => "R$ " + arred(v).toLocaleString("pt-BR");

function montarNarrativa(linhas: LinhaVariancia[], resumo: ResumoVariancia, periodo: string): string[] {
  const out: string[] = [];
  const dLucro = resumo.lucroRealizado - resumo.lucroOrcado;
  out.push(
    dLucro >= 0
      ? `Lucro de ${fmt(resumo.lucroRealizado)} no período (${periodo}) — ${fmt(Math.abs(dLucro))} acima do orçado.`
      : `Lucro de ${fmt(resumo.lucroRealizado)} no período (${periodo}) — ${fmt(Math.abs(dLucro))} abaixo do orçado.`,
  );
  const desf = linhas.filter((l) => l.sinal === "desfavoravel").sort((a, b) => Math.abs(b.varValor) - Math.abs(a.varValor));
  const fav = linhas.filter((l) => l.sinal === "favoravel").sort((a, b) => Math.abs(b.varValor) - Math.abs(a.varValor));
  if (desf[0]) {
    const l = desf[0];
    const cat = l.drivers[0];
    out.push(`Maior desvio desfavorável: ${l.label} em ${fmt(l.realizado)} vs ${fmt(l.orcado)} orçado (${(l.varPct * 100).toFixed(0)}%)${cat ? `, puxado por “${cat.categoria}”` : ""}.`);
  }
  if (fav[0]) {
    const l = fav[0];
    const sinalPct = l.tipo === "receita" ? l.varPct : -l.varPct;
    out.push(`Destaque favorável: ${l.label} ${sinalPct >= 0 ? "+" : ""}${(sinalPct * 100).toFixed(0)}% vs orçado (${fmt(l.realizado)}).`);
  }
  return out;
}

export function analisarVariancia(
  input: RiskInput,
  opts: { regime: Regime; de: string; ate: string; periodoLabel: string },
  override?: OrcamentoOverride,
): VarianciaReport {
  const { regime, de, ate, periodoLabel } = opts;
  const meses = Math.max(1, Math.round(mesesEntre(de, ate)));
  const movs = movimentosNoPeriodo(input, regime, de, ate);
  const real = agregarPorLinha(movs);
  const base = baselineMensal(input, regime, de, ate);

  const linhas: LinhaVariancia[] = LINHAS.map((L) => {
    const manual = override?.[L.id];
    const orcadoMensal = manual != null ? manual : base[L.id];
    const orcado = orcadoMensal * meses;
    const realizado = real[L.id];
    const varValor = realizado - orcado;
    const varPct = orcado !== 0 ? varValor / Math.abs(orcado) : realizado !== 0 ? 1 : 0;
    const sinal: SinalVar =
      Math.abs(varValor) < 1 ? "neutro"
        : L.tipo === "receita" ? (varValor > 0 ? "favoravel" : "desfavoravel")
        : (varValor > 0 ? "desfavoravel" : "favoravel");
    const ap = Math.abs(varPct);
    const severidade: Severidade =
      sinal === "desfavoravel" && ap >= 0.25 ? "critico"
        : sinal === "desfavoravel" && ap >= 0.1 ? "atencao"
        : "ok";

    const movsLinha = movs.filter((m) => linhaDe(m) === L.id);
    const porCat = new Map<string, number>();
    for (const m of movsLinha) {
      const c = m.category || "Sem categoria";
      porCat.set(c, (porCat.get(c) || 0) + m.amount);
    }
    const drivers = Array.from(porCat.entries())
      .map(([categoria, valor]) => ({ categoria, valor }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 4);
    const transacoes = movsLinha
      .slice()
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 4)
      .map((m) => ({ categoria: m.category || "—", data: (regime === "caixa" ? m.paid_date : m.due_date) || m.due_date, valor: m.amount, tipo: m.type }));

    return { id: L.id, label: L.label, tipo: L.tipo, orcado, realizado, varValor, varPct, sinal, severidade, origemOrcado: manual != null ? "manual" : "auto", drivers, transacoes };
  });

  const get = (id: LinhaOrcId) => linhas.find((l) => l.id === id)!;
  const receita = get("receita");
  const somaDesp = (campo: "orcado" | "realizado") =>
    get("impostos")[campo] + get("cmv")[campo] + get("folha")[campo] + get("opex")[campo];
  const ebitdaOrcado = receita.orcado - somaDesp("orcado");
  const ebitdaRealizado = receita.realizado - somaDesp("realizado");
  const resumo: ResumoVariancia = {
    receitaOrcado: receita.orcado,
    receitaRealizado: receita.realizado,
    ebitdaOrcado,
    ebitdaRealizado,
    lucroOrcado: ebitdaOrcado - get("financeiro").orcado,
    lucroRealizado: ebitdaRealizado - get("financeiro").realizado,
  };

  return { periodoLabel, regime, de, ate, meses, linhas, resumo, narrativa: montarNarrativa(linhas, resumo, periodoLabel), versao: VERSAO_ORCAMENTO };
}
