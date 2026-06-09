/**
 * pt-BR / BRL formatting helpers.
 * The whole product speaks Brazilian Real with "," decimals and "."
 * thousands. Use these everywhere numbers are shown.
 */

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const brlCompact = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

const groupedInt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

/** "R$ 1.284.900,00" — full BRL string (for tooltips, sr-only, axes). */
export function formatBRL(value: number): string {
  return brl.format(value);
}

/** "R$ 1,3 mi" — compact BRL (for tight chart axes). */
export function formatBRLCompact(value: number): string {
  return brlCompact.format(value);
}

/**
 * Split a number into the parts the <Money> component expects:
 * grouped integer ("1.284.900") + two decimal digits ("00").
 * Always works on the absolute value — sign is conveyed by color/label.
 */
export function brlParts(value: number): { integer: string; decimals: string } {
  const abs = Math.abs(value);
  const integer = groupedInt.format(Math.trunc(abs));
  const decimals = Math.round((abs - Math.trunc(abs)) * 100)
    .toString()
    .padStart(2, "0");
  return { integer, decimals };
}
