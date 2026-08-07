"use client";

import * as React from "react";
import { BRL } from "@/components/ui";

/**
 * Count-up clean para os valores monetários: anima de 0 → alvo com easeOutCubic
 * e PARA no número exato. Respeita `prefers-reduced-motion`. Durante a animação
 * conta em inteiros (sem tremer os centavos); ao terminar mostra o valor exato.
 */
export function useCountUp(target: number, durationMs = 900): { v: number; done: boolean } {
  const [v, setV] = React.useState(target);
  const [done, setDone] = React.useState(true);
  const fromRef = React.useRef(0);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !Number.isFinite(target)) { fromRef.current = target; setV(target); setDone(true); return; }
    const from = fromRef.current;
    if (from === target) { setV(target); setDone(true); return; }
    setDone(false);
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setV(from + (target - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else { fromRef.current = target; setV(target); setDone(true); }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return { v, done };
}

/** <BRL> com count-up: inteiro animado, centavos exatos no fim. */
export function AnimatedBRL({ value, durationMs }: { value: number; durationMs?: number }) {
  const { v, done } = useCountUp(value, durationMs);
  return <BRL value={done ? value : Math.round(v)} />;
}
