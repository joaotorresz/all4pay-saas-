/**
 * Auto company setup — aplica o plano de onboarding (FDIP). Em demo,
 * simula (sem escrita). Em live, cria clientes/fornecedores (parties),
 * categorias e centros de custo via Supabase (org_id pelo DEFAULT/RLS).
 */
import { isDemo } from "@/lib/demo";
import { createClient } from "@/lib/supabase/client";
import type { OnboardingPlan } from "@/core/fdip/types";

export interface ResultadoOnboarding {
  clientes: number;
  fornecedores: number;
  categorias: number;
  centrosCusto: number;
  simulado: boolean;
}

const RECEITA = /venda|servic|juros|receita/i;

export async function aplicarOnboarding(plan: OnboardingPlan): Promise<ResultadoOnboarding> {
  if (isDemo) {
    await new Promise((r) => setTimeout(r, 700));
    return {
      clientes: plan.clientes.length,
      fornecedores: plan.fornecedores.length,
      categorias: plan.categorias.length,
      centrosCusto: plan.centrosCusto.length,
      simulado: true,
    };
  }

  const supabase = createClient();
  const out: ResultadoOnboarding = { clientes: 0, fornecedores: 0, categorias: 0, centrosCusto: 0, simulado: false };

  const parties = [
    ...plan.clientes.map((c) => ({ type: "pj", name: c.nome, is_customer: true, is_supplier: false })),
    ...plan.fornecedores.map((f) => ({ type: "pj", name: f.nome, is_customer: false, is_supplier: true })),
  ];
  if (parties.length) {
    const { error } = await supabase.from("parties").insert(parties);
    if (!error) {
      out.clientes = plan.clientes.length;
      out.fornecedores = plan.fornecedores.length;
    }
  }

  if (plan.categorias.length) {
    const cats = plan.categorias.map((name) => ({ kind: RECEITA.test(name) ? "receita" : "despesa", name }));
    const { error } = await supabase.from("categories").insert(cats);
    if (!error) out.categorias = plan.categorias.length;
  }

  if (plan.centrosCusto.length) {
    const ccs = plan.centrosCusto.map((name) => ({ name }));
    const { error } = await supabase.from("cost_centers").insert(ccs);
    if (!error) out.centrosCusto = plan.centrosCusto.length;
  }

  return out;
}
