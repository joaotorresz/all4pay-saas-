"use client";

import * as React from "react";
import { loadCompany } from "@/lib/company";

/**
 * Tipo de conta — Empresa (Pessoa Jurídica) × Pessoal (Pessoa Física).
 * A MESMA infraestrutura financeira (caixa, contas, gastos, motores) servida em
 * duas roupas: a empresa vê o ERP completo; a pessoa física vê um app enxuto de
 * controle de gastos do dia a dia. Escolhido no login/cadastro, preferência por
 * usuário (localStorage), reativo — igual ao `useModo`.
 *
 * Fonte da verdade da UI = `a4p_tipo_conta`. Se ausente, cai no que o perfil
 * salvou no onboarding (`a4p_company.db.tipoConta`) — assim um retorno do mesmo
 * usuário reabre no modo certo mesmo sem a chave dedicada.
 */
export type TipoConta = "empresa" | "pessoal";
const KEY = "a4p_tipo_conta";
const listeners = new Set<() => void>();

function get(): TipoConta {
  if (typeof window === "undefined") return "empresa";
  try {
    const v = localStorage.getItem(KEY);
    if (v === "pessoal" || v === "empresa") return v;
    // Fallback: o que o onboarding gravou no perfil.
    const perfilTipo = loadCompany()?.db?.tipoConta;
    return perfilTipo === "pessoal" ? "pessoal" : "empresa";
  } catch {
    return "empresa";
  }
}
export function getTipoConta(): TipoConta {
  return get();
}
export function setTipoConta(t: TipoConta): void {
  try { localStorage.setItem(KEY, t); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}

/** [tipo, pessoal, set] — re-renderiza quem usa quando o tipo muda. */
export function useTipoConta(): { tipo: TipoConta; pessoal: boolean; set: (t: TipoConta) => void } {
  const [tipo, setT] = React.useState<TipoConta>("empresa");
  React.useEffect(() => {
    setT(get());
    const l = () => setT(get());
    listeners.add(l);
    const onStorage = (e: StorageEvent) => { if (e.key === KEY) setT(get()); };
    window.addEventListener("storage", onStorage);
    return () => { listeners.delete(l); window.removeEventListener("storage", onStorage); };
  }, []);
  return { tipo, pessoal: tipo === "pessoal", set: setTipoConta };
}
