/**
 * all4pay — Investor Update (`investor/1.0.0`)
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
    crescimentoMoM: number; // -1..+
    mrrEstimado: number;
    margemLiquida: number; // 0..1
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
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const pct = (v: number, casas = 0) =>
  `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: casas })}%`;

export function montarInvestorUpdate(input: RiskInput): InvestorUpdate {
  const q = analisarQuantitativo(input);
  const ind = q.indicadores;

  // fatia string "YYYY-MM-DD" (nunca getMonth de Date UTC — vide guarda tz)
  const [anoS, mesS] = input.hoje.slice(0, 10).split("-");
  const mesReferencia = `${MESES[Math.max(0, Number(mesS) - 1)]} de ${anoS}`;

  const receitaMes = q.serie.length ? q.serie[q.serie.length - 1].receita : ind.receitaMensal;
  const mrrEstimado = ind.receitaRecorrente * ind.receitaMensal;
  const runway = ind.runwayMeses;

  const raw = {
    caixa: input.saldoAtual,
    burn: ind.burnRate,
    runwayMeses: runway,
    receitaMes,
    crescimentoMoM: ind.crescimentoMensal,
    mrrEstimado,
    margemLiquida: ind.margemLiquida,
    inadimplencia: ind.inadimplencia,
    concentracao: ind.concentracaoReceita,
    score: q.score.score,
    classificacao: CLASSIF_SAUDE_LABEL[q.score.classificacao] ?? q.score.classificacao,
  };

  const kpis: InvestorKpi[] = [
    { id: "caixa", label: "Caixa", valor: raw.caixa, moeda: true, hint: "saldo consolidado das contas" },
    { id: "burn", label: "Burn mensal", valor: raw.burn, moeda: true, hint: "consumo líquido de caixa/mês (0 = gera caixa)" },
    { id: "runway", label: "Runway", valor: runway >= 120 ? "10+ anos" : `${runway.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} meses`, hint: "caixa ÷ burn" },
    { id: "receita", label: "Receita do mês", valor: receitaMes, moeda: true },
    { id: "mom", label: "Crescimento MoM", valor: `${raw.crescimentoMoM >= 0 ? "+" : ""}${pct(raw.crescimentoMoM, 1)}`, hint: "receita vs. mês anterior" },
    { id: "mrr", label: "MRR estimado", valor: mrrEstimado, moeda: true, hint: "share recorrente × receita mensal" },
    { id: "arr", label: "ARR estimado", valor: mrrEstimado * 12, moeda: true, hint: "MRR × 12" },
    { id: "margem", label: "Margem líquida", valor: pct(raw.margemLiquida, 1) },
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

  linhas.push(`${empresa ? empresa + " — " : ""}Investor update · ${mesRef}`);
  linhas.push("");
  linhas.push("TL;DR");
  linhas.push(
    en
      ? `We closed ${mesRef} with ${brl(r.receitaMes)} in revenue (${r.crescimentoMoM >= 0 ? "+" : ""}${pct(r.crescimentoMoM, 1)} MoM), ` +
        `${brl(r.caixa)} in cash and ${r.burn > 0 ? `a ${brl(r.burn)}/month burn (${runwayStr} months of runway)` : "positive cash generation"}.`
      : `Fechamos ${mesRef} com ${brl(r.receitaMes)} de receita (${r.crescimentoMoM >= 0 ? "+" : ""}${pct(r.crescimentoMoM, 1)} MoM), ` +
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
      ? `— generated by all4pay (${u.versaoModelo}) from the company's real ledger`
      : `— gerado pelo all4pay (${u.versaoModelo}) com os números reais do sistema`,
  );
  return linhas.join("\n");
}
