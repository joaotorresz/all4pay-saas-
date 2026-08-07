/**
 * Motor de Score — combina os pilares num score multifatorial (0..100),
 * com pesos explícitos (rastreável/auditável). Score alto = mais saudável.
 */
import type {
  RiskInput,
  PilarResult,
  Nivel,
  RunwayCenarios,
  ConcentracaoResult,
  InadimplenciaResult,
  SazonalidadeResult,
  BurnResult,
} from "./types";
import { clamp } from "./types";
import { recebiveisPonderados, compromissosAbertos, realizados } from "./normalize";

const PESOS: Record<string, number> = {
  liquidez: 0.2,
  previsibilidade: 0.15,
  concentracao: 0.15,
  tendencia: 0.15,
  burn: 0.1,
  inadimplencia: 0.1,
  sazonalidade: 0.05,
  compromissos: 0.1,
};

function receitaMensalSerie(input: RiskInput): number[] {
  const map = new Map<string, number>();
  for (const m of input.movements) {
    // só receita REALIZADA (pago), por data de caixa — alinhado a burn/
    // sazonalidade. Antes contava cancelado/pendente/mês parcial, inflando o CV
    // e subestimando a previsibilidade (e o score).
    if (m.type !== "entrada" || m.status !== "pago") continue;
    const d = m.paid_date ?? m.due_date;
    const k = d.slice(0, 7);
    map.set(k, (map.get(k) ?? 0) + m.amount);
  }
  return Array.from(map.values());
}

function coefVariacao(xs: number[]): number {
  const v = xs.filter((x) => x > 0);
  if (v.length < 2) return 0;
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const varr = v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length;
  return mean ? Math.sqrt(varr) / mean : 0;
}

export interface ScoreParts {
  componentes: PilarResult[];
  score: number;
  nivel: Nivel;
  probabilidadeRuptura: number;
  runwayDias: number;
}

export function calcularScore(
  input: RiskInput,
  m: {
    burn: BurnResult;
    runway: RunwayCenarios;
    rupturaDia: number | null;
    concentracao: ConcentracaoResult;
    inadimplencia: InadimplenciaResult;
    sazonalidade: SazonalidadeResult;
  },
): ScoreParts {
  const horizon = input.horizonDias ?? 60;

  // 1. Liquidez imediata — runway + penalidade por ruptura próxima
  const runwayScore = clamp((m.runway.base / 180) * 100);
  const liquidezScore =
    m.rupturaDia !== null
      ? Math.min(runwayScore, clamp((m.rupturaDia / horizon) * 100))
      : runwayScore;

  // 2. Previsibilidade de receita — menor variação → maior score
  const cov = coefVariacao(receitaMensalSerie(input));
  const previsScore = clamp(100 - cov * 120);

  // 3. Concentração — menor share do maior cliente → maior score
  const ts = m.concentracao.topShare;
  const concScore = ts <= 0.2 ? 100 : clamp(100 - ((ts - 0.2) / 0.4) * 80);

  // 4. Tendência de caixa — net 30d recentes vs 30d anteriores
  const net = (rows: ReturnType<typeof realizados>) =>
    rows.reduce((s, r) => s + (r.type === "entrada" ? r.amount : -r.amount), 0);
  const ult30 = net(realizados(input, 30));
  const todos60 = net(realizados(input, 60));
  const prev30 = todos60 - ult30;
  const slope = ult30 - prev30;
  const tendScore = clamp(50 + (slope / (m.burn.receitaMensal || 1)) * 100);

  // 5. Burn rate
  const burnScore =
    m.burn.liquidoMensal >= 0
      ? 100
      : clamp(100 - (m.burn.burnMensal / (m.burn.receitaMensal || 1)) * 100);

  // 6. Inadimplência
  const inadScore = clamp(100 - m.inadimplencia.overdueRatio * 150);

  // 7. Sazonalidade — exposição do mês atual
  const sazScore = clamp(60 + (m.sazonalidade.indiceMesAtual - 1) * 80);

  // 8. Compromissos futuros — cobertura dos próximos 30 dias
  const lim = new Date(input.hoje);
  lim.setDate(lim.getDate() + 30);
  const limISO = lim.toISOString().slice(0, 10);
  const in30 = recebiveisPonderados(input)
    .filter((r) => r.due_date <= limISO)
    .reduce((s, r) => s + r.valorEsperado, 0);
  const out30 = compromissosAbertos(input)
    .filter((p) => p.due_date <= limISO)
    .reduce((s, p) => s + p.amount, 0);
  const coverage = out30 === 0 ? 2 : (input.saldoAtual + in30) / out30;
  const compScore = clamp(coverage * 60);

  const componentes: PilarResult[] = [
    { id: "liquidez", label: "Liquidez imediata", peso: PESOS.liquidez, score: Math.round(liquidezScore), valor: m.runway.base, detalhe: `Runway base de ${m.runway.base} dias${m.rupturaDia !== null ? `, ruptura projetada em ${m.rupturaDia} dias` : ""}.` },
    { id: "previsibilidade", label: "Previsibilidade de receita", peso: PESOS.previsibilidade, score: Math.round(previsScore), valor: cov, detalhe: `Coeficiente de variação da receita mensal: ${(cov * 100).toFixed(0)}%.` },
    { id: "concentracao", label: "Concentração de clientes", peso: PESOS.concentracao, score: Math.round(concScore), valor: ts, detalhe: `Maior cliente representa ${(ts * 100).toFixed(0)}% da receita.` },
    { id: "tendencia", label: "Tendência de caixa", peso: PESOS.tendencia, score: Math.round(tendScore), valor: slope, detalhe: slope >= 0 ? "Geração de caixa em melhora nos últimos 30 dias." : "Geração de caixa em piora nos últimos 30 dias." },
    { id: "burn", label: "Burn rate", peso: PESOS.burn, score: Math.round(burnScore), valor: m.burn.liquidoMensal, detalhe: m.burn.liquidoMensal >= 0 ? "Operação gera caixa." : `Queima de ${Math.round(m.burn.burnMensal)} por mês.` },
    { id: "inadimplencia", label: "Inadimplência", peso: PESOS.inadimplencia, score: Math.round(inadScore), valor: m.inadimplencia.overdueRatio, detalhe: `${(m.inadimplencia.overdueRatio * 100).toFixed(0)}% do total a receber está vencido.` },
    { id: "sazonalidade", label: "Sazonalidade", peso: PESOS.sazonalidade, score: Math.round(sazScore), valor: m.sazonalidade.indiceMesAtual, detalhe: `Índice do mês atual: ${m.sazonalidade.indiceMesAtual.toFixed(2)} (1 = média).` },
    { id: "compromissos", label: "Compromissos futuros", peso: PESOS.compromissos, score: Math.round(compScore), valor: coverage, detalhe: `Cobertura dos próximos 30 dias: ${coverage.toFixed(1)}×.` },
  ];

  const score = Math.round(
    componentes.reduce((s, c) => s + c.score * c.peso, 0),
  );
  const nivel: Nivel =
    score >= 75 ? "baixo" : score >= 50 ? "medio" : score >= 30 ? "alto" : "critico";

  let p =
    m.rupturaDia !== null
      ? 1 - m.rupturaDia / horizon
      : (100 - score) / 250;
  if (m.runway.pessimista < 30) p = Math.max(p, 0.6);
  const probabilidadeRuptura = Math.min(0.97, Math.max(0.02, p));

  return { componentes, score, nivel, probabilidadeRuptura, runwayDias: m.runway.base };
}
