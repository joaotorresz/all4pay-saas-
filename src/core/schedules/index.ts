/**
 * Quattro — Cronogramas: amortização (despesas antecipadas) e depreciação
 * (ativo imobilizado). Inspirado no módulo do Campfire: os cronogramas vivem no
 * sistema (não em planilhas paralelas) e consolidam em UM lançamento contábil
 * mensal por tipo, para revisão e aprovação. Linear (linha reta). Puro, tipado.
 */
export const VERSAO_SCHEDULES = "schedules/1.0.0";

export type TipoCronograma = "amortizacao" | "depreciacao";

export interface Cronograma {
  id: string;
  tipo: TipoCronograma;
  descricao: string;
  valorTotal: number;   // valor bruto do ativo / despesa antecipada
  residual: number;     // valor residual (só faz sentido p/ depreciação; 0 default)
  meses: number;        // vida útil / período de amortização (em meses)
  inicio: string;       // YYYY-MM-01 (mês de início)
  categoria: string;    // linha contábil de destino
  /**
   * A COMPRA que este cronograma deprecia/amortiza (id do lançamento de saída).
   * O razão leva essa compra ao ATIVO em vez da despesa — sem o vínculo, a
   * compra entrava como despesa cheia e a depreciação vinha por cima (a
   * despesa em dobro da Rodada 4). `null` = o bem é anterior ao sistema, não
   * há compra no razão. `undefined` = ainda não respondido (o formulário exige).
   */
  movimentoId?: string | null;
}

export interface LinhaCronograma {
  periodo: string;      // YYYY-MM
  valor: number;        // parcela do mês
  acumulado: number;    // amortização/depreciação acumulada
  saldo: number;        // valor contábil restante (book value)
}

export interface ItemLancamento {
  cronogramaId: string;
  descricao: string;
  tipo: TipoCronograma;
  categoria: string;
  valor: number;
}

export interface LancamentoMensal {
  mes: string;          // YYYY-MM
  total: number;
  porTipo: Record<TipoCronograma, number>;
  itens: ItemLancamento[];
}

export interface ResumoCronogramas {
  ativos: number;            // cronogramas em andamento no mês de referência
  valorMensalTotal: number;  // soma das parcelas do mês de referência
  saldoAmortizar: number;    // book value restante somado
  baseTotal: number;         // soma dos valores totais
}

const LABEL: Record<TipoCronograma, string> = {
  amortizacao: "Amortização de despesas antecipadas",
  depreciacao: "Depreciação de imobilizado",
};
export const tipoLabel = (t: TipoCronograma) => LABEL[t];

function addMeses(inicioISO: string, n: number): string {
  const [y, m] = inicioISO.slice(0, 7).split("-").map(Number);
  const d = new Date(y, (m - 1) + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
/** Índice do mês (0..meses-1) dentro do cronograma, ou -1 se fora da janela. */
function indiceNoMes(c: Cronograma, mesISO: string): number {
  const ini = c.inicio.slice(0, 7);
  const [iy, im] = ini.split("-").map(Number);
  const [my, mm] = mesISO.slice(0, 7).split("-").map(Number);
  const diff = (my - iy) * 12 + (mm - im);
  return diff >= 0 && diff < c.meses ? diff : -1;
}

/** Conta de ATIVO que recebe a compra ligada ao cronograma. */
export const CONTA_ATIVO: Record<TipoCronograma, string> = {
  depreciacao: "1.2.01", // Imobilizado
  amortizacao: "1.1.05", // Despesas antecipadas
};

/**
 * As compras que viram ATIVO no razão: id do lançamento → conta do ativo.
 * Uma compra só pode estar em um cronograma (o banco recusa a segunda); aqui,
 * por defesa, a primeira vence.
 */
export function comprasDoAtivo(cronogramas: readonly Cronograma[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const c of cronogramas) {
    if (c.movimentoId && !m.has(c.movimentoId)) m.set(c.movimentoId, CONTA_ATIVO[c.tipo]);
  }
  return m;
}

/** Parcela mensal linear (base depreciável / vida útil). */
export function parcelaMensal(c: Cronograma): number {
  const base = Math.max(0, c.valorTotal - (c.tipo === "depreciacao" ? c.residual : 0));
  return c.meses > 0 ? base / c.meses : 0;
}

/** Cronograma completo, linha a linha. */
export function gerarCronograma(c: Cronograma): LinhaCronograma[] {
  const parcela = parcelaMensal(c);
  const linhas: LinhaCronograma[] = [];
  let acumulado = 0;
  for (let i = 0; i < c.meses; i++) {
    acumulado += parcela;
    linhas.push({
      periodo: addMeses(c.inicio, i),
      valor: parcela,
      acumulado,
      saldo: Math.max(c.tipo === "depreciacao" ? c.residual : 0, c.valorTotal - acumulado),
    });
  }
  return linhas;
}

/** Lançamento contábil consolidado do mês (todos os cronogramas ativos). */
export function lancamentoDoMes(cronogramas: Cronograma[], mesISO: string): LancamentoMensal {
  const itens: ItemLancamento[] = [];
  const porTipo: Record<TipoCronograma, number> = { amortizacao: 0, depreciacao: 0 };
  for (const c of cronogramas) {
    if (indiceNoMes(c, mesISO) < 0) continue;
    const valor = parcelaMensal(c);
    if (valor <= 0) continue;
    itens.push({ cronogramaId: c.id, descricao: c.descricao, tipo: c.tipo, categoria: c.categoria, valor });
    porTipo[c.tipo] += valor;
  }
  return { mes: mesISO.slice(0, 7), total: porTipo.amortizacao + porTipo.depreciacao, porTipo, itens };
}

/** Resumo da carteira de cronogramas no mês de referência. */
export function resumoCronogramas(cronogramas: Cronograma[], mesRefISO: string): ResumoCronogramas {
  let ativos = 0, valorMensalTotal = 0, saldoAmortizar = 0, baseTotal = 0;
  for (const c of cronogramas) {
    baseTotal += c.valorTotal;
    const idx = indiceNoMes(c, mesRefISO);
    const parcela = parcelaMensal(c);
    if (idx >= 0) { ativos++; valorMensalTotal += parcela; }
    // saldo (book value) no mês de referência
    const decorridos = Math.min(c.meses, Math.max(0, idx < 0 ? (mesRefISO.slice(0, 7) < c.inicio.slice(0, 7) ? 0 : c.meses) : idx + 1));
    const residual = c.tipo === "depreciacao" ? c.residual : 0;
    saldoAmortizar += Math.max(residual, c.valorTotal - parcela * decorridos);
  }
  return { ativos, valorMensalTotal, saldoAmortizar, baseTotal };
}
