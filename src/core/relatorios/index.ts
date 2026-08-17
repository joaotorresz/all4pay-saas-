/**
 * RELATÓRIOS — DRE, DFC, consolidado multiempresa e fechamento mensal.
 *
 * A diferença para `core/dre` (que é o Intelligence Center) é o PROPÓSITO: lá o
 * DRE responde perguntas executivas; aqui ele é o RELATÓRIO — a cascata
 * contábil linha a linha, em colunas de período, com análise vertical e
 * horizontal, comparação com orçamento e drill-down por célula.
 *
 * Três decisões estruturam tudo:
 *  • a **estrutura** é fixa e explícita (`ESTRUTURA_DRE`), porque é a cascata
 *    que o contador espera ler — não uma lista de categorias em ordem
 *    arbitrária;
 *  • a **classificação** de cada lançamento numa linha é por palavra-chave da
 *    categoria, a MESMA ideia de `core/dre/engine`, para os dois não divergirem;
 *  • toda célula sabe QUAIS movimentos a formaram, senão o clique para ver as
 *    transações seria uma segunda consulta que poderia discordar do número.
 *
 * Puro, tipado, demo-safe. Versão relatorios/1.0.0.
 */
import type { RiskInput, RiskMovement } from "@/core/risk-engine/types";
import { dataDe } from "@/core/indicadores/convencoes";

import { formatBRL } from "@/lib/format";
export const RELATORIOS_VERSION = "relatorios/1.0.0";

/* ================================= período ================================= */

/**
 * ⚠️ `doze_meses` é o PADRÃO (mapa de consolidação, item 3). Abrir no mês
 * corrente mostra um relatório quase vazio no dia 2 e faz o usuário concluir
 * que não há dados — a leitura de resultado é comparativa por natureza.
 */
export type PresetPeriodo = "doze_meses" | "personalizado" | "trimestre" | "semestre" | "ano";
export type TipoAnalise = "vertical" | "horizontal";

export interface Intervalo { de: string; ate: string }

const pad = (n: number) => String(n).padStart(2, "0");
const mesDe = (iso: string) => iso.slice(0, 7);
const round2 = (n: number) => Math.round(n * 100) / 100;

export function fimDoMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return `${mes}-${pad(new Date(a, m, 0).getDate())}`;
}

