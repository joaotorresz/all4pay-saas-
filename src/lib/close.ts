/**
 * Fechamento contábil — os PERÍODOS TRAVADOS.
 *
 * `isPeriodLocked` é lido no render (fechamento, razão), então tem de ser
 * síncrono: o localStorage é a camada imediata e, em **live**, um cache
 * hidratado de `accounting_periods` torna o estado cross-device. Quem TRAVA de
 * verdade é o banco (`fechar_periodo` + o gatilho da 0030); isto só espelha.
 *
 * ⚠️ As TAREFAS do checklist saíram daqui. Elas moravam em dois lugares — o
 * navegador (`a4p_close_tasks`) e `close_tasks` — unidos na leitura, e a união
 * nunca deixava um "feito" voltar a "não feito". A morada única delas é
 * `lib/fechamento-tarefas` (banco em produção; navegador só na demonstração).
 */
import { isDemo } from "@/lib/demo";
import { lockedPeriodsLive } from "@/lib/ledger";
import { ler as lerOrg, gravar as gravarOrg } from "@/lib/store-org";

const KEY_LOCK = "a4p_locked_periods";

// ⚠️ Chave de NEGÓCIO (`CHAVES_ORG`): passa por `store-org`, nunca `localStorage.setItem` cru.
const read = <T,>(key: string, fallback: T): T => lerOrg<T>(key, fallback);
const write = (key: string, v: unknown): void => gravarOrg(key, v);

/* ----------------------------- cache live (hidratado) ----------------------------- */
let liveLocks: string[] = [];

/** Hidrata o cache live a partir de `accounting_periods` (no-op em demo). */
export async function hydrateClose(): Promise<void> {
  if (isDemo) return;
  liveLocks = await lockedPeriodsLive();
}

/* ----------------------------- locks ----------------------------- */
/** Meses travados (YYYY-MM) — união do local (síncrono) com o cache live. */
export function lockedPeriods(): string[] {
  return Array.from(new Set([...read<string[]>(KEY_LOCK, []), ...liveLocks])).sort();
}
export function isPeriodLocked(mesISO: string): boolean {
  if (!mesISO) return false;
  return lockedPeriods().includes(mesISO.slice(0, 7));
}
/** Espelha localmente uma trava que o BANCO já aceitou (ou a da demonstração). */
export function lockPeriod(mesISO: string): void {
  const m = mesISO.slice(0, 7);
  const set = new Set(lockedPeriods());
  set.add(m);
  write(KEY_LOCK, Array.from(set).sort());
  if (!liveLocks.includes(m)) liveLocks = [...liveLocks, m];
}
export function unlockPeriod(mesISO: string): void {
  const m = mesISO.slice(0, 7);
  write(KEY_LOCK, read<string[]>(KEY_LOCK, []).filter((x) => x !== m));
  liveLocks = liveLocks.filter((x) => x !== m);
}
