/**
 * Puzzlebot — auto-categorização por IA da importação (FDIP). Pega os
 * lançamentos de BAIXA confiança da leitura por regras, manda para o Claude
 * (`/api/ai/categorizar`) escolher a melhor categoria do vocabulário, e
 * MEMORIZA a escolha (self-learning) via `aprender(contraparteNorm, categoria)`.
 * Depois é só re-analisar: a regra já acerta (confiança ~0.99) na sequência —
 * é como a acurácia sobe a ~90%+ a cada upload. Gated por ANTHROPIC_API_KEY.
 */
import { aprender, type FDIPReport } from "@/core/fdip";

/** Vocabulário de categorias oferecido ao modelo (rótulos do FDIP). */
export const CATEGORIAS_DESPESA = [
  "Marketing", "Assinaturas / software", "Combustível", "Folha de pagamento",
  "Aluguel", "Utilidades", "Impostos", "Tarifas bancárias", "Fornecedores / insumos", "Outras despesas",
];
export const CATEGORIAS_RECEITA = ["Vendas", "Serviços", "Outras receitas"];

const LIMIAR = 0.9; // abaixo disso, a IA reforça

export async function iaCategorizadorAtivo(): Promise<boolean> {
  try { return !!(await fetch("/api/ai/categorizar").then((r) => r.json()))?.configured; } catch { return false; }
}

export interface ResultadoPuzzlebot { revisados: number; aplicados: number }

/**
 * Reforça as categorias de baixa confiança com IA e memoriza. NÃO re-analisa
 * aqui (o chamador re-roda `analisarImportacao` para refletir o aprendizado).
 */
export async function autoCategorizar(report: FDIPReport): Promise<ResultadoPuzzlebot> {
  const conf = new Map(report.classificacoes.map((c) => [c.recordId, c]));
  // baixa confiança e não-transferência
  const alvos = report.records.filter((r) => {
    const c = conf.get(r.id);
    return c && c.categoria !== "Transferência" && c.confianca < LIMIAR;
  });
  if (alvos.length === 0) return { revisados: 0, aplicados: 0 };

  const transactions = alvos.map((r) => ({ id: r.id, descricao: r.descricao || r.contraparte, valor: r.valor, tipo: r.tipo }));
  const j = await fetch("/api/ai/categorizar", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ transactions, categoriasDespesa: CATEGORIAS_DESPESA, categoriasReceita: CATEGORIAS_RECEITA }),
  }).then((r) => r.json()).catch(() => ({ ok: false }));

  if (!j?.ok || !Array.isArray(j.categorias)) return { revisados: alvos.length, aplicados: 0 };

  const validas = new Set([...CATEGORIAS_DESPESA, ...CATEGORIAS_RECEITA]);
  const porId = new Map(alvos.map((r) => [r.id, r]));
  let aplicados = 0;
  for (const c of j.categorias as Array<{ id: string; categoria: string; confianca?: number }>) {
    const rec = porId.get(c.id);
    if (!rec || !validas.has(c.categoria)) continue;
    aprender(rec.contraparteNorm, c.categoria); // self-learning → próxima leitura já acerta
    aplicados++;
  }
  return { revisados: alvos.length, aplicados };
}
