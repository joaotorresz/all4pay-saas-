/**
 * Camada de aprendizado do assistente (all4pay IA) — memória adaptativa local.
 * Não é um LLM: é o "machine learning leve" que faz o assistente APRENDER com o
 * uso do cliente. Registra cada pergunta (frequência + recência), o feedback
 * (👍/👎) e usa isso para reordenar as sugestões — quanto mais o usuário
 * pergunta sobre um tema, mais alto ele sobe. Persistido em localStorage
 * (demo-safe, por navegador). Em live evolui para uma tabela por org.
 */
export interface QStat {
  q: string; // pergunta (casing original da 1ª vez)
  n: number; // quantas vezes foi perguntada
  last: number; // epoch ms da última vez
  up: number; // feedback positivo
  down: number; // feedback negativo
}
interface Mem { stats: Record<string, QStat> }

const KEY = "a4p_ia_memory";
const DAY = 86400000;
const norm = (q: string) => q.trim().toLowerCase().replace(/\s+/g, " ");

function load(): Mem {
  if (typeof window === "undefined") return { stats: {} };
  try { const r = localStorage.getItem(KEY); if (r) return JSON.parse(r) as Mem; } catch { /* ignore */ }
  return { stats: {} };
}
function save(m: Mem) { try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* ignore */ } }

/** Registra que o usuário fez esta pergunta (sobe a frequência + recência). */
export function registrarPergunta(q: string) {
  if (typeof window === "undefined" || !q.trim()) return;
  const m = load(); const k = norm(q);
  const s = m.stats[k] ?? { q: q.trim(), n: 0, last: 0, up: 0, down: 0 };
  s.n += 1; s.last = Date.now(); s.q = q.trim();
  m.stats[k] = s; save(m);
}

/** Feedback do usuário sobre a resposta — alimenta o ranking de sugestões. */
export function registrarFeedback(q: string, dir: "up" | "down") {
  if (typeof window === "undefined") return;
  const m = load(); const s = m.stats[norm(q)]; if (!s) return;
  if (dir === "up") s.up += 1; else s.down += 1;
  save(m);
}

/** Score adaptativo: frequência + recência + saldo de feedback. */
function score(s: QStat): number {
  const recencia = Math.max(0, 3 - (Date.now() - s.last) / DAY); // até +3 nos últimos 3 dias
  return s.n + recencia + s.up * 0.5 - s.down * 0.75;
}

/** As perguntas mais relevantes APRENDIDAS do uso (mais perguntadas/recentes). */
export function perguntasFrequentes(n = 3): string[] {
  return Object.values(load().stats)
    .filter((s) => s.n > 0 && s.down <= s.up + 1)
    .sort((a, b) => score(b) - score(a))
    .slice(0, n)
    .map((s) => s.q);
}

/** Mescla o que foi aprendido (topo) com as sugestões curadas; dedup; corta em n. */
export function sugestoes(curadas: string[], n = 4): string[] {
  const aprendidas = perguntasFrequentes(2);
  const out: string[] = [];
  const vistos = new Set<string>();
  for (const q of [...aprendidas, ...curadas]) {
    const k = norm(q);
    if (vistos.has(k)) continue;
    vistos.add(k); out.push(q);
    if (out.length >= n) break;
  }
  return out;
}
