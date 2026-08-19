/**
 * Motor do DRE — classifica os movimentos em linhas do DRE (por palavra-
 * chave na categoria), respeita o regime (competência por due_date /
 * caixa por paid_date) e monta as variações (gerencial, financeiro, por
 * cliente, por linha, comparativo, projetado).
 */
import type { RiskInput, RiskMovement } from "@/core/risk-engine/types";
// ⚠️ Só a CONSTANTE, e é de propósito: a declaração de transferência tem de
// ter um dono só. Duas cópias da mesma palavra divergem no primeiro ajuste, e
// aí uma cascata tira o movimento e a outra não — que é o defeito que este
// import corrige.
import { LINHA_TRANSFERENCIA } from "@/core/relatorios";
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
// ⚠️ A cascata é a fonte única de linha de resultado. `dreGerencial` entra como
// TRADUTOR dela, não como uma segunda implementação — ver `docs/auditoria.md`.
import { cascataDRE, type LinhaCascata } from "@/core/relatorios/cascata";

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

/* ---- DRE Gerencial — FACHADA FINA sobre a cascata ---- */
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ ESTA FUNÇÃO NÃO AGREGA NADA. Ela TRADUZ.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Era a **segunda** das cinco agregações independentes de resultado do sistema
 * (`docs/auditoria.md`): classificava por conta própria, somava por conta
 * própria e servia três superfícies — `/dre`, o cockpit e o painel de Vendas.
 * Enquanto ela existisse, "o EBITDA do cockpit" e "o EBITDA do relatório" eram
 * dois números que ninguém obrigava a concordar.
 *
 * Agora ela chama `cascataDRE` e mapeia o resultado para o formato que os
 * consumidores já esperam. Zero agregação própria, zero classificação própria.
 *
 * ⚠️ **A ENTRADA É TRADUZIDA, NÃO REFILTRADA.** Os chamadores passam um array
 * JÁ recortado por período (via `movimentosNoPeriodo` ou `naJanela`). O
 * intervalo montado aqui cobre TODOS os movimentos recebidos, de propósito: a
 * cascata classifica o que veio e não recorta de novo. Recortar duas vezes
 * mudaria o conjunto sem ninguém pedir — e é assim que dois caminhos que
 * "usam a mesma função" voltam a divergir.
 *
 * ⚠️ **`regime` é obrigatório e sem padrão.** Ver `FiltroCascata`.
 */
/**
 * ⚠️ **`linhaPorCategoria` NÃO é enfeite: sem ele o cartão executivo discordava
 * da tabela logo abaixo, em R$ 25.000,00 na fixture.**
 *
 * `core/relatorios` reconhece a declaração `transferencia` — a AUSÊNCIA de
 * linha, dita — e tira o movimento do relatório inteiro. Esta cascata não a
 * conhecia, então a mesma transferência entrava como RECEITA BRUTA na entrada e
 * como DESPESA OPERACIONAL na saída. O cartão publicava um faturamento inflado
 * por dinheiro que só trocou de bolso, exatamente acima de uma tabela que
 * mostrava o número certo.
 *
 * Medido com a matriz cartão × tabela (`npm run travar`): tabela R$ 170.000,50
 * · cartão R$ 195.000,50 · diferença R$ 25.000,00 — o valor exato da
 * transferência declarada.
 */
