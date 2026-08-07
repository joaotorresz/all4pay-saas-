"use client";

/**
 * Histórico dos fechamentos mensais (localStorage, demo-safe).
 *
 * O relatório inteiro é serializado — inclusive a DRE do período. Isso é
 * deliberado: um fechamento é uma FOTOGRAFIA assinada. Recalculá-lo ao abrir
 * mudaria o número depois que alguém já leu e assinou o documento, que é
 * exatamente o que um fechamento existe para impedir.
 */
import type { Fechamento } from "@/core/relatorios";

const CHAVE = "a4p_fechamentos";
/** Teto de histórico: os 60 mais recentes (5 anos de fechamentos mensais). */
const TETO = 60;

export function listarFechamentos(): Fechamento[] {
  if (typeof window === "undefined") return [];
  try {
    const s = localStorage.getItem(CHAVE);
    const l = s ? (JSON.parse(s) as Fechamento[]) : [];
    return l.sort((a, b) => `${b.ano}-${b.mes.padStart(2, "0")}`.localeCompare(`${a.ano}-${a.mes.padStart(2, "0")}`));
  } catch {
    return [];
  }
}

function gravar(l: Fechamento[]): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(CHAVE, JSON.stringify(l.slice(0, TETO))); } catch { /* cota cheia */ }
}

export function salvarFechamento(f: Fechamento): Fechamento[] {
  const out = [f, ...listarFechamentos().filter((x) => x.id !== f.id)];
  gravar(out);
  return out.slice(0, TETO);
}

export function removerFechamento(id: string): Fechamento[] {
  const out = listarFechamentos().filter((f) => f.id !== id);
  gravar(out);
  return out;
}
