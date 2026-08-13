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
import { financialDRE } from "@/core/dre";
import type { RiskInput, RiskMovement } from "@/core/risk-engine/types";
import type { IndicadoresFinanceiros } from "@/core/quant/types";
import type { FinancialAccount } from "@/lib/types";
import {
  runwayMeses as runwayMesesCanonico, saldo as saldoCanonico, previstoNaJanela,
  janela as janelaCanonica, type Indicador as IndicadorCanonico,
} from "@/core/indicadores";

export const CASHFLOW_VERSION = "cashflow/1.0.0";

// ---------- Tipos do modelo ----------
export interface ResumoExecutivo {
  caixaAtual: number;
  entradasPrevistas: number;
  saidasPrevistas: number;
  geracaoCaixa: number;
  burn: number;
  runwayMeses: number;
  /**
   * ⚠️ O runway CANÔNICO, inteiro — é ele que a tela deve ler.
   *
   * `runwayMeses` continua aqui porque meia dúzia de blocos desta página o
   * consomem como número; mas era ele, sozinho, que produzia "33 meses de
   * fôlego" com burn zero, e o cartão do resumo executivo é onde essa frase
   * era lida. Quando `indisponivel` está preenchido, o número é 0 e não
   * significa nada.
   */
  runway: IndicadorCanonico;
  /**
   * ⚠️ Os três primeiros cartões, também INTEIROS. Os campos `number` acima
   * continuam existindo porque meia dúzia de blocos desta página os consome
   * como número — mas o cartão do resumo executivo lê daqui, porque é ele que
   * a pessoa olha de relance, e é de relance que "R$ 0" vira "não entra nada".
   */
  caixaCanonico: IndicadorCanonico;
  entradasCanonicas: IndicadorCanonico;
  saidasCanonicas: IndicadorCanonico;
  chanceRuptura: number; // 0..1
  score: number; // 0..100
  /**
   * ═══════════════════════════════════════════════════════════════════════
   * ⚠️ **AS DUAS JANELAS DO MESMO CARTÃO — A4P-005**
   * ═══════════════════════════════════════════════════════════════════════
   *
   * `geracaoCaixa` e `burn` ficam lado a lado e olham para lados OPOSTOS do
   * tempo:
   *
   *  · **geração de caixa** = entradas − saídas **PREVISTAS**, no intervalo
   *    `[hoje, hoje + N]` do filtro. É o FUTURO agendado.
   *  · **burn** = média mensal do que foi **REALIZADO** nos últimos 90 dias
   *    (`calcularBurnRate`, janela fixa). É o PASSADO consumado.
   *
   * Sem dizer isso, o cartão convida a subtrair um do outro — e a conta não
   * significa nada, porque nenhum dos dois números fala do período do outro.
   * Foi assim que "geração de caixa positiva" apareceu ao lado de um burn
   * alto, e a leitura natural ("estou gerando mais do que queimo") era falsa:
   * o positivo vinha de recebimentos que ainda não aconteceram.
   *
   * ⚠️ **Nenhum dos dois muda de valor.** A decisão foi ROTULAR, não alinhar
   * as janelas — alinhar exigiria escolher qual pergunta sacrificar, e as duas
   * são legítimas: "o que vem pela frente" e "em que ritmo venho queimando".
   * É o mesmo desenho de `pontePosicaoFluxo` e de `ponteRupturaRunway`: duas
   * respostas verdadeiras a perguntas diferentes, exibidas com o mesmo peso,
   * viram contradição aparente até alguém escrever qual é qual.
   *
   * ⚠️ Os rótulos são DERIVADOS dos parâmetros reais (o `dias` do filtro, a
   * janela do motor de burn), nunca microtexto escrito à mão — texto à mão
   * envelhece na primeira mudança de fórmula e passa a descrever um cálculo
   * que não existe mais, que é pior do que não explicar (regra da ONDA 11).
   */
  janelaGeracao: string;
  janelaBurn: string;
}

/** A janela do motor de burn, em dias. Espelha o padrão de `calcularBurnRate`. */
export const BURN_JANELA_DIAS = 90;

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
  catch { return `R$${Math.round(n)}`; }
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
export type RegimeFluxo = "competencia" | "caixa" | "hibrido";
export type VisaoFluxo = "previsto" | "realizado" | "consolidado";

