/**
 * Central de Pagamentos — camada de EXECUÇÃO do funil PAGAR.
 * Pega `movements` de saída já lançados e os liquida (Pix/Open Finance, demo),
 * com IDEMPOTÊNCIA (reusa a fila do `core/platform`, não reinventa) e ajuste de
 * saldo na liquidação. "Enviado" ≠ "pago": o saldo só cai em `liquidado`.
 */
import { isDemo } from "@/lib/demo";
import { createClient } from "@/lib/supabase/client";
import { isoDay } from "@/lib/aggregations";
import { liquidarImported } from "@/lib/imported";
import { FinancialPlatform } from "@/core/platform";
import type { Movement } from "@/lib/types";

export type MetodoPagamento = "pix" | "ted" | "boleto" | "of";

export interface ItemPagamento {
  id: string; // movement_id
  amount: number;
  beneficiario: string;
  due_date: string;
  category?: string | null;
}

export interface ResultadoLote {
  enviados: number;
  duplicados: number;
  liquidados: number;
  total: number;
  detalhe: string;
}

// Fila idempotente única (a mesma noção do console /infraestrutura).
const plataforma = new FinancialPlatform();

/**
 * Envia + liquida um lote. Passo 3 (enviar, idempotente) e passo 4 (liquidar,
 * mexe no saldo) da cadeia §5 da spec. A `idempotency_key` é o `movement_id`:
 * reenviar o mesmo título NÃO paga de novo.
 */
export async function pagarLote(
  itens: ItemPagamento[],
  accountId: string,
  metodo: MetodoPagamento,
): Promise<ResultadoLote> {
  let duplicados = 0;
  const novos: ItemPagamento[] = [];
  for (const it of itens) {
    const r = plataforma.processarPagamento({
      idempotencyKey: `mov:${it.id}`,
      metodo: metodo === "of" ? "pix" : metodo,
      valor: it.amount,
      contraparte: it.beneficiario,
    });
    if (r.duplicado) duplicados++;
    else novos.push(it);
  }

  // Passo 4 — liquidar: marca pago + debita o saldo da conta de saída.
  const hoje = isoDay(new Date());
  const ids = novos.map((n) => n.id);
  let liquidados = 0, total = 0;

  if (ids.length) {
    if (isDemo) {
      await new Promise((r) => setTimeout(r, 400));
      const out = liquidarImported(ids, accountId, hoje);
      liquidados = out.liquidados; total = out.total;
    } else {
      const supabase = createClient();
      // Idempotência no BD (espelha o demo): só liquida o que AINDA está pendente
      // e debita pelo que efetivamente virou pago. Sem o gate `.eq(status,pendente)`,
      // reenviar um título já pago (fila idempotente em memória zera entre
      // instâncias serverless) debitaria o saldo de novo — pagamento em dobro.
      const { data: flipped, error } = await supabase
        .from("movements")
        .update({ status: "pago", paid_date: hoje, reconciled: true })
        .in("id", ids)
        .eq("status", "pendente")
        .select("amount");
      if (!error && flipped) {
        liquidados = flipped.length;
        total = flipped.reduce((s, m) => s + Number((m as { amount: number }).amount), 0);
        // debita o saldo da conta de saída (só o que de fato liquidou agora)
        if (total > 0) {
          const { data } = await supabase.from("financial_accounts").select("balance").eq("id", accountId).single();
          const saldo = data ? Number((data as { balance: number }).balance) : null;
          if (saldo != null) await supabase.from("financial_accounts").update({ balance: Math.round((saldo - total) * 100) / 100 }).eq("id", accountId);
        }
      }
    }
  }

  return {
    enviados: novos.length,
    duplicados,
    liquidados,
    total,
    detalhe: duplicados
      ? `${liquidados} liquidado(s); ${duplicados} ignorado(s) por idempotência (já pagos).`
      : `${liquidados} pagamento(s) liquidado(s).`,
  };
}

/** Converte um Movement de saída em item da Central. */
export function itemDe(m: Movement, nome: string): ItemPagamento {
  return { id: m.id, amount: m.amount, beneficiario: nome, due_date: m.due_date, category: m.category };
}

// ---- Comprovantes anexados na liquidação (demo: localStorage por movement) ----
const KEY_COMP = "a4p_comprovantes";
function loadComp(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(KEY_COMP) || "{}"); } catch { return {}; }
}
export function anexarComprovante(movId: string, nome: string): void {
  if (typeof window === "undefined") return;
  const m = loadComp(); m[movId] = nome;
  try { localStorage.setItem(KEY_COMP, JSON.stringify(m)); } catch { /* ignore */ }
}
export function comprovanteDe(movId: string): string | null {
  return loadComp()[movId] ?? null;
}
