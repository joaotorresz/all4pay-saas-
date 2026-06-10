/**
 * Motor do DRE — classifica os movimentos em linhas do DRE (por palavra-
 * chave na categoria), respeita o regime (competência por due_date /
 * caixa por paid_date) e monta as variações (gerencial, financeiro, por
 * cliente, por linha, comparativo, projetado).
 */
import type { RiskInput, RiskMovement } from "@/core/risk-engine/types";
import { calcularBurnRate } from "@/core/risk-engine/burn.engine";
import { calcularRunway } from "@/core/risk-engine/liquidez.engine";
import { motorPreditivo } from "@/core/executive/forecast";
import { analisarInadimplencia } from "@/core/risk";
import type {
  Regime,
  DREGerencial,
  DRELinha,
  DREFinanceiro,
  DREClienteLinha,
  DRELinhaReceita,
  DREComparativo,
  DREProjecao,
  DREPeriodo,
} from "./types";
import { uid } from "./types";

/* ---- Classificação ---- */
export type LinhaDespesa = "impostos" | "cmv" | "folha" | "financeiro" | "opex";
export type LinhaReceita = "vendas" | "servicos" | "juros" | "outras";

const LABEL_DESPESA: Record<LinhaDespesa, string> = {
  impostos: "Impostos sobre receita",
  cmv: "CMV / Fornecedores",
  folha: "Folha de pagamento",
  financeiro: "Resultado financeiro",
  opex: "Despesas operacionais",
};
const LABEL_RECEITA: Record<LinhaReceita, string> = {
  vendas: "Vendas",
  servicos: "Serviços prestados",
  juros: "Juros / receitas financeiras",
  outras: "Outras receitas",
};

export function classificarDespesa(cat: string | null | undefined): LinhaDespesa {
  const c = (cat ?? "").toLowerCase();
  if (/imposto|tribut|\bdas\b|irpj|iss|icms|pis|cofins/.test(c)) return "impostos";
  if (/fornecedor|cmv|custo|mercadoria|insumo|combust/.test(c)) return "cmv";
  if (/folha|sal[aá]r|pessoal|encargo|pró-labore|pro-labore/.test(c)) return "folha";
  if (/tarifa|juros|banc|financ|iof/.test(c)) return "financeiro";
  return "opex";
}
export function classificarReceita(cat: string | null | undefined): LinhaReceita {
  const c = (cat ?? "").toLowerCase();
  if (/serviç|servico/.test(c)) return "servicos";
  if (/juros|rendiment|aplicac/.test(c)) return "juros";
  if (/venda/.test(c)) return "vendas";
  return "outras";
}

/* ---- Período / regime ---- */
const refDate = (m: RiskMovement, regime: Regime) =>
  regime === "caixa" ? m.paid_date ?? m.due_date : m.due_date;

export function movimentosNoPeriodo(input: RiskInput, regime: Regime, de: string, ate: string): RiskMovement[] {
  return input.movements.filter((m) => {
    if (m.status === "cancelado") return false;
    if (regime === "caixa" && m.status !== "pago") return false;
    const d = refDate(m, regime);
    return d >= de && d <= ate;
  });
}

/* ---- Agregação base ---- */
interface Agg {
  receita: number;
  receitaPorLinha: Record<LinhaReceita, number>;
  despesaPorLinha: Record<LinhaDespesa, number>;
}
function agregar(movs: RiskMovement[]): Agg {
  const receitaPorLinha = { vendas: 0, servicos: 0, juros: 0, outras: 0 } as Record<LinhaReceita, number>;
  const despesaPorLinha = { impostos: 0, cmv: 0, folha: 0, financeiro: 0, opex: 0 } as Record<LinhaDespesa, number>;
  let receita = 0;
  for (const m of movs) {
    if (m.type === "entrada") {
      receita += m.amount;
      receitaPorLinha[classificarReceita(m.category)] += m.amount;
    } else {
      despesaPorLinha[classificarDespesa(m.category)] += m.amount;
    }
  }
  return { receita, receitaPorLinha, despesaPorLinha };
}

