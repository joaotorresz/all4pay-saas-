/**
 * Tags / dimensões customizadas por lançamento — mapa movementId → tags[].
 * Alimenta a dimensão "Tag" do relatório de dimensões (drill-down até a
 * transação). **demo**: `localStorage`; **live**: tabela `movement_tags`
 * (0011), via cache hidratado (`hydrateTags`) para `tagsDe`/`allTags` seguirem
 * síncronos. Leituras usam o cache; escritas gravam no destino e no cache.
 */
import { isDemo } from "@/lib/demo";
import { createClient } from "@/lib/supabase/client";

export type TagMap = Record<string, string[]>;

const KEY = "a4p_tags";
let cache: TagMap | null = null;

/* ----------------------------- demo (localStorage) ----------------------------- */
function loadLocal(): TagMap {
  if (typeof window === "undefined") return {};
  try { const raw = localStorage.getItem(KEY); return raw ? (JSON.parse(raw) as TagMap) : {}; } catch { return {}; }
}
function persistLocal(map: TagMap): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(KEY, JSON.stringify(map)); } catch { /* ignore */ }
}

/** Hidrata o cache (demo: localStorage; live: movement_tags). */
export async function hydrateTags(): Promise<TagMap> {
  if (isDemo) { cache = loadLocal(); return cache; }
  try {
    const { data } = await createClient().from("movement_tags").select("movement_id,tag");
    const map: TagMap = {};
    for (const r of (data ?? []) as Array<{ movement_id: string; tag: string }>) {
      (map[r.movement_id] ??= []).push(r.tag);
    }
    cache = map;
  } catch { cache = {}; }
  return cache;
}

export function loadTags(): TagMap {
  if (cache) return cache;
  return isDemo ? loadLocal() : {};
}
export function tagsDe(id: string): string[] {
  return loadTags()[id] ?? [];
}

export async function addTag(id: string, tag: string): Promise<TagMap> {
  const t = tag.trim();
  if (!t) return loadTags();
  const map = { ...loadTags() };
  const atual = new Set(map[id] ?? []);
  if (atual.has(t)) return map;
  atual.add(t);
  map[id] = Array.from(atual);
  cache = map;
  if (isDemo) persistLocal(map);
  else { try { await createClient().from("movement_tags").insert({ movement_id: id, tag: t }); } catch { /* best-effort */ } }
  return map;
}

export async function removeTag(id: string, tag: string): Promise<TagMap> {
  const map = { ...loadTags() };
  map[id] = (map[id] ?? []).filter((x) => x !== tag);
  if (map[id].length === 0) delete map[id];
  cache = map;
  if (isDemo) persistLocal(map);
  else { try { await createClient().from("movement_tags").delete().eq("movement_id", id).eq("tag", tag); } catch { /* best-effort */ } }
  return map;
}

/** Todas as tags conhecidas (para sugestões). */
export function allTags(): string[] {
  const set = new Set<string>();
  Object.values(loadTags()).forEach((arr) => arr.forEach((t) => set.add(t)));
  return Array.from(set).sort();
}
