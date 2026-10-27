/**
 * A HOME "SNAPSHOT" (canvas "Quattro ERP · Protótipo", prancheta
 * "Home · proposta snapshot", 14/10/2026).
 *
 * Seis números com a variação de 30 dias e duas curvas. ⚠️ Nenhuma soma nova:
 * cada valor sai da camada canônica (`core/indicadores`), e o "há 30 dias" é a
 * MESMA função rodada sobre o estado reconstruído naquela data — saldo por
 * `saldoEm`, o resto com `hoje` recuado. Puro, tipado, sem relógio.
 */
import type { RiskInput } from "@/core/risk-engine/types";
import {
  arr, burn, entradas, saidas, janela, janelaDoMesDe, janelaUltimosDias, JANELA_RITMO_DIAS, parseLocal, isoLocal,
  previstoNaJanela, runwayMeses, saldo, saldoEm, temValor, type Indicador,
} from "@/core/indicadores";

export const HOME_SNAPSHOT_VERSION = "home-snapshot/1.0.0";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const somaDias = (iso: string, n: number): string => {
  const d = parseLocal(iso);
  d.setDate(d.getDate() + n);
  return isoLocal(d);
};

/** Fim de cada um dos últimos `n` meses (o atual termina HOJE, não no dia 31). */
function fechamentosMensais(hoje: string, n: number): { iso: string; rotulo: string }[] {
  const h = parseLocal(hoje);
  const out: { iso: string; rotulo: string }[] = [];
  for (let k = n - 1; k >= 0; k--) {
    const fim = k === 0 ? h : new Date(h.getFullYear(), h.getMonth() - k + 1, 0);
    out.push({ iso: isoLocal(fim), rotulo: MESES[fim.getMonth()] });
  }
  return out;
}

/** O estado da empresa numa data passada: mesmo histórico, saldo reconstruído. */
export function estadoEm(input: RiskInput, dataISO: string): RiskInput {
  return { ...input, hoje: dataISO, saldoAtual: saldoEm(input, dataISO) };
}

/**
 * Variação relativa entre dois valores. `null` quando não há base para
 * comparar (indicador ausente nas duas pontas, ou base zero) — "+∞%" não é
 * uma leitura, e "0%" afirmaria que nada mudou.
 */
export function variacao(atual: Indicador, anterior: Indicador): number | null {
  if (!temValor(atual) || !temValor(anterior)) return null;
  if (Math.abs(anterior.valor) < 0.005) return null;
  return (atual.valor - anterior.valor) / Math.abs(anterior.valor);
}

export interface NumeroHome {
  id: "caixa" | "arr" | "burn" | "runway" | "pagar" | "receber";
  rotulo: string;
  atual: Indicador;
  anterior: Indicador;
  variacao: number | null;
  unidade: "brl" | "meses";
  href: string;
}

export interface CurvaHome {
  pontos: number[];
  meses: string[];
  /**
   * Entradas e saídas liquidadas de cada mês da curva (só no caixa): o modelo
   * "Entradas" que o dono escolheu nas trocas (15/10/2026) desenha o que moveu
   * o saldo mês a mês. Mesmas funções canônicas, regime de caixa.
   */
  entradas?: number[];
  saidas?: number[];
}

export interface HomeSnapshot {
  hoje: string;
  caixa: NumeroHome & { curva: CurvaHome };
  arr: NumeroHome & { curva: CurvaHome };
  pequenos: NumeroHome[];
}

const num = (
  id: NumeroHome["id"], rotulo: string, atual: Indicador, anterior: Indicador,
  unidade: NumeroHome["unidade"], href: string,
): NumeroHome => ({ id, rotulo, atual, anterior, variacao: variacao(atual, anterior), unidade, href });

/** Os próximos 30 dias a partir de `iso` (inclusive). */
const proximos30 = (iso: string) => janela(iso, somaDias(iso, 29), "Próximos 30 dias");

export function montarHomeSnapshot(input: RiskInput, pontos = 7): HomeSnapshot {
  const hoje = input.hoje.slice(0, 10);
  const d30 = somaDias(hoje, -30);
  const antes = estadoEm(input, d30);
  const meses = fechamentosMensais(hoje, pontos);

  const caixa = num("caixa", "Caixa consolidado", saldo(input), saldo(antes), "brl", "/dashboard/financial/statement");
  const curvaCaixa: CurvaHome = {
    pontos: meses.map((m) => saldoEm(input, m.iso)),
    meses: meses.map((m) => m.rotulo),
    entradas: meses.map((m) => {
      const e = entradas(input, janela(janelaDoMesDe(m.iso).de, m.iso));
      return temValor(e) ? e.valor : 0;
    }),
    saidas: meses.map((m) => {
      const e = saidas(input, janela(janelaDoMesDe(m.iso).de, m.iso));
      return temValor(e) ? e.valor : 0;
    }),
  };

  const arrAgora = arr(input);
  const arrAntes = arr(input, undefined, janelaDoMesDe(d30));
  const arrCard = num("arr", "Receita recorrente (ARR)", arrAgora, arrAntes, "brl", "/dashboard/dashboards/subscriptions");
  const curvaArr: CurvaHome = {
    pontos: meses.map((m) => {
      const a = arr(input, undefined, janelaDoMesDe(m.iso));
      return temValor(a) ? a.valor : 0;
    }),
    meses: meses.map((m) => m.rotulo),
  };

  const pequenos: NumeroHome[] = [
    num("burn", "Burn mensal", burn(input), burn(input, janelaUltimosDias(JANELA_RITMO_DIAS, d30)), "brl", "/fluxo-caixa"),
    num("runway", "Runway", runwayMeses(input), runwayMeses(antes), "meses", "/fluxo-caixa"),
    // ⚠️ O "há 30 dias" do a pagar/receber é o MESMO recorte (os 30 dias à
    // frente) visto daquela data, sobre o estado de lá: o que hoje já foi pago
    // estava em aberto naquele dia, e é isso que `previstoNaJanela` não vê.
    // Por isso a ponta antiga conta o título que VENCIA na janela e não estava
    // cancelado — liquidado depois ou não.
    num("pagar", "Contas a pagar", previstoNaJanela(input, proximos30(hoje), "saida"),
        vencendoNaJanela(input, proximos30(d30), "saida", d30), "brl", "/contas-a-pagar/painel-de-despesas"),
    num("receber", "Contas a receber", previstoNaJanela(input, proximos30(hoje), "entrada"),
        vencendoNaJanela(input, proximos30(d30), "entrada", d30), "brl", "/contas-a-receber/painel-de-vendas"),
  ];

  return { hoje, caixa: { ...caixa, curva: curvaCaixa }, arr: { ...arrCard, curva: curvaArr }, pequenos };
}

/**
 * O que estava EM ABERTO numa data passada com vencimento na janela: título
 * não cancelado, que naquela data ainda não tinha sido pago (pendente hoje, ou
 * pago depois dela). É o `previstoNaJanela` daquele dia, reconstruído.
 */
function vencendoNaJanela(
  input: RiskInput, j: ReturnType<typeof janela>, tipo: "entrada" | "saida", naData: string,
): Indicador {
  const naquelaData = {
    ...input,
    movements: input.movements.map((m) =>
      m.status === "pago" && m.paid_date && m.paid_date.slice(0, 10) > naData
        ? { ...m, status: "pendente" as const, paid_date: null }
        : m,
    ),
  };
  return previstoNaJanela(naquelaData, j, tipo);
}
