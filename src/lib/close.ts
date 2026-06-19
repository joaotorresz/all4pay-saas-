/**
 * Fechamento contábil — períodos travados + estado das tarefas manuais do
 * checklist por mês. **Persistência em duas camadas:** localStorage é a camada
 * síncrona imediata (mesma sessão; `isPeriodLocked` é lido no render do
 * MovementsTable, então tem de ser síncrono); e, em **live**, um cache
 * hidratado das tabelas `0010` (`accounting_periods` p/ locks, `close_tasks` p/
 * tarefas) torna o estado **cross-device**. As leituras unem as duas camadas.
 */
import { isDemo } from "@/lib/demo";
import { lockedPeriodsLive, closeTasksLive, saveCloseTaskLive } from "@/lib/ledger";

const KEY_LOCK = "a4p_locked_periods";
const KEY_TASKS = "a4p_close_tasks";

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}
function write(key: string, v: unknown): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ }
}

/* ----------------------------- cache live (hidratado) ----------------------------- */
type TasksByMonth = Record<string, Record<string, boolean>>;
let liveLocks: string[] = [];
let liveTasks: TasksByMonth = {};

/** Hidrata o cache live a partir das tabelas `0010` (no-op em demo). */
export async function hydrateClose(): Promise<void> {
  if (isDemo) return;
  [liveLocks, liveTasks] = await Promise.all([lockedPeriodsLive(), closeTasksLive()]);
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
export function lockPeriod(mesISO: string): void {
  const m = mesISO.slice(0, 7);
  const set = new Set(lockedPeriods());
  set.add(m);
  write(KEY_LOCK, Array.from(set).sort());
  if (!liveLocks.includes(m)) liveLocks = [...liveLocks, m];
  // a persistência live do lock é feita por travarPeriodoLive() (accounting_periods).
}
export function unlockPeriod(mesISO: string): void {
  const m = mesISO.slice(0, 7);
  write(KEY_LOCK, read<string[]>(KEY_LOCK, []).filter((x) => x !== m));
  liveLocks = liveLocks.filter((x) => x !== m);
}

/* ----------------------------- tarefas do checklist ----------------------------- */
/** Estado das tarefas manuais por mês: { "2026-05": { conciliacao: true, ... } } */
export function loadCloseTasks(mesISO: string): Record<string, boolean> {
  const m = mesISO.slice(0, 7);
  const local = read<TasksByMonth>(KEY_TASKS, {})[m] ?? {};
  return { ...(liveTasks[m] ?? {}), ...local };
}
export function saveCloseTask(mesISO: string, taskId: string, done: boolean): void {
  const all = read<TasksByMonth>(KEY_TASKS, {});
  const m = mesISO.slice(0, 7);
  all[m] = { ...(all[m] ?? {}), [taskId]: done };
  write(KEY_TASKS, all);
  (liveTasks[m] ??= {})[taskId] = done;
  void saveCloseTaskLive(mesISO, taskId, done); // persiste em close_tasks (live)
}
