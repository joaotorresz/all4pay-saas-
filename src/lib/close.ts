/**
 * Fechamento contábil — store local (demo-safe): períodos travados (locked
 * periods) + estado das tarefas manuais do checklist por mês. Persistência em
 * Postgres é evolução futura. `isPeriodLocked` é o controle consumido pela UI
 * (ex.: bloquear edição/exclusão de lançamentos de um mês fechado).
 */
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

/** Meses travados (YYYY-MM). */
export function lockedPeriods(): string[] {
  return read<string[]>(KEY_LOCK, []);
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
}
export function unlockPeriod(mesISO: string): void {
  const m = mesISO.slice(0, 7);
  write(KEY_LOCK, lockedPeriods().filter((x) => x !== m));
}

/** Estado das tarefas manuais por mês: { "2026-05": { conciliacao: true, ... } } */
type TasksByMonth = Record<string, Record<string, boolean>>;
export function loadCloseTasks(mesISO: string): Record<string, boolean> {
  return read<TasksByMonth>(KEY_TASKS, {})[mesISO.slice(0, 7)] ?? {};
}
export function saveCloseTask(mesISO: string, taskId: string, done: boolean): void {
  const all = read<TasksByMonth>(KEY_TASKS, {});
  const m = mesISO.slice(0, 7);
  all[m] = { ...(all[m] ?? {}), [taskId]: done };
  write(KEY_TASKS, all);
}
