/** Concentração de receita por cliente (risco estrutural). */
import type { RiskInput, ConcentracaoResult } from "./types";

export function calcularConcentracao(
  input: RiskInput,
  janelaDias = 180,
): ConcentracaoResult {
  const ini = new Date(input.hoje);
  ini.setDate(ini.getDate() - janelaDias);
  const iniISO = ini.toISOString().slice(0, 10);

  const porCliente = new Map<string, number>();
  let total = 0;
  for (const m of input.movements) {
    if (m.type !== "entrada" || m.status === "cancelado") continue; // receita cancelada não é dependência de cliente
    const d = m.paid_date ?? m.due_date;
    if (d < iniISO) continue;
    const id = m.party_id ?? "—";
    porCliente.set(id, (porCliente.get(id) ?? 0) + m.amount);
    total += m.amount;
  }

  if (total === 0)
    return { topShare: 0, hhi: 0, top: [] };

  const top = Array.from(porCliente.entries())
    .map(([id, receita]) => ({
      id,
      name: input.partyNames?.[id] ?? (id === "—" ? "Sem cliente" : id),
      receita,
      share: receita / total,
    }))
    .sort((a, b) => b.share - a.share);

  const hhi = top.reduce((s, c) => s + c.share * c.share, 0) * 10000;
  return { topShare: top[0]?.share ?? 0, hhi, top: top.slice(0, 5) };
}
