/**
 * Conclusão da venda do Simulador POS (Central POS) → cria recebível(is) que
 * entram na Central de Recebimentos. Type "entrada" · status "pendente" — a
 * MESMA fonte de `/recebimentos` (`getOpenMovements("entrada")`). Parcelado
 * gera N títulos mensais. Demo: anexa ao dataset (`appendImported`); live:
 * insere em `movements`. Categoria "venda" também alimenta o faturamento/DRE.
 */
import { isDemo } from "@/lib/demo";
import { createClient } from "@/lib/supabase/client";
import { appendImported } from "@/lib/imported";
import { isoDay } from "@/lib/aggregations";
import type { Movement } from "@/lib/types";

export interface VendaPosInput {
  /** Valor líquido a receber = total da venda − taxa MDR. */
  valorReceber: number;
  descricao: string;
  parcelas: number; // 1 = à vista
  /** Taxa MDR em R$ (total − líquido). Vira um custo de adquirência no DRE. */
  taxaValor?: number;
}

/** Soma `m` meses a uma data ISO (yyyy-mm-dd). */
function addMonthsISO(iso: string, m: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setMonth(d.getMonth() + m);
  return d.toISOString().slice(0, 10);
}

export async function concluirVendaPos(input: VendaPosInput): Promise<void> {
  const hoje = isoDay(new Date());
  const n = Math.max(1, input.parcelas);
  const parcela = Math.round((input.valorReceber / n) * 100) / 100;
  const valorDe = (i: number) =>
    i === n - 1 ? Math.round((input.valorReceber - parcela * (n - 1)) * 100) / 100 : parcela;
  const descDe = (i: number) => (n > 1 ? `${input.descricao} · ${i + 1}/${n}` : input.descricao);
  const groupId = globalThis.crypto?.randomUUID?.() ?? `pos-${Date.now()}`;
  // Custo de adquirência (taxa MDR) → vira despesa "Tarifas de adquirência" para
  // o DRE mostrar a margem (relatório de melhorias, item 6).
  const taxa = Math.round((input.taxaValor ?? 0) * 100) / 100;

  if (isDemo) {
    for (let i = 0; i < n; i++) {
      const movement: Movement = {
        id: `pos-${Date.now()}-${i}`,
        account_id: "", // appendImported resolve para a conta real do dataset
        type: "entrada",
        status: "pendente",
        category: "venda",
        amount: valorDe(i),
        due_date: addMonthsISO(hoje, i),
        paid_date: null,
        reconciled: false,
        description: descDe(i),
      } as Movement;
      appendImported({ movement });
    }
    if (taxa > 0) {
      appendImported({
        movement: {
          id: `pos-taxa-${Date.now()}`,
          account_id: "",
          type: "saida",
          status: "pago",
          category: "Tarifas de adquirência",
          amount: taxa,
          due_date: hoje,
          paid_date: hoje,
          reconciled: true,
          description: `${input.descricao} · taxa MDR`,
        } as Movement,
      });
    }
    return;
  }

  // ---- Live (Supabase) ----
  const supabase = createClient();
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
  if (!accId) throw new Error("Sem conta para registrar a venda");

  const rows: Record<string, unknown>[] = Array.from({ length: n }, (_, i) => ({
    account_id: accId,
    type: "entrada",
    status: "pendente",
    category: "venda",
    amount: valorDe(i),
    due_date: addMonthsISO(hoje, i),
    paid_date: null,
    reconciled: false,
    description: descDe(i),
    group_id: groupId,
  }));
  if (taxa > 0) {
    rows.push({
      account_id: accId,
      type: "saida",
      status: "pago",
      category: "Tarifas de adquirência",
      amount: taxa,
      due_date: hoje,
      paid_date: hoje,
      reconciled: true,
      description: `${input.descricao} · taxa MDR`,
      group_id: groupId,
    });
  }
  const { error } = await supabase.from("movements").insert(rows);
  if (error) throw error;
}
