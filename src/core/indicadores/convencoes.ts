/**
 * AS CONVENÇÕES — as regras escritas, uma vez, em código.
 *
 * Este arquivo é a parte "por escrito" da ONDA 1. Toda pergunta que antes cada
 * tela respondia sozinha ("isto conta? com que data? com que sinal?") tem aqui
 * UMA resposta, e é dela que os indicadores saem. Quando duas telas divergiam,
 * era sempre porque tinham respondido diferente a uma destas quatro perguntas.
 *
 * Puro, sem I/O, sem `Date.now()` — a data de hoje entra pelo `RiskInput`.
 */
import type { RiskInput, RiskMovement } from "@/core/risk-engine/types";

export const CONVENCOES_VERSION = "indicadores/1.0.0";

/* ========================================================================== */
/* 1. SINAL                                                                    */
/* ========================================================================== */

/**
 * **`amount` é MAGNITUDE, nunca direção.** O sentido do dinheiro vive em
 * `type` (`entrada` | `saida`) e em lugar nenhum mais.
 *
 * Isso vale para o dado que entra (seed, importação, Supabase) e para o dado
 * que sai. Um `amount` negativo numa saída significaria "saída de saída", e é
 * assim que um gasto vira receita no meio de uma soma.
 *
 * O único lugar onde o sinal aparece é aqui, na hora de somar: entrada soma,
 * saída subtrai. Quem precisa do valor com sinal chama `assinado`; quem precisa
 * da magnitude chama `magnitude`. Ninguém escreve `-m.amount` à mão.
 */
export const magnitude = (m: Pick<RiskMovement, "amount">): number => Math.abs(m.amount);

export const assinado = (m: Pick<RiskMovement, "amount" | "type">): number =>
  m.type === "entrada" ? magnitude(m) : -magnitude(m);

/**
 * **Saldo NUNCA é exibido em módulo.** Um caixa negativo é a informação mais
 * importante que a tela tem; `Math.abs` sobre ele não "formata", inverte o
 * sinal e transforma um rombo em patrimônio.
 *
 * A formatação de um valor negativo é responsabilidade do componente (cor,
 * prefixo "−"), nunca do cálculo. Esta função existe para ser chamada em vez de
 * `Math.abs` quando a intenção é só evitar "-0".
 */
export const semZeroNegativo = (v: number): number => (Object.is(v, -0) ? 0 : v);

/* ========================================================================== */
/* 2. O QUE CONTA — liquidado × previsto × cancelado                           */
/* ========================================================================== */

/**
 * **Liquidado = `status === "pago"`. Uma definição só.**
 *
 * O sistema tinha três: `status === "pago"`, `paid_date != null`, e
 * `status !== "cancelado"`. As três discordam justamente nas linhas que
 * importam — um título com `paid_date` preenchido mas ainda `pendente` entrava
 * no fluxo de caixa de uma tela e não entrava no de outra.
 *
 * `paid_date` é a DATA de um fato; quem diz que o fato aconteceu é o `status`.
 */
export const liquidado = (m: Pick<RiskMovement, "status">): boolean => m.status === "pago";

/** Cancelado não conta em lugar nenhum: não é dinheiro previsto nem realizado. */
export const cancelado = (m: Pick<RiskMovement, "status">): boolean => m.status === "cancelado";

/** Previsto = existe e ainda não aconteceu. Nunca soma no caixa realizado. */
export const previsto = (m: Pick<RiskMovement, "status">): boolean => m.status === "pendente";

/* ========================================================================== */
/* 3. QUAL DATA — regime                                                       */
/* ========================================================================== */

/**
 * **Caixa** é quando o dinheiro se move; **competência** é quando o fato
 * econômico ocorre. As duas respostas são certas, para perguntas diferentes — e
 * o erro nunca foi escolher a errada, foi não dizer qual estava escolhendo.
 */
export type Regime = "caixa" | "competencia";

/**
 * A data pela qual o movimento entra numa janela, segundo o regime.
 *
 * ⚠️ No regime de CAIXA, um movimento não liquidado **não tem data** —
 * devolve `null` e fica fora da janela. O `paid_date ?? due_date` que várias
 * telas usavam fazia um pendente futuro cair no caixa de hoje.
 */
export function dataDe(m: RiskMovement, regime: Regime): string | null {
  if (cancelado(m)) return null;
  if (regime === "competencia") return m.due_date ? m.due_date.slice(0, 10) : null;
  if (!liquidado(m)) return null;
  // Liquidado sem `paid_date` é dado incompleto vindo de importação antiga: o
  // vencimento é a melhor aproximação da data em que o dinheiro se moveu.
  const d = m.paid_date || m.due_date;
  return d ? d.slice(0, 10) : null;
}

/* ========================================================================== */
/* 4. O SALDO                                                                  */
/* ========================================================================== */

/**
 * **A REGRA DO SALDO, por extenso:**
 *
 * O saldo de hoje é o `balance` das contas financeiras — o que o banco diz.
 * Não é a soma dos movimentos. O extrato do banco é a autoridade sobre quanto
 * existe; os movimentos explicam a VARIAÇÃO desse número, não o seu nível.
 *
 * Some os movimentos e você obtém o saldo apenas se o histórico for completo
 * desde a abertura da conta — o que nunca é verdade em quem importou seis meses
 * de extrato. Por isso o nível vem do `balance` e o histórico só o desloca.
 *
 * **O saldo em uma data passada** é o saldo de hoje DESFAZENDO os movimentos
 * liquidados depois daquela data:
 *
 *     saldo(d) = saldoAtual − Σ assinado(m), para m liquidado com data > d
 *
 * **O saldo em uma data futura** é o saldo de hoje MAIS os previstos até lá:
 *
 *     saldo(d) = saldoAtual + Σ assinado(m), para m previsto com d(m) em (hoje, d]
 *
 * Uma implementação, um número — é o que faz a Home, o extrato, o calendário e
 * o painel financeiro fecharem no mesmo lugar.
 */
export function saldoEm(input: RiskInput, dataISO: string): number {
  const alvo = dataISO.slice(0, 10);
  const hoje = input.hoje.slice(0, 10);
  let saldo = input.saldoAtual;

  if (alvo < hoje) {
    for (const m of input.movements) {
      const d = dataDe(m, "caixa");
      if (d && d > alvo) saldo -= assinado(m);
    }
    return semZeroNegativo(saldo);
  }
  if (alvo > hoje) {
    for (const m of input.movements) {
      if (!previsto(m)) continue;
      const d = m.due_date?.slice(0, 10);
      if (d && d > hoje && d <= alvo) saldo += assinado(m);
    }
  }
  return semZeroNegativo(saldo);
}

/**
 * Saldo de ABERTURA de uma janela — o saldo do dia anterior ao início.
 * É o número do qual todo gráfico acumulado tem de partir para terminar no
 * saldo real; partir de zero desenha a variação, não a posição.
 */
export function saldoAbertura(input: RiskInput, deISO: string): number {
  const d = new Date(`${deISO.slice(0, 10)}T00:00:00`);
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return saldoEm(input, `${y}-${mm}-${dd}`);
}
