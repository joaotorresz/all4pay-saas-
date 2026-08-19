/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A ORGANIZAÇÃO SINTÉTICA — desenhada para a conta ser feita À MÃO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **Cada linha do DRE recebe um valor DISTINTO e redondo, de propósito.** Se
 * duas linhas tivessem o mesmo total, uma troca entre elas passaria despercebida
 * — o teste ficaria verde com a receita no lugar do custo. Valores distintos
 * fazem cada erro de classificação aparecer como um número que ninguém
 * reconhece.
 *
 * ⚠️ **Os centavos existem para exercitar o arredondamento.** Uma fixture só com
 * milhares redondos nunca encosta no defeito de meio centavo, que é justamente
 * o que separa `R$ 61.265,44` de `R$ 61.265,43` num relatório assinado.
 *
 * A aritmética esperada está escrita em `ESPERADO`, calculada À MÃO a partir
 * desta lista — NUNCA pela função que o teste audita (a lição do contrato de
 * resultado: um teste que usa o motor para prever o motor não pode discordar
 * dele).
 */
import type { RiskInput, RiskMovement } from "@/core/risk-engine/types";

export const HOJE_ORG = "2026-09-15";

let seq = 0;
const m = (
  data: string, valor: number, tipo: "entrada" | "saida", categoria: string,
  status: "pago" | "pendente" = "pago", paid?: string,
): RiskMovement => ({
  id: `f${++seq}`, type: tipo, status, amount: valor,
  due_date: data, paid_date: status === "pago" ? (paid ?? data) : null,
  competence_date: data, category: categoria, description: categoria,
  party_id: null, party_name: null, account_id: "c1",
} as unknown as RiskMovement);

/* ── JULHO/2026 — o mês cheio, com uma linha para cada nível do DRE ───────── */
const JULHO: RiskMovement[] = [
  // Receita bruta: 100.000 + 50.000 = 150.000
  m("2026-07-05", 100_000, "entrada", "Venda de produtos"),
  m("2026-07-20", 50_000, "entrada", "Prestação de serviços"),
  // Dedução (imposto sobre venda): 5.000
  m("2026-07-25", 5_000, "saida", "ISS sobre serviços"),
  // Custo variável (CMV): 30.000
  m("2026-07-08", 30_000, "saida", "CMV — mercadoria vendida"),
  // Despesa variável (comissão): 7.500
  m("2026-07-22", 7_500, "saida", "Comissão de vendas"),
  // Despesa operacional: 20.000 + 25.000 = 45.000
  m("2026-07-10", 20_000, "saida", "Aluguel do escritório"),
  m("2026-07-05", 25_000, "saida", "Folha de pagamento"),
  // Resultado financeiro: juros pagos, COM CENTAVOS
  m("2026-07-15", 1_234.56, "saida", "Juros de empréstimo"),
  // Imposto sobre o lucro: 9.000
  m("2026-07-30", 9_000, "saida", "IRPJ do trimestre"),
];

/* ── JUNHO/2026 — mês SEM MOVIMENTO (nenhuma linha) ───────────────────────── */

/* ── MAIO/2026 — mês NEGATIVO: despesa maior que receita ──────────────────── */
const MAIO: RiskMovement[] = [
  m("2026-05-10", 10_000, "entrada", "Venda de produtos"),
  m("2026-05-12", 18_000, "saida", "Aluguel do escritório"),
];

/* ── AGOSTO/2026 — o que está EM ABERTO, para o aging ─────────────────────── */
/**
 * ⚠️ **Estes ficam FORA da janela do DRE de propósito, e a trava me obrigou a
 * perceber isso.** A primeira versão os datava em julho, e a trava acusou
 * receita bruta de 155.000 contra os 150.000 que eu havia calculado à mão.
 * O motor estava CERTO: por competência, um recebível pendente com vencimento
 * em julho É receita de julho — pendente não quer dizer "não aconteceu", quer
 * dizer "não foi pago". Quem estava errado era a fixture, que misturava o mês
 * cheio do DRE com o material do aging.
 *
 * Com competência em agosto e a janela do DRE em maio–julho, cada coisa exerce
 * o que deve: o DRE mede os meses fechados, o aging mede o que está em aberto
 * hoje (15/09).
 */
