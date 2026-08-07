"use client";

/**
 * Vínculo LANÇAMENTO → PROJETO.
 *
 * O projeto já existia como cadastro (`a4p_projetos`), mas nenhum movimento o
 * referenciava — por isso o filtro "Projeto" dos relatórios não filtrava nada e
 * eu o tinha deixado de fora dos painéis. Aqui o vínculo passa a existir.
 *
 * Duas camadas, na ordem em que respondem:
 *  1. **`movements.project_id`** (migration `0019`) — a casa definitiva do dado
 *     em live. O writer já manda a coluna quando o projeto é escolhido.
 *  2. **Este mapa local** (`a4p_movimento_projeto`) — a fonte SÍNCRONA, que faz
 *     a coisa funcionar em demo e enquanto a migration não é aplicada ao remoto.
 *
 * `getRiscoInput` lê a coluna quando ela existe e cai neste mapa quando não —
 * então o filtro funciona hoje e continua funcionando depois, sem troca de
 * código nas telas.
 */
const CHAVE = "a4p_movimento_projeto";

type Mapa = Record<string, string>;

function ler(): Mapa {
  if (typeof window === "undefined") return {};
  try {
    const s = localStorage.getItem(CHAVE);
    return s ? (JSON.parse(s) as Mapa) : {};
  } catch {
    return {};
  }
}

function gravar(m: Mapa): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(CHAVE, JSON.stringify(m)); } catch { /* cota cheia */ }
}

export const vinculosProjeto = (): Mapa => ler();

export const projetoDoMovimento = (movementId: string): string | null =>
  ler()[movementId] ?? null;

/** Grava (ou apaga, com id vazio) o projeto de um lançamento. */
export function vincularProjeto(movementId: string, projetoId: string): void {
  const m = ler();
  if (projetoId) m[movementId] = projetoId;
  else delete m[movementId];
  gravar(m);
}

/** Vincula vários de uma vez (usado pelo rateio de contrato e pela importação). */
export function vincularProjetos(pares: { movementId: string; projetoId: string }[]): void {
  const m = ler();
  for (const p of pares) {
    if (p.projetoId) m[p.movementId] = p.projetoId;
    else delete m[p.movementId];
  }
  gravar(m);
}
