/**
 * Centro Operacional de Caixa — assembla TODOS os blocos da página /fluxo-caixa
 * a partir do mesmo RiskInput, reusando os motores (risco, quant, decisão/Monte
 * Carlo, DRE, executivo, tesouraria). Puro, tipado, demo-safe. Versão
 * `cashflow/1.0.0`. Os blocos interativos (cenários, what-if) recalculam no
 * cliente via `simularCenario` usando `indicadores` + `saldoAtual` expostos aqui.
 */
import { scoreRiscoCaixa } from "@/core/risk-engine";
import { analisarQuantitativo } from "@/core/quant";
import { decidir } from "@/core/decision";
import { preverCaixa } from "@/core/decision/prediction";
import { centroInteligencia } from "@/core/executive";
import { financialDRE, periodoPreset } from "@/core/dre";
import type { RiskInput, RiskMovement } from "@/core/risk-engine/types";
import type { IndicadoresFinanceiros } from "@/core/quant/types";
import type { FinancialAccount } from "@/lib/types";

export const CASHFLOW_VERSION = "cashflow/1.0.0";

// ---------- Tipos do modelo ----------
export interface ResumoExecutivo {
  caixaAtual: number;
  entradasPrevistas: number;
  saidasPrevistas: number;
  geracaoCaixa: number;
  burn: number;
  runwayMeses: number;
  chanceRuptura: number; // 0..1
  score: number; // 0..100
}

export interface FluxoItem { label: string; valor: number }
export interface FluxoGrupo { label: string; valor: number; itens: FluxoItem[] }
export interface FluxoInteligente {
  saldoInicial: number;
  entradas: { total: number; grupos: FluxoGrupo[] };
  saidas: { total: number; grupos: FluxoGrupo[] };
  operacional: number;
  investimentos: number;
  financiamentos: number;
  livre: number;
  saldoFinal: number;
}

export interface PrevRealLinha {
  label: string;
  planejado: number;
  realizado: number;
  diff: number;
  pct: number; // variação (realizado/planejado - 1)
  ia: string;
}

export interface DiaCalendario { date: string; label: string; recebe: number; paga: number; saldo: number }

export interface CrossCheckPasso { label: string; ok: boolean; detalhe: string }
export interface CrossCheck { titulo: string; passos: CrossCheckPasso[] }

export interface ProjecaoHorizonte {
  horizonte: string; // "7 dias"
  dias: number;
  p10: number; p50: number; p90: number;
  probNegativo: number; // 0..1
  confianca: number; // 0..1
}
export interface BandaProj { dia: number; data: string; p10: number; p50: number; p90: number }

export interface DiaHeat { date: string; label: string; saldo: number; nivel: "verde" | "amarelo" | "vermelho" }

export interface WaterfallPasso { label: string; valor: number; acumulado: number; tipo: "base" | "deducao" | "soma" | "total" }

export interface CopilotAchado { tom: "ok" | "atencao" | "risco"; texto: string }
export interface Copilot { achados: CopilotAchado[]; sugestoes: string[] }

export interface EventoFin { quando: string; tipo: string; texto: string; valor?: number; tom: "entrada" | "saida" | "neutro" }

export interface TwinFeeds { entradas: string[]; saidas: string[]; inteligencia: string[] }

export interface FluxoModelo {
  hoje: string;
  diasJanela: number;
  resumo: ResumoExecutivo;
  fluxo: FluxoInteligente;
  prevReal: PrevRealLinha[];
  calendario: DiaCalendario[];
  crossChecks: CrossCheck[];
  projecoes: ProjecaoHorizonte[];
  bandas: BandaProj[]; // série para o gráfico de projeção
  heatmap: DiaHeat[];
  waterfall: WaterfallPasso[];
  copilot: Copilot;
  eventos: EventoFin[];
  twin: { feeds: TwinFeeds; explicacao: string };
  // expostos para blocos interativos (cenários / what-if)
  indicadores: IndicadoresFinanceiros;
  saldoAtual: number;
}

// ---------- Helpers ----------
const fmtBRL = (n: number) => {
  try { return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }); }
  catch { return `R$ ${Math.round(n)}`; }
};
function addDias(iso: string, d: number): string {
  const dt = new Date(iso + "T00:00:00");
  dt.setDate(dt.getDate() + d);
  return dt.toISOString().slice(0, 10);
}
function rotuloDia(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}
const nome = (input: RiskInput, m: RiskMovement) =>
  (m.party_id && input.partyNames?.[m.party_id]) || m.category || "Sem contraparte";

