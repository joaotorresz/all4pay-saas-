/**
 * Camada de aprendizado do assistente (all4pay IA) — memória adaptativa local.
 * Não é um LLM: é o "machine learning leve" que faz o assistente APRENDER com o
 * uso do cliente. Registra cada pergunta (frequência + recência), o feedback
 * (👍/👎) e usa isso para reordenar as sugestões — quanto mais o usuário
 * pergunta sobre um tema, mais alto ele sobe. O localStorage é a fonte SÍNCRONA
 * (rápida, demo-safe, por navegador). Em live (não-demo, Supabase configurado)
 * sincroniza **best-effort** com a tabela `ai_learning` por ORG (0018): cada
 * pergunta/feedback dá um bump remoto (fire-and-forget) e `hidratarAprendizado()`
 * (chamado ao abrir o painel) mescla o aprendizado da org de volta no local.
 * Tudo tolerante a falha/ausência da tabela — nunca quebra o assistente.
 */
import { isDemo } from "@/lib/demo";
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

// ——— Sincronização best-effort com o Supabase (só live; nunca lança) ———
async function supa() {
  if (isDemo || typeof window === "undefined") return null;
  try { const { createClient } = await import("@/lib/supabase/client"); return createClient(); } catch { return null; }
}
async function remoteBump(k: string, q: string) {
  try { const c = await supa(); if (c) await c.rpc("ai_learning_bump", { p_norm: k, p_q: q }); } catch { /* ignore */ }
}
async function remoteFeedback(k: string, dir: "up" | "down") {
  try { const c = await supa(); if (c) await c.rpc("ai_learning_feedback", { p_norm: k, p_dir: dir }); } catch { /* ignore */ }
}

/** Mescla o aprendizado da ORG (Supabase) no local — chamar 1x ao abrir. */
let hidratado = false;
export async function hidratarAprendizado() {
  if (hidratado || isDemo || typeof window === "undefined") return;
  try {
    const c = await supa(); if (!c) return; // sem cliente → tenta de novo numa próxima abertura
    const { data } = await c.from("ai_learning").select("q_norm,q,n,up,down,last").order("n", { ascending: false }).limit(40);
    if (Array.isArray(data) && data.length) {
      const m = load();
      for (const r of data as { q_norm: string; q: string; n: number; up: number; down: number; last: string }[]) {
        const cur = m.stats[r.q_norm];
        const remoteLast = Date.parse(r.last) || 0;
        // funde pegando o MAIOR de cada contador (org agrega vários navegadores)
        m.stats[r.q_norm] = {
          q: cur?.q || r.q,
          n: Math.max(cur?.n ?? 0, r.n ?? 0),
          up: Math.max(cur?.up ?? 0, r.up ?? 0),
          down: Math.max(cur?.down ?? 0, r.down ?? 0),
          last: Math.max(cur?.last ?? 0, remoteLast),
        };
      }
      save(m);
    }
    hidratado = true; // conectou (com ou sem dados) → não repete; falha deixa retry
  } catch { /* ignore — permite nova tentativa ao reabrir */ }
}

/** Registra que o usuário fez esta pergunta (sobe a frequência + recência). */
export function registrarPergunta(q: string) {
  if (typeof window === "undefined" || !q.trim()) return;
  const m = load(); const k = norm(q);
  const s = m.stats[k] ?? { q: q.trim(), n: 0, last: 0, up: 0, down: 0 };
  s.n += 1; s.last = Date.now(); s.q = q.trim();
  m.stats[k] = s; save(m);
  void remoteBump(k, q.trim());
}

/** Feedback do usuário sobre a resposta — alimenta o ranking de sugestões. */
export function registrarFeedback(q: string, dir: "up" | "down") {
  if (typeof window === "undefined") return;
  const m = load(); const k = norm(q); const s = m.stats[k]; if (!s) return;
  if (dir === "up") s.up += 1; else s.down += 1;
  save(m);
  void remoteFeedback(k, dir);
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
