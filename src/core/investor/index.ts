/**
 * Quattro — Investor Update (`investor/1.0.0`)
 * --------------------------------------------
 * O relatório mensal para investidores que toda startup precisa mandar
 * (benchmark: Mercury/Runway): métricas do mês + destaques + riscos + o
 * TEXTO pronto para colar no e-mail. Puro, tipado, demo-safe — deriva tudo
 * do mesmo `RiskInput` via camada quantitativa (nada digitado à mão além
 * dos campos do fundador).
 */
import type { RiskInput } from "@/core/risk-engine/types";
import { analisarQuantitativo } from "@/core/quant";
import { CLASSIF_SAUDE_LABEL } from "@/core/quant/types";
import { mrr as mrrCanonico } from "@/core/indicadores";

export const VERSAO_INVESTOR = "investor/1.0.0";

export interface InvestorKpi {
  id: string;
  label: string;
  /** valor formatável: BRL quando `moeda`, senão texto pronto */
  valor: number | string;
  moeda?: boolean;
  hint?: string;
}

export interface InvestorUpdate {
  /** mês de referência, ex.: "julho de 2026" */
  mesReferencia: string;
  kpis: InvestorKpi[];
  destaquesAuto: string[];
  atencaoAuto: string[];
  /** insumos crus p/ o texto */
  raw: {
    caixa: number;
    burn: number;
    runwayMeses: number;
    receitaMes: number;
    /** `null` sem receita no mês anterior — sem base não há variação. */
    crescimentoMoM: number | null; // -1..+
    /** `null` quando o MRR canônico é indisponível — nunca "R$ 0,00". */
    mrrEstimado: number | null;
    /** `null` quando não houve receita líquida — sem receita não existe margem. */
    margemLiquida: number | null; // 0..1
    inadimplencia: number; // 0..1
    concentracao: number; // 0..1
    score: number;
    classificacao: string;
  };
  versaoModelo: string;
}

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

const brl = (v: number) =>
  formatBRL(v);
const pct = (v: number, casas = 0) =>
  `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: casas })}%`;

import { cascataDRE } from "@/core/relatorios/cascata";

/** "2026-10" → "2026-09" (fatiando a string — nunca getMonth de Date UTC). */
function mesAnterior(ym: string): string {
  const [a, m] = ym.split("-").map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
}
function cascataDoMes(input: RiskInput, ym: string) {
  const [a, m] = ym.split("-").map(Number);
  const ultimo = `${ym}-${String(new Date(a, m, 0).getDate()).padStart(2, "0")}`;
  return cascataDRE(input, { intervalo: { de: `${ym}-01`, ate: ultimo }, regime: "competencia" });
}
/** Variação com o SINAL escrito (− U+2212 no negativo); ausente vira "—". */
function textoMoM(v: number | null): string {
  if (v === null) return "—";
  return `${v >= 0 ? "+" : "−"}${pct(Math.abs(v), 1)}`;
}

