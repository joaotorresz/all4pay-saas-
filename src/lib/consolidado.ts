/**
 * Consolidação multi-empresa (multi-entity) — agrega a posição das organizações
 * em que o usuário é membro. **live**: RPC `org_consolidado` (0013, SECURITY
 * DEFINER escopado às orgs do usuário); **demo**: entidades sintéticas
 * determinísticas. Sem eliminações intercompany (v1).
 */
import { isDemo } from "@/lib/demo";
import { createClient } from "@/lib/supabase/client";

export interface EntidadeConsolidada {
  orgId: string;
  nome: string;
  saldo: number;
  receita: number;
  despesa: number;
  contas: number;
  resultado: number; // receita − despesa
}
export interface Consolidado {
  entidades: EntidadeConsolidada[];
  saldo: number; receita: number; despesa: number; resultado: number;
}

const DEMO: EntidadeConsolidada[] = [
  { orgId: "demo-1", nome: "all4pay Matriz", saldo: 184320, receita: 96500, despesa: 71200, contas: 3, resultado: 25300 },
  { orgId: "demo-2", nome: "all4pay Filial SP", saldo: 73850, receita: 52100, despesa: 44780, contas: 2, resultado: 7320 },
  { orgId: "demo-3", nome: "Holding (investimentos)", saldo: 421000, receita: 18400, despesa: 9650, contas: 2, resultado: 8750 },
];

function consolidar(ents: EntidadeConsolidada[]): Consolidado {
  const r = (k: keyof EntidadeConsolidada) => ents.reduce((s, e) => s + (e[k] as number), 0);
  return { entidades: ents, saldo: r("saldo"), receita: r("receita"), despesa: r("despesa"), resultado: r("resultado") };
}

export async function getConsolidado(de: string, ate: string): Promise<Consolidado> {
  if (isDemo) return consolidar(DEMO);
  try {
    const { data, error } = await createClient().rpc("org_consolidado", { p_de: de, p_ate: ate });
    if (error) throw error;
    const ents: EntidadeConsolidada[] = ((data ?? []) as Array<Record<string, unknown>>).map((r) => {
      const receita = Number(r.receita ?? 0), despesa = Number(r.despesa ?? 0);
      return { orgId: String(r.org_id), nome: String(r.nome ?? "Organização"), saldo: Number(r.saldo ?? 0), receita, despesa, contas: Number(r.contas ?? 0), resultado: receita - despesa };
    });
    return consolidar(ents);
  } catch { return consolidar([]); }
}
