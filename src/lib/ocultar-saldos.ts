"use client";

/**
 * Ocultar saldos — o "olho" dos apps de banco (pedido do dono, 27/10/2026).
 * Uma preferência do DISPOSITIVO (`a4p_ocultar_saldos`, em
 * `PREFERENCIAS_LOCAIS`): quem esconde o saldo no celular, numa mesa de café,
 * não quer escondê-lo no computador do escritório. Um store só, com ouvintes,
 * para todo card que mostrar saldo seguir o mesmo olho.
 */
import * as React from "react";

const CHAVE = "a4p_ocultar_saldos";
const ouvintes = new Set<() => void>();
let memoria: boolean | null = null;

/** O que aparece no lugar do valor escondido: a moeda fica, o número não. */
export const VALOR_OCULTO = "R$ ••••••";

function ler(): boolean {
  if (typeof window === "undefined") return false;
  try { return localStorage.getItem(CHAVE) === "1"; } catch { return false; }
}

export function definirOcultarSaldos(ocultar: boolean) {
  try { if (ocultar) localStorage.setItem(CHAVE, "1"); else localStorage.removeItem(CHAVE); } catch { /* preferência: sem armazenamento, vale só nesta aba */ }
  memoria = ocultar;
  ouvintes.forEach((f) => f());
}

const atual = () => memoria ?? (memoria = ler());

/** `[oculto, alternar]`. No servidor (e no primeiro desenho) é `false`. */
export function useOcultarSaldos(): [boolean, () => void] {
  const oculto = React.useSyncExternalStore(
    (f) => { ouvintes.add(f); return () => { ouvintes.delete(f); }; },
    atual,
    () => false,
  );
  return [oculto, () => definirOcultarSaldos(!atual())];
}
