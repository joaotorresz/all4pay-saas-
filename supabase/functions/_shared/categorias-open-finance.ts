/**
 * As categorias do Open Finance, em português — UMA tabela, para quem grava e
 * para quem lê (Rodada 7).
 *
 * ⚠️ O Pluggy devolve a categoria da transação no vocabulário DELE, em inglês
 * ("Electricity", "Housing", "Credit card payment"). As duas Edge Functions
 * gravavam isso cru em `movements.category`, e o DRE, a lista de lançamentos e
 * o plano de contas passavam a mostrar "Gyms and fitness centers" a um dono de
 * PME brasileira — 31 lançamentos medidos em produção, em 2 organizações.
 *
 * ⚠️ TRADUZIR NÃO É CLASSIFICAR. O destino é o NOME em português; a linha do
 * DRE continua saindo do palpite ou da declaração da empresa, exatamente como
 * antes. Por isso os nomes ambíguos ganham uma tradução LITERAL, não uma
 * categoria da taxonomia que decida por eles:
 *   · "Credit card payment" pode ser transferência (a fatura é a soma de
 *     despesas que já entraram pelo cartão) ou a ÚNICA despesa registrada
 *     (cartão não conectado) — depende da empresa.
 *   · "Transfer - Bank Slip" pode ser boleto de fornecedor (despesa) ou
 *     movimento entre contas próprias.
 * Mandá-los para "Transferência entre contas" tiraria custo real do DRE em
 * silêncio. Eles ficam no palpite, com o aviso aceso, para a empresa declarar.
 *
 * ⚠️ O que esta tabela NÃO conhece fica como veio: inventar uma tradução para
 * um rótulo que nunca vimos é pior que mostrar o original.
 *
 * Este arquivo mora em `_shared` porque as Edge Functions (Deno) só enxergam
 * a pasta `supabase/functions`; o app o importa daqui. Sem import nenhum, de
 * propósito: os dois lados o compilam.
 */
export const CATEGORIAS_OPEN_FINANCE: Readonly<Record<string, string>> = {
  // Taxonomia do sistema (mesmo nome da `core/ingestao/taxonomia`) — sem ambiguidade
  "electricity": "Utilidades",
  "water": "Utilidades",
  "gas": "Utilidades",
  "telecommunications": "Utilidades",
  "internet": "Utilidades",
  "housing": "Aluguel",
  "rent": "Aluguel",
  "music streaming": "Assinaturas e software",
  "video streaming": "Assinaturas e software",
  "software": "Assinaturas e software",
  "gas stations": "Combustível",
  "taxes": "Impostos",
  "bank fees": "Tarifas bancárias",
  "interests charged": "Juros e encargos",
  "loans": "Empréstimos e financiamentos",
  "same person transfer": "Transferência entre contas",
  // Literais — o nome em português, sem decidir a linha do DRE
  "salary": "Salário",
  "income": "Outras receitas",
  "credit card payment": "Pagamento de fatura de cartão",
  "transfer - bank slip": "Pagamento de boleto",
  "transfer - pix": "Transferência via PIX",
  "transfer - ted": "Transferência via TED",
  "transfers": "Transferências",
  "gyms and fitness centers": "Academia",
  "groceries": "Supermercado",
  "supermarkets": "Supermercado",
  "restaurants": "Alimentação",
  "food delivery": "Alimentação",
  "pharmacy": "Farmácia",
  "health": "Saúde",
  "insurance": "Seguros",
  "education": "Educação",
  "transportation": "Transporte",
  "taxi and ride-hailing": "Transporte",
  "travel": "Viagens",
  "shopping": "Compras",
  "online shopping": "Compras",
  "entertainment": "Lazer",
  "donations": "Doações",
  "investments": "Aplicação financeira",
};

/** O nome em português, ou o original quando a tabela não o conhece. */
export function categoriaDoOpenFinance(original: string | null | undefined): string | null {
  if (original == null) return null;
  const k = original.replace(/\s+/g, " ").trim().toLowerCase();
  return CATEGORIAS_OPEN_FINANCE[k] ?? original;
}
