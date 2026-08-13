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
  DRECentroCusto,
  DREComparativo,
  DREProjecao,
  DREPeriodo,
} from "./types";
import { uid } from "./types";
import {
  classificarDespesa, classificarReceita, LABEL_DESPESA, LABEL_RECEITA,
  type LinhaDespesa, type LinhaReceita,
} from "@/core/indicadores/classificacao";

/* ---- Classificação ---- */
// ⚠️ MUDOU DE CASA, não de conteúdo. Ela vive em `core/indicadores/classificacao`
// porque a camada canônica também precisa dela (para responder "qual foi o
// EBITDA") e não pode importar `core/dre` sem fechar um ciclo. Reexportada
// daqui para não quebrar os ~10 consumidores que já a importavam deste módulo.
export {
  classificarDespesa, classificarReceita,
  type LinhaDespesa, type LinhaReceita,
} from "@/core/indicadores/classificacao";

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
/**
 * ⚠️ **`receita` É A OPERACIONAL — a receita financeira NÃO entra aqui.**
 *
 * Ela somava TODA entrada, inclusive a classificada como `juros`. O efeito
 * atravessava a cascata inteira: receita bruta, receita líquida, lucro bruto
 * e **EBITDA** — que por definição exclui o resultado financeiro — saíam
 * inflados pelo rendimento de aplicação. E a linha "Resultado financeiro" era
 * **unilateral**: só subtraía a despesa financeira, então a receita financeira
 * não aparecia onde deveria e aparecia onde não deveria.
 *
 * ⚠️ **Este motor estava errado; `core/relatorios` estava certo.** Lá a
 * `receita_bruta` já exclui o financeiro e o `resultado_financeiro` entra com
 * o sinal do movimento. Corrigir aqui é alinhar ao que já era a referência —
 * não é uma terceira interpretação.
 *
 * ⚠️ **Por que a guarda LINHA 31c não pegava:** ela confronta esta cascata com
 * a de `core/relatorios` par a par, e passava porque a fixture não tinha uma
 * única entrada financeira. Duas implementações só divergem no dado que as
 * separa; sem esse dado, comparar as duas não prova nada. A fixture passou a
 * ter juros recebidos — é essa parte que impede o defeito de voltar.
 */
function agregar(movs: RiskMovement[]): Agg {
  const receitaPorLinha = { vendas: 0, servicos: 0, juros: 0, outras: 0 } as Record<LinhaReceita, number>;
  const despesaPorLinha = { impostos: 0, cmv: 0, folha: 0, financeiro: 0, opex: 0 } as Record<LinhaDespesa, number>;
  let receita = 0;
  for (const m of movs) {
    if (m.type === "entrada") {
      const linha = classificarReceita(m.category);
      receitaPorLinha[linha] += m.amount;
      // Só a OPERACIONAL entra na receita bruta. `juros` é resultado
      // financeiro e é somado lá embaixo, uma vez só.
      if (linha !== "juros") receita += m.amount;
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
  // ⚠️ O resultado financeiro tem DOIS lados. Ele era só a despesa, então a
  // receita financeira não tinha para onde ir — e acabava dentro da receita
  // bruta, que é o defeito de cima. `financeiro` aqui é o LÍQUIDO: positivo
  // quando a empresa ganhou mais do que pagou de juros.
  const financeiro = a.despesaPorLinha.financeiro - a.receitaPorLinha.juros;
  const lair = ebit - financeiro;
  const ir = 0; // sem linha de IR dedicada nos dados
  const lucroLiquido = lair - ir;
  const base = receitaLiquida > 0 ? receitaLiquida : 1; // evita margens de sinal invertido quando líquida < 0
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

/* ---- DRE por Centro de Custo ---- */
export function drePorCentroCusto(movs: RiskMovement[]): DRECentroCusto[] {
  const m = new Map<string, { receita: number; despesa: number }>();
  for (const mv of movs) {
    const k = mv.costCenter ?? "Não alocado";
    const cur = m.get(k) ?? { receita: 0, despesa: 0 };
    if (mv.type === "entrada") cur.receita += mv.amount;
    else cur.despesa += mv.amount;
    m.set(k, cur);
  }
  return Array.from(m.entries())
    .map(([centro, v]) => {
      const resultado = v.receita - v.despesa;
      return { centro, receita: v.receita, despesa: v.despesa, resultado, margem: v.receita > 0 ? resultado / v.receita : 0 };
    })
    .sort((a, b) => b.despesa + b.receita - (a.despesa + a.receita));
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
  const hoje = new Date(input.hoje + "T00:00:00"); // local: evita mês anterior em UTC-3 no 1º dia
  const ymAtual = input.hoje.slice(0, 7);
  const prev = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
  const ymPrev = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
  const ano = hoje.getFullYear();

  const empty: Agg = { receita: 0, receitaPorLinha: { vendas: 0, servicos: 0, juros: 0, outras: 0 }, despesaPorLinha: { impostos: 0, cmv: 0, folha: 0, financeiro: 0, opex: 0 } };
  const atual = meses.get(ymAtual) ?? empty;
  const anterior = meses.get(ymPrev) ?? empty;

  const ytdAggs = Array.from(meses.entries()).filter(([ym]) => ym >= `${ano}-01` && ym <= ymAtual).map(([, a]) => a);
  // corte local (não UTC) p/ não errar o mês no início do mês em fuso negativo
  const c12 = new Date(hoje.getFullYear(), hoje.getMonth() - 11, 1);
  const corte12 = `${c12.getFullYear()}-${String(c12.getMonth() + 1).padStart(2, "0")}`;
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
  // Ordena por mês (YYYY-MM) ANTES do slice: porMes preserva ordem de inserção
  // (1ª aparição no array de movements), não cronológica. Sem o sort, "últimos
  // 6 meses" pegava 6 meses arbitrários (o live não tem ORDER BY due_date),
  // enviesando a receita-base da projeção.
  const receitasMes = Array.from(meses.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, agg]) => agg.receita)
    .filter((v) => v > 0);
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
