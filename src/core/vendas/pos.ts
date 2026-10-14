/**
 * A venda da maquininha (POS) em títulos — puro, tipado, demo-safe.
 *
 * ⚠️ **A TAXA MDR ERA CONTADA DUAS VEZES.** O simulador gravava o recebível
 * pelo LÍQUIDO (total − taxa) e, além disso, uma despesa "taxa MDR" já PAGA,
 * com data de hoje. Numa venda de R$ 100,00 com 3% de taxa, o caixa via
 * +R$ 97,00 no repasse e −R$ 3,00 hoje (R$ 94,00 no fim), e o DRE via receita
 * de R$ 97,00 e despesa de R$ 3,00 — o resultado ficava R$ 3,00 menor que a
 * verdade, em toda venda de maquininha. E a despesa "paga hoje, conciliada"
 * afirmava uma saída de banco que nunca aconteceu: a adquirente DESCONTA a taxa
 * no repasse, não debita a conta no dia da venda.
 *
 * A forma certa, que este planejador devolve: por parcela, a receita BRUTA a
 * receber e a taxa daquela parcela a pagar, NA MESMA DATA do repasse. O caixa
 * fecha no líquido (bruto − taxa), o DRE mostra a receita cheia e o custo de
 * adquirência como custo — e nada é "pago" antes de o dinheiro se mover.
 */

export const POS_VENDA_VERSION = "pos-venda/1.0.0";

export interface VendaPos {
  /** Total BRUTO da venda — o que o cliente pagou. */
  total: number;
  /** Taxa MDR em fração (0,0299 = 2,99%). */
  taxa: number;
  parcelas: number;
  descricao: string;
}

export interface TituloPos {
  type: "entrada" | "saida";
  amount: number;
  due_date: string;
  category: string;
  description: string;
}

export const CATEGORIA_RECEITA_POS = "Vendas";
export const CATEGORIA_TAXA_POS = "Tarifas de adquirência";
/**
 * O custo de RECEBER ANTES: a adquirente adianta o repasse do crédito e cobra
 * por isso. É custo de dinheiro no tempo, não de vender — vai para o Resultado
 * Financeiro, abaixo do EBITDA (`ehAntecipacaoDeRecebiveis`, a regra única em
 * `core/indicadores/classificacao`).
 */
export const CATEGORIA_ANTECIPACAO_POS = "Antecipação de recebíveis";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Dias de antecipação pelo número de parcelas: crédito à vista = 30, e 15 a mais por parcela (2x = 45, 3x = 60). */
export function diasDeAntecipacao(parcelas: number): number {
  return parcelas <= 1 ? 30 : 15 * (parcelas + 1);
}

/**
 * ⚠️ **A ANTECIPAÇÃO TEM UMA REGRA SÓ** — a do simulador de taxas da maquininha
 * (`lib/pos-taxas`, que a reexporta) e a do lançamento da venda da Pinbank
 * (`core/pinbank/plano`). Duas contas para o mesmo custo divergiriam na
 * primeira parcela nova.
 *
 * A fração do valor que a antecipação consome, dada a taxa AO MÊS: à vista paga
 * um mês; parcelado, a taxa diária equivalente (composta) vezes os dias de
 * `diasDeAntecipacao`. Pix e débito (parcelas ≤ 0) não antecipam.
 *
 * Medido contra o extrato da Pinbank em 14/10/2026 (1,55% a.m.): o crédito à
 * vista e o 2x de R$ 9,99 repassaram exatamente o que esta fração dá.
 */
export function fracaoDeAntecipacao(parcelas: number, mensal: number): number {
  if (parcelas <= 0) return 0;
  if (parcelas === 1) return mensal;
  const diario = Math.pow(1 + mensal, 1 / 30) - 1;
  return diario * diasDeAntecipacao(parcelas);
}

/** `iso` + `m` meses, sem escorregar de mês (31/01 + 1 → 28/02, nunca 03/03). */
export function somaMeses(iso: string, m: number): string {
  const [a, mes, d] = iso.slice(0, 10).split("-").map(Number);
  const alvo = new Date(Date.UTC(a, mes - 1 + m, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  return `${alvo.getUTCFullYear()}-${String(alvo.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(d, ultimo)).padStart(2, "0")}`;
}

/** Divide `valor` em `n` partes; o resto dos centavos vai na ÚLTIMA. */
export function dividir(valor: number, n: number): number[] {
  const parte = r2(valor / n);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? r2(valor - parte * (n - 1)) : parte));
}

/**
 * Os títulos de UMA venda de maquininha: para cada parcela, a entrada bruta e
 * (se houver taxa) a saída da taxa, com o mesmo vencimento — o do repasse.
 */
export function titulosDaVendaPos(v: VendaPos, hoje: string): TituloPos[] {
  const n = Math.max(1, Math.floor(v.parcelas || 1));
  const total = r2(Math.max(0, v.total));
  const taxa = r2(total * Math.max(0, v.taxa));
  const brutos = dividir(total, n);
  const taxas = dividir(taxa, n);
  const desc = (i: number) => (n > 1 ? `${v.descricao} · ${i + 1}/${n}` : v.descricao);
  const out: TituloPos[] = [];
  for (let i = 0; i < n; i++) {
    const due = somaMeses(hoje, i);
    out.push({ type: "entrada", amount: brutos[i], due_date: due, category: CATEGORIA_RECEITA_POS, description: desc(i) });
    if (taxas[i] > 0) {
      out.push({ type: "saida", amount: taxas[i], due_date: due, category: CATEGORIA_TAXA_POS, description: `${desc(i)} · taxa MDR` });
    }
  }
  return out.filter((t) => t.amount > 0);
}
