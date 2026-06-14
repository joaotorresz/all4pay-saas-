/**
 * Agenda de faturamento — função PURA compartilhada pelo Cron
 * (`/api/recorrencias/run`) e pela ativação em live, para que ambos gerem as
 * MESMAS datas/`reference_code` (dedup idempotente). Sem deps de cliente/servidor.
 */
const iso = (d: Date) => d.toISOString().slice(0, 10);

export type FreqDB = "semanal" | "mensal" | "anual";

/** Datas de faturamento no intervalo [hoje, hoje+dias], a partir de start_date. */
export function datasFaturaCron(startISO: string, freq: FreqDB | string, dueDay: number | null, hojeISO: string, dias = 90): string[] {
  const hoje = new Date(hojeISO + "T00:00:00");
  const fim = new Date(hoje); fim.setDate(fim.getDate() + dias);
  const cur = new Date(startISO + "T00:00:00");
  if (freq !== "semanal" && dueDay) cur.setDate(Math.min(dueDay, 28));
  const step = () => {
    if (freq === "semanal") cur.setDate(cur.getDate() + 7);
    else if (freq === "anual") cur.setFullYear(cur.getFullYear() + 1);
    else { cur.setMonth(cur.getMonth() + 1); if (dueDay) cur.setDate(Math.min(dueDay, 28)); }
  };
  const out: string[] = [];
  let guard = 0;
  while (cur <= fim && guard++ < 500) {
    if (cur >= hoje) out.push(iso(cur));
    step();
  }
  return out;
}

/** Mapeia o ciclo (7 valores da UI) para o enum freq do banco (3 valores). */
export function cicloParaFreq(ciclo: string): FreqDB {
  return ciclo === "semanal" ? "semanal" : ciclo === "anual" ? "anual" : "mensal";
}

/** `reference_code` idempotente de uma fatura de recorrência. */
export const refFatura = (recId: string, dataISO: string) => `rec:${recId}:${dataISO}`;