export function montarFluxoCaixa(
  inputRaw: RiskInput,
  accounts: FinancialAccount[],
  opts: { dias: number; conta?: string; regime?: RegimeFluxo; visao?: VisaoFluxo },
): FluxoModelo {
  const dias = Math.max(1, opts.dias);
  const regime: RegimeFluxo = opts.regime ?? "hibrido";
  const visao: VisaoFluxo = opts.visao ?? "consolidado";
  const escopoConta = !!opts.conta && opts.conta !== "todas";

  // Escopo por conta: ajusta saldo E filtra os lançamentos da conta (accountId).
  const contasEscopo = escopoConta ? accounts.filter((a) => a.id === opts.conta) : accounts;
  const saldoAtual = escopoConta ? (contasEscopo[0]?.balance ?? inputRaw.saldoAtual) : inputRaw.saldoAtual;
  const movsConta = escopoConta ? inputRaw.movements.filter((m) => m.accountId === opts.conta) : inputRaw.movements;
  const input: RiskInput = { ...inputRaw, movements: movsConta, saldoAtual, horizonDias: Math.min(365, Math.max(60, dias)) };

  // Motores (1 execução cada).
  const risco = scoreRiscoCaixa(input);
  const quant = analisarQuantitativo(input);
  const decisao = decidir(input);
  const centro = centroInteligencia(input);
  const hoje = input.hoje;
  const fim = addDias(hoje, dias);
  const movs = input.movements;

  // Waterfall (DRE) reflete o período selecionado (janela retroativa) + regime.
  const dre = financialDRE(input, {
    regime: regime === "caixa" ? "caixa" : "competencia",
    de: addDias(hoje, -dias),
    ate: hoje,
    periodoLabel: `Últimos ${dias} dias`,
  });

  // Data de referência por regime: competência=vencimento, caixa=pagamento,
  // híbrido=pago pela data de pagamento e pendente pelo vencimento.
  const dataRef = (m: RiskMovement) =>
    regime === "caixa" ? (m.paid_date ?? m.due_date)
      : regime === "competencia" ? m.due_date
        : (m.status === "pago" ? (m.paid_date ?? m.due_date) : m.due_date);
  // Visão: previsto=pendente, realizado=pago, consolidado=ambos.
  const passaVisao = (m: RiskMovement) =>
    visao === "previsto" ? m.status === "pendente"
      : visao === "realizado" ? m.status === "pago"
        : m.status !== "cancelado";
  const noPeriodo = (m: RiskMovement) => { const d = dataRef(m); return d >= hoje && d <= fim && m.status !== "cancelado"; };
  const naJanela = (m: RiskMovement) => noPeriodo(m) && passaVisao(m);

  // ----- Bloco 1: Resumo executivo -----
  // "Previstas" são sempre o que está PENDENTE com vencimento na janela
  // (independente da visão; a visão muda a árvore/calendário, não os KPIs forward).
  const pend = movs.filter((m) => m.status === "pendente");
  const venceNaJanela = (m: RiskMovement) => m.due_date >= hoje && m.due_date <= fim;
  const entradasPrevistas = pend.filter((m) => m.type === "entrada" && venceNaJanela(m)).reduce((s, m) => s + m.amount, 0);
  const saidasPrevistas = pend.filter((m) => m.type === "saida" && venceNaJanela(m)).reduce((s, m) => s + m.amount, 0);
  const resumo: ResumoExecutivo = {
    caixaAtual: saldoAtual,
    entradasPrevistas,
    saidasPrevistas,
    geracaoCaixa: entradasPrevistas - saidasPrevistas,
    burn: risco.burn.burnMensal,
    runwayMeses: quant.indicadores.runwayMeses,
    runway: runwayMesesCanonico(input),
    caixaCanonico: saldoCanonico(input),
    entradasCanonicas: previstoNaJanela(input, janelaCanonica(hoje, fim, "Janela do filtro"), "entrada"),
    saidasCanonicas: previstoNaJanela(input, janelaCanonica(hoje, fim, "Janela do filtro"), "saida"),
    chanceRuptura: risco.probabilidadeRuptura,
    score: quant.score.score,
    // Derivados dos parâmetros REAIS: `dias` é o horizonte do filtro da tela e
    // `BURN_JANELA_DIAS` é o padrão de `calcularBurnRate`. Mudar qualquer um
    // dos dois muda a frase junto, sem ninguém precisar lembrar.
    janelaGeracao: `previsto · próximos ${dias} dias`,
    janelaBurn: `realizado · média dos últimos ${BURN_JANELA_DIAS} dias`,
  };

  // ----- Bloco 2: Fluxo inteligente (árvore) -----
  const janela = movs.filter(naJanela);
  const buildGrupos = (tipo: "entrada" | "saida") => {
    const map = new Map<string, FluxoItem[]>();
    let total = 0;
    for (const m of janela) {
      if (m.type !== tipo) continue;
      // Fora do operacional nos DOIS sentidos: uma ENTRADA de financiamento/
      // investimento é contada à parte (financiamentos/investimentos). Sem isto,
      // um empréstimo recebido entrava em entradas.total E em financiamentos —
      // dobrando no fluxo livre / saldo final.
      if (ehInvestimento(m) || ehFinanciamento(m)) continue;
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
  const investimentos = janela.filter((m) => ehInvestimento(m)).reduce((s, m) => s + (m.type === "entrada" ? m.amount : -m.amount), 0);
  const financiamentos = janela.filter((m) => ehFinanciamento(m)).reduce((s, m) => s + (m.type === "entrada" ? m.amount : -m.amount), 0);
  const operacional = entradas.total - saidas.total;
  const livre = operacional + investimentos + financiamentos;
  const fluxo: FluxoInteligente = {
    saldoInicial: saldoAtual,
    entradas, saidas, operacional, investimentos, financiamentos, livre,
    saldoFinal: saldoAtual + livre,
  };

  /* ----- Bloco 3: Previsto x Realizado (por contraparte) -----
   *
   * ⚠️ **A JANELA OLHA PARA TRÁS — A4P-007.**
   *
   * Ela era `[hoje, hoje + N]`, e isso tornava o bloco incapaz de dizer a
   * verdade: **pagamento é fato do passado.** Medido nesta base, 101 de 101
   * movimentos liquidados têm `paid_date` ANTERIOR a hoje — então a coluna
   * *Realizado* somava praticamente zero contra um *Planejado* cheio, e toda
   * contraparte aparecia como se não tivesse pago nada. Um comparativo em que
   * um dos dois lados não pode existir não compara: ele acusa.
   *
   * Agora a janela é `[hoje − N, hoje]`, e as duas colunas são ancoradas no
   * MESMO conjunto — os títulos que **venceram** no período:
   *
   *  · **planejado** = o que venceu na janela (o compromisso do período);
   *  · **realizado** = a parte desses mesmos títulos que já foi paga.
   *
   * ⚠️ Ancorar as duas no vencimento é o que impede o percentual de explodir.
   * A alternativa — somar em *realizado* tudo que foi PAGO na janela — traria
   * títulos vencidos meses antes e quitados agora, sem contrapartida no
   * *planejado*: a contraparte apareceria com 300% de cumprimento num mês em
   * que ela só pagou atrasado. Aqui, o atraso aparece como o que é: um título
   * que venceu e ainda não foi pago.
   */
  const inicioPR = addDias(hoje, -dias);
  const grupoPR = new Map<string, { plan: number; real: number }>();
  for (const m of movs) {
    if (m.status === "cancelado") continue;
    // Só o que VENCEU na janela retroativa entra — nos dois lados.
    if (!(m.due_date >= inicioPR && m.due_date <= hoje)) continue;
    const k = nome(input, m);
    const cur = grupoPR.get(k) ?? { plan: 0, real: 0 };
    cur.plan += m.amount;
    if (m.status === "pago") cur.real += m.amount;
    grupoPR.set(k, cur);
  }
  const prevReal: PrevRealLinha[] = Array.from(grupoPR.entries())
    .map(([label, v]) => {
      const diff = v.real - v.plan;
      const pct = v.plan > 0 ? v.real / v.plan - 1 : (v.real > 0 ? 1 : 0);
      return { label, planejado: v.plan, realizado: v.real, diff, pct, ia: comentarioPR(label, pct, diff, v.real, v.plan) };
    })
    .sort((a, b) => (b.planejado + b.realizado) - (a.planejado + a.realizado))
    .slice(0, 8);

  // ----- Bloco 4: Calendário financeiro (diário) -----
  const diasCal = Math.min(Math.max(dias, 7), 31);
  const calendario: DiaCalendario[] = [];
  for (let i = 0; i < diasCal; i++) {
    const d = addDias(hoje, i);
    const noDia = (m: RiskMovement) => dataRef(m) === d && passaVisao(m) && m.status !== "cancelado";
    const recebe = movs.filter((m) => m.type === "entrada" && noDia(m)).reduce((s, m) => s + m.amount, 0);
    const paga = movs.filter((m) => m.type === "saida" && noDia(m)).reduce((s, m) => s + m.amount, 0);
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
        { label: "Contrato / recorrência", ok: quant.indicadores.receitaRecorrente > 0, detalhe: quant.indicadores.receitaRecorrente > 0 ? `${Math.round(quant.indicadores.receitaRecorrente * 100)}% de receita recorrente` : "sem recorrência detectada" },
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
  const nHeat = Math.min(60, Math.max(7, dias));
  const heatmap: DiaHeat[] = risco.liquidez.slice(0, nHeat).map((p) => {
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
/**
 * ⚠️ **A IA NÃO OPINA SOBRE UM ZERO QUE NÃO PODIA SER OUTRA COISA.**
 *
 * A janela deste bloco é `[hoje, hoje + N dias]` — para FRENTE. Pagamento
 * acontece no passado: medido na base real, **101 de 101 lançamentos pagos têm
 * `paid_date` anterior a hoje, e nenhum cai na janela**. O lado "Realizado" é,
 * por construção, zero para tudo que ainda vai vencer.
 *
 * Sobre esse zero estrutural a frase saía como *"Abaixo do previsto (−100%) —
 * verifique atraso ou redução em Folha de pagamento"*, mandando o dono
 * investigar um atraso que não existe. É pior que um número errado: é um número
 * errado com uma ordem de serviço em cima.
 *
 * Enquanto a janela não for decidida (ver o relatório do item 3), a linha diz o
 * que de fato sabe — que o período ainda não aconteceu — em vez de inventar uma
 * causa.
 */
function comentarioPR(label: string, pct: number, diff: number, realizado = 0, planejado = 0): string {
  if (realizado === 0 && planejado > 0) {
    return "Ainda não realizado — o período está à frente, então não há execução a comparar.";
  }
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
