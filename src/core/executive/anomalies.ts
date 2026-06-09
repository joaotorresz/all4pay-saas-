/**
 * detectarAnomalias() — despesas anormais, duplicidade e pagamentos
 * atípicos. Estatística pura (média / desvio-padrão / z-score); a
 * camada de ML (Isolation Forest / One-Class SVM) é evolução futura.
 */
import type { RiskInput } from "@/core/risk-engine/types";
import type { Anomalia, Severidade } from "./types";
import { uid } from "./types";

const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const desvio = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = media(xs);
  return Math.sqrt(media(xs.map((x) => (x - m) ** 2)));
};

export function detectarAnomalias(input: RiskInput): Anomalia[] {
  const out: Anomalia[] = [];
  const hoje = input.hoje;
  const mesAtual = hoje.slice(0, 7);

  // 1) Despesa anormal por categoria: mês atual vs histórico (z-score).
  const porCatMes = new Map<string, Map<string, number>>();
  for (const m of input.movements) {
    if (m.type !== "saida" || m.status !== "pago") continue;
    const cat = m.category ?? "Sem categoria";
    const ym = (m.paid_date ?? m.due_date).slice(0, 7);
    const mes = porCatMes.get(cat) ?? porCatMes.set(cat, new Map()).get(cat)!;
    mes.set(ym, (mes.get(ym) ?? 0) + m.amount);
  }
  for (const [cat, mes] of Array.from(porCatMes)) {
    const atual = mes.get(mesAtual);
    if (atual == null) continue;
    const historico = Array.from(mes.entries())
      .filter(([ym]) => ym < mesAtual)
      .map(([, v]) => v);
    if (historico.length < 3) continue;
    const m = media(historico);
    const s = desvio(historico);
    if (s <= 0 || m <= 0) continue;
    const z = (atual - m) / s;
    if (z >= 1.5 && atual > m) {
      const pctAcima = Math.round(((atual - m) / m) * 100);
      out.push({
        id: uid("anom"),
        classe: "despesa",
        severidade: z >= 3 ? "critica" : z >= 2 ? "alta" : "media",
        titulo: `Despesa de ${cat} acima do padrão`,
        descricao: `${cat} apresentou aumento de ${pctAcima}% acima do padrão histórico (z-score ${z.toFixed(1)}).`,
        valor: atual - m,
        zscore: Math.round(z * 10) / 10,
        criadoEm: hoje,
      });
    }
  }

  // 2) Duplicidade: mesma contraparte + mesmo valor em até 3 dias (saída).
  const saidas = input.movements.filter((m) => m.type === "saida");
  for (let a = 0; a < saidas.length; a++) {
    for (let b = a + 1; b < saidas.length; b++) {
      const x = saidas[a];
      const y = saidas[b];
      if (x.amount !== y.amount || (x.party_id ?? "") !== (y.party_id ?? "")) continue;
      const dias = Math.abs(
        (new Date(x.due_date).getTime() - new Date(y.due_date).getTime()) / 86_400_000,
      );
      if (dias <= 3 && x.amount > 0) {
        out.push({
          id: uid("anom"),
          classe: "duplicidade",
          severidade: "alta",
          titulo: "Possível pagamento duplicado",
          descricao: `Dois pagamentos de igual valor para a mesma contraparte em ${Math.round(dias)} dia(s).`,
          valor: x.amount,
          criadoEm: hoje,
        });
        break;
      }
    }
  }

  // 3) Pagamento atípico: saída muito acima do padrão da contraparte.
  const porParte = new Map<string, number[]>();
  for (const m of input.movements) {
    if (m.type !== "saida") continue;
    const id = m.party_id ?? "—";
    (porParte.get(id) ?? porParte.set(id, []).get(id)!).push(m.amount);
  }
  for (const [, vals] of Array.from(porParte)) {
    if (vals.length < 4) continue;
    const m = media(vals);
    const s = desvio(vals);
    if (s <= 0) continue;
    const max = Math.max(...vals);
    const z = (max - m) / s;
    if (z >= 3) {
      out.push({
        id: uid("anom"),
        classe: "fraude",
        severidade: "alta",
        titulo: "Pagamento fora do padrão da contraparte",
        descricao: `Pagamento de valor muito acima do histórico desta contraparte (z-score ${z.toFixed(1)}). Revisar.`,
        valor: max,
        zscore: Math.round(z * 10) / 10,
        criadoEm: hoje,
      });
    }
  }

  return out.sort((a, b) => b.valor - a.valor).slice(0, 8);
}
