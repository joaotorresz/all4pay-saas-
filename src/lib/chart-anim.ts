/**
 * Animação de entrada dos gráficos (DS aurora glass — "o gráfico respira").
 * Um único lugar decide duração/easing e respeita `prefers-reduced-motion`
 * (aí a série entra estática). Uso: `<Line {...chartAnim()} …/>`; passe um
 * `begin` para escalonar séries do mesmo gráfico (0 · 120 · 240ms).
 */
export function chartAnim(begin = 0) {
  const reduced =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return {
    isAnimationActive: !reduced,
    animationDuration: 700,
    animationBegin: begin,
    animationEasing: "ease-out" as const,
  };
}
