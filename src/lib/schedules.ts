/**
 * Cronogramas (amortização/depreciação) — store local demo-safe. CRUD em
 * localStorage; em demo, semeia exemplos para a tela não nascer vazia.
 * Persistência em Postgres é evolução futura.
 */
import type { Cronograma } from "@/core/schedules";
import { isDemo } from "@/lib/demo";

const KEY = "a4p_cronogramas";
const uid = () => globalThis.crypto?.randomUUID?.() ?? `cr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

function primeiroDiaMesesAtras(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

const SEED: Cronograma[] = [
  { id: "seed-amort-1", tipo: "amortizacao", descricao: "Licença de software (anual)", valorTotal: 12000, residual: 0, meses: 12, inicio: primeiroDiaMesesAtras(3), categoria: "Assinaturas / Software" },
  { id: "seed-amort-2", tipo: "amortizacao", descricao: "Seguro empresarial (anual)", valorTotal: 6000, residual: 0, meses: 12, inicio: primeiroDiaMesesAtras(1), categoria: "Seguros" },
  { id: "seed-deprec-1", tipo: "depreciacao", descricao: "Notebooks (lote)", valorTotal: 18000, residual: 1800, meses: 36, inicio: primeiroDiaMesesAtras(6), categoria: "Equipamentos de TI" },
];

export function loadCronogramas(): Cronograma[] {
  if (typeof window === "undefined") return isDemo ? SEED : [];
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Cronograma[];
  } catch { /* ignore */ }
  return isDemo ? SEED : [];
}

function persist(list: Cronograma[]): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

export function salvarCronograma(c: Omit<Cronograma, "id"> & { id?: string }): Cronograma[] {
  const list = loadCronogramas();
  if (c.id) {
    const next = list.map((x) => (x.id === c.id ? { ...x, ...c, id: c.id } as Cronograma : x));
    persist(next); return next;
  }
  const novo: Cronograma = { ...c, id: uid() } as Cronograma;
  const next = [...list, novo];
  persist(next); return next;
}

export function removerCronograma(id: string): Cronograma[] {
  const next = loadCronogramas().filter((x) => x.id !== id);
  persist(next); return next;
}
