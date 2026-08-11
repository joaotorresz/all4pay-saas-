/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O PAINEL DE CONTAS A PAGAR — os três números e o que os compõe.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **Toda soma mora aqui, nenhuma na tela.** É a regra de teto ZERO da
 * ONDA 10 ("nenhuma tela soma lançamentos por conta própria") e ela não é
 * cerimônia: enquanto a conta mora no componente, a correção de uma convenção
 * — o que conta como liquidado, qual data usa, como o sinal funciona — não
 * alcança a tela, e o mesmo rótulo passa a mostrar números diferentes conforme
 * a página.
 *
 * ⚠️ **Os três cards respondem perguntas DIFERENTES, e as datas provam isso.**
 *
 *  - **Pago no período** olha a data de PAGAMENTO. É caixa que já saiu.
 *  - **A vencer** e **Atrasadas** olham a data de VENCIMENTO. São obrigações
 *    que ainda não viraram caixa.
 *
 * Somar os três daria um número que não significa nada — misturaria dinheiro
 * que saiu com dinheiro que vai sair. Por isso eles nunca aparecem como um
 * total único, e o gráfico de distribuição existe justamente para mostrar a
 * proporção sem sugerir a soma.
 *
 * ⚠️ **"Vence hoje" é A VENCER, não atrasado.** Um título que vence hoje e não
 * foi pago ainda está no prazo — contá-lo como atraso criaria um pico de
 * inadimplência toda manhã que sumiria à tarde, sem nada ter acontecido. É a
 * mesma regra que `core/indicadores.inadimplencia` já aplica.
 *
 * Puro, tipado, demo-safe, sem I/O e sem relógio. Versão `contas-pagar/1.0.0`.
 */
import type { RiskInput, RiskMovement } from "@/core/risk-engine/types";
import { magnitude, liquidado, previsto, cancelado } from "@/core/indicadores/convencoes";

export const CONTAS_PAGAR_VERSION = "contas-pagar/1.0.0";

/* ========================================================================== */
/* O recorte                                                                   */
/* ========================================================================== */

export interface FiltroContasPagar {
  /** Início do período, inclusive (YYYY-MM-DD). */
  de: string;
  /** Fim do período, inclusive. */
  ate: string;
  /** Nome do projeto. `null`/ausente = todos. */
  projeto?: string | null;
  /** Nome do centro de custo. `null`/ausente = todos. */
  centro?: string | null;
}

/** ⚠️ Só SAÍDAS, e nunca canceladas — um título cancelado não é obrigação. */
const ehContaAPagar = (m: RiskMovement) => m.type === "saida" && !cancelado(m);

function passaNosFiltros(m: RiskMovement, f: FiltroContasPagar): boolean {
  if (f.projeto && m.projeto !== f.projeto) return false;
  if (f.centro && m.costCenter !== f.centro) return false;
  return true;
}

const dentro = (d: string | null | undefined, de: string, ate: string) =>
  !!d && d.slice(0, 10) >= de && d.slice(0, 10) <= ate;

/* ========================================================================== */
/* O que cada card mostra                                                      */
/* ========================================================================== */

export interface ContaDoCard {
  id: string;
  /** Nome da contraparte, quando o cadastro o resolve. */
  contraparte: string;
  categoria: string;
  valor: number;
  /** A data que importa para ESTE card — pagamento nos pagos, vencimento nos demais. */
  data: string;
  /** Dias de atraso; só faz sentido no card de atrasadas. */
  diasAtraso?: number;
}

export interface CardContasPagar {
  /** A soma, em reais. */
  total: number;
  /** Quantos títulos. */
  quantidade: number;
  /** A relação que o botão de expandir revela — ordenada por valor. */
  contas: ContaDoCard[];
}

export type Situacao = "pago" | "a_vencer" | "atrasado";

export const ROTULO_SITUACAO: Record<Situacao, string> = {
  pago: "Pagas",
  a_vencer: "A vencer",
  atrasado: "Vencidas",
};

/**
 * ⚠️ A cor de cada situação vem dos tokens SEMÂNTICOS do design system, e são
 * as três exceções sancionadas à paleta. Nenhum hex novo entra aqui.
 */