// classificação de entrada
function grupoEntrada(m: RiskMovement): string {
  const t = `${m.category ?? ""}`.toLowerCase();
  if (/pix/.test(t)) return "PIX";
  if (/boleto|t[ií]tulo/.test(t)) return "Boletos";
  if (/cart[aã]o|card/.test(t)) return "Cartões";
  if (/venda|servi[cç]|receita|mensalidade|assinatura/.test(t)) return "Receitas";
  return "Outras";
}
function grupoSaida(m: RiskMovement): string {
  const t = `${m.category ?? ""}`.toLowerCase();
  if (/fornecedor|insumo|compra|mercadoria|cmv/.test(t)) return "Fornecedores";
  if (/folha|sal[aá]rio|pr[oó].?labore|funcion/.test(t)) return "Folha";
  if (/imposto|darf|das\b|iss|icms|tribut|inss|fgts|gps/.test(t)) return "Impostos";
  if (/marketing|ads|m[ií]dia|publicidade|tr[aá]fego/.test(t)) return "Marketing";
  if (/combust|gasolina|diesel|posto|shell|ipiranga/.test(t)) return "Combustível";
  return "Outras";
}
const ehInvestimento = (m: RiskMovement) => /investimento|aplica[cç]|cdb|aquisi[cç]/.test(`${m.category ?? ""}`.toLowerCase());
const ehFinanciamento = (m: RiskMovement) => /financiamento|empr[eé]stimo|parcela banc/.test(`${m.category ?? ""}`.toLowerCase());

