/**
 * Orçamento (valores MENSAIS por linha do resultado) — a fonte única do orçado
 * do sistema (consumido pelo motor `@/core/budget` em `/orcamento`). Sem
 * override, o motor usa o baseline automático (run-rate).
 *
 * Persistência:
 * - **demo**: store local por navegador (`a4p_orcamento`).
 * - **live**: tabela `budgets` (Postgres, RLS por org). Como o override é um
 *   valor mensal recorrente (aplica a todo mês), grava-se uma linha por
 *   `LinhaOrcId` num **período sentinela** (`SENTINEL`) com
 *   `dimensions = { kind: 'orcamento_linha', linha }`. Sem orçamento por mês
 *   específico ainda — evolução futura usa o mesmo schema com `period` real.
 */
import type { OrcamentoOverride, LinhaOrcId } from "@/core/budget";
import { isDemo } from "@/lib/demo";
import { createClient } from "@/lib/supabase/client";
import { TETO_LINHAS } from "@/lib/supabase/consulta";

const KEY = "a4p_orcamento";
/** Período sentinela = orçamento mensal recorrente (aplica a todo mês). */
const SENTINEL = "2000-01-01";
const KIND = "orcamento_linha";

function loadLocal(): OrcamentoOverride {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as OrcamentoOverride) : {};
  } catch { return {}; }
}

function saveLocal(o: OrcamentoOverride): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(KEY, JSON.stringify(o)); } catch { /* ignore */ }
}

export async function loadOrcamento(): Promise<OrcamentoOverride> {
  if (isDemo) return loadLocal();
  try {
    const { data, error } = await createClient()
      .from("budgets")
      .select("amount,dimensions")
      .eq("period", SENTINEL)
      .eq("dimensions->>kind", KIND).limit(TETO_LINHAS);
    if (error) return loadLocal();
    const o: OrcamentoOverride = {};
    for (const r of (data ?? []) as Array<{ amount: number; dimensions: Record<string, unknown> }>) {
      const linha = r.dimensions?.linha as LinhaOrcId | undefined;
      if (linha) o[linha] = Number(r.amount);
    }
    return o;
  } catch { return loadLocal(); }
}

export async function saveOrcamento(o: OrcamentoOverride): Promise<void> {
  if (isDemo) { saveLocal(o); return; }
  const sb = createClient();
  // Regrava o orçamento recorrente: apaga as linhas do sentinela e insere as atuais.
  await sb.from("budgets").delete().eq("period", SENTINEL).eq("dimensions->>kind", KIND);
  const rows = (Object.entries(o) as [LinhaOrcId, number][])
    .filter(([, v]) => v != null && v > 0)
    .map(([linha, amount]) => ({ period: SENTINEL, amount, dimensions: { kind: KIND, linha } }));
  if (rows.length) await sb.from("budgets").insert(rows);
}