/* ---- DRE Gerencial ---- */
export function dreGerencial(movs: RiskMovement[]): DREGerencial {
  const a = agregar(movs);
  const receitaBruta = a.receita;
  const impostos = a.despesaPorLinha.impostos;
  const receitaLiquida = receitaBruta - impostos;
  const cmv = a.despesaPorLinha.cmv;
  const lucroBruto = receitaLiquida - cmv;
  const opex = a.despesaPorLinha.opex + a.despesaPorLinha.folha;
  const ebitda = lucroBruto - opex;
  const depreciacao = 0; // não informado no fluxo de movimentos
  const ebit = ebitda - depreciacao;
  const financeiro = a.despesaPorLinha.financeiro;
  const lair = ebit - financeiro;
  const ir = 0; // sem linha de IR dedicada nos dados
  const lucroLiquido = lair - ir;
  const base = receitaLiquida || 1;
  const pct = (v: number) => v / base;

  const compReceita = (Object.keys(a.receitaPorLinha) as LinhaReceita[])
    .filter((k) => a.receitaPorLinha[k] > 0)
    .map((k) => ({ label: LABEL_RECEITA[k], valor: a.receitaPorLinha[k] }));

  const linhas: DRELinha[] = [
    { id: uid("l"), label: "Receita bruta", valor: receitaBruta, pctReceita: receitaBruta / base, papel: "receita", componentes: compReceita },
    { id: uid("l"), label: "(-) Impostos sobre receita", valor: -impostos, pctReceita: -pct(impostos), papel: "deducao" },
    { id: uid("l"), label: "= Receita líquida", valor: receitaLiquida, pctReceita: 1, papel: "subtotal" },
    { id: uid("l"), label: "(-) CMV / Fornecedores", valor: -cmv, pctReceita: -pct(cmv), papel: "deducao" },
    { id: uid("l"), label: "= Lucro bruto", valor: lucroBruto, pctReceita: pct(lucroBruto), papel: "subtotal" },
    { id: uid("l"), label: "(-) Despesas operacionais", valor: -opex, pctReceita: -pct(opex), papel: "deducao", componentes: [
      { label: LABEL_DESPESA.folha, valor: a.despesaPorLinha.folha },
      { label: LABEL_DESPESA.opex, valor: a.despesaPorLinha.opex },
    ] },
    { id: uid("l"), label: "= EBITDA", valor: ebitda, pctReceita: pct(ebitda), papel: "subtotal" },
    { id: uid("l"), label: "(-) Resultado financeiro", valor: -financeiro, pctReceita: -pct(financeiro), papel: "deducao" },
    { id: uid("l"), label: "= Lucro líquido", valor: lucroLiquido, pctReceita: pct(lucroLiquido), papel: "resultado" },
  ];

  return {
    linhas,
    receitaBruta,
    receitaLiquida,
    lucroBruto,
    ebitda,
    ebit,
    lair,
    lucroLiquido,
    margemBruta: pct(lucroBruto),
    margemEbitda: pct(ebitda),
    margemLiquida: pct(lucroLiquido),
  };
}

/* ---- DRE Financeiro (caixa) ---- */
export function dreFinanceiro(input: RiskInput, de: string, ate: string): DREFinanceiro {
  const movs = movimentosNoPeriodo(input, "caixa", de, ate);
  const a = agregar(movs);
  const recebimentos = a.receita;
  const pagamentos = (Object.values(a.despesaPorLinha) as number[]).reduce((s, v) => s + v, 0);
  const fluxoFinanceiro = -a.despesaPorLinha.financeiro;
  const fluxoOperacional = recebimentos - (pagamentos - a.despesaPorLinha.financeiro);
  const fluxoInvestimento = 0;
  const fluxoLivre = fluxoOperacional + fluxoFinanceiro + fluxoInvestimento;
  const burn = calcularBurnRate(input);
  const runway = calcularRunway(input.saldoAtual, burn);
  return {
    recebimentos,
    pagamentos,
    fluxoOperacional,
    fluxoFinanceiro,
    fluxoInvestimento,
    fluxoLivre,
    burnMensal: burn.burnMensal,
    runwayMeses: runway.base >= 999 ? 24 : Math.round((runway.base / 30) * 10) / 10,
  };
}

