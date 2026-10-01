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
import { ler as lerOrg, gravar as gravarOrg } from "@/lib/store-org";

const CHAVE = "a4p_fechamentos";
/** Teto de histórico: os 60 mais recentes (5 anos de fechamentos mensais). */
const TETO = 60;

export function listarFechamentos(): Fechamento[] {
  try {
    const l = [...lerOrg<Fechamento[]>(CHAVE, [])];
    return l.sort((a, b) => `${b.ano}-${b.mes.padStart(2, "0")}`.localeCompare(`${a.ano}-${a.mes.padStart(2, "0")}`));
  } catch {
    return [];
  }
}

// ⚠️ Chave de NEGÓCIO (`CHAVES_ORG`): passa por `store-org`, nunca `localStorage.setItem` cru.
function gravar(l: Fechamento[]): void {
  gravarOrg(CHAVE, l.slice(0, TETO));
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
