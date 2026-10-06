/**
 * A CLASSIFICAÇÃO DE UM LANÇAMENTO NA CASCATA DO RESULTADO — uma só.
 *
 * ⚠️ Ela morava em `core/dre/engine.ts`, e é dali que veio para cá sem uma
 * vírgula mudada. O motivo é de arquitetura, não de gosto: a camada canônica
 * precisa saber o que é imposto, custo, folha e resultado financeiro para
 * responder "qual foi o EBITDA" — e importar `core/dre` de dentro de
 * `core/indicadores` fecharia um CICLO (`indicadores → dre/engine →
 * liquidez.engine → indicadores`, porque a liquidez já delega o runway à
 * fórmula única). ESM tolera ciclo; um sistema não.
 *
 * A alternativa seria reescrever os regex aqui, e essa é exatamente a doença
 * que a ONDA 1 existe para matar: duas classificações que começam idênticas e
 * divergem na primeira categoria nova, sem ninguém perceber, porque as duas
 * "funcionam".
 *
 * ⚠️ A ORDEM DENTRO DE `classificarDespesa` É REGRA, não estilo: **folha vem
 * antes de cmv**. "Custo de pessoal" casa `custo` (cmv) e é folha; nenhuma das
 * palavras de cmv (mercadoria/fornecedor/insumo/combustível) casa folha, então
 * inverter a ordem move a folha inteira para dentro do CMV e infla o lucro
 * bruto sem nada parecer errado na tela.
 *
 * Puro, sem I/O. Versão `indicadores/1.0.0`.
 */

export type LinhaDespesa = "impostos" | "cmv" | "folha" | "financeiro" | "opex";
export type LinhaReceita = "vendas" | "servicos" | "juros" | "outras";

export const LABEL_DESPESA: Record<LinhaDespesa, string> = {
  impostos: "Impostos sobre receita",
  cmv: "CMV / Fornecedores",
  folha: "Folha de pagamento",
  financeiro: "Resultado financeiro",
  opex: "Despesas operacionais",
};

export const LABEL_RECEITA: Record<LinhaReceita, string> = {
  vendas: "Vendas",
  servicos: "Serviços prestados",
  juros: "Juros / receitas financeiras",
  outras: "Outras receitas",
};

/**
 * ⚠️ **A TAXA DA MAQUININHA É CUSTO DE VENDER, não resultado financeiro.**
 *
 * A adquirente desconta o MDR de cada venda no cartão: ele só existe porque
 * houve venda e cresce com ela — é despesa VARIÁVEL, acima do EBITDA. A
 * categoria que a maquininha grava é "Tarifas de adquirência", e a palavra
 * "tarifa" a jogava no Resultado Financeiro (junto de juros e tarifa bancária),
 * ABAIXO do EBITDA: o EBITDA de quem vende no cartão saía maior que o real pelo
 * valor do MDR. O padrão antigo da despesa variável (`adquiren`) não casava com
 * "adquir**ê**ncia" — o acento era o defeito inteiro.
 *
 * Uma regra só, usada pelos DOIS classificadores do resultado
 * (`core/relatorios` e `classificarDespesa` abaixo) e pela sugestão do razão:
 * tarifa ou taxa DA ADQUIRÊNCIA, ou MDR. Exige "tarifa"/"taxa" junto de
 * "adquir…" de propósito: "Repasse da adquirente" é a VENDA chegando na conta,
 * e não pode virar estorno de despesa. Tarifa BANCÁRIA continua financeira.
 */
export function ehTaxaAdquirencia(cat: string | null | undefined): boolean {
  const c = (cat ?? "").toLowerCase();
  return /\bmdr\b/.test(c) || (/adquir[eê]n/.test(c) && /tarifa|taxa/.test(c));
}

export function classificarDespesa(cat: string | null | undefined): LinhaDespesa {
  const c = (cat ?? "").toLowerCase();
  if (/imposto|tribut|\bdas\b|irpj|iss|icms|pis|cofins/.test(c)) return "impostos";
  // folha ANTES de cmv: "Custo de pessoal" casa "custo" (cmv) mas é folha; as
  // palavras de cmv (mercadoria/fornecedor/insumo/combust) não casam folha.
  if (/folha|sal[aá]r|pessoal|encargo|pró-labore|pro-labore/.test(c)) return "folha";
  if (/fornecedor|cmv|custo|mercadoria|insumo|combust/.test(c)) return "cmv";
  // A taxa da maquininha ANTES do financeiro: "Tarifas de adquirência" casa
  // "tarifa" e é custo de vender (opex, acima do EBITDA), não juros.
  if (ehTaxaAdquirencia(c)) return "opex";
  if (/tarifa|juros|banc|financ|iof/.test(c)) return "financeiro";
  return "opex";
}

export function classificarReceita(cat: string | null | undefined): LinhaReceita {
  const c = (cat ?? "").toLowerCase();
  if (/serviç|servico/.test(c)) return "servicos";
  if (/juros|rendiment|aplicac/.test(c)) return "juros";
  if (/venda/.test(c)) return "vendas";
  return "outras";
}