export function deslocarMes(mes: string, n: number): string {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(a, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** Os meses (inclusive) que o intervalo cobre — as COLUNAS do relatório. */
export function mesesDoIntervalo(i: Intervalo): string[] {
  const out: string[] = [];
  let m = mesDe(i.de);
  const fim = mesDe(i.ate);
  // Trava de 120 colunas: um intervalo inválido (ate < de) não pode virar laço.
  for (let k = 0; k < 120 && m <= fim; k++) {
    out.push(m);
    m = deslocarMes(m, 1);
  }
  return out;
}

/** Traduz o preset num intervalo, ancorado no mês de referência. */
export function intervaloDoPreset(preset: PresetPeriodo, mesRef: string, atual?: Intervalo): Intervalo {
  switch (preset) {
    case "doze_meses": return { de: `${deslocarMes(mesRef, -11)}-01`, ate: fimDoMes(mesRef) };
    case "trimestre": return { de: `${deslocarMes(mesRef, -2)}-01`, ate: fimDoMes(mesRef) };
    case "semestre": return { de: `${deslocarMes(mesRef, -5)}-01`, ate: fimDoMes(mesRef) };
    case "ano": return { de: `${mesRef.slice(0, 4)}-01-01`, ate: `${mesRef.slice(0, 4)}-12-31` };
    default: return atual ?? { de: `${mesRef}-01`, ate: fimDoMes(mesRef) };
  }
}

const MES_ABREV = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
export const rotuloColuna = (mes: string) => `${MES_ABREV[Number(mes.slice(5, 7)) - 1]}/${mes.slice(0, 4)}`;

/* =============================== estrutura =============================== */

/**
 * Uma linha do relatório. `tipo` diz como ela se comporta:
 *  • `soma`   — agrega os lançamentos classificados nela (tem filhos = categorias);
 *  • `total`  — calculada a partir de outras linhas (as linhas "=");
 *  • `titulo` — só cabeçalho.
 * `sinal` é o que o print mostra: (+), (−) ou (+/−).
 */
export type TipoLinha = "soma" | "total";
export type SinalLinha = "+" | "-" | "+/-" | "=";

export interface LinhaEstrutura {
  id: string;
  label: string;
  tipo: TipoLinha;
  sinal: SinalLinha;
  /** Nível 1 = a linha da cascata; 2 = grupo; 3 = categoria. */
  nivel: 1;
  /** Para `total`: os ids que entram e com que sinal. */
  formula?: { id: string; sinal: 1 | -1 }[];
  /** Para `soma`: o classificador que decide se um movimento cai aqui. */
  casa?: (m: RiskMovement) => boolean;
}

const cat = (m: RiskMovement) => (m.category ?? "").toLowerCase();
const entrada = (m: RiskMovement) => m.type === "entrada";
const saida = (m: RiskMovement) => m.type === "saida";

// Os classificadores, em ORDEM de especificidade. O primeiro que casa vence —
// "Impostos sobre vendas" tem de ganhar de "despesa operacional" genérica.
//
// ⚠️ As siglas de tributo são ANCORADAS em `\b`. Sem isso, `iss` casa dentro de
// "com**iss**ão" e toda comissão de afiliado vira imposto sobre vendas — some da
// linha de Despesas Variáveis e infla a Dedução, com a cascata inteira fechando
// "certo" no número errado. O mesmo vale para pis/ipi/das.
const ehImpostoVenda = (m: RiskMovement) =>
  /imposto|tribut|simples nacional|\bdas\b|\bicms\b|\biss\b|\bpis\b|\bcofins\b|\bipi\b|\binss\b|\birpj\b|\bcsll\b/.test(cat(m));
const ehDevolucao = (m: RiskMovement) => /devolu|desconto|reembols|estorno|chargeback|reclamad|cancelad/.test(cat(m));
const ehCustoVariavel = (m: RiskMovement) => /cmv|mercadoria|insumo|fornecedor|frete|embalagem|custo de produ/.test(cat(m));
const ehDespesaVariavel = (m: RiskMovement) => /comiss|taxa|gateway|adquiren|plataforma|antecipa|marketing|an[úu]ncio|ads|tr[áa]fego/.test(cat(m));
const ehFinanceiro = (m: RiskMovement) => /juros|tarifa|banc|iof|financ|empr[ée]stim|rendiment|aplica/.test(cat(m));
const ehImpostoLucro = (m: RiskMovement) => /\birpj\b|\bcsll\b|imposto sobre o lucro/.test(cat(m));

/**
 * ⚠️ **A pergunta "esta entrada é FATURAMENTO?" tem UMA resposta no sistema.**
 *
 * Exportada porque `core/indicadores/resultado` precisava dela e tinha a sua
 * própria versão — que reconhecia os juros e NÃO reconhecia o empréstimo. O
 * resultado, medido na fixture compartilhada: R$ 15.000 de empréstimo bancário
 * entravam como receita bruta lá e não aqui, e as duas cascatas divergiam
 * exatamente nesse valor em receita, receita líquida, lucro bruto e EBITDA.
 *
 * Empréstimo, aporte e rendimento de aplicação são dinheiro que ENTRA e não são
 * dinheiro que a operação GANHOU. Quem trata as duas coisas como a mesma
 * apresenta um faturamento que não houve — e é sobre esse número que se decide
 * contratar.
 */
export const ehReceitaOperacional = (m: RiskMovement) =>
  entrada(m) && !ehFinanceiro(m) && !ehNaoOperacional(m);
const ehNaoOperacional = (m: RiskMovement) => /n[ãa]o operacional|venda de ativo|imobilizado|indeniza|multa contratual/.test(cat(m));
/**
 * ⚠️ **DEPRECIAÇÃO E AMORTIZAÇÃO — a linha que faltava, e que tornava o rótulo
 * "EBITDA" falso.**
 *
 * O *A* de EBITDA é justamente *amortization*: EBITDA é o resultado ANTES de
 * depreciação e amortização. A cascata não tinha essa linha, então a
 * depreciação — quando lançada — caía dentro de *Despesas Operacionais* e era
 * subtraída ali. O número apresentado como EBITDA já vinha líquido de D&A, ou
 * seja, era **EBIT**. Duas linhas com o mesmo valor e nomes diferentes é pior
 * que uma linha só: quem compara o "EBITDA" desta tela com o múltiplo de
 * mercado de um concorrente compara coisas diferentes com o mesmo nome.
 *
 * ⚠️ Ancorado em `\b` no que pode colidir: sem a borda, `amortiza` casaria em
 * "amortização de EMPRÉSTIMO", que é financeiro e não D&A — é o mesmo erro que
 * fazia `iss` casar dentro de "com**iss**ão".
 */
const ehDepreciacao = (m: RiskMovement) =>
  /deprecia|amortiza[çc][ãa]o do imobilizado|amortiza[çc][ãa]o de intang|exaust[ãa]o|\bd&a\b/.test(cat(m))
  || (/amortiza/.test(cat(m)) && !/empr[ée]stimo|financiamento|d[íi]vida|contrato/.test(cat(m)));

/**
 * A cascata do resultado, exatamente na ordem em que o relatório apresenta.
 * Cada linha "=" é calculada das anteriores — nenhuma delas soma lançamento
 * diretamente, o que impede um valor aparecer duas vezes.
 */
/**
 * A declaração que tira o lançamento do relatório INTEIRO.
 *
 * ⚠️ Não é um id de linha, e não pode virar um: uma linha de transferência no
 * DRE mostraria no resultado um dinheiro que só mudou de bolso. É a ausência
 * de linha, dita — e dizer é o que a separa de "esqueceram de classificar".
 *
 * ⚠️ **Ela existe porque a alternativa era silenciosa.** Uma declaração que o
 * montador não reconhece cai no palpite por palavra-chave sem avisar ninguém:
 * "Credit card payment" viraria despesa operacional e o custo da empresa
 * subiria pelo valor da fatura que ela já pagou uma vez, dentro dos
 * lançamentos individuais. O mesmo vale para o DFC, onde ela também sai das
 * seções operacionais.
 */
export const LINHA_TRANSFERENCIA = "transferencia";

export const ESTRUTURA_DRE: LinhaEstrutura[] = [
  {
    id: "receita_bruta", label: "Receita Bruta Operacional", tipo: "soma", sinal: "+", nivel: 1,
    casa: (m) => entrada(m) && !ehFinanceiro(m) && !ehNaoOperacional(m),
  },
  {
    id: "deducoes", label: "Dedução sobre Produtos e Serviços", tipo: "soma", sinal: "-", nivel: 1,
    /*
     * ⚠️ **`!ehImpostoLucro` — sem ele a linha `impostos_lucro` era INALCANÇÁVEL.**
     *
     * A atribuição é `estrutura.find(l => l.casa?.(m))`: a PRIMEIRA linha que
     * casa leva o movimento. E `ehImpostoVenda` (`/imposto|tribut|…|irpj|csll/`)
     * é um SUPERCONJUNTO de `ehImpostoLucro` (`/irpj|csll|imposto sobre o lucro/`):
     * toda categoria que o segundo reconhece o primeiro também reconhece. Como
     * `deducoes` vem antes de `impostos_lucro` na estrutura, IRPJ e CSLL caíam
     * como DEDUÇÃO DA RECEITA e a linha de imposto sobre o lucro ficava zerada
     * para sempre.
     *
     * O estrago não é de rótulo: imposto sobre o LUCRO entrando ACIMA do EBITDA
     * derruba receita líquida, lucro bruto e EBITDA pelo valor do IRPJ+CSLL — a
     * DRE afirma que a OPERAÇÃO vai pior do que vai, e o defeito só aparece em
     * quem provisiona IR. Medido na fixture: 100k de venda, 40k de folha, 12k de
     * IRPJ/CSLL davam EBITDA de R$ 48.000 em vez de R$ 60.000.
     *
     * Descoberto ao escrever a fixture que deveria travar a diferença de `lair`:
     * ela passava sem exercitar nada, porque a linha nunca recebia um centavo.
     */
    casa: (m) => saida(m) && !ehImpostoLucro(m) && (ehImpostoVenda(m) || ehDevolucao(m)),
  },
  {
    id: "receita_liquida", label: "Receita Líquida", tipo: "total", sinal: "=", nivel: 1,
    formula: [{ id: "receita_bruta", sinal: 1 }, { id: "deducoes", sinal: -1 }],
  },
  {
    id: "custos_variaveis", label: "Custos Variáveis", tipo: "soma", sinal: "-", nivel: 1,
    casa: (m) => saida(m) && !ehImpostoVenda(m) && !ehDevolucao(m) && ehCustoVariavel(m),
  },
  {
    id: "lucro_bruto", label: "Lucro Operacional Bruto", tipo: "total", sinal: "=", nivel: 1,
    formula: [{ id: "receita_liquida", sinal: 1 }, { id: "custos_variaveis", sinal: -1 }],
  },
  {
    id: "despesas_variaveis", label: "Despesas Variáveis", tipo: "soma", sinal: "-", nivel: 1,
    casa: (m) => saida(m) && !ehImpostoVenda(m) && !ehDevolucao(m) && !ehCustoVariavel(m) && ehDespesaVariavel(m),
  },
  {
    id: "margem_contribuicao", label: "Margem de Contribuição", tipo: "total", sinal: "=", nivel: 1,
    formula: [{ id: "lucro_bruto", sinal: 1 }, { id: "despesas_variaveis", sinal: -1 }],
  },
  {
    id: "despesas_operacionais", label: "Despesas Operacionais", tipo: "soma", sinal: "-", nivel: 1,
    // ⚠️ D&A sai DAQUI e ganha linha própria abaixo do EBITDA. Enquanto ela
    // ficava aqui dentro, o "EBITDA" já vinha líquido de depreciação — era EBIT.
    casa: (m) => saida(m) && !ehImpostoVenda(m) && !ehDevolucao(m) && !ehCustoVariavel(m)
      && !ehDespesaVariavel(m) && !ehFinanceiro(m) && !ehImpostoLucro(m) && !ehNaoOperacional(m)
      && !ehDepreciacao(m),
  },
  {
    id: "ebitda", label: "EBITDA (antes de D&A)", tipo: "total", sinal: "=", nivel: 1,
    formula: [{ id: "margem_contribuicao", sinal: 1 }, { id: "despesas_operacionais", sinal: -1 }],
  },
  {
    id: "depreciacao_amortizacao", label: "Depreciação e Amortização", tipo: "soma", sinal: "-", nivel: 1,
    casa: (m) => saida(m) && ehDepreciacao(m),
  },
  {
    id: "ebit", label: "EBIT (resultado operacional)", tipo: "total", sinal: "=", nivel: 1,
    formula: [{ id: "ebitda", sinal: 1 }, { id: "depreciacao_amortizacao", sinal: -1 }],
  },
  {
    id: "resultado_financeiro", label: "Resultado Financeiro", tipo: "soma", sinal: "+/-", nivel: 1,
    // Entra com o SINAL do movimento: receita financeira soma, despesa subtrai.
    casa: (m) => ehFinanceiro(m) && !ehNaoOperacional(m),
  },
  {
    id: "impostos_lucro", label: "Impostos sobre o Lucro", tipo: "soma", sinal: "-", nivel: 1,
    casa: (m) => saida(m) && ehImpostoLucro(m),
  },
  {
    id: "nao_operacional", label: "Resultado não Operacional", tipo: "soma", sinal: "+/-", nivel: 1,
    casa: (m) => ehNaoOperacional(m),
  },
  {
    id: "resultado_liquido", label: "Resultado Líquido", tipo: "total", sinal: "=", nivel: 1,
    formula: [
      // ⚠️ Parte do EBIT, não do EBITDA: o resultado líquido é DEPOIS da
      // depreciação. Somar a partir do EBITDA devolveria a D&A ao lucro.
      { id: "ebit", sinal: 1 },
      { id: "resultado_financeiro", sinal: 1 },
      { id: "impostos_lucro", sinal: -1 },
      { id: "nao_operacional", sinal: 1 },
    ],
  },
];

/** DFC — regime de caixa, começando pelo saldo inicial. */
export const ESTRUTURA_DFC: LinhaEstrutura[] = [
  { id: "saldo_inicial", label: "Saldo Inicial", tipo: "total", sinal: "=", nivel: 1, formula: [] },
  {
    id: "entradas_operacionais", label: "Entradas Operacionais", tipo: "soma", sinal: "+", nivel: 1,
    casa: (m) => entrada(m) && !ehFinanceiro(m) && !ehNaoOperacional(m),
  },
  {
    id: "saidas_operacionais", label: "Saídas Operacionais", tipo: "soma", sinal: "-", nivel: 1,
    casa: (m) => saida(m) && !ehFinanceiro(m) && !ehNaoOperacional(m),
  },
  {
    id: "fluxo_operacional", label: "Fluxo de Caixa Operacional", tipo: "total", sinal: "=", nivel: 1,
    formula: [{ id: "entradas_operacionais", sinal: 1 }, { id: "saidas_operacionais", sinal: -1 }],
  },
  {
    id: "fluxo_investimento", label: "Fluxo de Investimentos", tipo: "soma", sinal: "+/-", nivel: 1,
    casa: (m) => ehNaoOperacional(m),
  },
  {
    id: "fluxo_financiamento", label: "Fluxo de Financiamentos", tipo: "soma", sinal: "+/-", nivel: 1,
    casa: (m) => ehFinanceiro(m),
  },
  {
    id: "fluxo_liquido", label: "Fluxo de Caixa Líquido", tipo: "total", sinal: "=", nivel: 1,
    formula: [
      { id: "fluxo_operacional", sinal: 1 },
      { id: "fluxo_investimento", sinal: 1 },
      { id: "fluxo_financiamento", sinal: 1 },
    ],
  },
  { id: "saldo_final", label: "Saldo Final", tipo: "total", sinal: "=", nivel: 1, formula: [] },
];

/* ============================== o relatório ============================== */

export interface Celula {
  /** Valor da célula, já com o sinal contábil aplicado. */
  valor: number;
  /** Análise vertical: % sobre a receita bruta (ou entradas, no DFC). */
  av: number | null;
  /** Análise horizontal: variação % contra a coluna anterior. */
  ah: number | null;
  /** Ids dos movimentos que formaram o valor — o drill-down da célula. */
  movimentos: string[];
}

export interface LinhaRelatorio {
  id: string;
  label: string;
  nivel: 1 | 2 | 3;
  sinal: SinalLinha;
  tipo: TipoLinha;
  /** Uma célula por coluna de período, na ordem de `colunas`. */
  celulas: Celula[];
  total: Celula;
  media: Celula;
  /** Categorias que compõem a linha (nível 3). */
  filhos: LinhaRelatorio[];
}

/**
 * ⚠️ **A BASE DA ANÁLISE VERTICAL, e por que ela precisou virar escolha.**
 *
 * Era a **receita bruta**, fixa. Num mês de receita baixa isso produz leituras
 * como *"Assinaturas / software 3451,4%"* — aritmeticamente corretas e
 * inúteis: o percentual deixa de medir composição e passa a medir o quanto a
 * base encolheu. Pior, ele CHAMA A ATENÇÃO justamente no mês em que não há o
 * que ver.
 *
 * O padrão passou a ser **receita líquida**, que é a base contábil usual da AV
 * — a bruta inclui impostos sobre venda que nunca foram da empresa, e comparar
 * despesa contra dinheiro que vai embora em guia infla toda a coluna.
 */
export type BaseVertical = "receita_bruta" | "receita_liquida";

export interface FiltroRelatorio {
  intervalo: Intervalo;
  tipo: TipoAnalise;
  /** Base da AV. Padrão: `receita_liquida`. */
  baseVertical?: BaseVertical;
  conta?: string | null;
  projeto?: string | null;
  centro?: string | null;
  /** Regime: DRE usa competência; DFC usa caixa. */
  regime: "competencia" | "caixa";
  /**
   * A LINHA DECLARADA de cada categoria — `nome da categoria (minúsculo)` → id
   * da linha. Vem do plano de contas da empresa.
   *
   * ⚠️ **Ela VENCE a classificação por palavra-chave**, e é essa precedência
   * que dá sentido ao campo. O regex sobre o nome da categoria é um palpite:
   * acerta enquanto as categorias são as de fábrica ("Taxa Plataforma" cai em
   * Despesas Variáveis porque contém "taxa") e erra calado na primeira que a
   * empresa cria com o nome dela. Quem cadastrou a categoria sabe em que linha
   * ela entra; o regex, não.
   *
   * Ausente ou sem a categoria ⇒ o palpite continua valendo, que é o que mantém
   * de pé todo lançamento anterior a esta decisão.
   *
   * ⚠️ Chega por PARÂMETRO, nunca lido de dentro: `core/relatorios` é puro e
   * sem I/O, e um `localStorage` aqui faria o mesmo relatório dar números
   * diferentes conforme o navegador — que é o defeito que a camada canônica
   * existe para impedir.
   */
  linhaPorCategoria?: Record<string, string>;
}

export interface Relatorio {
  colunas: string[];
  linhas: LinhaRelatorio[];
  /** Base da análise vertical, por coluna (receita bruta / entradas). */
  base: number[];
  /**
   * ⚠️ **AS COLUNAS SEM UM ÚNICO LANÇAMENTO — A4P-027.**
   *
   * O preset de 12 meses conta para trás a partir do mês corrente, então ele
   * inclui meses anteriores ao primeiro lançamento da empresa. A coluna sai
   * inteira em zero e a AV inteira em "—", e quem lê não distingue *"não houve
   * movimento"* de *"o relatório não conseguiu calcular"* — as duas viram o
   * mesmo travessão.
   *
   * ⚠️ A janela NÃO é estreitada em silêncio. Começar no primeiro mês com
   * movimento entregaria 11 colunas sob um filtro que diz "12 meses" — trocar
   * o período que a pessoa pediu sem avisar é outra forma da mesma mentira.
   * Aqui a coluna FICA e é NOMEADA; a tela a marca.
   */
  colunasSemDado: string[];
}

/**
 * ⚠️ **DELEGA para a convenção canônica — era uma SEGUNDA implementação.**
 *
 * Esta função repetia a regra de data por conta própria (`regime === "caixa" ?
 * paid_date : due_date`), e foi por isso que ligar a competência em
 * `dataDe` não mudou nada no DRE: o relatório nunca a chamava. Duas
 * implementações da mesma regra é exatamente a doença que a camada canônica
 * existe para matar — elas começam idênticas e divergem na primeira mudança,
 * que foi o que aconteceu aqui.
 *
 * O último recurso (`|| paid_date`) fica: um liquidado sem vencimento tem a
 * data de pagamento como melhor aproximação, e devolver vazio o tiraria do
 * relatório inteiro.
 */
const dataDoRegime = (m: RiskMovement, regime: "competencia" | "caixa") => {
  /**
   * ⚠️ **A normalização não é defensividade — ela impede uma TROCA SILENCIOSA
   * de regime, e a guarda pegou uma.**
   *
   * O tipo diz que `regime` é obrigatório, mas há chamada que o omite (o spread
   * de um filtro genérico atravessa o tipo). Com `undefined`, a expressão
   * antiga caía no ramo de COMPETÊNCIA por acidente do ternário; a delegação
   * caía no de CAIXA, pelo mesmo acidente ao contrário. O efeito medido na
   * fixture: um pagamento com vencimento em julho e caixa em agosto mudava de
   * mês, e a Receita Líquida divergia em R$ 5.000 entre o cartão e a tabela.
   *
   * Nenhum dos dois padrões é defensável por si; o que não pode acontecer é a
   * escolha ser feita por qual operador veio primeiro. Aqui ela é DITA, e
   * mantém o comportamento histórico.
   */
  const r: "competencia" | "caixa" = regime === "caixa" ? "caixa" : "competencia";
  return (dataDe(m, r) ?? m.paid_date ?? m.due_date ?? "").slice(0, 10);
};

function aplicaFiltros(ms: RiskMovement[], f: FiltroRelatorio): RiskMovement[] {
  return ms.filter((m) => {
    if (m.status === "cancelado") return false;
    // No regime de CAIXA só o que foi liquidado existe — previsto não é caixa.
    if (f.regime === "caixa" && m.status !== "pago") return false;
    if (f.conta && m.accountId !== f.conta) return false;
    if (f.projeto && m.projeto !== f.projeto) return false;
    if (f.centro && m.costCenter !== f.centro) return false;
    const d = dataDoRegime(m, f.regime);
    return !!d && d >= f.intervalo.de && d <= f.intervalo.ate;
  });
}

const celulaVazia = (): Celula => ({ valor: 0, av: null, ah: null, movimentos: [] });

/**
 * Monta o relatório: classifica cada movimento na PRIMEIRA linha que o aceita,
 * agrega por coluna, quebra em categorias (nível 3) e só então calcula as
 * linhas "=" a partir das outras.
 */
export function montarRelatorio(
  input: RiskInput,
  estrutura: LinhaEstrutura[],
  f: FiltroRelatorio,
  saldoInicial?: number,
): Relatorio {
  const colunas = mesesDoIntervalo(f.intervalo);
  const movs = aplicaFiltros(input.movements, f);
  const indice = new Map(colunas.map((c, k) => [c, k]));

  // valores[linhaId][coluna] e as categorias por linha
  const soma = new Map<string, number[]>();
  const movsPorLinha = new Map<string, string[][]>();
  const categorias = new Map<string, Map<string, { valores: number[]; movs: string[][] }>>();
  for (const l of estrutura) {
    soma.set(l.id, colunas.map(() => 0));
    movsPorLinha.set(l.id, colunas.map(() => []));
    categorias.set(l.id, new Map());
  }

  for (const m of movs) {
    const k = indice.get(mesDe(dataDoRegime(m, f.regime)));
    if (k === undefined) continue;
    const declarada = f.linhaPorCategoria?.[(m.category ?? "").trim().toLowerCase()];
    // ⚠️ TRANSFERÊNCIA NÃO É LINHA — é a ausência de linha, declarada.
    // Pagamento de fatura de cartão, boleto de transferência e movimento entre
    // contas próprias não são receita nem despesa: o dinheiro trocou de bolso.
    // Sem esta saída, a única forma de tirá-los do resultado seria não
    // declará-los — e aí o palpite por palavra-chave os põe em despesa
    // operacional, inflando o custo com dinheiro que a empresa não gastou.
    if (declarada === LINHA_TRANSFERENCIA) continue;
    const linha = (declarada
      ? estrutura.find((l) => l.id === declarada && l.tipo === "soma")
      : undefined)
      ?? estrutura.find((l) => l.tipo === "soma" && l.casa?.(m));
    if (!linha) continue;
    /**
     * Linhas "+/-" carregam o sinal do movimento; as demais são magnitude —
     * o sinal já está na estrutura, e a fórmula do total o aplica.
     *
     * ⚠️ **Exceção: ENTRADA numa linha de sinal "-" é ESTORNO, e entra
     * negativa.** Uma restituição de imposto é a dedução voltando; somá-la em
     * magnitude faria a devolução AUMENTAR a dedução — o contribuinte recebe
     * dinheiro de volta e o DRE registra que ele pagou mais imposto. O mesmo
     * vale para devolução de fornecedor e estorno de despesa.
     *
     * Sem esta linha, a única saída seria classificar a restituição como
     * receita — e aí ela infla o faturamento, que foi exatamente o defeito
     * medido (R$ 655,30 de restituição dentro da receita bruta).
     */
    const estorno = linha.sinal === "-" && m.type === "entrada";
    const v = linha.sinal === "+/-"
      ? (m.type === "entrada" ? m.amount : -m.amount)
      : estorno ? -Math.abs(m.amount) : Math.abs(m.amount);
    soma.get(linha.id)![k] += v;
    movsPorLinha.get(linha.id)![k].push(m.id);

    const nome = (m.category || "Sem categoria").trim() || "Sem categoria";
    const mapa = categorias.get(linha.id)!;
    if (!mapa.has(nome)) mapa.set(nome, { valores: colunas.map(() => 0), movs: colunas.map(() => []) });
    const c = mapa.get(nome)!;
    c.valores[k] += v;
    c.movs[k].push(m.id);
  }

  // Totais calculados a partir das outras linhas, na ordem da cascata.
  const valorDe = new Map<string, number[]>(soma);
  for (const l of estrutura) {
    if (l.tipo !== "total") continue;
    const acc = colunas.map((_, k) =>
      (l.formula ?? []).reduce((s, p) => s + p.sinal * (valorDe.get(p.id)?.[k] ?? 0), 0));
    valorDe.set(l.id, acc);
  }

  // DFC: saldo inicial e final são posição, não fluxo — acumulam coluna a coluna.
  if (saldoInicial != null) {
    const inicial: number[] = [];
    const final: number[] = [];
    let acc = saldoInicial;
    const liquido = valorDe.get("fluxo_liquido") ?? colunas.map(() => 0);
    colunas.forEach((_, k) => {
      inicial.push(round2(acc));
      acc = round2(acc + liquido[k]);
      final.push(acc);
    });
    valorDe.set("saldo_inicial", inicial);
    valorDe.set("saldo_final", final);
  }

  /*
   * Base da análise vertical: a linha escolhida (DRE) ou as entradas (DFC).
   * ⚠️ O padrão é RECEITA LÍQUIDA — ver `BaseVertical`.
   */
  const idBase = estrutura.some((l) => l.id === "receita_bruta")
    ? (f.baseVertical ?? "receita_liquida")
    : "entradas_operacionais";
  const base = valorDe.get(idBase) ?? colunas.map(() => 0);

  /**
   * ⚠️ **A BASE INSIGNIFICANTE — o que produzia "Assinaturas / software 3451,4%".**
   *
   * Quando a receita de um mês desaba, o denominador da AV desaba junto e todo
   * percentual estoura. O número está aritmeticamente certo e é inútil: ele
   * deixou de medir COMPOSIÇÃO e passou a medir o quanto a base encolheu — e,
   * pior, grita justamente no mês em que não há o que ler.
   *
   * O corte é 1% da média do período (a régua que você pediu). Abaixo disso a
   * célula devolve `null`, que a tela já renderiza como "—".
   *
   * ⚠️ `null` e não zero, e não um número grande escondido: "—" diz *não dá
   * para calcular*; "0%" diria *essa linha não representa nada da receita*, que
   * é uma afirmação diferente e falsa. É a mesma regra da ONDA 4.
   */
  const mediaBase = base.reduce((s, v) => s + Math.abs(v), 0) / (base.length || 1);
  const PISO_BASE = 0.01; // 1% da média do período
  const baseUsavel = (k: number) => Math.abs(base[k] ?? 0) >= mediaBase * PISO_BASE && base[k] !== 0;

  const montaCelulas = (valores: number[], movsIds: string[][], acumulado: boolean): {
    celulas: Celula[]; total: Celula; media: Celula;
  } => {
    const celulas = valores.map((v, k) => ({
      valor: round2(v),
      av: f.tipo === "vertical" && baseUsavel(k) ? round2((v / base[k]) * 100) : null,
      // AH da primeira coluna não existe — não há período anterior com que
      // comparar. `null` vira "—" na tela; 0 diria "não variou".
      ah: f.tipo === "horizontal" && k > 0 && valores[k - 1] !== 0
        ? round2(((v - valores[k - 1]) / Math.abs(valores[k - 1])) * 100)
        : null,
      movimentos: movsIds[k],
    }));
    // Saldo (acumulado) não se soma: o "total" é a última posição.
    const somaTotal = acumulado
      ? (valores[valores.length - 1] ?? 0)
      : valores.reduce((s, v) => s + v, 0);
    return {
      celulas,
      total: {
        valor: round2(somaTotal),
        av: f.tipo === "vertical" && base.reduce((s, v) => s + v, 0)
          ? round2((somaTotal / base.reduce((s, v) => s + v, 0)) * 100) : null,
        ah: null,
        movimentos: movsIds.flat(),
      },
      media: {
        valor: round2(valores.length ? valores.reduce((s, v) => s + v, 0) / valores.length : 0),
        av: null, ah: null, movimentos: [],
      },
    };
  };

  const linhas: LinhaRelatorio[] = estrutura.map((l) => {
    const acumulado = l.id === "saldo_inicial" || l.id === "saldo_final";
    const valores = valorDe.get(l.id) ?? colunas.map(() => 0);
    const movsIds = movsPorLinha.get(l.id) ?? colunas.map(() => []);
    const c = montaCelulas(valores, movsIds, acumulado);
    const filhos: LinhaRelatorio[] = Array.from(categorias.get(l.id) ?? [])
      .map(([nome, dados]) => {
        const cf = montaCelulas(dados.valores, dados.movs, false);
        return { id: `${l.id}:${nome}`, label: nome, nivel: 3 as const, sinal: l.sinal, tipo: "soma" as const, ...cf, filhos: [] };
      })
      .sort((a, b) => Math.abs(b.total.valor) - Math.abs(a.total.valor));
    return { id: l.id, label: l.label, nivel: 1, sinal: l.sinal, tipo: l.tipo, ...c, filhos };
  });

  /**
   * Uma coluna é "sem dado" quando NENHUM lançamento do recorte caiu nela — não
   * quando a soma dá zero. Um mês com +1.000 e −1.000 tem dado e resultado
   * zero, e dizer que ele está vazio seria falso.
   */
  const comLancamento = new Set<number>();
  for (const m of movs) {
    const k = indice.get(mesDe(dataDoRegime(m, f.regime)));
    if (k !== undefined) comLancamento.add(k);
  }
  const colunasSemDado = colunas.filter((_, k) => !comLancamento.has(k));

  return { colunas, linhas, base, colunasSemDado };
}

export const montarDRE = (input: RiskInput, f: Omit<FiltroRelatorio, "regime">): Relatorio =>
  montarRelatorio(input, ESTRUTURA_DRE, { ...f, regime: "competencia" });

/**
 * DFC parte do SALDO INICIAL do período. Como o saldo histórico não fica
 * guardado, reconstrói-se do saldo de hoje desfazendo o que foi liquidado a
 * partir do início do intervalo — a mesma técnica do painel financeiro, para os
 * dois fecharem no mesmo número.
 */
export function montarDFC(input: RiskInput, f: Omit<FiltroRelatorio, "regime">): Relatorio {
  const depois = input.movements
    .filter((m) => m.status === "pago" && (m.paid_date || m.due_date || "").slice(0, 10) >= f.intervalo.de)
    .reduce((s, m) => s + (m.type === "entrada" ? m.amount : -m.amount), 0);
  return montarRelatorio(input, ESTRUTURA_DFC, { ...f, regime: "caixa" }, round2(input.saldoAtual - depois));
}

/* ============================== consolidado ============================== */

export interface EntidadeRelatorio { id: string; nome: string; input: RiskInput }

export interface RelatorioConsolidado {
  colunas: string[];
  /** Uma coluna extra por empresa, além do consolidado. */
  empresas: { id: string; nome: string; relatorio: Relatorio }[];
  consolidado: Relatorio;
  /**
   * O que foi ELIMINADO por ser operação entre empresas do grupo — listado,
   * nunca só descontado. É por esta lista que o contador confere a diferença
   * entre o consolidado e a soma das partes.
   */
  eliminacoes: Eliminacao[];
}

/** Teto de 20 empresas — o mesmo do print, e um limite real de leitura. */
export const MAX_EMPRESAS = 20;

/* ------------------------- eliminações entre empresas ---------------------- */

/**
 * ⚠️ **CONSOLIDAR NÃO É SOMAR.** Somar os lançamentos de duas empresas do mesmo
 * grupo conta duas vezes o dinheiro que só andou entre elas: a holding fatura
 * serviço para a operadora, a operadora paga. No consolidado isso é receita da
 * holding, despesa da operadora — e **receita nenhuma do grupo**, porque nada
 * entrou vindo de fora. O grupo aparece maior do que é, e é justamente esse
 * número inflado que vai para o banco pedir crédito.
 *
 * A regra da eliminação, e por que ela é conservadora: só se elimina o par que
 * se reconhece com CERTEZA — mesmo valor, mesma competência (com tolerância de
 * dias), sentidos opostos, e as duas pontas sendo empresas DO GRUPO. Eliminar
 * por semelhança ("mesmo valor no mesmo mês") apagaria vendas legítimas a
 * terceiros que por acaso coincidem, e uma eliminação errada some com receita
 * real — erro pior que não eliminar, porque não deixa rastro na soma.
 */
export interface Eliminacao {
  /** Ids já prefixados por empresa, como no consolidado. */
  entrada: string;
  saida: string;
  valor: number;
  competencia: string;
  /** Quem com quem — a linha que o contador confere. */
  entre: string;
  motivo: string;
}

/** Tolerância de dias entre as duas pontas do mesmo fato. */
const DIAS_PAREAMENTO = 5;

const diasEntreISO = (a: string, b: string): number =>
  Math.abs(Math.round((Date.parse(`${a.slice(0, 10)}T00:00:00Z`) - Date.parse(`${b.slice(0, 10)}T00:00:00Z`)) / 86400000));

/**
 * Encontra os pares intercompany. `nomes` mapeia id da empresa → nome, e é ele
 * que define QUEM está no grupo: a contraparte de um lançamento só é
 * intercompany se o nome dela corresponde a outra empresa da consolidação.
 */
export function eliminacoesIntercompany(
  entidades: readonly EntidadeRelatorio[],
): Eliminacao[] {
  const normal = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
  const porNome = new Map(entidades.map((e) => [normal(e.nome), e.id]));

  interface Ponta { empresa: string; id: string; valor: number; data: string; alvo: string; tipo: "entrada" | "saida" }
  const pontas: Ponta[] = [];
  for (const e of entidades) {
    for (const m of e.input.movements) {
      if (m.status === "cancelado" || !m.due_date) continue;
      const contraparte = m.party_id ? (e.input.partyNames?.[m.party_id] ?? "") : "";
      const alvo = porNome.get(normal(contraparte)) ?? "";
      // A contraparte tem de ser OUTRA empresa da consolidação.
      if (!alvo || alvo === e.id) continue;
      pontas.push({ empresa: e.id, id: `${e.id}:${m.id}`, valor: Math.abs(m.amount), data: m.due_date.slice(0, 10), alvo, tipo: m.type });
    }
  }

  const nome = new Map(entidades.map((e) => [e.id, e.nome]));
  const usados = new Set<string>();
  const out: Eliminacao[] = [];
  for (const e of pontas.filter((p) => p.tipo === "entrada")) {
    if (usados.has(e.id)) continue;
    const par = pontas.find((s) =>
      s.tipo === "saida" && !usados.has(s.id)
      // O espelho: a saída sai da empresa que a entrada aponta, e aponta de volta.
      && s.empresa === e.alvo && s.alvo === e.empresa
      && Math.round(s.valor * 100) === Math.round(e.valor * 100)
      && diasEntreISO(s.data, e.data) <= DIAS_PAREAMENTO);
    if (!par) continue;
    usados.add(e.id); usados.add(par.id);
    out.push({
      entrada: e.id, saida: par.id, valor: e.valor, competencia: e.data,
      entre: `${nome.get(e.empresa) ?? e.empresa} ↔ ${nome.get(par.empresa) ?? par.empresa}`,
      motivo: "mesmo valor e competência, sentidos opostos, entre duas empresas da consolidação",
    });
  }
  return out;
}

/**
 * Consolida somando os RiskInput e rodando o MESMO motor: consolidar somando os
 * relatórios prontos dobraria a lógica e as duas somas divergiriam na primeira
 * regra nova.
 *
 * ⚠️ As eliminações são aplicadas ANTES do motor, removendo as duas pontas do
 * conjunto unido — e ficam LISTADAS na saída. Eliminar em silêncio produziria
 * um consolidado menor que a soma das partes sem nada que explique a diferença,
 * e a primeira pergunta do contador seria exatamente essa.
 */
export function montarConsolidado(
  entidades: EntidadeRelatorio[],
  estrutura: LinhaEstrutura[],
  f: FiltroRelatorio,
): RelatorioConsolidado {
  const usadas = entidades.slice(0, MAX_EMPRESAS);
  const eliminacoes = eliminacoesIntercompany(usadas);
  const removidos = new Set(eliminacoes.flatMap((e) => [e.entrada, e.saida]));
  const unido: RiskInput = {
    hoje: usadas[0]?.input.hoje ?? new Date().toISOString().slice(0, 10),
    saldoAtual: usadas.reduce((s, e) => s + e.input.saldoAtual, 0),
    // Prefixa o id com a empresa: dois movimentos com o mesmo id em orgs
    // diferentes se anulariam no drill-down.
    movements: usadas
      .flatMap((e) => e.input.movements.map((m) => ({ ...m, id: `${e.id}:${m.id}` })))
      .filter((m) => !removidos.has(m.id)),
    partyNames: Object.assign({}, ...usadas.map((e) => e.input.partyNames ?? {})),
    horizonDias: 60,
  };
  return {
    colunas: mesesDoIntervalo(f.intervalo),
    empresas: usadas.map((e) => ({ id: e.id, nome: e.nome, relatorio: montarRelatorio(e.input, estrutura, f) })),
    consolidado: montarRelatorio(unido, estrutura, f),
    eliminacoes,
  };
}

/* ============================ fechamento mensal ============================ */

export interface KpiFechamento { id: string; label: string; valor: number; formato: "moeda" | "pct"; variacao: number | null }
export interface PontoAtencao { id: string; titulo: string; texto: string; severidade: "alta" | "media" | "baixa" }

export interface Fechamento {
  id: string;
  mes: string;
  ano: number;
  comparativo: 3 | 6 | 12;
  emitidoPor: string;
  cargo: string;
  criadoEm: string;
  /** DRE comparativa do período — as colunas do relatório. */
  relatorio: Relatorio;
  kpis: KpiFechamento[];
  pontos: PontoAtencao[];
  /** Textos editáveis pelo autor antes de exportar. */
  textos: { resumo: string; destaques: string; recomendacoes: string };
}

const pct = (a: number, b: number): number | null => (b !== 0 ? round2(((a - b) / Math.abs(b)) * 100) : null);
const valorLinha = (r: Relatorio, id: string, col: number) =>
  r.linhas.find((l) => l.id === id)?.celulas[col]?.valor ?? 0;

/**
 * O relatório mensal: a DRE comparativa dos últimos N meses + KPIs do mês de
 * referência + os pontos de atenção derivados dos próprios números.
 *
 * Os textos saem prontos e EDITÁVEIS: a máquina redige o que os números dizem,
 * e quem assina ajusta. O contrário — pedir o texto em branco — faria o
 * relatório nascer vazio todo mês.
 */
export function montarFechamento(
  input: RiskInput,
  cfg: { mes: string; ano: number; comparativo: 3 | 6 | 12; emitidoPor: string; cargo: string },
): Fechamento {
  const mesRef = `${cfg.ano}-${pad(Number(cfg.mes))}`;
  const inicio = deslocarMes(mesRef, -(cfg.comparativo - 1));
  const relatorio = montarDRE(input, {
    intervalo: { de: `${inicio}-01`, ate: fimDoMes(mesRef) },
    tipo: "vertical",
  });
  const ultima = relatorio.colunas.length - 1;
  const anterior = ultima - 1;

  const kpiDe = (id: string, label: string, formato: "moeda" | "pct" = "moeda"): KpiFechamento => {
    const atual = valorLinha(relatorio, id, ultima);
    return {
      id, label, valor: atual, formato,
      variacao: anterior >= 0 ? pct(atual, valorLinha(relatorio, id, anterior)) : null,
    };
  };

  const receita = valorLinha(relatorio, "receita_bruta", ultima);
  const ebitda = valorLinha(relatorio, "ebitda", ultima);
  const liquido = valorLinha(relatorio, "resultado_liquido", ultima);

  const kpis: KpiFechamento[] = [
    kpiDe("receita_bruta", "Receita bruta"),
    kpiDe("receita_liquida", "Receita líquida"),
    kpiDe("margem_contribuicao", "Margem de contribuição"),
    kpiDe("ebitda", "EBITDA"),
    kpiDe("resultado_liquido", "Resultado líquido"),
    {
      id: "margem_ebitda", label: "Margem EBITDA", formato: "pct",
      valor: receita ? round2((ebitda / receita) * 100) : 0,
      variacao: null,
    },
  ];

  // Pontos de atenção derivados dos números — nada genérico.
  const pontos: PontoAtencao[] = [];
  if (liquido < 0) {
    pontos.push({
      id: "prejuizo", severidade: "alta", titulo: "Resultado líquido negativo",
      texto: `O mês fechou com prejuízo de ${brl(Math.abs(liquido))}. A prioridade é identificar qual linha da cascata consumiu o resultado — comece pelas Despesas Operacionais.`,
    });
  }
  if (receita > 0 && ebitda / receita < 0.1) {
    pontos.push({
      id: "margem", severidade: ebitda < 0 ? "alta" : "media", titulo: "Margem EBITDA abaixo de 10%",
      texto: `A operação converteu ${round2((ebitda / receita) * 100)}% da receita em EBITDA. Margem apertada deixa pouco espaço para absorver queda de faturamento.`,
    });
  }
  if (anterior >= 0) {
    const varReceita = pct(receita, valorLinha(relatorio, "receita_bruta", anterior));
    if (varReceita != null && varReceita < -10) {
      pontos.push({
        id: "queda", severidade: "alta", titulo: "Queda de receita contra o mês anterior",
        texto: `A receita bruta caiu ${Math.abs(varReceita).toFixed(1)}% contra o mês anterior. Verifique se a queda é sazonal ou perda de carteira.`,
      });
    }
    const despAtual = valorLinha(relatorio, "despesas_operacionais", ultima);
    const varDesp = pct(despAtual, valorLinha(relatorio, "despesas_operacionais", anterior));
    if (varDesp != null && varDesp > 15) {
      pontos.push({
        id: "despesa", severidade: "media", titulo: "Despesas operacionais em alta",
        texto: `As despesas operacionais subiram ${varDesp.toFixed(1)}% contra o mês anterior, enquanto a receita variou ${pct(receita, valorLinha(relatorio, "receita_bruta", anterior))?.toFixed(1) ?? "—"}%.`,
      });
    }
  }
  if (pontos.length === 0) {
    pontos.push({
      id: "ok", severidade: "baixa", titulo: "Sem alertas no período",
      texto: "Nenhum indicador da cascata saiu da faixa esperada no mês. Mantenha o acompanhamento mensal.",
    });
  }

  return {
    id: `f_${mesRef}_${Date.now().toString(36)}`,
    mes: cfg.mes, ano: cfg.ano, comparativo: cfg.comparativo,
    emitidoPor: cfg.emitidoPor, cargo: cfg.cargo,
    criadoEm: new Date().toISOString().slice(0, 10),
    relatorio, kpis, pontos,
    textos: {
      resumo: `No mês de referência a empresa apurou receita bruta de ${brl(receita)}, EBITDA de ${brl(ebitda)} e resultado líquido de ${brl(liquido)}. A análise a seguir cobre ${cfg.comparativo} meses e detalha cada linha da cascata de resultado.`,
      destaques: liquido >= 0
        ? `O resultado do período foi positivo em ${brl(liquido)}, com margem EBITDA de ${receita ? round2((ebitda / receita) * 100) : 0}% sobre a receita bruta.`
        : `O período fechou negativo em ${brl(Math.abs(liquido))}. A recuperação passa por receita ou por corte nas linhas de despesa detalhadas abaixo.`,
      recomendacoes: pontos.filter((p) => p.severidade !== "baixa").map((p) => `• ${p.titulo}: ${p.texto}`).join("\n")
        || "• Manter o acompanhamento mensal da cascata e revisar o orçamento do próximo trimestre.",
    },
  };
}

const brl = (n: number) => formatBRL(n);

/* ================================ orçamento ================================ */

export interface LinhaOrcada { id: string; valores: number[] }

export interface CelulaOrcamento { orcado: number; diferenca: number; pct: number | null }

/**
 * Compara realizado × orçado por linha e coluna. `null` no % quando não há
 * orçamento para a célula: 0% diria "bateu na mosca", que é o oposto de "não
 * foi orçado".
 */
export function compararOrcamento(r: Relatorio, orcado: LinhaOrcada[]): Map<string, CelulaOrcamento[]> {
  const mapa = new Map<string, CelulaOrcamento[]>();
  for (const l of r.linhas) {
    const o = orcado.find((x) => x.id === l.id);
    mapa.set(l.id, l.celulas.map((c, k) => {
      const prev = o?.valores[k] ?? 0;
      return {
        orcado: round2(prev),
        diferenca: round2(c.valor - prev),
        pct: prev !== 0 ? round2(((c.valor - prev) / Math.abs(prev)) * 100) : null,
      };
    }));
  }
  return mapa;
}
