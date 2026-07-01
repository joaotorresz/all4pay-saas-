/**
 * Juros de mora + multa sobre título vencido (puro, tipado, demo-safe).
 * Versão late-fee/1.0.0.
 *
 * "Quanto cobrar de um boleto vencido há 30 dias?" — a conta que toda cobrança
 * refaz na mão. Padrão brasileiro (Código Civil art. 406 / praxe contratual):
 *  • MULTA de mora: percentual FIXO sobre o principal (teto 2% em relação de
 *    consumo — CDC art. 52 §1º), incide uma vez;
 *  • JUROS de mora: percentual ao mês aplicado PRO RATA DIE (por dia de atraso,
 *    dias/30 do mês), incide sobre o principal.
 *
 * corrigido = principal + principal·multa + principal·jurosMes·(dias/30)
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface EncargosMora {
  principal: number;
  diasAtraso: number;
  multaPct: number;       // fração (0.02 = 2%)
  jurosMesPct: number;    // fração ao mês (0.01 = 1% a.m.)
  multa: number;          // R$ — parcela fixa
  juros: number;          // R$ — pro rata die
  totalEncargos: number;  // multa + juros
  totalCorrigido: number; // principal + encargos
  encargoPct: number;     // totalEncargos ÷ principal (× 100 no display)
}

/**
 * Calcula multa + juros de mora de um título vencido.
 * Defaults à praxe: multa 2% + juros 1% a.m. pro rata die.
 * `diasAtraso <= 0` → sem encargos (não venceu / vence hoje).
 */
export function calcularMora(
  principal: number,
  diasAtraso: number,
  multaPct = 0.02,
  jurosMesPct = 0.01,
): EncargosMora {
  const P = Math.max(0, principal);
  const dias = Math.max(0, Math.floor(diasAtraso));
  const m = Math.max(0, multaPct);
  const j = Math.max(0, jurosMesPct);
  const multa = dias > 0 ? round2(P * m) : 0;
  const juros = dias > 0 ? round2(P * j * (dias / 30)) : 0;
  const totalEncargos = round2(multa + juros);
  return {
    principal: round2(P),
    diasAtraso: dias,
    multaPct: m,
    jurosMesPct: j,
    multa,
    juros,
    totalEncargos,
    totalCorrigido: round2(P + totalEncargos),
    encargoPct: P > 0 && dias > 0 ? round2((totalEncargos / P) * 100) : 0,
  };
}
