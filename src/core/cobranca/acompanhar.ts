/**
 * QUANDO A PÁGINA DO LINK PERGUNTA DE NOVO se o pagamento entrou (04/11/2026).
 * Puro, sem I/O: quem consulta é `components/checkout/AcompanharPagamento`.
 *
 * ⚠️ **O PRIMEIRO TESTE REAL (05/11/2026) MOSTROU QUE ERA LENTO DEMAIS.** A
 * versão anterior perguntava a cada 5 s só no primeiro meio minuto e depois
 * espaçava até 30 s. Quem abre o link, vai ao app do banco e paga leva mais
 * de meio minuto, então o aviso caía na espera longa e o João recarregou a
 * página à mão. Agora: a cada 3 s nos primeiros 10 minutos (o tempo de pagar),
 * depois a cada 15 s, e para em 1 hora. Voltar para a janela pergunta na hora.
 */
export const ACOMPANHAR = Object.freeze({
  rapidaMs: 3_000,
  janelaRapidaMs: 10 * 60_000,
  lentaMs: 15_000,
  limiteMs: 60 * 60_000,
});

/** A espera antes da próxima consulta, pelo tempo desde que a página abriu, ou null quando é hora de parar. */
export function esperaDaConsulta(decorridoMs: number): number | null {
  if (!Number.isFinite(decorridoMs) || decorridoMs < 0 || decorridoMs >= ACOMPANHAR.limiteMs) return null;
  return decorridoMs < ACOMPANHAR.janelaRapidaMs ? ACOMPANHAR.rapidaMs : ACOMPANHAR.lentaMs;
}

/** A situação que a consulta trouxe pede redesenhar a página? Só a mudança de um link aberto. */
export function pedeRedesenhar(atual: string, nova: unknown): boolean {
  return atual === "aberto" && (nova === "pago" || nova === "indisponivel");
}
