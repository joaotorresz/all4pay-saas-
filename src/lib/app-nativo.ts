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

/* ── Ponte para os plugins nativos ──────────────────────────────────────────
 * O site é carregado de fora (`server.url`), então não importa os pacotes do
 * Capacitor: fala com a ponte global, `window.Capacitor.registerPlugin`, pelo
 * NOME nativo do plugin. Fora do app tudo aqui responde "não há".
 */
type Escuta = { remove: () => Promise<void> };
type PluginNativo = Record<string, (...a: unknown[]) => Promise<unknown>> & {
  addListener?: (evento: string, cb: (dados: unknown) => void) => Promise<Escuta>;
};

function plugin(nome: string): PluginNativo | null {
  if (typeof window === "undefined" || !lerAppNativo().nativo) return null;
  const cap = (window as unknown as { Capacitor?: { registerPlugin?: (n: string) => PluginNativo } }).Capacitor;
  return cap?.registerPlugin?.(nome) ?? null;
}

/** Preferência DESTE aparelho (cada celular decide o seu). */
export const CHAVE_BIOMETRIA = "a4p_app_biometria";

export function biometriaLigada(): boolean {
  try { return localStorage.getItem(CHAVE_BIOMETRIA) === "1"; } catch { return false; }
}

export function gravarBiometria(ligada: boolean) {
  try {
    if (ligada) localStorage.setItem(CHAVE_BIOMETRIA, "1");
    else localStorage.removeItem(CHAVE_BIOMETRIA);
  } catch { /* sem armazenamento: a trava simplesmente não liga */ }
}

/** O aparelho tem digital/rosto (ou senha do aparelho) cadastrados? */
export async function biometriaDisponivel(): Promise<boolean> {
  const p = plugin("BiometricAuthNative");
  if (!p?.checkBiometry) return false;
  try {
    const r = (await p.checkBiometry()) as { isAvailable?: boolean; deviceIsSecure?: boolean };
    return !!(r.isAvailable || r.deviceIsSecure);
  } catch { return false; }
}

/**
 * Pede digital, rosto ou a senha do aparelho. `true` só quando o sistema
 * confirmou; cancelar ou errar devolve `false`.
 */
export async function pedirBiometria(motivo: string): Promise<boolean> {
  const p = plugin("BiometricAuthNative");
  if (!p?.internalAuthenticate) return false;
  try {
    await p.internalAuthenticate({
      reason: motivo,
      cancelTitle: "Cancelar",
      allowDeviceCredential: true,
      androidTitle: "Destravar o Quattro",
      androidSubtitle: motivo,
    });
    return true;
  } catch { return false; }
}

/** Avisa quando o app volta para a frente (e quando sai). */
export function aoMudarDePlano(cb: (ativo: boolean) => void): () => void {
  const p = plugin("App");
  if (!p?.addListener) return () => {};
  let escuta: Escuta | null = null;
  let cancelado = false;
  void p.addListener("appStateChange", (d) => cb(!!(d as { isActive?: boolean }).isActive)).then((e) => {
    if (cancelado) void e.remove();
    else escuta = e;
  });
  return () => { cancelado = true; void escuta?.remove(); };
}
