/**
 * Simples Nacional — cálculo da alíquota EFETIVA e do DAS (puro, tipado,
 * demo-safe). Versão tax/1.0.0.
 *
 * A grande pegadinha do Simples: a alíquota da tabela (nominal) NÃO é o que se
 * paga. O que vale é a alíquota EFETIVA, que sobe suavemente dentro da faixa:
 *
 *   alíquota efetiva = (RBT12 × alíquota nominal − parcela a deduzir) ÷ RBT12
 *
 * onde RBT12 = receita bruta acumulada dos últimos 12 meses. O DAS do mês é a
 * alíquota efetiva aplicada sobre a receita DO MÊS.
 *
 * Tabelas oficiais (LC 123/2006, vigência a partir de 2018) — Anexos I
 * (comércio), II (indústria), III e V (serviços). Fonte de verdade fiscal do
 * "quanto vou pagar de imposto" para a maioria das PMEs brasileiras.
 */

export type AnexoSimples = "I" | "II" | "III" | "V";

interface FaixaSimples {
  ate: number;        // teto da RBT12 da faixa (R$)
  nominal: number;    // alíquota nominal (fração)
  deduzir: number;    // parcela a deduzir (R$)
}

/** Anexo I — Comércio. */
const ANEXO_I: FaixaSimples[] = [
  { ate: 180000, nominal: 0.04, deduzir: 0 },
  { ate: 360000, nominal: 0.073, deduzir: 5940 },
  { ate: 720000, nominal: 0.095, deduzir: 13860 },
  { ate: 1800000, nominal: 0.107, deduzir: 22500 },
  { ate: 3600000, nominal: 0.143, deduzir: 87300 },
  { ate: 4800000, nominal: 0.19, deduzir: 378000 },
];

/** Anexo II — Indústria. */
const ANEXO_II: FaixaSimples[] = [
  { ate: 180000, nominal: 0.045, deduzir: 0 },
  { ate: 360000, nominal: 0.078, deduzir: 5940 },
  { ate: 720000, nominal: 0.1, deduzir: 13860 },
  { ate: 1800000, nominal: 0.112, deduzir: 22500 },
  { ate: 3600000, nominal: 0.147, deduzir: 85500 },
  { ate: 4800000, nominal: 0.3, deduzir: 720000 },
];

/** Anexo III — Serviços (locação, agências, e serviços em geral). */
const ANEXO_III: FaixaSimples[] = [
  { ate: 180000, nominal: 0.06, deduzir: 0 },
  { ate: 360000, nominal: 0.112, deduzir: 9360 },
  { ate: 720000, nominal: 0.135, deduzir: 17640 },
  { ate: 1800000, nominal: 0.16, deduzir: 35640 },
  { ate: 3600000, nominal: 0.21, deduzir: 125640 },
  { ate: 4800000, nominal: 0.33, deduzir: 648000 },
];

/** Anexo V — Serviços intelectuais/técnicos (fator r < 28%). */
const ANEXO_V: FaixaSimples[] = [
  { ate: 180000, nominal: 0.155, deduzir: 0 },
  { ate: 360000, nominal: 0.18, deduzir: 4500 },
  { ate: 720000, nominal: 0.195, deduzir: 9900 },
  { ate: 1800000, nominal: 0.205, deduzir: 17100 },
  { ate: 3600000, nominal: 0.23, deduzir: 62100 },
  { ate: 4800000, nominal: 0.305, deduzir: 540000 },
];

const TABELAS: Record<AnexoSimples, FaixaSimples[]> = { I: ANEXO_I, II: ANEXO_II, III: ANEXO_III, V: ANEXO_V };
const TETO_SIMPLES = 4800000;
const round2 = (n: number) => Math.round(n * 100) / 100;

export interface ResultadoSimples {
  anexo: AnexoSimples;
  rbt12: number;            // receita bruta dos últimos 12 meses
  receitaMes: number;       // receita do mês (base do DAS)
  faixa: number;            // 1..6
  aliquotaNominal: number;  // fração (da tabela)
  parcelaDeduzir: number;   // R$
  aliquotaEfetiva: number;  // fração — a que realmente pesa
  das: number;              // imposto do mês em R$
  acimaDoTeto: boolean;     // RBT12 > 4,8M → desenquadra do Simples
}

/**
 * Calcula a alíquota efetiva e o DAS do mês no Simples Nacional.
 * `anexo` default III (serviços — o caso mais comum de dúvida).
 * Se a RBT12 estoura o teto (4,8M), sinaliza `acimaDoTeto` e usa a última faixa.
 */
export function calcularSimplesNacional(
  rbt12: number,
  receitaMes: number,
  anexo: AnexoSimples = "III",
): ResultadoSimples {
  const RBT = Math.max(0, rbt12);
  const mes = Math.max(0, receitaMes);
  const tabela = TABELAS[anexo];
  const acimaDoTeto = RBT > TETO_SIMPLES;

  // Faixa: primeira cujo teto ainda comporta a RBT12 (última se estourar).
  let idx = tabela.findIndex((f) => RBT <= f.ate);
  if (idx === -1) idx = tabela.length - 1;
  const f = tabela[idx];

  // Alíquota efetiva = (RBT12 × nominal − deduzir) ÷ RBT12. RBT12 = 0 → nominal
  // da 1ª faixa (empresa nova sem histórico paga a alíquota de entrada).
  const efetiva = RBT > 0 ? Math.max(0, (RBT * f.nominal - f.deduzir) / RBT) : tabela[0].nominal;
  const das = round2(mes * efetiva);

  return {
    anexo,
    rbt12: round2(RBT),
    receitaMes: round2(mes),
    faixa: idx + 1,
    aliquotaNominal: f.nominal,
    parcelaDeduzir: f.deduzir,
    aliquotaEfetiva: Math.round(efetiva * 1e6) / 1e6,
    das,
    acimaDoTeto,
  };
}
