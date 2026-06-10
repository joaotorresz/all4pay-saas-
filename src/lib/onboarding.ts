/**
 * Persistência do "Criar empresa" — grava as escolhas estruturais do wizard
 * (contas bancárias, centros de custo, unidades) no Supabase em live, sem
 * duplicar o que o seed_org já criou na organização (dedup por nome).
 * Em demo é no-op (o ambiente já vem do seed/importação).
 */
import { createClient } from "@/lib/supabase/client";
import { isDemo } from "@/lib/demo";
import type { Estrutura } from "@/core/onboarding";

export interface ResultadoEstrutura {
  contas: number;
  centros: number;
  unidades: number;
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(new RegExp("[\\u0300-\\u036f]", "g"), "").trim();
/** Slug do banco para casar com as cores conhecidas (itau/bradesco/…). */
const bankSlug = (banco: string) => {
  const n = norm(banco);
  if (n.includes("itau")) return "itau";
  if (n.includes("bradesco")) return "bradesco";
  if (n.includes("santander")) return "santander";
  if (n.includes("nubank")) return "nubank";
  if (n.includes("inter")) return "inter";
  if (n.includes("brasil")) return "bb";
  if (n.includes("caixa")) return "caixa";
  return n.replace(/[^a-z0-9]/g, "").slice(0, 12) || "outro";
};

/**
 * Aplica a estrutura financeira declarada no onboarding. Lê os nomes já
 * existentes e insere só os novos (o seed_org cria centros/unidades/conta
 * padrão; aqui adicionamos os bancos/centros próprios do usuário).
 */
export async function aplicarEstrutura(estrutura: Estrutura): Promise<ResultadoEstrutura> {
  const out: ResultadoEstrutura = { contas: 0, centros: 0, unidades: 0 };
  if (isDemo) return out;
  const s = createClient();

  // Centros de custo
  const centros = estrutura.centrosCusto.map((x) => x.trim()).filter(Boolean);
  if (centros.length) {
    const { data } = await s.from("cost_centers").select("name");
    const have = new Set((data ?? []).map((r) => norm((r as { name: string }).name)));
    const novos = centros.filter((n) => !have.has(norm(n)));
    if (novos.length) {
      const { error } = await s.from("cost_centers").insert(novos.map((name) => ({ name })));
      if (!error) out.centros = novos.length;
    }
  }

  // Unidades
  const unidades = estrutura.unidades.map((x) => x.trim()).filter(Boolean);
  if (unidades.length) {
    const { data } = await s.from("units").select("name");
    const have = new Set((data ?? []).map((r) => norm((r as { name: string }).name)));
    const novos = unidades.filter((n) => !have.has(norm(n)));
    if (novos.length) {
      const { error } = await s.from("units").insert(novos.map((name) => ({ name, abbrev: norm(name).slice(0, 4) })));
      if (!error) out.unidades = novos.length;
    }
  }

  // Contas bancárias (banco · tipo) — as do usuário, além da conta inicial do seed
  const contas = estrutura.contas.filter((c) => c.banco?.trim() && c.banco !== "—");
  if (contas.length) {
    const { data } = await s.from("financial_accounts").select("name");
    const have = new Set((data ?? []).map((r) => norm((r as { name: string }).name)));
    const rows = contas
      .map((c) => ({ name: `${c.banco} · ${c.tipo}`.trim(), bank: bankSlug(c.banco), balance: 0 }))
      .filter((r) => !have.has(norm(r.name)));
    if (rows.length) {
      const { error } = await s.from("financial_accounts").insert(rows);
      if (!error) out.contas = rows.length;
    }
  }

  return out;
}