/* ---- DRE por Linha de receita (produto/unidade proxy) ---- */
export function drePorLinha(movs: RiskMovement[]): DRELinhaReceita[] {
  const a = agregar(movs);
  const custoTotal = (Object.values(a.despesaPorLinha) as number[]).reduce((s, v) => s + v, 0);
  const receitaTotal = a.receita || 1;
  return (Object.keys(a.receitaPorLinha) as LinhaReceita[])
    .filter((k) => a.receitaPorLinha[k] > 0)
    .map((k) => {
      const receita = a.receitaPorLinha[k];
      const custoAlocado = custoTotal * (receita / receitaTotal);
      const resultado = receita - custoAlocado;
      return { linha: LABEL_RECEITA[k], receita, custoAlocado, resultado, margem: receita > 0 ? resultado / receita : 0 };
    })
    .sort((x, y) => y.receita - x.receita);
}

/* ---- DRE por Cliente ---- */
export function drePorCliente(input: RiskInput, movs: RiskMovement[]): DREClienteLinha[] {
  const a = agregar(movs);
  const custoTotal = (Object.values(a.despesaPorLinha) as number[]).reduce((s, v) => s + v, 0);

  const receitaPorCliente = new Map<string, number>();
  let receitaTotal = 0;
  for (const m of movs) {
    if (m.type !== "entrada") continue;
    const id = m.party_id ?? "—";
    receitaPorCliente.set(id, (receitaPorCliente.get(id) ?? 0) + m.amount);
    receitaTotal += m.amount;
  }
  receitaTotal = receitaTotal || 1;

  // Risco + inadimplência por cliente (motor de crédito).
  const cred = analisarInadimplencia(input);
  const byId = new Map(cred.clientes.map((c) => [c.clienteId, c]));

  return Array.from(receitaPorCliente.entries())
    .map(([id, receita]) => {
      const share = receita / receitaTotal;
      const custoAlocado = custoTotal * share;
      const resultado = receita - custoAlocado;
      const perfil = byId.get(id);
      return {
        cliente: input.partyNames?.[id] ?? (id === "—" ? "Sem contraparte" : id),
        receita,
        share,
        resultado,
        margem: receita > 0 ? resultado / receita : 0,
        inadimplencia: perfil?.features.volumeVencido ?? 0,
        risco: perfil?.score ?? 0,
      };
    })
    .sort((a2, b2) => b2.receita - a2.receita)
    .slice(0, 10);
}

