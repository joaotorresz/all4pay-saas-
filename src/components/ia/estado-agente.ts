"use client";

/**
 * "O agente está trabalhando AGORA" — um lugar só, lido por todo avatar dele
 * (menu, lista, pílula do chat, cartão da resposta). Quem trabalha avisa com
 * `useAgenteTrabalhando(id, ativo)` enquanto `ativo` for verdadeiro: o chat
 * do agente digitando ou salvando, a proposta sendo executada, a Quattro AI
 * pensando numa resposta.
 *
 * ⚠️ É contagem, não liga/desliga: duas tarefas do mesmo agente ao mesmo
 * tempo não se apagam quando a primeira termina.
 */
import * as React from "react";
import type { IdAgente } from "@/core/agentes";

export type IdAvatar = IdAgente | "quattro-ai";

const contagem = new Map<IdAvatar, number>();
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());

function somar(id: IdAvatar, d: number) {
  const n = Math.max(0, (contagem.get(id) ?? 0) + d);
  if (n) contagem.set(id, n); else contagem.delete(id);
  avisar();
}

function assinar(f: () => void) {
  ouvintes.add(f);
  return () => { ouvintes.delete(f); };
}

/** Marca o agente como trabalhando enquanto `ativo` for verdadeiro. */
export function useAgenteTrabalhando(id: IdAvatar, ativo: boolean) {
  React.useEffect(() => {
    if (!ativo) return;
    somar(id, 1);
    return () => somar(id, -1);
  }, [id, ativo]);
}

/** Verdadeiro enquanto alguma tarefa do agente estiver em andamento. */
export function useEstaTrabalhando(id: IdAvatar): boolean {
  return React.useSyncExternalStore(assinar, () => (contagem.get(id) ?? 0) > 0, () => false);
}
