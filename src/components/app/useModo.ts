"use client";

import * as React from "react";

/**
 * Modo Simples × Pro — a camada de exposição da tese de reconstrução.
 * Simples (padrão): 5 destinos, Início enxuto, Fluxo com 3 blocos — responde
 * "tenho caixa? o que vence? o que fazer hoje?". Pro: libera os motores de IA,
 * a Plataforma e os 13 blocos. Preferência por usuário (localStorage), reativa.
 */
export type Modo = "simples" | "pro";
const KEY = "a4p_modo";
const listeners = new Set<() => void>();

function get(): Modo {
  if (typeof window === "undefined") return "simples";
  try { return (localStorage.getItem(KEY) as Modo) === "pro" ? "pro" : "simples"; } catch { return "simples"; }
}
export function setModo(m: Modo): void {
  try { localStorage.setItem(KEY, m); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}

/** [modo, setModo, isPro] — re-renderiza quem usa quando o modo muda. */
export function useModo(): { modo: Modo; pro: boolean; set: (m: Modo) => void } {
  const [modo, setM] = React.useState<Modo>("simples");
  React.useEffect(() => {
    setM(get());
    const l = () => setM(get());
    listeners.add(l);
    const onStorage = (e: StorageEvent) => { if (e.key === KEY) setM(get()); };
    window.addEventListener("storage", onStorage);
    return () => { listeners.delete(l); window.removeEventListener("storage", onStorage); };
  }, []);
  return { modo, pro: modo === "pro", set: setModo };
}