export const TOKEN_SITUACAO: Record<Situacao, string> = {
  pago: "var(--color-positive)",
  a_vencer: "var(--color-warning)",
  atrasado: "var(--color-negative)",
};

export interface DiaDoCalendario {
  /** YYYY-MM-DD. */
  data: string;
  /** Total a pagar que vence neste dia (pendente). */
  aPagar: number;
  /** Total pago neste dia. */
  pago: number;
  quantidade: number;
  /** A situação predominante do dia — decide a cor do marcador. `null` = dia vazio. */
  situacao: Situacao | null;
  /** É hoje? O calendário marca o dia corrente mesmo quando ele não tem nada. */
  ehHoje: boolean;
}

export interface PainelContasPagar {
  versao: string;
  filtro: FiltroContasPagar;
  pagoNoPeriodo: CardContasPagar;
  aVencer: CardContasPagar;
  atrasadas: CardContasPagar;
  /** A distribuição por situação, para o gráfico radial. */
  distribuicao: { situacao: Situacao; rotulo: string; valor: number; quantidade: number; fracao: number }[];
  /**
   * TODOS os dias do período, do primeiro ao último — inclusive os vazios.
   *
   * ⚠️ Antes só entravam os dias COM lançamento, e a faixa do calendário ficava
   * com buracos invisíveis: 01, 02, 05, 11, 25. Quem olha lê a sequência como
   * se fosse contínua e conclui coisas erradas sobre o espaçamento — dois
   * vencimentos "colados" podiam estar a duas semanas um do outro. Um
   * calendário que pula dia deixa de ser calendário e vira uma lista ordenada
   * por data.
   */
  dias: DiaDoCalendario[];
  /**
   * O período tinha mais dias do que o `TETO_DIAS` — a faixa mostra os
   * primeiros. ⚠️ Truncar em silêncio faria um intervalo de dois anos parecer
   * um trimestre.
   */
  diasTruncados: boolean;
}

/**
 * Quantos dias a faixa desenha, no máximo.
 *
 * ⚠️ Um trimestre. O mês e a semana cabem folgados; o que este teto protege é o
 * intervalo personalizado — "de 01/2024 a hoje" renderizaria mais de mil
 * cápsulas e travaria a tela. O corte é DITO na saída, nunca calado.
 */
export const TETO_DIAS = 92;

/* ========================================================================== */
/* O motor                                                                     */
/* ========================================================================== */

const round2 = (n: number) => Math.round(n * 100) / 100;

function montarCard(
  ms: RiskMovement[], nomes: Record<string, string> | undefined,
  dataDe: (m: RiskMovement) => string, hoje?: string,
): CardContasPagar {
  const contas: ContaDoCard[] = ms.map((m) => {
    const d = dataDe(m);
    return {
      id: m.id,
      contraparte: (m.party_id ? nomes?.[m.party_id] : null) ?? m.category ?? "Sem contraparte",
      categoria: m.category ?? "Sem categoria",
      valor: magnitude(m),
      data: d,
      ...(hoje ? { diasAtraso: diasEntre(d, hoje) } : {}),
    };
  });
  // ⚠️ Maior primeiro: quem abre a relação de "atrasadas" quer saber o que
  // resolver antes, e o que resolve antes é o que pesa mais.
  contas.sort((a, b) => b.valor - a.valor);
  return {
    total: round2(contas.reduce((s, c) => s + c.valor, 0)),
    quantidade: contas.length,
    contas,
  };
}

/** Dias entre duas datas-só, fatiando a string. */
function diasEntre(de: string, ate: string): number {
  const [a1, m1, d1] = de.slice(0, 10).split("-").map(Number);
  const [a2, m2, d2] = ate.slice(0, 10).split("-").map(Number);
  // ⚠️ `Date.UTC`, nunca `new Date("YYYY-MM-DD")` interpretado local: em UTC−3
  // o dia 1º vira o último do mês anterior, e o atraso sai com um dia a mais.
  const ms = Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1);
  return Math.round(ms / 86_400_000);
}