/* ---- Agregação mensal (para comparativo) ---- */
function porMes(input: RiskInput, regime: Regime): Map<string, Agg> {
  const m = new Map<string, Agg>();
  for (const mv of input.movements) {
    if (mv.status === "cancelado") continue;
    if (regime === "caixa" && mv.status !== "pago") continue;
    const ym = refDate(mv, regime).slice(0, 7);
    const cur = m.get(ym) ?? { receita: 0, receitaPorLinha: { vendas: 0, servicos: 0, juros: 0, outras: 0 }, despesaPorLinha: { impostos: 0, cmv: 0, folha: 0, financeiro: 0, opex: 0 } };
    if (mv.type === "entrada") {
      cur.receita += mv.amount;
      cur.receitaPorLinha[classificarReceita(mv.category)] += mv.amount;
    } else {
      cur.despesaPorLinha[classificarDespesa(mv.category)] += mv.amount;
    }
    m.set(ym, cur);
  }
  return m;
}
function periodoDeAgg(label: string, ag: Agg): DREPeriodo {
  const recLiq = ag.receita - ag.despesaPorLinha.impostos;
  const ebitda = recLiq - ag.despesaPorLinha.cmv - ag.despesaPorLinha.folha - ag.despesaPorLinha.opex;
  const lucro = ebitda - ag.despesaPorLinha.financeiro;
  return { label, receita: ag.receita, ebitda, lucro, margemEbitda: recLiq > 0 ? ebitda / recLiq : 0 };
}
function somarAggs(aggs: Agg[]): Agg {
  return aggs.reduce(
    (acc, a) => {
      acc.receita += a.receita;
      (Object.keys(a.receitaPorLinha) as LinhaReceita[]).forEach((k) => (acc.receitaPorLinha[k] += a.receitaPorLinha[k]));
      (Object.keys(a.despesaPorLinha) as LinhaDespesa[]).forEach((k) => (acc.despesaPorLinha[k] += a.despesaPorLinha[k]));
      return acc;
    },
    { receita: 0, receitaPorLinha: { vendas: 0, servicos: 0, juros: 0, outras: 0 }, despesaPorLinha: { impostos: 0, cmv: 0, folha: 0, financeiro: 0, opex: 0 } } as Agg,
  );
}

export function dreComparativo(input: RiskInput, regime: Regime): DREComparativo {
  const meses = porMes(input, regime);
  const hoje = new Date(input.hoje);
  const ymAtual = input.hoje.slice(0, 7);
  const prev = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
  const ymPrev = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
  const ano = hoje.getFullYear();

  const empty: Agg = { receita: 0, receitaPorLinha: { vendas: 0, servicos: 0, juros: 0, outras: 0 }, despesaPorLinha: { impostos: 0, cmv: 0, folha: 0, financeiro: 0, opex: 0 } };
  const atual = meses.get(ymAtual) ?? empty;
  const anterior = meses.get(ymPrev) ?? empty;

  const ytdAggs = Array.from(meses.entries()).filter(([ym]) => ym >= `${ano}-01` && ym <= ymAtual).map(([, a]) => a);
  const corte12 = new Date(hoje.getFullYear(), hoje.getMonth() - 11, 1).toISOString().slice(0, 7);
  const m12Aggs = Array.from(meses.entries()).filter(([ym]) => ym >= corte12 && ym <= ymAtual).map(([, a]) => a);

  const periodos: DREPeriodo[] = [
    periodoDeAgg("Mês atual", atual),
    periodoDeAgg("Mês anterior", anterior),
    periodoDeAgg("YTD", somarAggs(ytdAggs)),
    periodoDeAgg("12 meses", somarAggs(m12Aggs)),
  ];
  const va = (a: number, b: number) => (b !== 0 ? (a - b) / Math.abs(b) : 0);
  return {
    periodos,
    variacaoReceita: va(periodos[0].receita, periodos[1].receita),
    variacaoEbitda: va(periodos[0].ebitda, periodos[1].ebitda),
  };
}

/* ---- DRE Projetado ---- */
export function dreProjetado(input: RiskInput, margemEbitda: number, margemLiquida: number): DREProjecao[] {
  const fc = motorPreditivo(input, 12);
  // Receita projetada média mensal a partir do histórico de receita realizada.
  const meses = porMes(input, "competencia");
  const receitasMes = Array.from(meses.values()).map((a) => a.receita).filter((v) => v > 0);
  const ult6 = receitasMes.slice(-6);
  const receitaMensalBase = ult6.length ? ult6.reduce((s, v) => s + v, 0) / ult6.length : 0;
  void fc;

  const horizontes: { label: string; meses: number }[] = [
    { label: "30 dias", meses: 1 },
    { label: "90 dias", meses: 3 },
    { label: "180 dias", meses: 6 },
    { label: "12 meses", meses: 12 },
  ];
  return horizontes.map((h) => {
    const receita = receitaMensalBase * h.meses;
    return { horizonte: h.label, receita, ebitda: receita * margemEbitda, lucro: receita * margemLiquida };
  });
}
