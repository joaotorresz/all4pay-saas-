"use client";

import * as React from "react";

/**
 * O app das lojas (`app-movel/`, Capacitor) abre o MESMO site numa WebView.
 * Duas marcas dizem que estamos dentro dele: o sufixo `QuattroApp` no agente
 * (`appendUserAgent` do `capacitor.config.json`, presente desde a primeira
 * requisição) e a ponte `window.Capacitor`, que entra depois.
 */
export const SUFIXO_AGENTE_APP = "QuattroApp";

type Ponte = { isNativePlatform?: () => boolean; getPlatform?: () => string };

export type AppNativo = { nativo: boolean; ios: boolean };

export function lerAppNativo(): AppNativo {
  if (typeof window === "undefined") return { nativo: false, ios: false };
  const ponte = (window as unknown as { Capacitor?: Ponte }).Capacitor;
  const agente = navigator.userAgent;
  const nativo = agente.includes(SUFIXO_AGENTE_APP) || !!ponte?.isNativePlatform?.();
  const ios = nativo && (ponte?.getPlatform?.() === "ios" || /iPhone|iPad|iPod/.test(agente));
  return { nativo, ios };
}

/**
 * ⚠️ Lido DEPOIS de montar: no servidor não há agente, e decidir no render
 * daria uma tela no servidor e outra no aparelho (erro de hidratação).
 */
export function useAppNativo(): AppNativo {
  const [app, setApp] = React.useState<AppNativo>({ nativo: false, ios: false });
  React.useEffect(() => setApp(lerAppNativo()), []);
  return app;
}
