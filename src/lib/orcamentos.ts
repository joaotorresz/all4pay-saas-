"use client";

/**
 * Persistência dos orçamentos (localStorage, demo-safe).
 *
 * Síncrono de propósito: o select de orçamento do DRE/DFC precisa da lista na
 * hora, sem um estado de carregando que piscaria a cada troca de filtro.
 */
import type { Orcamento } from "@/core/orcamento";

const CHAVE = "a4p_orcamentos";

export function listarOrcamentos(): Orcamento[] {
  if (typeof window === "undefined") return [];
  try {
    const s = localStorage.getItem(CHAVE);
    const l = s ? (JSON.parse(s) as Orcamento[]) : [];
    return l.sort((a, b) => b.periodo.de.localeCompare(a.periodo.de));
  } catch {
    return [];
  }
}

function gravar(l: Orcamento[]): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(CHAVE, JSON.stringify(l)); } catch { /* cota cheia */ }
}

export const orcamentoPorId = (id: string): Orcamento | null =>
  listarOrcamentos().find((o) => o.id === id) ?? null;

export function salvarOrcamento(o: Orcamento): Orcamento[] {
  const out = [o, ...listarOrcamentos().filter((x) => x.id !== o.id)];
  gravar(out);
  return out.sort((a, b) => b.periodo.de.localeCompare(a.periodo.de));
}

export function removerOrcamento(id: string): Orcamento[] {
  const out = listarOrcamentos().filter((o) => o.id !== id);
  gravar(out);
  return out;
}

export function duplicarOrcamento(id: string): Orcamento | null {
  const orig = orcamentoPorId(id);
  if (!orig) return null;
  const copia: Orcamento = {
    ...orig,
    id: `orc_${Date.now().toString(36)}`,
    nome: `${orig.nome} (cópia)`,
    criadoEm: new Date().toISOString().slice(0, 10),
  };
  salvarOrcamento(copia);
  return copia;
}
