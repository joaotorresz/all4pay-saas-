/**
 * Central de Recebimentos — camada de EXECUÇÃO do funil RECEBER (espelho da
 * Central de Pagamentos). Pega `movements` de entrada já lançados (a receber) e
 * dá baixa (recebido), CREDITANDO o saldo da conta escolhida. Idempotente: dar
 * baixa no mesmo título não credita duas vezes (só age sobre pendentes).
 * Reaproveita os comprovantes da Central de Pagamentos (por movement_id).
 */
import { isDemo } from "@/lib/demo";
import { createClient } from "@/lib/supabase/client";
import { isoDay } from "@/lib/aggregations";
import { receberImported } from "@/lib/imported";
import type { Movement } from "@/lib/types";
import { TETO_LINHAS } from "@/lib/supabase/consulta";

export type MetodoRecebimento = "pix" | "ted" | "boleto" | "of";

export interface ItemRecebimento {
  id: string; // movement_id
  amount: number;
  pagador: string;
  due_date: string;
  category?: string | null;
}

export interface ResultadoReceb {
  recebidos: number;
  total: number;
  detalhe: string;
}

/** Dá baixa num lote de recebíveis: marca pago + CREDITA a conta de destino.
 *  Idempotente (só pendentes viram pago) — re-executar não credita de novo. */
export async function receberLote(
  itens: ItemRecebimento[],
  accountId: string,
): Promise<ResultadoReceb> {
  const hoje = isoDay(new Date());
  const ids = itens.map((i) => i.id);
  if (!ids.length || !accountId) return { recebidos: 0, total: 0, detalhe: "Nada a receber." };

  if (isDemo) {
    await new Promise((r) => setTimeout(r, 400));
    const out = receberImported(ids, accountId, hoje);
    return { recebidos: out.recebidos, total: out.total, detalhe: `${out.recebidos} recebimento(s) baixado(s).` };
  }

  const supabase = createClient();
  // só os ainda pendentes (idempotência) — busca quais sobraram pendentes
  const { data: pend } = await supabase.from("movements").select("id,amount").in("id", ids).eq("status", "pendente").eq("type", "entrada").limit(TETO_LINHAS);
  const alvo = (pend ?? []) as { id: string; amount: number }[];
  if (!alvo.length) return { recebidos: 0, total: 0, detalhe: "Nada a receber (já recebidos)." };
  const total = alvo.reduce((s, m) => s + Number(m.amount), 0);
  const { error } = await supabase.from("movements")
    .update({ status: "pago", paid_date: hoje, reconciled: true })
    .in("id", alvo.map((m) => m.id));
  if (error) return { recebidos: 0, total: 0, detalhe: "Falha ao dar baixa." };
  // credita o saldo da conta de destino
  const { data } = await supabase.from("financial_accounts").select("balance").eq("id", accountId).single();
  const saldo = data ? Number((data as { balance: number }).balance) : null;
  if (saldo != null) await supabase.from("financial_accounts").update({ balance: Math.round((saldo + total) * 100) / 100 }).eq("id", accountId);
  return { recebidos: alvo.length, total, detalhe: `${alvo.length} recebimento(s) baixado(s).` };
}

/** Converte um Movement de entrada em item da Central. */
export function itemReceb(m: Movement, nome: string): ItemRecebimento {
  return { id: m.id, amount: m.amount, pagador: nome, due_date: m.due_date, category: m.category };
}

export { anexarComprovante, comprovanteDe } from "@/lib/pagamentos";
