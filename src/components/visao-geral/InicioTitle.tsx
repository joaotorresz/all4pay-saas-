"use client";

/**
 * Título da Home — saudação personalizada "Bem-vindo, {nome}!". O nome vem do
 * perfil da empresa (representante do onboarding; fallback fantasia/razão).
 * Demo: perfil local; live: company_profiles. Sem nome → "Bem-vindo!".
 */
import * as React from "react";
import { fetchCompany } from "@/lib/company";

const primeiroNome = (s?: string) => (s ?? "").trim().split(/\s+/)[0] || "";

export function InicioTitle() {
  const [nome, setNome] = React.useState("");
  React.useEffect(() => {
    fetchCompany()
      .then((c) => {
        const db = (c?.db ?? {}) as Record<string, string>;
        setNome(primeiroNome(db.repNome) || String(db.fantasia || db.razaoSocial || ""));
      })
      .catch(() => {});
  }, []);
  return <>{nome ? `Bem-vindo, ${nome}!` : "Bem-vindo!"}</>;
}
