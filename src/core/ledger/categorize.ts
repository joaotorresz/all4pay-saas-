/**
 * Categorização transação → conta do razão. Camada de REGRAS (determinística,
 * grátis, demo-safe) por palavra-chave pt-BR. A IA (Claude) reforça as de baixa
 * confiança quando a chave existir (ver /api/ledger/categorize). Fase 1b.
 */
import { ehLancamentoDeTaxaAdquirencia } from "@/core/indicadores/classificacao";

export interface TxParaCategorizar { id: string; descricao: string; valor: number; tipo: "entrada" | "saida" }
export interface Categorizacao { id: string; code: string; confianca: number; motivo: string }

const REGRAS_SAIDA: { re: RegExp; code: string; cat: string }[] = [
  { re: /folha|sal[aá]rio|inss|fgts|pr[oó].?labore|pessoal|adiantamento sal/i, code: "4.1.03", cat: "Folha" },
  { re: /imposto|darf|d[ae]s\b|tribut|iss\b|icms|pis|cofins|gps|gnre|simples nacional/i, code: "4.1.01", cat: "Impostos" },
  { re: /tarifa|juros|iof|encargo|banc[aá]ri|empr[eé]stimo|financiament|anuidade/i, code: "4.2.01", cat: "Financeiras" },
  { re: /fornecedor|compra|mercadoria|insumo|estoque|atacad|distribuidora/i, code: "4.1.02", cat: "CMV/Fornecedores" },
  { re: /aluguel|energia|\bluz\b|[aá]gua|internet|telefone|assinatura|software|marketing|combust[ií]vel|posto|frete|contabil/i, code: "4.1.09", cat: "Operacionais" },
];
const REGRAS_ENTRADA: { re: RegExp; code: string; cat: string }[] = [
  { re: /servi[cç]o|honor[aá]rio|consultoria|mensalidade|assinatura/i, code: "3.1.02", cat: "Serviços" },
  { re: /juros|rendiment|aplica[cç]|resgate/i, code: "3.1.03", cat: "Juros" },
  { re: /venda|recebiment|pix recebido|fatura|cliente|boleto recebido/i, code: "3.1.01", cat: "Vendas" },
];

export function categorizarPorRegras(tx: TxParaCategorizar): Categorizacao {
  const regras = tx.tipo === "saida" ? REGRAS_SAIDA : REGRAS_ENTRADA;
  for (const r of regras) {
    if (!r.re.test(tx.descricao || "")) continue;
    /*
     * A taxa da maquininha (MDR) é custo de vender, não despesa financeira — a
     * regra é a MESMA do DRE (`ehTaxaAdquirencia`). Ela só desvia o que IRIA
     * para "Financeiras", e só com "tarifa"/"taxa" no texto: a descrição do
     * extrato é texto livre, e um "MDR" solto (nome de empresa, folha, guia)
     * não pode passar na frente das regras de folha e imposto.
     */
    if (r.code === "4.2.01" && ehLancamentoDeTaxaAdquirencia(tx.descricao, "saida")) {
      return { id: tx.id, code: "4.1.09", confianca: 0.9, motivo: "Regra: Taxa da maquininha (adquirência)" };
    }
    return { id: tx.id, code: r.code, confianca: 0.9, motivo: `Regra: ${r.cat}` };
  }
  // "TAXA ADQUIRENTE GETNET" não casa regra nenhuma: é a taxa da maquininha, e
  // com certeza (0.9) — no 0.5 do padrão ela iria para a IA, que podia mandá-la
  // para as Financeiras. A mesma regra do extrato da importação.
  if (tx.tipo === "saida" && ehLancamentoDeTaxaAdquirencia(tx.descricao, "saida")) {
    return { id: tx.id, code: "4.1.09", confianca: 0.9, motivo: "Regra: Taxa da maquininha (adquirência)" };
  }
  return tx.tipo === "saida"
    ? { id: tx.id, code: "4.1.09", confianca: 0.5, motivo: "Padrão: despesa operacional" }
    : { id: tx.id, code: "3.1.09", confianca: 0.5, motivo: "Padrão: outras receitas" };
}
