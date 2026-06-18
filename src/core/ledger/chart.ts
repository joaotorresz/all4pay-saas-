/**
 * Plano de contas padrão (BR-ready) + categorização determinística
 * (transação → conta do razão). Reusa o classificador do DRE como camada de
 * REGRAS; a IA (Claude) entra só como reforço quando a chave existir (Fase 1).
 */
import type { AccountType } from "./index";
import { classificarReceita, classificarDespesa } from "@/core/dre/engine";

export interface ContaPlano { code: string; name: string; type: AccountType }

/** Conta caixa/banco (contrapartida das entradas/saídas). */
export const CAIXA = "1.1.01";

export const PLANO_PADRAO: ContaPlano[] = [
  { code: "1.1.01", name: "Caixa e equivalentes", type: "asset" },
  { code: "3.1.01", name: "Receita de vendas", type: "revenue" },
  { code: "3.1.02", name: "Receita de serviços", type: "revenue" },
  { code: "3.1.03", name: "Juros recebidos", type: "revenue" },
  { code: "3.1.09", name: "Outras receitas", type: "revenue" },
  { code: "4.1.01", name: "Impostos sobre vendas", type: "expense" },
  { code: "4.1.02", name: "CMV / Fornecedores", type: "expense" },
  { code: "4.1.03", name: "Folha de pagamento", type: "expense" },
  { code: "4.1.09", name: "Despesas operacionais", type: "expense" },
  { code: "4.2.01", name: "Despesas financeiras", type: "expense" },
  { code: "4.3.01", name: "Depreciação", type: "expense" },
  { code: "4.3.02", name: "Amortização", type: "expense" },
  { code: "1.2.99", name: "(-) Depreciação/amortização acumulada", type: "asset" },
  { code: "2.1.99", name: "Provisões a pagar", type: "liability" },
  { code: "2.2.01", name: "Receita diferida", type: "liability" },
];

const REC: Record<string, string> = { vendas: "3.1.01", servicos: "3.1.02", juros: "3.1.03", outras: "3.1.09" };
const DESP: Record<string, string> = { impostos: "4.1.01", cmv: "4.1.02", folha: "4.1.03", opex: "4.1.09", financeiro: "4.2.01" };

const byCode = new Map(PLANO_PADRAO.map((c) => [c.code, c]));
export const nomeConta = (code: string) => byCode.get(code)?.name ?? code;
export const tipoConta = (code: string): AccountType => byCode.get(code)?.type ?? "asset";

/** Conta de resultado para um movimento (regra determinística por categoria). */
export function contaDeMovimento(m: { type: "entrada" | "saida"; category?: string | null }): string {
  return m.type === "entrada" ? REC[classificarReceita(m.category)] : DESP[classificarDespesa(m.category)];
}
