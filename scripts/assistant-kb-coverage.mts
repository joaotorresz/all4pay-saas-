/**
 * assistant-kb-coverage — guarda de COBERTURA da base de conhecimento.
 *
 * Garante que os conceitos financeiros essenciais respondem via buscarKB
 * (perguntas "o que é X?"). Falha (exit 1) se algum conceito-chave deixar de
 * resolver — protege a camada educativa do assistente contra remoção acidental
 * ou regressão de regex ao mexer no KB.
 *
 *   npm run kb   (também roda dentro de npm test)
 */
import { buscarKB } from "@/lib/assistant-kb";

// [pergunta conceitual, id esperado] — cada conceito que o assistente promete
// explicar deve continuar resolvendo.
const ESPERADOS: [string, string][] = [
  ["o que é runway?", "runway"],
  ["o que é burn rate?", "burn"],
  ["o que é burn multiple?", "burn-multiple"],
  ["o que é EBITDA?", "ebitda"],
  ["o que é EBIT?", "lucro-operacional"],
  ["o que é margem de contribuição?", "mc"],
  ["o que é margem bruta?", "margem-bruta"],
  ["o que é margem líquida?", "margem-liquida"],
  ["o que é DRE?", "dre"],
  ["o que é fluxo de caixa?", "fluxo"],
  ["o que é fluxo de caixa livre?", "fcf"],
  ["o que é inadimplência?", "inadimplencia"],
  ["o que é conciliação bancária?", "conciliacao"],
  ["o que é conciliação automática?", "concil-auto"],
  ["o que é MRR?", "mrr"],
  ["o que é churn?", "churn"],
  ["o que é LTV?", "ltv"],
  ["o que é CAC?", "cac"],
  ["o que é LTV/CAC?", "ltvcac"],
  ["o que é ticket médio?", "ticket-medio"],
  ["o que é ponto de equilíbrio?", "breakeven"],
  ["o que é payback?", "payback"],
  ["o que é ROI?", "roi"],
  ["o que é WACC?", "wacc"],
  ["o que é capital de giro?", "capital-giro"],
  ["o que é liquidez corrente?", "liquidez"],
  ["o que é DSO?", "dso"],
  ["o que é DPO?", "dpo"],
  ["o que é ciclo de caixa?", "ciclo-caixa"],
  ["o que é CMV?", "cmv"],
  ["o que é OPEX?", "opex"],
  ["o que é markup?", "markup"],
  ["o que é depreciação?", "depreciacao"],
  ["o que é sazonalidade?", "sazonalidade"],
  ["o que é aging?", "aging"],
  ["o que é provisão?", "provisao"],
  ["o que é rateio?", "rateio"],
  ["o que é reserva de caixa?", "reserva"],
  ["o que é score de saúde financeira?", "score"],
  ["o que é boleto?", "boleto"],
  ["o que é PIX?", "pix"],
  ["o que é NFS-e?", "nfse"],
  ["o que é NSU?", "nsu"],
  ["o que é chargeback?", "chargeback"],
  ["o que é reembolso?", "reembolso"],
  ["o que é competência × caixa?", "regime"],
  ["o que é partidas dobradas?", "partidas"],
  ["o que é antecipação de recebíveis?", "antecipacao"],
  ["o que é faturamento?", "faturamento"],
  // 2ª leva de conceitos (sweep do KB): societário/tributário/financiamento
  ["o que é ARR?", "arr"],
  ["o que é pró-labore?", "prolabore"],
  ["o que é regime tributário?", "regime-trib"],
  ["o que é Simples Nacional?", "regime-trib"],
  ["o que é juros de mora?", "juros-mora"],
  ["o que é alíquota efetiva?", "aliquota-efetiva"],
  ["o que é RBT12?", "rbt12"],
  ["o que é taxa de gateway?", "taxa-gateway"],
  ["o que é balanço patrimonial?", "balanco"],
  ["o que é ativo circulante?", "ativo-passivo"],
  ["o que é patrimônio líquido?", "patrimonio"],
  ["o que é ROE?", "roe"],
  ["o que é ROIC?", "roic"],
  ["o que é alavancagem?", "alavancagem"],
  ["o que é liquidez seca?", "liquidez-seca"],
  ["o que é split de pagamento?", "split-pag"],
  ["o que é DANFE?", "danfe"],
  ["o que é retenção de imposto?", "retencao"],
  ["o que é distribuição de lucros?", "distrib-lucro"],
  ["o que é 13º salário?", "encargos"],
  ["o que é FGTS?", "encargos"],
  ["o que é comissão de vendas?", "comissao"],
  ["o que é margem operacional?", "margem-op"],
  ["o que é receita líquida?", "receita-liquida"],
  ["o que é TIR?", "tir-vpl"],
  ["o que é VPL?", "tir-vpl"],
  ["o que é orçamento?", "orcamento"],
  ["o que é forecast?", "orcamento"],
  ["o que é custo de oportunidade?", "custo-oport"],
  ["o que é recebível de cartão?", "fatura-cartao"],
  ["o que é meta de vendas?", "meta-vendas"],
  // 3ª leva: bancário / fiscal / recebíveis / rentabilidade
  ["o que é TED?", "ted-doc"],
  ["o que é open finance?", "open-finance"],
  ["o que é conta escrow?", "conta-tipos"],
  ["o que é adquirente?", "adquirente"],
  ["o que é gateway de pagamento?", "adquirente"],
  ["o que é liquidação financeira?", "liquidacao"],
  ["o que é D+30?", "liquidacao"],
  ["o que é CAPEX?", "capex"],
  ["o que é receita diferida?", "receita-diferida"],
  ["o que é MEI?", "mei-das"],
  ["o que é DAS?", "mei-das"],
  ["o que é NFC-e?", "nfce-cte"],
  ["o que é substituição tributária?", "substituicao-trib"],
  ["o que é crédito tributário?", "credito-trib"],
  ["o que é duplicata?", "duplicata"],
  ["o que é factoring?", "factoring"],
  ["o que é hedge?", "hedge-cambio"],
  ["o que é câmbio?", "hedge-cambio"],
  ["o que é net revenue retention?", "nrr"],
  ["o que é lucratividade?", "lucratividade"],
  ["o que é solvência?", "solvencia"],
  ["o que é DFC?", "dfc-indireto"],
  ["o que é cash flow?", "fluxo"],
  // 4ª leva: estoque / bancário / macro / investimento
  ["o que é ponto de reposição?", "estoque"],
  ["o que é curva ABC?", "estoque"],
  ["o que é nota promissória?", "promissoria"],
  ["o que é cheque especial?", "cheque-especial"],
  ["o que é capital de terceiros?", "capital-terceiros"],
  ["o que é ativo imobilizado?", "imobilizado"],
  ["o que é carência?", "carencia-parcelamento"],
  ["o que é juros compostos?", "juros-compostos"],
  ["o que é taxa selic?", "selic-indexador"],
  ["o que é correção monetária?", "selic-indexador"],
  ["o que é inflação?", "inflacao"],
  ["o que é margem de segurança?", "margem-seguranca"],
  ["o que é geração de caixa?", "geracao-caixa"],
  ["o que é aporte?", "aporte-valuation"],
  ["o que é valuation?", "aporte-valuation"],
  ["o que é break even point?", "breakeven"],
  ["o que é tabela Price?", "amortizacao-sistema"],
  ["o que é SAC?", "amortizacao-sistema"],
];

let ok = 0;
const fails: string[] = [];
for (const [q, id] of ESPERADOS) {
  const e = buscarKB(q);
  if (e && e.id === id) ok++;
  else fails.push(`✗ "${q}"  esperava id=${id}, veio ${e ? e.id : "NULL"}`);
}
for (const f of fails) console.log(f);
console.log(`\n${fails.length === 0 ? "✓ TODOS" : `✗ ${fails.length} FALHA(S)`} — ${ok}/${ESPERADOS.length} conceitos resolvem`);
if (fails.length > 0) process.exit(1);
