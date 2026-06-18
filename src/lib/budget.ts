/**
 * Orçamento manual (valores MENSAIS por linha) — store local por navegador.
 * Sem override, o motor (`@/core/budget`) usa o baseline automático (run-rate).
 * Persistência em Postgres (tabela `budgets`) é evolução futura, no mesmo padrão
 * de `pos-taxas.ts`/`company.ts`.
 */
import type { OrcamentoOverride } from "@/core/budget";

const KEY = "a4p_orcamento";

export function loadOrcamento(): OrcamentoOverride {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as OrcamentoOverride) : {};
  } catch { return {}; }
}

export function saveOrcamento(o: OrcamentoOverride): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(KEY, JSON.stringify(o)); } catch { /* ignore */ }
}