export function dreGerencial(
  movs: RiskMovement[], regime: Regime,
  linhaPorCategoria?: Record<string, string>,
): DREGerencial {
  if (linhaPorCategoria) {
    movs = movs.filter(
      (m) => linhaPorCategoria[(m.category ?? "").trim().toLowerCase()] !== LINHA_TRANSFERENCIA,
    );
  }
  const datas = movs.map((m) => (refDate(m, regime) || "").slice(0, 10)).filter(Boolean).sort();
  const intervalo = datas.length
    ? { de: datas[0], ate: datas[datas.length - 1] }
    // Sem movimento não há data para delimitar. A janela larga mantém `de <= ate`
    // (senão a cascata acusaria "janela inválida", que seria mentira: o período
    // é válido, o que falta é lançamento) e deixa a cascata dizer o que é
    // verdade — `sem_lancamentos`.
    : { de: "1970-01-01", ate: "9999-12-31" };

  const entrada = { hoje: datas[datas.length - 1] ?? "1970-01-01", saldoAtual: 0, movements: movs, partyNames: {} } as RiskInput;
  const c = cascataDRE(entrada, { intervalo, regime });

  const v = (id: LinhaCascata) => c.linhas[id].valor;
  const receitaBruta = v("receita_bruta");
  const receitaLiquida = v("receita_liquida");
  const lucroBruto = v("lucro_bruto");
  const ebitda = v("ebitda");
  const ebit = v("ebit");
  const lucroLiquido = v("resultado_liquido");
  // LAIR = lucro ANTES do imposto sobre o lucro. Na cascata o resultado líquido
  // já vem depois dele, então a volta é somá-lo.
  //
  // ⚠️ **Diferença latente, travada em teste.** O caminho antigo fazia `ir = 0`
  // sempre e `lucroLiquido = lair`; a cascata SUBTRAI `impostos_lucro`. Hoje o
  // valor não muda porque o sistema ainda não provisiona IRPJ/CSLL e a linha é
  // zero em todos os meses. No dia em que a provisão existir, o lucro líquido
  // destas telas cai — e sem o teste isso pareceria regressão em vez de
  // correção. Ver `contrato-resultado.mts`, caso "IR não-zero".
  const lair = lucroLiquido + v("impostos_lucro");

  /* As linhas do desenho, tiradas do relatório — inclusive o drill-down por
   * categoria (`filhos`), que antes era remontado à mão a partir da
   * classificação própria. */
  const rel = new Map(c.relatorio.linhas.map((l) => [l.id, l]));
  const linha = (id: LinhaCascata, papel: DRELinha["papel"]): DRELinha => {
    const l = rel.get(id);
    /*
     * ⚠️ **O SINAL DA LINHA É PARTE DO CONTRATO DE `DRELinha`.** No relatório,
     * a dedução é guardada como MAGNITUDE positiva e a direção vive em `sinal`
     * ("-"); em `DRELinha` ela sempre foi um número NEGATIVO, e é isso que
     * permite somar a cascata de cima para baixo e conferir cada subtotal.
     *
     * Traduzir sem o sinal fazia as deduções SOMAREM: medido, "EBITDA fecha com
     * as linhas acima" passou a acusar 38.000 × 115.800 na fixture. A guarda de
     * coerência pegou — ela confere as LINHAS, não os campos do objeto, que
     * seria tautologia.
     *
     * Linhas "+/-" (resultado financeiro, não operacional) entram com o próprio
     * sinal: elas já são o líquido.
     */
    const bruto = l?.total.valor ?? 0;
    return {
      id: uid("l"),
      label: l?.label ?? id,
      valor: l?.sinal === "-" ? -bruto : bruto,
      pctReceita: l?.total.av ?? 0,
      papel,
      componentes: l?.filhos.length
        ? l.filhos.map((f) => ({ label: f.label, valor: f.total.valor }))
        : undefined,
    };
  };

  const linhas: DRELinha[] = [
    linha("receita_bruta", "receita"),
    linha("deducoes", "deducao"),
    linha("receita_liquida", "subtotal"),
    linha("custos_variaveis", "deducao"),
    linha("lucro_bruto", "subtotal"),
    linha("despesas_variaveis", "deducao"),
    linha("margem_contribuicao", "subtotal"),
    linha("despesas_operacionais", "deducao"),
    linha("ebitda", "subtotal"),
    linha("depreciacao_amortizacao", "deducao"),
    linha("ebit", "subtotal"),
    linha("resultado_financeiro", "deducao"),
    linha("impostos_lucro", "deducao"),
    linha("nao_operacional", "deducao"),
    linha("resultado_liquido", "resultado"),
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
    margemBruta: c.margemBruta,
    margemEbitda: c.margemEbitda,
    margemLiquida: c.margemLiquida,
    regime,
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