import { formatBRL } from "@/lib/format";
export function montarInvestorUpdate(input: RiskInput): InvestorUpdate {
  const q = analisarQuantitativo(input);
  const ind = q.indicadores;

  /*
   * ═══════════════════════════════════════════════════════════════════════
   * ⚠️ O MÊS DO RELATÓRIO É O ÚLTIMO MÊS FECHADO, não o mês de `hoje`.
   * ═══════════════════════════════════════════════════════════════════════
   *
   * Medido no dia 1º de outubro: o texto dizia "Fechamos outubro de 2026 com
   * R$ 446.517,16 de receita (−53,8% MoM)". Outubro tinha UM dia; a receita
   * era a competência do mês inteiro (títulos que ainda vão vencer) e o MoM
   * vinha de OUTRA base (a série de CAIXA do motor quantitativo) — três
   * afirmações erradas numa frase que vai para fora da empresa. Relatório ao
   * investidor é sobre o mês ENCERRADO: no dia 1º de outubro, setembro.
   *
   * ⚠️ E o MoM sai da MESMA cascata, mês fechado contra o mês fechado
   * anterior — receita e variação na mesma base, ou a frase compara competência
   * com caixa. Sem receita no mês anterior a variação é AUSENTE (ONDA 4), não 0%.
   */
  const ref = mesAnterior(input.hoje.slice(0, 7));
  const antes = mesAnterior(ref);
  const [anoS, mesS] = ref.split("-");
  const mesReferencia = `${MESES[Math.max(0, Number(mesS) - 1)]} de ${anoS}`;
  const casc = cascataDoMes(input, ref);
  const cascAntes = cascataDoMes(input, antes);
  const receitaMes = casc.linhas.receita_bruta.valor;
  const receitaAntes = cascAntes.linhas.receita_bruta.valor;
  const crescimentoMoM = receitaAntes > 0 ? (receitaMes - receitaAntes) / receitaAntes : null;
  // ⚠️ MRR pelo indicador canônico. A conta anterior era
  // `receitaRecorrente × receitaMensal` — um SHARE (0..1) multiplicado por um
  // valor, que é uma definição diferente das outras três do sistema. O número
  // que ia para o investidor não era o mesmo que a tela de assinaturas exibia.
  // ⚠️ E a AUSÊNCIA atravessa: o canônico devolve `valor: 0` junto com
  // `indisponivel` quando não há base, e "MRR R$ 0,00 · ARR R$ 0,00" num
  // relatório ao investidor afirma que a empresa não tem receita recorrente.
  const mrrInd = mrrCanonico(input);
  const mrrEstimado = mrrInd.indisponivel ? null : mrrInd.valor;
  const runway = ind.runwayMeses;

  const raw = {
    caixa: input.saldoAtual,
    burn: ind.burnRate,
    runwayMeses: runway,
    receitaMes,
    crescimentoMoM,
    mrrEstimado,
    // ⚠️ `null` quando não houve receita líquida: sem receita não existe margem,
    // e "0%" diria ao investidor que a empresa vendeu e não sobrou nada.
    margemLiquida: casc.margemLiquida.indisponivel ? null : casc.margemLiquida.valor,
    inadimplencia: ind.inadimplencia,
    concentracao: ind.concentracaoReceita,
    score: q.score.score,
    classificacao: CLASSIF_SAUDE_LABEL[q.score.classificacao] ?? q.score.classificacao,
  };

  const kpis: InvestorKpi[] = [
    { id: "caixa", label: "Caixa", valor: raw.caixa, moeda: true, hint: "saldo consolidado das contas, hoje" },
    { id: "burn", label: "Burn mensal", valor: raw.burn, moeda: true, hint: "consumo líquido de caixa/mês (0 = gera caixa)" },
    { id: "runway", label: "Runway", valor: runway >= 120 ? "10+ anos" : `${runway.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} meses`, hint: "caixa ÷ burn" },
    { id: "receita", label: "Receita do mês", valor: receitaMes, moeda: true,
      hint: `receita bruta operacional de ${mesReferencia}, competência (cascata do DRE)` },
    { id: "mom", label: "Crescimento MoM", valor: textoMoM(crescimentoMoM),
      hint: crescimentoMoM === null ? "sem receita no mês anterior — sem base não há variação" : "receita vs. mês anterior, mesma base (competência)" },
    { id: "mrr", label: "MRR estimado", valor: mrrEstimado ?? "—", moeda: mrrEstimado !== null,
      hint: mrrEstimado === null ? (mrrInd.indisponivel?.motivo ?? "sem base para estimar") : "receita das contrapartes recorrentes, mensalizada" },
    { id: "arr", label: "ARR estimado", valor: mrrEstimado === null ? "—" : mrrEstimado * 12, moeda: mrrEstimado !== null, hint: "MRR × 12" },
    { id: "margem", label: "Margem líquida",
      valor: raw.margemLiquida === null ? "—" : pct(raw.margemLiquida, 1),
      hint: raw.margemLiquida === null
        ? "sem receita líquida no mês — sem receita não existe margem"
        : "resultado líquido ÷ receita líquida, competência (cascata do DRE)" },
    { id: "score", label: "Score de saúde", valor: `${raw.score}/100 · ${raw.classificacao}`, hint: "motor quantitativo (8 pilares)" },
  ];

  const destaquesAuto = q.score.fatoresPositivos.slice(0, 4);
  const atencaoAuto = q.score.fatoresNegativos.slice(0, 4);

  return { mesReferencia, kpis, destaquesAuto, atencaoAuto, raw, versaoModelo: VERSAO_INVESTOR };
}

