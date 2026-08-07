/**
 * Plano de contas padrão (BR-ready) + categorização determinística
 * (transação → conta do razão). Reusa o classificador do DRE como camada de
 * REGRAS; a IA (Claude) entra só como reforço quando a chave existir (Fase 1).
 */
import { lancamentoDeMovimento, type AccountType, type LedgerEntryInput } from "./index";
import { classificarReceita, classificarDespesa } from "@/core/dre/engine";
import { liquidado, dataDe, magnitude } from "@/core/indicadores/convencoes";
import type { RiskInput, RiskMovement } from "@/core/risk-engine/types";

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

/**
 * Deriva os lançamentos de dupla entrada a partir dos movimentos — PURO.
 *
 * ⚠️ **Só o LIQUIDADO vira lançamento de caixa.** Esta linha é a correção da
 * divergência entre o Razão e o extrato: a versão anterior postava tudo que não
 * estivesse cancelado, então cada nota a receber em aberto entrava debitando
 * "Caixa e equivalentes". O balancete somava dinheiro que não existia na conta,
 * e o saldo contábil descolava do extrato pelo total dos títulos em aberto —
 * exatamente a diferença que a auditoria registrou.
 *
 * Um título previsto é um fato de COMPETÊNCIA (contas a receber/a pagar), não
 * de caixa. Enquanto o razão não tiver as contas de AR/AP com o seu próprio
 * ciclo (reconhecimento → liquidação), o certo é não postá-lo — melhor faltar
 * no razão do que existir no lugar errado.
 *
 * A data é a de CAIXA (`dataDe(m, "caixa")`), pela mesma convenção do resto do
 * sistema, e um liquidado sem data nenhuma fica de fora: um lançamento contábil
 * sem competência não tem em que mês entrar.
 */
export function lancamentosDeMovimentos(
  input: RiskInput,
  nomeDaParte?: (m: RiskMovement) => string | undefined,
): LedgerEntryInput[] {
  const saida: LedgerEntryInput[] = [];
  for (const m of input.movements) {
    if (!liquidado(m)) continue;
    const data = dataDe(m, "caixa");
    if (!data) continue;
    saida.push(
      lancamentoDeMovimento({
        tipo: m.type,
        valor: magnitude(m),
        data,
        contaCaixaId: CAIXA,
        contaResultadoId: contaDeMovimento(m),
        descricao: nomeDaParte?.(m) || m.category || "Lançamento",
        externalKey: `mov:${m.id}`,
        dimensions: {
          ...(m.party_id ? { contraparte: nomeDaParte?.(m) ?? m.party_id } : {}),
          ...(m.costCenter ? { centro: m.costCenter } : {}),
        },
      }),
    );
  }
  return saida;
}
