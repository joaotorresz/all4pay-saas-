/**
 * Provisão trabalhista (pura, tipada) — versão payroll/1.0.0.
 *
 * O 13º e as férias NÃO são "extras": são custo que se acumula todo mês e
 * estoura em dezembro/nas férias. Provisionar mês a mês (competência) evita o
 * aperto de caixa. Uma folha de X custa ~1,4·X ao ano por causa disso + FGTS.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;
const FGTS = 0.08; // 8% sobre salário, 13º e férias

export interface ProvisaoTrabalhista {
  folhaMensal: number;
  decimoTerceiroMes: number; // provisão mensal do 13º (folha ÷ 12)
  feriasMes: number;         // provisão mensal de férias + 1/3
  fgtsMes: number;           // FGTS 8% sobre 13º + férias provisionados
  provisaoTotalMes: number;  // guardar isso por mês evita o susto
  custoAnualFolha: number;   // 12 salários + 13º + férias(+1/3) + FGTS de tudo
}

/** Quanto provisionar por mês para 13º + férias (+ FGTS) de uma folha mensal. */
export function provisaoTrabalhista(folhaMensal: number): ProvisaoTrabalhista {
  const X = Math.max(0, folhaMensal);
  const decimoTerceiroMes = X / 12;
  const feriasMes = (X * (1 + 1 / 3)) / 12; // salário de férias + adicional de 1/3, mensalizado
  const fgtsMes = (decimoTerceiroMes + feriasMes) * FGTS;
  const provisaoTotalMes = decimoTerceiroMes + feriasMes + fgtsMes;
  // custo anual real: 12 salários + 1 (13º) + 1,333 (férias+1/3) + FGTS de tudo
  const salariosAno = X * 12;
  const decimoAno = X;
  const feriasAno = X * (1 + 1 / 3);
  const fgtsAno = (salariosAno + decimoAno + feriasAno) * FGTS;
  return {
    folhaMensal: round2(X),
    decimoTerceiroMes: round2(decimoTerceiroMes),
    feriasMes: round2(feriasMes),
    fgtsMes: round2(fgtsMes),
    provisaoTotalMes: round2(provisaoTotalMes),
    custoAnualFolha: round2(salariosAno + decimoAno + feriasAno + fgtsAno),
  };
}