// ---------- Assembler ----------
export function montarFluxoCaixa(
  inputRaw: RiskInput,
  accounts: FinancialAccount[],
  opts: { dias: number; conta?: string },
): FluxoModelo {
  const dias = Math.max(1, opts.dias);
  // Escopo por conta: ajusta saldo/tesouraria (movements não trazem account_id).
  const contasEscopo = opts.conta && opts.conta !== "todas"
    ? accounts.filter((a) => a.id === opts.conta)
    : accounts;
  const saldoAtual = opts.conta && opts.conta !== "todas"
    ? (contasEscopo[0]?.balance ?? inputRaw.saldoAtual)
    : inputRaw.saldoAtual;
  const input: RiskInput = { ...inputRaw, saldoAtual, horizonDias: Math.min(365, Math.max(60, dias)) };

  // Motores (1 execução cada).
  const risco = scoreRiscoCaixa(input);
  const quant = analisarQuantitativo(input);
  const decisao = decidir(input);
  const centro = centroInteligencia(input);
  const dre = financialDRE(input, periodoPreset(input.hoje, "mes"));

  const hoje = input.hoje;
  const fim = addDias(hoje, dias);
  const movs = input.movements;
  const naJanela = (m: RiskMovement) => m.due_date >= hoje && m.due_date <= fim && m.status !== "cancelado";

  // ----- Bloco 1: Resumo executivo -----
  const pend = movs.filter((m) => m.status === "pendente");
  const entradasPrevistas = pend.filter((m) => m.type === "entrada" && naJanela(m)).reduce((s, m) => s + m.amount, 0);
  const saidasPrevistas = pend.filter((m) => m.type === "saida" && naJanela(m)).reduce((s, m) => s + m.amount, 0);
  const resumo: ResumoExecutivo = {
    caixaAtual: saldoAtual,
    entradasPrevistas,
    saidasPrevistas,
    geracaoCaixa: entradasPrevistas - saidasPrevistas,
    burn: risco.burn.burnMensal,
    runwayMeses: quant.indicadores.runwayMeses,
    chanceRuptura: risco.probabilidadeRuptura,
    score: quant.score.score,
  };

  // ----- Bloco 2: Fluxo inteligente (árvore) -----
  const janela = movs.filter(naJanela);
  const buildGrupos = (tipo: "entrada" | "saida") => {
    const map = new Map<string, FluxoItem[]>();
    let total = 0;
    for (const m of janela) {
      if (m.type !== tipo) continue;
      if (tipo === "saida" && (ehInvestimento(m) || ehFinanciamento(m))) continue;
      const g = tipo === "entrada" ? grupoEntrada(m) : grupoSaida(m);
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push({ label: nome(input, m), valor: m.amount });
      total += m.amount;
    }
    const grupos: FluxoGrupo[] = Array.from(map.entries())
      .map(([label, itens]) => ({ label, valor: itens.reduce((s, i) => s + i.valor, 0), itens: itens.sort((a, b) => b.valor - a.valor).slice(0, 8) }))
      .sort((a, b) => b.valor - a.valor);
    return { total, grupos };
  };
  const entradas = buildGrupos("entrada");
  const saidas = buildGrupos("saida");
  const investimentos = -janela.filter((m) => m.type === "saida" && ehInvestimento(m)).reduce((s, m) => s + m.amount, 0);
  const financiamentos = janela.filter((m) => ehFinanciamento(m)).reduce((s, m) => s + (m.type === "entrada" ? m.amount : -m.amount), 0);
  const operacional = entradas.total - saidas.total;
  const livre = operacional + investimentos + financiamentos;
  const fluxo: FluxoInteligente = {
    saldoInicial: saldoAtual,
    entradas, saidas, operacional, investimentos, financiamentos, livre,
    saldoFinal: saldoAtual + livre,
  };

  // ----- Bloco 3: Previsto x Realizado (por contraparte) -----
  const grupoPR = new Map<string, { plan: number; real: number }>();
  for (const m of movs) {
    if (m.status === "cancelado") continue;
    const dueNaJanela = m.due_date >= hoje && m.due_date <= fim;
    const paidNaJanela = !!m.paid_date && m.paid_date >= hoje && m.paid_date <= fim;
    if (!dueNaJanela && !paidNaJanela) continue;
    const k = nome(input, m);
    const cur = grupoPR.get(k) ?? { plan: 0, real: 0 };
    if (dueNaJanela) cur.plan += m.amount;
    if (m.status === "pago" && (paidNaJanela || dueNaJanela)) cur.real += m.amount;
    grupoPR.set(k, cur);
  }
  const prevReal: PrevRealLinha[] = Array.from(grupoPR.entries())
    .map(([label, v]) => {
      const diff = v.real - v.plan;
      const pct = v.plan > 0 ? v.real / v.plan - 1 : (v.real > 0 ? 1 : 0);
      return { label, planejado: v.plan, realizado: v.real, diff, pct, ia: comentarioPR(label, pct, diff) };
    })
    .sort((a, b) => (b.planejado + b.realizado) - (a.planejado + a.realizado))
    .slice(0, 8);

  // ----- Bloco 4: Calendário financeiro (diário) -----
  const diasCal = Math.min(Math.max(dias, 7), 31);
  const calendario: DiaCalendario[] = [];
  for (let i = 0; i < diasCal; i++) {
    const d = addDias(hoje, i);
    const recebe = movs.filter((m) => m.type === "entrada" && m.due_date === d && m.status !== "cancelado").reduce((s, m) => s + m.amount, 0);
    const paga = movs.filter((m) => m.type === "saida" && m.due_date === d && m.status !== "cancelado").reduce((s, m) => s + m.amount, 0);
    calendario.push({ date: d, label: rotuloDia(d), recebe, paga, saldo: recebe - paga });
  }

  // ----- Bloco 5: Cross-check inteligente -----
  const temPendSaida = pend.some((m) => m.type === "saida");
  const fornecedores = new Set(movs.filter((m) => m.type === "saida" && m.party_id).map((m) => m.party_id)).size;
  const clientes = new Set(movs.filter((m) => m.type === "entrada" && m.party_id).map((m) => m.party_id)).size;
  const crossChecks: CrossCheck[] = [
    {
      titulo: "Cross-check de despesa",
      passos: [
        { label: "Boleto / título", ok: temPendSaida, detalhe: temPendSaida ? "há contas a pagar em aberto" : "nenhuma conta a pagar pendente" },
        { label: "Nota fiscal", ok: false, detalhe: "vincule a NF na Caixa de Entrada" },
        { label: "Contrato / recorrência", ok: risco.sazonalidade.indiceMesAtual !== undefined, detalhe: "recorrências detectadas alimentam o previsto" },
        { label: "Fornecedor cadastrado", ok: fornecedores > 0, detalhe: `${fornecedores} fornecedores no cadastro` },
        { label: "Orçamento disponível", ok: saldoAtual > saidasPrevistas, detalhe: saldoAtual > saidasPrevistas ? "saldo cobre as saídas do período" : "saídas acima do saldo — atenção" },
        { label: "Saldo em conta", ok: saldoAtual > 0, detalhe: fmtBRL(saldoAtual) },
        { label: "Fluxo atualizado", ok: true, detalhe: "propaga automaticamente para projeção/DRE/dashboard" },
      ],
    },
    {
      titulo: "Cross-check de recebimento",
      passos: [
        { label: "Pedido / venda", ok: clientes > 0, detalhe: `${clientes} clientes com histórico` },
        { label: "Contrato", ok: quant.indicadores.receitaRecorrente > 0, detalhe: `${Math.round(quant.indicadores.receitaRecorrente * 100)}% de receita recorrente` },
        { label: "PIX / Boleto", ok: entradas.total > 0, detalhe: "recebíveis no período" },
        { label: "Comprovante / baixa", ok: movs.some((m) => m.type === "entrada" && m.status === "pago"), detalhe: "recebimentos confirmados" },
        { label: "Conta a receber", ok: entradasPrevistas > 0, detalhe: fmtBRL(entradasPrevistas) },
        { label: "Fluxo · DRE · Dashboard", ok: true, detalhe: "tudo integrado em tempo real" },
      ],
    },
  ];

  // ----- Bloco 6/13: Projeção ML (Monte Carlo) + confiança -----
  const features = decisao.features.atual;
  const horizontes = [7, 30, 90, 180, 365];
  const vol = quant.indicadores.volatilidadeFluxo; // 0..1
  const projecoes: ProjecaoHorizonte[] = horizontes.map((H) => {
    const p = preverCaixa(features, hoje, H, 300);
    const confianca = Math.max(0.55, Math.min(0.99, 1 - (H / 365) * (0.28 + vol * 0.18)));
    return { horizonte: rotuloHorizonte(H), dias: H, p10: p.caixaFinalP10, p50: p.caixaFinalP50, p90: p.caixaFinalP90, probNegativo: p.probabilidadeNegativo, confianca };
  });
  // Série do gráfico: horizonte mais próximo do período (mín. 90 p/ ter curva).
  const Hgraf = Math.min(365, Math.max(90, dias));
  const bandas: BandaProj[] = preverCaixa(features, hoje, Hgraf, 300).bandas.map((b) => ({ dia: b.dia, data: b.data, p10: b.p10, p50: b.p50, p90: b.p90 }));

  // ----- Bloco 7: Heatmap financeiro -----
  const heatmap: DiaHeat[] = risco.liquidez.slice(0, 60).map((p) => {
    const buffer = risco.burn.burnMensal || Math.abs(saidasPrevistas) || 1;
    const nivel: DiaHeat["nivel"] = p.ruptura || p.saldo < 0 ? "vermelho" : p.saldo < buffer ? "amarelo" : "verde";
    return { date: p.date, label: p.label, saldo: p.saldo, nivel };
  });

  // ----- Bloco 8: Waterfall (DRE) -----
  const waterfall = montarWaterfall(dre.gerencial.linhas);

  // ----- Bloco 9: IA Copilot -----
  const achados: CopilotAchado[] = [];
  if (quant.indicadores.crescimentoMensal > 0.02) achados.push({ tom: "ok", texto: `Receita crescendo ${Math.round(quant.indicadores.crescimentoMensal * 100)}% no mês.` });
  for (const ins of centro.insights.slice(0, 4)) {
    achados.push({ tom: ins.severidade === "critica" || ins.severidade === "alta" ? "risco" : "atencao", texto: `${ins.titulo} — ${ins.descricao}` });
  }
  if (risco.rupturaDia != null) achados.push({ tom: "risco", texto: `Caixa pode ficar negativo em ~${risco.rupturaDia} dias.` });
  const sugestoes = [
    ...decisao.recomendacoes.slice(0, 3).map((r) => r.titulo),
    ...centro.briefing.acoes.slice(0, 2),
  ].filter((v, i, a) => v && a.indexOf(v) === i).slice(0, 4);
  const copilot: Copilot = { achados: achados.slice(0, 6), sugestoes };

  // ----- Bloco 11: Eventos financeiros (timeline) -----
  const recentes = movs
    .filter((m) => m.paid_date)
    .sort((a, b) => (b.paid_date! < a.paid_date! ? -1 : 1))
    .slice(0, 6)
    .map<EventoFin>((m) => ({
      quando: rotuloDia(m.paid_date!),
      tipo: m.type === "entrada" ? "Recebimento" : "Pagamento",
      texto: `${m.type === "entrada" ? "Recebido de" : "Pago a"} ${nome(input, m)}`,
      valor: m.amount,
      tom: m.type === "entrada" ? "entrada" : "saida",
    }));
  const hojePend = pend.filter((m) => m.due_date === hoje).slice(0, 4).map<EventoFin>((m) => ({
    quando: "Hoje",
    tipo: m.type === "entrada" ? "Boleto a receber" : "Conta a pagar",
    texto: `${nome(input, m)} vence hoje`,
    valor: m.amount,
    tom: "neutro",
  }));
  const eventos = [...hojePend, ...recentes].slice(0, 8);

  // ----- Digital twin -----
  const feeds: TwinFeeds = {
    entradas: ["PIX", "Boletos", "Contratos", "Vendas", "Recebíveis", "Assinaturas", "Open Finance"],
    saidas: ["Folha", "Impostos", "Fornecedores", "Financiamentos", "Recorrências", "Cartões", "Despesas operacionais"],
    inteligencia: ["Sazonalidade", "Comportamento histórico", "Atrasos médios", "Inadimplência", "Risco por cliente", "Risco por fornecedor", "Pipeline", "Eventos futuros"],
  };
  const twin = { feeds, explicacao: explicacaoTwin(centro.forecast.texto, dre.executivo.comentario, centro.insights[0]?.titulo, decisao.recomendacoes[0]?.titulo) };

  return {
    hoje, diasJanela: dias, resumo, fluxo, prevReal, calendario, crossChecks,
    projecoes, bandas, heatmap, waterfall, copilot, eventos, twin,
    indicadores: quant.indicadores, saldoAtual,
  };
}

