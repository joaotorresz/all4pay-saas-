/**
 * Consolidação multi-empresa (multi-entity) — agrega a posição das organizações
 * em que o usuário é membro. **live**: RPC `org_consolidado` (0013, SECURITY
 * DEFINER escopado às orgs do usuário); **demo**: entidades sintéticas
 * determinísticas. Sem eliminações intercompany (v1).
 */
import { isDemo } from "@/lib/demo";
import { createClient } from "@/lib/supabase/client";
import type { RiskInput, RiskMovement } from "@/core/risk-engine/types";

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

/* ------------------ lançamentos por organização (0020) ------------------ */

/**
 * `RiskInput` POR ORGANIZAÇÃO — o que a DRE/DFC Multiempresas precisa.
 *
 * O `org_consolidado` devolve totais; para classificar linha a linha na cascata
 * é preciso dos lançamentos, e é isso que a RPC `org_movements` (0020) entrega,
 * escopada às organizações em que o usuário é membro.
 *
 * Devolve `null` quando a RPC não existe (migration não aplicada) — a tela cai
 * no comportamento anterior e diz isso, em vez de somar zeros calada.
 */
export async function getRiscoInputPorOrg(
  de: string,
  ate: string,
): Promise<{ orgId: string; nome: string; input: RiskInput }[] | null> {
  if (isDemo) return demoInputsPorOrg(de, ate);
  try {
    const supabase = createClient();
    const [movRes, salRes] = await Promise.all([
      supabase.rpc("org_movements", { p_de: de, p_ate: ate }),
      supabase.rpc("org_balances"),
    ]);
    if (movRes.error || salRes.error) return null;

    const hoje = new Date().toISOString().slice(0, 10);
    const saldos = new Map<string, { nome: string; saldo: number }>();
    for (const r of (salRes.data ?? []) as Array<Record<string, unknown>>) {
      saldos.set(String(r.org_id), { nome: String(r.org_nome ?? "Organização"), saldo: Number(r.saldo ?? 0) });
    }

    const porOrg = new Map<string, { nome: string; movs: RiskMovement[]; nomes: Record<string, string> }>();
    for (const r of (movRes.data ?? []) as Array<Record<string, unknown>>) {
      const org = String(r.org_id);
      const nome = String(r.org_nome ?? saldos.get(org)?.nome ?? "Organização");
      if (!porOrg.has(org)) porOrg.set(org, { nome, movs: [], nomes: {} });
      const bucket = porOrg.get(org)!;
      const partyId = r.party_id ? String(r.party_id) : null;
      if (partyId && r.party_nome) bucket.nomes[partyId] = String(r.party_nome);
      bucket.movs.push({
        id: String(r.id),
        type: String(r.type) as RiskMovement["type"],
        status: String(r.status) as RiskMovement["status"],
        amount: Number(r.amount ?? 0),
        due_date: String(r.due_date ?? ""),
        paid_date: r.paid_date ? String(r.paid_date) : null,
        party_id: partyId,
        accountId: r.account_id ? String(r.account_id) : null,
        category: r.categoria ? String(r.categoria) : null,
        costCenter: r.centro ? String(r.centro) : null,
        projeto: r.projeto ? String(r.projeto) : null,
      });
    }

    // Organizações sem lançamento no período ainda aparecem — com saldo e sem
    // movimento, que é a verdade, não uma omissão.
    saldos.forEach((s, org) => {
      if (!porOrg.has(org)) porOrg.set(org, { nome: s.nome, movs: [], nomes: {} });
    });

    return Array.from(porOrg, ([orgId, b]) => ({
      orgId,
      nome: b.nome,
      input: {
        hoje,
        saldoAtual: saldos.get(orgId)?.saldo ?? 0,
        movements: b.movs,
        partyNames: b.nomes,
        horizonDias: 60,
      } as RiskInput,
    }));
  } catch {
    return null;
  }
}

/**
 * Demo: um dataset determinístico por entidade sintética.
 *
 * Em demonstração TUDO é seed, inclusive aqui — mas os números não são
 * arbitrários: saem da receita/despesa que a própria entidade já declara em
 * `DEMO`, distribuídas pelos meses do período. Assim o consolidado da tela bate
 * com o consolidado de `/consolidado`.
 */
function demoInputsPorOrg(de: string, ate: string): { orgId: string; nome: string; input: RiskInput }[] {
  const meses: string[] = [];
  let m = de.slice(0, 7);
  for (let k = 0; k < 60 && m <= ate.slice(0, 7); k++) {
    meses.push(m);
    const [a, mm] = m.split("-").map(Number);
    const d = new Date(a, mm, 1);
    m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  const hoje = new Date().toISOString().slice(0, 10);
  const CATS_R = ["Vendas", "Serviços prestados"];
  const CATS_D = ["Fornecedores", "Folha de Pagamento", "Marketing", "Simples Nacional"];

  return DEMO.map((e) => {
    const movs: RiskMovement[] = [];
    const n = Math.max(1, meses.length);
    meses.forEach((mes, k) => {
      CATS_R.forEach((c, i) => {
        movs.push({
          id: `${e.orgId}-r${k}${i}`, type: "entrada", status: "pago",
          amount: Math.round((e.receita / n / CATS_R.length) * 100) / 100,
          due_date: `${mes}-10`, paid_date: `${mes}-10`,
          party_id: null, accountId: null, category: c, costCenter: null, projeto: null,
        });
      });
      CATS_D.forEach((c, i) => {
        movs.push({
          id: `${e.orgId}-d${k}${i}`, type: "saida", status: "pago",
          amount: Math.round((e.despesa / n / CATS_D.length) * 100) / 100,
          due_date: `${mes}-15`, paid_date: `${mes}-15`,
          party_id: null, accountId: null, category: c, costCenter: null, projeto: null,
        });
      });
    });
    return {
      orgId: e.orgId,
      nome: e.nome,
      input: { hoje, saldoAtual: e.saldo, movements: movs, partyNames: {}, horizonDias: 60 } as RiskInput,
    };
  });
}
