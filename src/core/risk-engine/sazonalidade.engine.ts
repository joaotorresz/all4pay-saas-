/** Engine de sazonalidade — índice de receita por mês (1 = média). */
import type { RiskInput, SazonalidadeResult } from "./types";

const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function calcularSazonalidade(input: RiskInput): SazonalidadeResult {
  const soma = new Array(12).fill(0);
  const cont = new Array(12).fill(0);
  for (const m of input.movements) {
    if (m.type !== "entrada") continue;
    const d = m.paid_date ?? m.due_date;
    const mes = Number(d.slice(5, 7)) - 1;
    soma[mes] += m.amount;
    cont[mes] += 1;
  }
  const medias = soma.map((s, i) => (cont[i] ? s / cont[i] : 0));
  const ativos = medias.filter((v) => v > 0);
  const media = ativos.length ? ativos.reduce((a, b) => a + b, 0) / ativos.length : 0;
  const indicePorMes = medias.map((v, i) => ({
    label: MES[i],
    indice: media ? v / media : 0,
  }));
  const mesAtual = Number(input.hoje.slice(5, 7)) - 1; // mês LOCAL da string (0-11); new Date(UTC).getMonth() erra no dia 1 em UTC-3
  return {
    indiceMesAtual: indicePorMes[mesAtual]?.indice || 1,
    mesesBaixos: indicePorMes.filter((m) => m.indice > 0 && m.indice < 0.85).map((m) => m.label),
    indicePorMes,
  };
}
