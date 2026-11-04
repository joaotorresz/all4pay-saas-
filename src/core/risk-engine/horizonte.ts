/**
 * O HORIZONTE DA CHANCE DE RUPTURA — um número só no produto (Fase 3.3 do
 * plano, 03/11/2026).
 *
 * Antes havia três "chances" de o caixa faltar, de três motores, em dois
 * horizontes: a do `risk-engine` (60 dias), a do `quant` (fórmula própria,
 * dita "90 dias") e a do `decision` (o "stress" agregado e a simulação Monte
 * Carlo, 90 dias). A mesma empresa via 12% numa tela e 31% na outra.
 *
 * Agora a chance de ruptura é UMA: `probabilidadeRuptura` do `risk-engine`,
 * sempre medida neste horizonte, qualquer que seja o período que a tela
 * projeta. Os outros motores LEEM esse número; nenhum calcula o seu.
 * Guarda: `npm run risco-unico`.
 */
export const HORIZONTE_RUPTURA_DIAS = 60;

/** "60 dias" — o rótulo que toda tela e toda resposta usam. */
export const ROTULO_HORIZONTE_RUPTURA = `${HORIZONTE_RUPTURA_DIAS} dias`;