export function montarPainelContasPagar(
  input: RiskInput, filtro: FiltroContasPagar,
): PainelContasPagar {
  const hoje = input.hoje.slice(0, 10);
  const { de, ate } = filtro;
  const nomes = input.partyNames;

  const base = input.movements.filter((m) => ehContaAPagar(m) && passaNosFiltros(m, filtro));

  // PAGO: pela data de PAGAMENTO — é caixa que já saiu.
  // ⚠️ `liquidado` é a definição única (status === "pago"). O sistema já teve
  // três definições concorrentes, e elas discordavam justamente nas linhas que
  // importam.
  const pagas = base.filter(
    (m) => liquidado(m) && dentro(m.paid_date ?? m.due_date, de, ate),
  );

  // A VENCER e ATRASADAS: pela data de VENCIMENTO — ainda não viraram caixa.
  const emAberto = base.filter((m) => previsto(m) && dentro(m.due_date, de, ate));
  const aVencer = emAberto.filter((m) => m.due_date.slice(0, 10) >= hoje);
  const atrasadas = emAberto.filter((m) => m.due_date.slice(0, 10) < hoje);

  const cardPago = montarCard(pagas, nomes, (m) => (m.paid_date ?? m.due_date).slice(0, 10));
  const cardAVencer = montarCard(aVencer, nomes, (m) => m.due_date.slice(0, 10));
  const cardAtrasadas = montarCard(atrasadas, nomes, (m) => m.due_date.slice(0, 10), hoje);

  const totais: { situacao: Situacao; valor: number; quantidade: number }[] = [
    { situacao: "pago", valor: cardPago.total, quantidade: cardPago.quantidade },
    { situacao: "a_vencer", valor: cardAVencer.total, quantidade: cardAVencer.quantidade },
    { situacao: "atrasado", valor: cardAtrasadas.total, quantidade: cardAtrasadas.quantidade },
  ];
  const somaGeral = totais.reduce((s, t) => s + t.valor, 0);

  // ⚠️ A fração é sobre a soma das TRÊS — e é a única leitura em que somá-las
  // faz sentido, porque aqui a pergunta é de PROPORÇÃO, não de total. Sem
  // denominador, `fracao` é 0 e o gráfico não desenha nada, que é o correto.
  const distribuicao = totais.map((t) => ({
    ...t,
    rotulo: ROTULO_SITUACAO[t.situacao],
    fracao: somaGeral > 0 ? t.valor / somaGeral : 0,
  }));

  /* ---- O calendário ------------------------------------------------------ */
  const porDia = new Map<string, DiaDoCalendario>();
  const toque = (data: string): DiaDoCalendario =>
    porDia.get(data) ?? { data, aPagar: 0, pago: 0, quantidade: 0, situacao: null, ehHoje: data === hoje };

  for (const m of pagas) {
    const d = (m.paid_date ?? m.due_date).slice(0, 10);
    const x = toque(d);
    porDia.set(d, { ...x, pago: round2(x.pago + magnitude(m)), quantidade: x.quantidade + 1 });
  }
  for (const m of emAberto) {
    const d = m.due_date.slice(0, 10);
    const x = toque(d);
    porDia.set(d, { ...x, aPagar: round2(x.aPagar + magnitude(m)), quantidade: x.quantidade + 1 });
  }

  // ⚠️ A faixa percorre o PERÍODO, não o mapa: é isso que garante que 03 venha
  // depois de 02 mesmo quando nenhum dos dois tem lançamento. O mapa só
  // preenche o que existe.
  const dias: DiaDoCalendario[] = [];
  for (let d = de; d <= ate && dias.length < TETO_DIAS; d = somarDia(d)) {
    const x = toque(d);
    dias.push({
      ...x,
      // ⚠️ A situação do DIA é a mais urgente que ele contém, não a mais
      // frequente: um dia com nove pagas e um título vencido precisa aparecer
      // como vencido, senão o marcador esconde justamente o que exige ação.
      situacao: x.aPagar > 0
        ? (d < hoje ? "atrasado" as const : "a_vencer" as const)
        : x.pago > 0 ? "pago" as const : null,
      ehHoje: d === hoje,
    });
  }
  const diasTruncados = dias.length > 0 && dias[dias.length - 1].data < ate;

  return {
    versao: CONTAS_PAGAR_VERSION,
    filtro,
    pagoNoPeriodo: cardPago,
    aVencer: cardAVencer,
    atrasadas: cardAtrasadas,
    distribuicao,
    dias,
    diasTruncados,
  };
}

