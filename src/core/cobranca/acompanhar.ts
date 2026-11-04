/**
 * QUANDO A PÁGINA DO LINK PERGUNTA DE NOVO se o pagamento entrou (04/11/2026).
 * Puro, sem I/O: quem consulta é `components/checkout/AcompanharPagamento`.
 *
 * O Pix cai em segundos, então o começo é rápido; quem deixa a aba aberta não
 * pode virar uma consulta a cada 5 segundos para sempre. A espera cresce até
 * 30 segundos e a página para de perguntar depois de 1 hora (quem voltar
 * depois recarrega e vê a situação).
 */
export const ACOMPANHAR = Object.freeze({
  primeiraMs: 5_000,
  maximaMs: 30_000,
  limiteMs: 60 * 60_000,
});

/** A espera antes da consulta de número `n` (0, 1, 2…), ou null quando é hora de parar. */
export function esperaDaConsulta(n: number, decorridoMs: number): number | null {
  if (!Number.isFinite(n) || n < 0 || decorridoMs >= ACOMPANHAR.limiteMs) return null;
  // 5 s nas seis primeiras (o primeiro meio minuto), depois dobra até 30 s.
  const passo = n < 6 ? ACOMPANHAR.primeiraMs : ACOMPANHAR.primeiraMs * 2 ** Math.min(n - 5, 3);
  return Math.min(passo, ACOMPANHAR.maximaMs);
}

/** A situação que a consulta trouxe pede redesenhar a página? Só a mudança de um link aberto. */
export function pedeRedesenhar(atual: string, nova: unknown): boolean {
  return atual === "aberto" && (nova === "pago" || nova === "indisponivel");
}
