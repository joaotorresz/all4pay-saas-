/**
 * Auto company setup — aplica a importação (FDIP) ao SISTEMA INTEIRO.
 * Converte os lançamentos lidos em movimentos e:
 *  • demo: grava no store importado (passa a alimentar dashboard/DRE/risco…);
 *  • live: cria clientes/fornecedores, categorias, centros de custo E os
 *    movimentos no Supabase (org_id pelo DEFAULT/RLS).
 * Em ambos os casos a informação passa a se correlacionar em todas as páginas.
 */
import { isDemo } from "@/lib/demo";
import { createClient } from "@/lib/supabase/client";
import { isoDay } from "@/lib/aggregations";
import { setImported, clearImported } from "@/lib/imported";
import type { Movement, FinancialAccount, Party } from "@/lib/types";
import type { FDIPReport } from "@/core/fdip/types";

export { clearImported } from "@/lib/imported";

export interface ResultadoOnboarding {
  clientes: number;
  fornecedores: number;
  categorias: number;
  centrosCusto: number;
  movimentos: number;
  simulado: boolean;
}

const RECEITA = /venda|servic|juros|receita/i;
const ACC_ID = "acc-import";

/** Converte o relatório FDIP em um dataset (movimentos + contas + entidades). */
export function montarDataset(report: FDIPReport): { movements: Movement[]; accounts: FinancialAccount[]; parties: Party[] } {
  const hoje = isoDay(new Date());
  const cls = new Map(report.classificacoes.map((c) => [c.recordId, c]));

  const movements: Movement[] = report.records
    .filter((r) => cls.get(r.id)?.destino !== "Transferência")
    .map((r) => {
      const pago = r.data <= hoje;
      return {
        id: r.id,
        account_id: ACC_ID,
        type: r.tipo === "entrada" ? "entrada" : "saida",
        status: pago ? "pago" : "pendente",
        category: cls.get(r.id)?.categoria ?? r.descricao,
        amount: r.valor,
        party_id: r.contraparteNorm,
        due_date: r.data,
        paid_date: pago ? r.data : null,
        reconciled: pago,
        description: r.contraparte,
      } as Movement;
    });

  const saldo = movements
    .filter((m) => m.status === "pago")
    .reduce((s, m) => s + (m.type === "entrada" ? m.amount : -m.amount), 0);
  const accounts: FinancialAccount[] = [
    { id: ACC_ID, name: "Conta consolidada (importada)", bank: "inter", balance: Math.round(saldo * 100) / 100 },
  ];

  const parties: Party[] = report.entidades.map((e) => ({
    id: e.id,
    type: "pj",
    name: e.nome,
    is_customer: e.tipo === "cliente",
    is_supplier: e.tipo === "fornecedor",
  }));

  return { movements, accounts, parties };
}

export async function aplicarOnboarding(report: FDIPReport): Promise<ResultadoOnboarding> {
  const dataset = montarDataset(report);
  const clientes = dataset.parties.filter((p) => p.is_customer).length;
  const fornecedores = dataset.parties.filter((p) => p.is_supplier).length;
  const categorias = report.plano.categorias;
  const centros = report.plano.centrosCusto;

  if (isDemo) {
    setImported({ ...dataset, criadoEm: new Date().toISOString() });
    await new Promise((r) => setTimeout(r, 500));
    return { clientes, fornecedores, categorias: categorias.length, centrosCusto: centros.length, movimentos: dataset.movements.length, simulado: true };
  }

  const supabase = createClient();
  const out: ResultadoOnboarding = { clientes: 0, fornecedores: 0, categorias: 0, centrosCusto: 0, movimentos: 0, simulado: false };

  // 1) Clientes/fornecedores
  const parties = dataset.parties.map((p) => ({ type: "pj", name: p.name, is_customer: p.is_customer, is_supplier: p.is_supplier }));
  if (parties.length) {
    const { error } = await supabase.from("parties").insert(parties);
    if (!error) {
      out.clientes = clientes;
      out.fornecedores = fornecedores;
    }
  }

  // 2) Categorias + centros de custo
  if (categorias.length) {
    const { error } = await supabase.from("categories").insert(categorias.map((name) => ({ kind: RECEITA.test(name) ? "receita" : "despesa", name })));
    if (!error) out.categorias = categorias.length;
  }
  if (centros.length) {
    const { error } = await supabase.from("cost_centers").insert(centros.map((name) => ({ name })));
    if (!error) out.centrosCusto = centros.length;
  }

  // 3) Movimentos (precisa de uma conta) — é o que correlaciona com dashboard/DRE
  let accId: string | undefined;
  const { data: accs } = await supabase.from("financial_accounts").select("id").limit(1);
  accId = (accs as { id: string }[] | null)?.[0]?.id;
  if (!accId) {
    const { data: created } = await supabase
      .from("financial_accounts")
      .insert({ name: "Conta consolidada", bank: "inter", balance: 0 })
      .select("id")
      .single();
    accId = (created as { id: string } | null)?.id;
  }
  if (accId) {
    const rows = dataset.movements.map((m) => ({
      account_id: accId,
      type: m.type,
      status: m.status,
      category: m.category,
      amount: m.amount,
      due_date: m.due_date,
      paid_date: m.paid_date,
      reconciled: false,
      description: m.description,
    }));
    // insere em lotes para extratos grandes
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase.from("movements").insert(rows.slice(i, i + 500));
      if (!error) out.movimentos += Math.min(500, rows.length - i);
    }
  }

  return out;
}