const ABERTOS: RiskMovement[] = [
  // vencido há 45 dias (de 2026-09-15) ⇒ faixa 31–60
  m("2026-08-01", 3_000, "entrada", "Venda de produtos", "pendente"),
  // vencido há 15 dias ⇒ faixa até 30
  m("2026-08-31", 2_000, "entrada", "Venda de produtos", "pendente"),
  // a vencer
  m("2026-09-30", 4_000, "entrada", "Venda de produtos", "pendente"),
  // a pagar, a vencer
  m("2026-09-25", 1_500, "saida", "Aluguel do escritório", "pendente"),
];

export const MOVS_ORG: RiskMovement[] = [...JULHO, ...MAIO, ...ABERTOS];

export const INPUT_ORG: RiskInput = {
  hoje: HOJE_ORG,
  saldoAtual: 80_000,
  movements: MOVS_ORG,
  accounts: [{ id: "c1", name: "Conta principal", balance: 80_000 }],
  parties: [],
} as unknown as RiskInput;

/**
 * ⚠️ **CALCULADO À MÃO a partir da lista acima.** Nenhum destes números saiu de
 * uma execução do motor — se saíssem, o teste concordaria com o motor por
 * construção e deixaria de medir (a mesma tautologia do `resíduo = x − x`).
 *
 *   receita bruta ......  100.000,00 + 50.000,00 = 150.000,00
 *   deduções ...........                              5.000,00
 *   receita líquida ....  150.000,00 − 5.000,00  = 145.000,00
 *   custos variáveis ...                             30.000,00
 *   lucro bruto ........  145.000,00 − 30.000,00 = 115.000,00
 *   despesas variáveis .                              7.500,00
 *   margem contrib. ....  115.000,00 − 7.500,00  = 107.500,00
 *   despesas operac. ...  20.000,00 + 25.000,00  =  45.000,00
 *   EBITDA .............  107.500,00 − 45.000,00 =  62.500,00
 *   financeiro .........                              1.234,56  (saída)
 *   impostos s/ lucro ..                              9.000,00
 *   resultado líquido ..  62.500,00 − 1.234,56 − 9.000,00 = 52.265,44
 */
export const ESPERADO_JULHO = {
  receita_bruta: 150_000,
  deducoes: 5_000,
  receita_liquida: 145_000,
  custos_variaveis: 30_000,
  lucro_bruto: 115_000,
  despesas_variaveis: 7_500,
  margem_contribuicao: 107_500,
  despesas_operacionais: 45_000,
  ebitda: 62_500,
  resultado_liquido: 52_265.44,
} as const;

/** Maio: 10.000 de receita contra 18.000 de despesa ⇒ −8.000. */
export const ESPERADO_MAIO = { receita_bruta: 10_000, despesas_operacionais: 18_000, resultado_liquido: -8_000 } as const;

/** Junho não tem uma linha sequer — tudo zero, e zero aqui é RESPOSTA. */
export const ESPERADO_JUNHO = { receita_bruta: 0, resultado_liquido: 0 } as const;

/**
 * Aging em 15/09/2026, sobre os recebíveis em aberto:
 *   01/08 → 45 dias de atraso (faixa 31–60) ....... 3.000,00
 *   31/08 → 15 dias de atraso (faixa até 30) ...... 2.000,00
 *   30/09 → a vencer .............................. 4.000,00
 */
export const ESPERADO_AGING = { ate30: 2_000, de31a60: 3_000, aVencer: 4_000, vencidoTotal: 5_000 } as const;
