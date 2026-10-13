/**
 * Quattro DS — PontoStatus
 *
 * O status de um número, no lugar em que ele pode estar: um ponto de 7px ao
 * lado do rótulo. ⚠️ O NÚMERO fica sempre na tinta do texto (decisão do dono,
 * 30/09/2026) — pintar o valor de verde, laranja ou vermelho é o defeito que a
 * guarda `cor:` da matriz de consistência proíbe. Sem cor, ou com a própria
 * tinta, não desenha nada: "está tudo bem" não ganha marca.
 */
export function PontoStatus({ cor }: { cor?: string | null }) {
  if (!cor || cor === "var(--color-ink)") return null;
  return <span className="w-[7px] h-[7px] rounded-pill shrink-0" style={{ background: cor }} aria-hidden />;
}
