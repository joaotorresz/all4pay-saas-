/**
 * Tags / dimensões customizadas por lançamento — store local demo-safe.
 * Mapa movementId → tags[]. Alimenta a dimensão "Tag" do relatório de dimensões
 * (drill-down até a transação). Persistência em Postgres é evolução futura.
 */
export type TagMap = Record<string, string[]>;

const KEY = "a4p_tags";

export function loadTags(): TagMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as TagMap) : {};
  } catch { return {}; }
}
function persist(map: TagMap): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(KEY, JSON.stringify(map)); } catch { /* ignore */ }
}

export function tagsDe(id: string): string[] {
  return loadTags()[id] ?? [];
}
export function addTag(id: string, tag: string): TagMap {
  const t = tag.trim();
  if (!t) return loadTags();
  const map = loadTags();
  const atual = new Set(map[id] ?? []);
  atual.add(t);
  map[id] = Array.from(atual);
  persist(map);
  return map;
}
export function removeTag(id: string, tag: string): TagMap {
  const map = loadTags();
  map[id] = (map[id] ?? []).filter((x) => x !== tag);
  if (map[id].length === 0) delete map[id];
  persist(map);
  return map;
}
/** Todas as tags conhecidas (para sugestões). */
export function allTags(): string[] {
  const set = new Set<string>();
  Object.values(loadTags()).forEach((arr) => arr.forEach((t) => set.add(t)));
  return Array.from(set).sort();
}
