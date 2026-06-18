/**
 * all4pay — Reconhecimento de receita (IFRS 15 / CPC 47) + receita diferida +
 * waterfall de receita recorrente (ARR/MRR). Inspirado no Revenue Automation do
 * Campfire (ASC 606 lá; IFRS 15/CPC 47 aqui — a lógica de reconhecer ao longo da
 * obrigação de desempenho é análoga). Puro, tipado, demo-safe.
 *
 * Modelo: um contrato fatura `valorCiclo` a cada `cicloMeses` (ex.: anual = 12)
 * e RECONHECE a receita mensalmente (1/cicloMeses por mês). A diferença entre o
 * faturado no ciclo e o já reconhecido é a RECEITA DIFERIDA (passivo).
 */
export const VERSAO_REVENUE = "revenue/1.0.0";

export interface ContratoReceita {
  id: string;
  titulo: string;
  clienteNome: string;
  valorCiclo: number; // valor faturado por ciclo
  cicloMeses: number; // duração do ciclo (1 = mensal, 12 = anual)
  inicio: string;     // ISO (início do contrato / 1ª fatura)
  ativo: boolean;
}

export interface ContratoReceitaCalc extends ContratoReceita {
  mrr: number;
  arr: number;
  mesesDecorridos: number;
  mesNoCiclo: number;        // 0..cicloMeses-1
  diferida: number;          // saldo de receita diferida agora
  reconhecidoNoCiclo: number;
  pctCiclo: number;          // 0..1 (avanço no ciclo atual)
}

export interface PontoWaterfall {
  mes: string;        // YYYY-MM
  label: string;
  mrrInicio: number;
  novo: number;       // MRR de contratos iniciados no mês
  mrrFim: number;
}

export interface ResumoReceita {
  mrr: number;
  arr: number;
  diferidaTotal: number;
  reconhecidaMes: number;
  churnMrr: number;   // MRR atualmente cancelado (contratos inativos)
  contratosAtivos: number;
}

export interface ReceitaReport {
  hoje: string;
  resumo: ResumoReceita;
  contratos: ContratoReceitaCalc[];
  waterfall: PontoWaterfall[];
  reconhecimentoFuturo: { mes: string; label: string; valor: number }[];
  versao: string;
}

const MESES_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const monthKey = (iso: string) => iso.slice(0, 7);
const labelMes = (mesISO: string) => { const [y, m] = mesISO.split("-").map(Number); return `${MESES_PT[(m || 1) - 1]}/${String(y).slice(2)}`; };
function diffMeses(deISO: string, ateISO: string): number {
  const [ay, am] = monthKey(deISO).split("-").map(Number);
  const [by, bm] = monthKey(ateISO).split("-").map(Number);
  return (by - ay) * 12 + (bm - am);
}
function addMesISO(mesISO: string, n: number): string {
  const [y, m] = mesISO.split("-").map(Number);
  const d = new Date(y, (m - 1) + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export const mrrDe = (c: ContratoReceita) => (c.cicloMeses > 0 ? c.valorCiclo / c.cicloMeses : 0);

export function calcularContrato(c: ContratoReceita, hojeISO: string): ContratoReceitaCalc {
  const mrr = mrrDe(c);
  const decorridos = Math.max(0, diffMeses(c.inicio, hojeISO));
  const mesNoCiclo = c.cicloMeses > 0 ? decorridos % c.cicloMeses : 0;
  // No ciclo atual: já reconhecido (incluindo o mês corrente) e diferido restante.
  const reconhecidoNoCiclo = Math.min(c.valorCiclo, mrr * (mesNoCiclo + 1));
  const diferida = c.ativo ? Math.max(0, c.valorCiclo - reconhecidoNoCiclo) : 0;
  return {
    ...c, mrr, arr: mrr * 12, mesesDecorridos: decorridos, mesNoCiclo,
    diferida, reconhecidoNoCiclo, pctCiclo: c.cicloMeses > 0 ? (mesNoCiclo + 1) / c.cicloMeses : 1,
  };
}

export function analisarReceita(contratos: ContratoReceita[], hojeISO: string, mesesWaterfall = 6): ReceitaReport {
  const calc = contratos.map((c) => calcularContrato(c, hojeISO));
  const ativos = calc.filter((c) => c.ativo);
  const mrr = ativos.reduce((s, c) => s + c.mrr, 0);
  const churnMrr = calc.filter((c) => !c.ativo).reduce((s, c) => s + c.mrr, 0);
  const diferidaTotal = ativos.reduce((s, c) => s + c.diferida, 0);

  // Waterfall de MRR (trajetória): MRR de contratos ativos iniciados até o mês.
  const hojeMes = monthKey(hojeISO);
  const waterfall: PontoWaterfall[] = [];
  let mrrInicioJanela = ativos
    .filter((c) => monthKey(c.inicio) < addMesISO(hojeMes, -(mesesWaterfall - 1)))
    .reduce((s, c) => s + c.mrr, 0);
  for (let i = mesesWaterfall - 1; i >= 0; i--) {
    const mes = addMesISO(hojeMes, -i);
    const novo = ativos
      .filter((c) => monthKey(c.inicio) === mes)
      .reduce((s, c) => s + c.mrr, 0);
    const mrrFim = mrrInicioJanela + novo;
    waterfall.push({ mes, label: labelMes(mes), mrrInicio: mrrInicioJanela, novo, mrrFim });
    mrrInicioJanela = mrrFim;
  }

  // Reconhecimento futuro (próximos 6 meses): MRR ativo projetado (flat).
  const reconhecimentoFuturo = Array.from({ length: 6 }, (_, i) => {
    const mes = addMesISO(hojeMes, i + 1);
    return { mes, label: labelMes(mes), valor: mrr };
  });

  return {
    hoje: hojeISO,
    resumo: { mrr, arr: mrr * 12, diferidaTotal, reconhecidaMes: mrr, churnMrr, contratosAtivos: ativos.length },
    contratos: calc.sort((a, b) => b.mrr - a.mrr),
    waterfall,
    reconhecimentoFuturo,
    versao: VERSAO_REVENUE,
  };
}