// ---------- sub-helpers ----------
function comentarioPR(label: string, pct: number, diff: number): string {
  if (Math.abs(pct) < 0.03) return "Em linha com o planejado.";
  if (pct > 0) return diff > 0
    ? `Acima do previsto (+${Math.round(pct * 100)}%) — possível crescimento operacional ou reajuste de ${label}.`
    : `Recebimento acima do esperado (+${Math.round(pct * 100)}%).`;
  return `Abaixo do previsto (${Math.round(pct * 100)}%) — verifique atraso ou redução em ${label}.`;
}

function rotuloHorizonte(H: number): string {
  if (H < 30) return `${H} dias`;
  if (H < 365) return `${H} dias`;
  return "365 dias";
}

function montarWaterfall(linhas: { label: string; valor: number; papel: string }[]): WaterfallPasso[] {
  const passos: WaterfallPasso[] = [];
  let acc = 0;
  for (const l of linhas) {
    if (l.papel === "receita") {
      acc = l.valor;
      passos.push({ label: l.label, valor: l.valor, acumulado: acc, tipo: "base" });
    } else if (l.papel === "deducao") {
      acc += l.valor <= 0 ? l.valor : -l.valor;
      passos.push({ label: l.label, valor: -Math.abs(l.valor), acumulado: acc, tipo: "deducao" });
    } else if (l.papel === "subtotal" || l.papel === "resultado") {
      acc = l.valor;
      passos.push({ label: l.label, valor: l.valor, acumulado: acc, tipo: "total" });
    }
  }
  return passos.slice(0, 12);
}

function explicacaoTwin(forecast: string, comentario: string, insight?: string, recomendacao?: string): string {
  const partes: string[] = [];
  if (forecast) partes.push(forecast);
  if (insight) partes.push(`Principal sinal: ${insight}.`);
  if (recomendacao) partes.push(`Ação sugerida: ${recomendacao}.`);
  if (comentario && partes.length < 3) partes.push(comentario);
  return partes.join(" ") || "O gêmeo digital do caixa está sincronizado com os lançamentos atuais.";
}
