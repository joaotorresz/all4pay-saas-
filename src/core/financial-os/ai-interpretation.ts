/**
 * AI Interpretation Layer — sugere regras a partir de padrões observados
 * (produto adaptativo). Determinístico por ora; estruturado para ser
 * substituído por um LLM mantendo o contrato RuleSuggestion.
 */
import type { FinancialTransaction, RuleSuggestion, FinancialRule } from "./types";

export function sugerirRegras(transacoes: FinancialTransaction[]): RuleSuggestion[] {
  const out: RuleSuggestion[] = [];

  // Política de aprovação para pagamentos altos
  const saidas = transacoes.filter((t) => t.tipo === "saida").map((t) => t.valor);
  if (saidas.length) {
    const max = Math.max(...saidas);
    if (max >= 50000) {
      const limiar = Math.round((max * 0.8) / 1000) * 1000;
      out.push({
        titulo: "Aprovação para pagamentos altos",
        descricao: `Detectamos pagamentos próximos de ${formatK(max)}. Exigir aprovação dupla acima de ${formatK(limiar)}?`,
        rule: {
          nome: `Aprovação dupla > ${formatK(limiar)}`,
          trigger: "pagamento_criado",
          conditions: [{ campo: "valor", operador: ">", valor: limiar }],
          actions: [{ tipo: "pedir_aprovacao_dupla" }, { tipo: "notificar_time", destino: "Financeiro" }],
          prioridade: "alta",
        },
      });
    }
  }

  // Anomalia de fornecedor (variação de valor)
  out.push({
    titulo: "Anomalia de fornecedor",
    descricao: "Marcar anomalia quando um fornecedor aumentar o valor acima de 20% vs histórico.",
    rule: {
      nome: "Fornecedor +20% → anomalia",
      trigger: "custo_variou",
      conditions: [{ campo: "variacaoPct", operador: ">", valor: 20 }],
      actions: [{ tipo: "marcar_risco" }, { tipo: "notificar_time", destino: "Compras" }],
      prioridade: "media",
    },
  });

  return out;
}

const formatK = (n: number) => `R$ ${Math.round(n / 1000)}k`;

/** Converte uma sugestão aceita em regra concreta. */
export function materializarRegra(s: RuleSuggestion, id: string): FinancialRule {
  return { id, ativo: true, ...s.rule };
}
