/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OS PARES DA CONCILIAÇÃO — o extrato do banco × o título previsto
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * UMA regra para a tela (aba Conciliar) e para o agente de conciliação
 * (Etapa 4 do plano "AI first", 04/11/2026). Antes ela morava em
 * `lib/conciliacao-of.ts`, colada na consulta do navegador: o agente teria de
 * copiar, e duas cópias de um casador divergem no primeiro ajuste.
 *
 * Casa a linha do banco (movimento de Open Finance já pago) com UM título
 * pendente do mesmo tipo: valor exato ou até 2% de diferença, data até 7 dias,
 * e o mesmo contato pesa a favor. Cada título entra em um par só.
 *
 * Puro: nada de banco, relógio ou navegador.
 */

export interface MovimentoParaCasar {
  id: string;
  type: "entrada" | "saida";
  amount: number;
  due_date: string;
  paid_date: string | null;
  party_id: string | null;
  description: string | null;
}

export interface ParConciliacao {
  ofId: string; ofDesc: string; ofData: string;
  pendId: string; pendDesc: string; dueDate: string;
  tipo: "entrada" | "saida"; amount: number; confianca: number;
  /** Os critérios que bateram (para o "porquê" do agente). */
  criterios: { valorExato: boolean; dias: number; mesmoContato: boolean };
}

/** Acima disto o par é "de confiança alta": a tela concilia em lote e o agente pode fazer sozinho. */
export const CONFIANCA_ALTA = 85;
export const DIAS_MAX = 7;
export const DIFERENCA_MAX = 0.02;

const diasEntre = (a: string, b: string) => Math.abs(Math.round((Date.parse(a) - Date.parse(b)) / 86400000));

export function casarExtrato(pendentes: MovimentoParaCasar[], extrato: MovimentoParaCasar[]): {
  pares: ParConciliacao[]; pendentesSemPar: number; extratoSemPar: number;
} {
  const usados = new Set<string>();
  const pares: ParConciliacao[] = [];
  for (const o of extrato) {
    const dataOf = o.paid_date ?? o.due_date;
    let best: { p: MovimentoParaCasar; conf: number; criterios: ParConciliacao["criterios"] } | null = null;
    for (const p of pendentes) {
      if (usados.has(p.id) || p.type !== o.type) continue;
      const dif = Math.abs(p.amount - Math.abs(o.amount));
      const valorExato = dif <= 0.01;
      const valorProx = p.amount > 0 && dif / p.amount <= DIFERENCA_MAX;
      if (!valorExato && !valorProx) continue;
      const dd = diasEntre(dataOf, p.due_date);
      if (dd > DIAS_MAX) continue;
      const mesmoContato = !!(o.party_id && p.party_id && o.party_id === p.party_id);
      const conf = (valorExato ? 50 : 35) + (dd === 0 ? 30 : dd <= 2 ? 22 : dd <= 5 ? 12 : 5) + (mesmoContato ? 20 : 0);
      if (!best || conf > best.conf) best = { p, conf, criterios: { valorExato, dias: dd, mesmoContato } };
    }
    if (best) {
      usados.add(best.p.id);
      pares.push({
        ofId: o.id, ofDesc: o.description ?? "Open Finance", ofData: dataOf,
        pendId: best.p.id, pendDesc: best.p.description ?? "Título", dueDate: best.p.due_date,
        tipo: o.type, amount: Math.abs(o.amount), confianca: Math.min(100, best.conf), criterios: best.criterios,
      });
    }
  }
  pares.sort((a, b) => b.confianca - a.confianca);
  return { pares, pendentesSemPar: pendentes.length - usados.size, extratoSemPar: extrato.length - pares.length };
}
