"use client";

/**
 * Cadastros do modelo IULI ainda não cobertos pelo schema all4pay — Projetos
 * (centros de resultado temporais, com previsões) e Centros de Custo (rateio +
 * código contábil Domínio). Store local (localStorage), demo-safe; em escala
 * vira tabela própria. Campos fiéis ao relatório (§3.4 / §3.5).
 */

export interface Projeto {
  id: string;
  nome: string;
  codigo: string;
  descricao: string;
  dataInicial: string; // ISO
  dataFinal: string; // ISO
  previsaoReceita: number;
  previsaoDespesa: number;
}

export interface CentroCusto {
  id: string;
  nome: string;
  codigo: string;
  codigoContabil: string; // Domínio (TXT contábil)
  descricao: string;
  ativo: boolean;
}

const K_PROJ = "a4p_projetos";
const K_CC = "a4p_centros_custo";

function load<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try { const s = localStorage.getItem(key); return s ? (JSON.parse(s) as T[]) : []; } catch { return []; }
}
function save<T>(key: string, v: T[]) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ }
}
const novoId = (xs: { id: string }[]) => String(1 + xs.reduce((m, x) => Math.max(m, Number(x.id) || 0), 5000));

export function listProjetos(): Projeto[] { return load<Projeto>(K_PROJ); }
export function addProjeto(p: Omit<Projeto, "id">): Projeto {
  const xs = listProjetos(); const novo = { ...p, id: novoId(xs) }; save(K_PROJ, [novo, ...xs]); return novo;
}
export function listCentrosCusto(): CentroCusto[] { return load<CentroCusto>(K_CC); }
export function addCentroCusto(c: Omit<CentroCusto, "id">): CentroCusto {
  const xs = listCentrosCusto(); const novo = { ...c, id: novoId(xs) }; save(K_CC, [novo, ...xs]); return novo;
}
