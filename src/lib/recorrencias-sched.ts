/**
 * Agenda de faturamento — função PURA compartilhada pelo Cron
 * (`/api/recorrencias/run`) e pela ativação em live, para que ambos gerem as
 * MESMAS datas/`reference_code` (dedup idempotente). Sem deps de cliente/servidor.
 */
const iso = (d: Date) => d.toISOString().slice(0, 10);

export type FreqDB = "semanal" | "mensal" | "bimestral" | "trimestral" | "quadrimestral" | "semestral" | "anual";

/** Meses por ciclo (semanal=0 → passo especial de +7 dias). */
const MESES: Record<FreqDB, number> = {
  semanal: 0, mensal: 1, bimestral: 2, trimestral: 3, quadrimestral: 4, semestral: 6, anual: 12,
};

/** Datas de faturamento no intervalo [hoje, hoje+dias], a partir de start_date.
 *  Entende TODOS os ciclos (uma fonte de verdade p/ o Cron e o ativar). */
export function datasFaturaCron(startISO: string, freq: FreqDB | string, dueDay: number | null, hojeISO: string, dias = 180): string[] {
  const meses = MESES[freq as FreqDB] ?? 1;
  const hoje = new Date(hojeISO + "T00:00:00");
  const fim = new Date(hoje); fim.setDate(fim.getDate() + dias);
  const cur = new Date(startISO + "T00:00:00");
  if (meses > 0 && dueDay) cur.setDate(Math.min(dueDay, 28));
  const step = () => {
    if (meses === 0) cur.setDate(cur.getDate() + 7);
    else { cur.setMonth(cur.getMonth() + meses); if (dueDay) cur.setDate(Math.min(dueDay, 28)); }
  };
  const out: string[] = [];
  let guard = 0;
  while (cur <= fim && guard++ < 500) {
    if (cur >= hoje) out.push(iso(cur));
    step();
  }
  return out;
}

/** O ciclo da UI JÁ É o enum freq do banco (7 valores). Identidade + saneamento. */
export function cicloParaFreq(ciclo: string): FreqDB {
  return (Object.keys(MESES) as FreqDB[]).includes(ciclo as FreqDB) ? (ciclo as FreqDB) : "mensal";
}

/** `reference_code` idempotente de uma fatura de recorrência. */
export const refFatura = (recId: string, dataISO: string) => `rec:${recId}:${dataISO}`;
