/**
 * Unified Financial Graph — o ativo mais avançado: conecta empresa →
 * contas → clientes/fornecedores → fluxos. Daí o sistema entende o
 * "comportamento financeiro da empresa" (base para crédito,
 * underwriting, previsão e antifraude).
 */
import type { RiskInput } from "@/core/risk-engine/types";
import type { FinancialGraph, GraphNode, GraphEdge } from "./types";

const EMPRESA = "empresa";

export function construirGrafo(input: RiskInput): FinancialGraph {
  const nodes: GraphNode[] = [{ id: EMPRESA, tipo: "empresa", label: "Empresa", valor: 0 }];
  const edges: GraphEdge[] = [];

  const nome = (id: string) =>
    input.partyNames?.[id] ?? (id === "—" ? "Sem contraparte" : id);

  const recebPorCliente = new Map<string, number>();
  const pagoPorFornecedor = new Map<string, number>();
  let fluxoTotal = 0;

  for (const m of input.movements) {
    if (m.status === "cancelado") continue;
    const id = m.party_id ?? "—";
    if (m.type === "entrada") {
      recebPorCliente.set(id, (recebPorCliente.get(id) ?? 0) + m.amount);
      fluxoTotal += m.amount;
    } else {
      pagoPorFornecedor.set(id, (pagoPorFornecedor.get(id) ?? 0) + m.amount);
      fluxoTotal += m.amount;
    }
  }

  const totalReceb = Array.from(recebPorCliente.values()).reduce((a, b) => a + b, 0);

  // Clientes (recebimentos) — top 8 por volume.
  const clientes = Array.from(recebPorCliente.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
  for (const [id, valor] of clientes) {
    const share = totalReceb > 0 ? valor / totalReceb : 0;
    nodes.push({ id: `cli_${id}`, tipo: "cliente", label: nome(id), valor, metrica: `${Math.round(share * 100)}% receita` });
    edges.push({ de: `cli_${id}`, para: EMPRESA, valor, tipo: "recebimento" });
  }

  // Fornecedores (pagamentos) — top 8.
  const fornecedores = Array.from(pagoPorFornecedor.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
  for (const [id, valor] of fornecedores) {
    nodes.push({ id: `for_${id}`, tipo: "fornecedor", label: nome(id), valor });
    edges.push({ de: EMPRESA, para: `for_${id}`, valor, tipo: "pagamento" });
  }

  const topCli = clientes[0];
  const concentracaoTop = topCli
    ? { nome: nome(topCli[0]), share: totalReceb > 0 ? topCli[1] / totalReceb : 0 }
    : null;

  return {
    nodes,
    edges,
    resumo: {
      contas: 1,
      clientes: recebPorCliente.size,
      fornecedores: pagoPorFornecedor.size,
      concentracaoTop,
      fluxoTotal,
    },
  };
}