const MESES_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "julho de 2026" → "July 2026". */
function mesReferenciaEn(mesRefPt: string): string {
  const [mesPt, , ano] = mesRefPt.split(" ");
  const i = MESES.indexOf(mesPt);
  return i >= 0 ? `${MESES_EN[i]} ${ano}` : mesRefPt;
}

/** Rótulos EN dos KPIs (investidor YC lê inglês; valores seguem em BRL). */
const KPI_EN: Record<string, string> = {
  caixa: "Cash",
  burn: "Monthly burn",
  runway: "Runway",
  receita: "Revenue (month)",
  mom: "MoM growth",
  mrr: "Estimated MRR",
  arr: "Estimated ARR",
  margem: "Net margin",
  score: "Health score",
};

/**
 * Monta o e-mail pronto — os campos do fundador entram nas seções.
 * `idioma: "en"` gera a versão em inglês (padrão dos updates YC); os valores
 * seguem em BRL.
 */
export function gerarTextoInvestorUpdate(
  u: InvestorUpdate,
  extras?: { empresa?: string; destaques?: string; pedidos?: string; idioma?: "pt" | "en" },
): string {
  const r = u.raw;
  const en = extras?.idioma === "en";
  const linhas: string[] = [];
  const empresa = extras?.empresa?.trim();
  const runwayStr = r.runwayMeses.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  const mesRef = en ? mesReferenciaEn(u.mesReferencia) : u.mesReferencia;

  linhas.push(`${empresa ? empresa + " — " : ""}${en ? "Investor update" : "Relatório ao investidor"} · ${mesRef}`);
  linhas.push("");
  linhas.push("TL;DR");
  linhas.push(
    en
      ? `We closed ${mesRef} with ${brl(r.receitaMes)} in revenue (${r.crescimentoMoM === null ? "no prior month to compare" : `${textoMoM(r.crescimentoMoM)} MoM`}), ` +
        `${brl(r.caixa)} in cash and ${r.burn > 0 ? `a ${brl(r.burn)}/month burn (${runwayStr} months of runway)` : "positive cash generation"}.`
      : `Fechamos ${mesRef} com ${brl(r.receitaMes)} de receita (${r.crescimentoMoM === null ? "sem mês anterior para comparar" : `${textoMoM(r.crescimentoMoM)} MoM`}), ` +
        `caixa de ${brl(r.caixa)} e ${r.burn > 0 ? `burn de ${brl(r.burn)}/mês (runway de ${runwayStr} meses)` : "geração de caixa positiva"}.`,
  );
  linhas.push("");
  linhas.push(en ? "Metrics" : "Métricas");
  for (const k of u.kpis) {
    const label = en ? KPI_EN[k.id] ?? k.label : k.label;
    linhas.push(`- ${label}: ${typeof k.valor === "number" ? brl(k.valor) : k.valor}`);
  }
  if (extras?.destaques?.trim() || u.destaquesAuto.length) {
    linhas.push("");
    linhas.push(en ? "Highlights" : "Destaques");
    if (extras?.destaques?.trim()) linhas.push(extras.destaques.trim());
    for (const d of u.destaquesAuto) linhas.push(`- ${d}`);
  }
  if (u.atencaoAuto.length) {
    linhas.push("");
    linhas.push(en ? "Watch items" : "Pontos de atenção");
    for (const a of u.atencaoAuto) linhas.push(`- ${a}`);
  }
  if (extras?.pedidos?.trim()) {
    linhas.push("");
    linhas.push(en ? "How you can help" : "Como vocês podem ajudar");
    linhas.push(extras.pedidos.trim());
  }
  linhas.push("");
  linhas.push(
    en
      ? `— generated by Quattro (${u.versaoModelo}) from the company's real ledger`
      : `— gerado pelo Quattro (${u.versaoModelo}) com os números reais do sistema`,
  );
  return linhas.join("\n");
}