/** O dia seguinte, sempre em UTC. */
function somarDia(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + 1)).toISOString().slice(0, 10);
}

/* ========================================================================== */
/* Os períodos                                                                 */
/* ========================================================================== */

export type TipoPeriodo = "mes" | "semana" | "personalizado";

export interface Periodo {
  tipo: TipoPeriodo;
  de: string;
  ate: string;
  rotulo: string;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** O mês corrente, do dia 1 ao último dia. */
export function periodoMes(hoje: string): Periodo {
  const [a, m] = hoje.slice(0, 10).split("-").map(Number);
  const de = iso(new Date(Date.UTC(a, m - 1, 1)));
  const ate = iso(new Date(Date.UTC(a, m, 0)));
  const nome = new Date(Date.UTC(a, m - 1, 1)).toLocaleDateString("pt-BR", { month: "long", timeZone: "UTC" });
  return { tipo: "mes", de, ate, rotulo: `${nome[0].toUpperCase()}${nome.slice(1)} de ${a}` };
}

/**
 * A semana corrente.
 *
 * ⚠️ De **segunda a domingo**, não de domingo a sábado. Quem opera contas a
 * pagar pensa em semana útil, e um recorte que começa no domingo joga o
 * vencimento de segunda para a "semana passada" na manhã de segunda-feira —
 * exatamente quando a pessoa abre a tela para saber o que pagar hoje.
 */
export function periodoSemana(hoje: string): Periodo {
  const [a, m, d] = hoje.slice(0, 10).split("-").map(Number);
  const base = new Date(Date.UTC(a, m - 1, d));
  const dow = base.getUTCDay();                 // 0 = domingo
  const recuo = dow === 0 ? 6 : dow - 1;        // segunda = 0 de recuo
  const seg = new Date(Date.UTC(a, m - 1, d - recuo));
  const dom = new Date(Date.UTC(a, m - 1, d - recuo + 6));
  return {
    tipo: "semana", de: iso(seg), ate: iso(dom),
    rotulo: `${iso(seg).slice(8, 10)}/${iso(seg).slice(5, 7)} a ${iso(dom).slice(8, 10)}/${iso(dom).slice(5, 7)}`,
  };
}

export function periodoPersonalizado(de: string, ate: string): Periodo {
  // ⚠️ Intervalo invertido não vira silenciosamente um intervalo válido: ele é
  // devolvido como está, e a tela recusa na ENTRADA (regra da ONDA 10). Trocar
  // as pontas aqui esconderia o erro de digitação de quem o cometeu.
  return {
    tipo: "personalizado", de, ate,
    rotulo: `${de.slice(8, 10)}/${de.slice(5, 7)} a ${ate.slice(8, 10)}/${ate.slice(5, 7)}`,
  };
}

export const periodoInvalido = (p: Periodo): boolean => p.de > p.ate;

/* ========================================================================== */
/* As opções dos filtros — só o que EXISTE no dado                            */
/* ========================================================================== */

/**
 * ⚠️ Projetos e centros oferecidos são os que aparecem em algum título a pagar,
 * não o cadastro inteiro. Um filtro que oferece trinta opções e devolve vazio
 * em vinte e oito ensina a pessoa a não confiar no filtro.
 */
export function opcoesDeFiltro(input: RiskInput): { projetos: string[]; centros: string[] } {
  const projetos = new Set<string>();
  const centros = new Set<string>();
  for (const m of input.movements) {
    if (!ehContaAPagar(m)) continue;
    if (m.projeto) projetos.add(m.projeto);
    if (m.costCenter) centros.add(m.costCenter);
  }
  return {
    projetos: Array.from(projetos).sort((a, b) => a.localeCompare(b, "pt-BR")),
    centros: Array.from(centros).sort((a, b) => a.localeCompare(b, "pt-BR")),
  };
}
