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
import { chaveCategoria } from "@/core/categorias/chave";

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
  // A chave única da categoria (sem acento, sem caixa): "adquirência" digitada
  // ou importada em forma DECOMPOSTA (e + U+0302) também casa.
  const c = chaveCategoria(cat);
  return /\bmdr\b/.test(c) || (/adquiren/.test(c) && /tarifa|taxa/.test(c));
}

/** A palavra que diz que o dinheiro VOLTOU: estorno, devolução, reembolso, reversão, restituição, ressarcimento. */
const DEVOLUCAO = /estorno|devolu|reembols|revers|restitu|ressarc/;

/** O texto diz que o dinheiro VOLTOU (estorno, devolução, reembolso…). */
export function citaDevolucao(texto: string | null | undefined): boolean {
  return DEVOLUCAO.test(chaveCategoria(texto));
}

/**
 * O texto diz que o dinheiro é a VENDA chegando: receita, repasse, recebimento,
 * venda, líquido ("Repasse da adquirente (líquido de taxas)", "Receita de
 * MDR", "LIQUIDO VENDAS TAXA MDR"). Uma regra só para o DRE (a entrada que cita
 * a adquirência continua receita) e para a qualidade de cadastro (a
 * contraparte do repasse não é "a taxa").
 */
export function citaVendaOuRepasse(texto: string | null | undefined): boolean {
  return /receita|repasse|receb|venda|liquid/.test(chaveCategoria(texto));
}

/**
 * A taxa da maquininha que VOLTOU, e o texto diz isso ("Estorno de tarifa de
 * adquirência"). É estorno da despesa variável — nunca faturamento.
 */
export function ehDevolucaoDeTaxaAdquirencia(texto: string | null | undefined): boolean {
  return ehTaxaAdquirencia(texto) && citaDevolucao(texto);
}

/**
 * ⚠️ **Um lançamento de EXTRATO é a taxa da maquininha?** — a pergunta das
 * portas de importação, que leem o DESCRITIVO do banco, não uma categoria
 * escolhida. Mais ESTREITA que a de cima, de propósito, em dois pontos:
 *
 *  1. **Exige a palavra da cobrança** ("tarifa"/"taxa"). Numa categoria,
 *     "MDR" sozinho é a taxa; num extrato, "MDR" é também sigla de empresa
 *     ("PIX ENVIADO MDR CONSULTORIA LTDA", "MDR ENGENHARIA") e aparece no
 *     crédito da venda ("CRED STONE LIQ MDR") — achado da revisão adversarial:
 *     o "MDR" solto levava fornecedor e venda para a taxa com certeza alta.
 *  2. **Na ENTRADA, só a devolução nomeada** ("ESTORNO TARIFA MDR"): o crédito
 *     que cita a adquirente quase sempre é a VENDA chegando.
 *
 * Quem DECIDE no extrato é a prévia (`core/ingestao` `classificar`), e o
 * classificador que grava (`core/fdip`) a segue — uma decisão, não duas.
 */
export function ehLancamentoDeTaxaAdquirencia(texto: string | null | undefined, tipo: string): boolean {
  if (!ehTaxaAdquirencia(texto) || !/tarifa|taxa/.test(chaveCategoria(texto))) return false;
  if (tipo === "saida") return true;
  if (tipo === "entrada") return citaDevolucao(texto);
  return false;
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
