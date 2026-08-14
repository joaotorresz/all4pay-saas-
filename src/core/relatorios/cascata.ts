/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A CASCATA DO DRE — UM selector, duas renderizações
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **O defeito que este módulo existe para matar.** A tela `/dashboard/reports/dre`
 * tinha DOIS caminhos para os mesmos números: os cartões do topo saíam de
 * `painelResultado` (`core/indicadores/resultado`) e a tabela de
 * `montarRelatorio` + `ESTRUTURA_DRE`. Eles discordavam.
 *
 * A causa, medida: a base dos cartões somava **toda entrada** em `receita` —
 * inclusive a receita FINANCEIRA (juros, rendimento de aplicação) — e todas as
 * linhas da cascata partiam desse total. A tabela, ao contrário, sempre excluiu
 * o financeiro da Receita Bruta (`entrada(m) && !ehFinanceiro(m)`) e o
 * apresentou na linha própria, depois do EBITDA. Resultado: **Receita Líquida
 * e EBITDA dos cartões vinham inflados exatamente pela receita financeira do
 * período.**
 *
 * ⚠️ **O que vaza é a RECEITA financeira, não o Resultado Financeiro.** Medido
 * injetando R$ 500.000 de juros numa base real: a divergência foi de
 * R$ 500.000,00 exatos, enquanto a linha Resultado Financeiro marcava
 * R$ 498.706,35 (os mesmos 500 mil menos R$ 1.293,65 de despesa financeira). Do
 * lado da DESPESA os dois caminhos já concordavam. Quem "corrigisse" subtraindo
 * o resultado financeiro LÍQUIDO erraria pelo valor da despesa — e o erro
 * ficaria pequeno o bastante para ninguém notar.
 *
 * ⚠️ **Por que o Lucro Líquido batia, e por que isso escondia o defeito.** Os
 * cartões somavam a receita financeira lá em cima e subtraíam a despesa
 * financeira lá embaixo; a tabela deixava as duas na linha do meio. Os dois
 * chegam ao MESMO lucro líquido por caminhos diferentes. O número que fecha no
 * fim é justamente o que faz a divergência do meio parecer impossível.
 *
 * ⚠️ **A guarda que existia não pegava**: a LINHA 31c compara a cascata
 * canônica com `dreGerencial` — e os dois compartilhavam a mesma base errada
 * (`core/dre/engine.ts`, `receita += m.amount` para toda entrada). Duas
 * implementações erradas do mesmo jeito concordam perfeitamente.
 *
 * **A solução não é "duas implementações que concordam", é UMA.** Este módulo
 * chama `montarDRE` — a MESMA função que desenha a tabela desta tela, sobre a
 * `ESTRUTURA_DRE` que o contador reconhece, com as linhas "=" saindo de FÓRMULA
 * sobre as outras e nunca de soma direta — e devolve as 13 linhas. Os cartões
 * leem daqui; a tabela É isto. Elas não têm como divergir porque não há duas
 * contas: há uma conta e dois desenhos.
 */
import { montarRelatorio, ESTRUTURA_DRE, type FiltroRelatorio, type Relatorio } from "./index";
import { liquidado } from "@/core/indicadores/convencoes";
import type { RiskInput } from "@/core/risk-engine/types";
import type {
  Indicador, Janela, Regime, Natureza, MotivoIndisponivel,
} from "@/core/indicadores";

/** As 13 linhas, na ordem em que o relatório as apresenta. */
export const LINHAS_CASCATA = [
  "receita_bruta", "deducoes", "receita_liquida",
  "custos_variaveis", "lucro_bruto",
  "despesas_variaveis", "margem_contribuicao",
  "despesas_operacionais", "ebitda",
  // ⚠️ D&A e EBIT já eram CALCULADOS pela `ESTRUTURA_DRE` e não eram
  // PUBLICADOS aqui — a lista parava no EBITDA. Expor não é inventar campo, é
  // devolver o que a estrutura já produz. Sem eles, quem consome a cascata
  // precisava reconstruir o EBIT por fora, que é a porta pela qual a próxima
  // agregação paralela entra.
  "depreciacao_amortizacao", "ebit",
  "resultado_financeiro", "impostos_lucro", "nao_operacional",
  "resultado_liquido",
] as const;

export type LinhaCascata = (typeof LINHAS_CASCATA)[number];

export interface CascataDRE {
  /** Uma entrada por linha da estrutura, com o total do período. */
  linhas: Record<LinhaCascata, Indicador>;
  /**
   * EBITDA ÷ Receita Líquida.
   *
   * ⚠️ **Indisponível quando a receita líquida é zero** — e este é o caso
   * perigoso. "Margem de 0%" lê como *vendeu e não sobrou nada*; a verdade, num
   * período sem faturamento, é *não vendeu*. As duas mandam fazer coisas
   * opostas: cortar custo × vender. Um percentual é a única grandeza em que o
   * zero da ausência e o zero do desastre são graficamente idênticos.
   */
  margemEbitda: Indicador;
  /** Lucro Bruto ÷ Receita Líquida — mesma guarda de denominador. */
  margemBruta: Indicador;
  /** Resultado Líquido ÷ Receita Líquida — mesma guarda de denominador. */
  margemLiquida: Indicador;
  /** O regime sob o qual ESTES números foram apurados. */
  regime: Regime;
  /** O relatório inteiro, para quem precisa das colunas e do drill-down. */
  relatorio: Relatorio;
}

/**
 * O filtro da cascata — o MESMO do relatório. `tipo` é a análise
 * (vertical/horizontal) e não muda os valores.
 *
 * ⚠️ **`regime` é OBRIGATÓRIO e não tem padrão.** A cascata passou a servir as
 * duas leituras (competência para o DRE, caixa para a visão gerencial), e uma
 * função canônica com duas personalidades é onde nasce o próximo defeito. Com
 * valor padrão, alguém chama sem pensar e recebe o regime errado em silêncio —
 * a mesma classe do `is_sample`, que se resolveu fazendo o filtro EXCLUIR por
 * omissão. A decisão tem de ser explícita no ponto da chamada.
 */
export type FiltroCascata = Omit<FiltroRelatorio, "tipo">
  & Partial<Pick<FiltroRelatorio, "tipo">>;

const jan = (f: FiltroCascata): Janela => ({
  de: f.intervalo.de, ate: f.intervalo.ate,
  label: "Período do relatório",
  vazia: f.intervalo.de > f.intervalo.ate,
  motivo: f.intervalo.de > f.intervalo.ate
    ? "a data inicial está depois da final" : undefined,
  contemHoje: false,
} as Janela);

function indicador(
  valor: number, j: Janela, formula: string,
  lancamentos: number, movimentos: readonly string[], natureza: Natureza,
  regime: Regime,
): Indicador {
  return {
    valor,
    procedencia: { lancamentos, regime, janela: j, formula, natureza, movimentos },
  };
}

function ausente(
  j: Janela, formula: string,
  codigo: MotivoIndisponivel,
  motivo: string, regime: Regime, comoResolver?: string,
): Indicador {
  return {
    valor: 0,
    indisponivel: { codigo, motivo, comoResolver },
    procedencia: { lancamentos: 0, regime, janela: j, formula, natureza: "fato" },
  };
}

/**
 * A cascata inteira do DRE sobre um período.
 *
 * ⚠️ **`semAmostra` não é aplicado aqui, e é de propósito.** Este módulo é
 * puro e não fala com o banco: ele recebe os movimentos já lidos. O filtro de
 * demonstração vive no acesso a dados (`lib/supabase/consulta.semAmostra`), que
 * exclui por omissão — então o `RiskInput` que chega aqui já vem sem amostra,
 * por construção, em todo caminho do produto. Repetir o filtro aqui daria a
 * impressão de que ele é opcional lá, que é o oposto do desenho.
 */
export function cascataDRE(input: RiskInput, filtro: FiltroCascata): CascataDRE {
  const j = jan(filtro);
  const regime = filtro.regime;
  // ⚠️ `montarRelatorio` sobre a `ESTRUTURA_DRE` é EXATAMENTE a chamada que
  // desenha a tabela do relatório. Não é "a mesma aritmética"; é a mesma
  // função. (Era `montarDRE`, que fixava competência; com o regime virando
  // parâmetro, ele deixou de servir — mas a estrutura é a mesma.)
  const relatorio = montarRelatorio(input, ESTRUTURA_DRE, { tipo: "vertical", ...filtro });

  // A natureza sai dos próprios lançamentos contados: se algum ainda não foi
  // liquidado, o número fala de expectativa, não de fato.
  const porId = new Map(input.movements.map((m) => [m.id, m]));
  const natureza = (ids: readonly string[]): Natureza =>
    ids.some((id) => { const m = porId.get(id); return m ? !liquidado(m) : false; })
      ? "projecao" : "fato";

  const linhas = {} as Record<LinhaCascata, Indicador>;
  const semLancamento = relatorio.linhas
    .every((l) => (l.total.movimentos?.length ?? 0) === 0);

  for (const id of LINHAS_CASCATA) {
    const l = relatorio.linhas.find((x) => x.id === id);
    const rotulo = l?.label ?? id;
    if (j.vazia) {
      linhas[id] = ausente(j, rotulo, "janela_invalida",
        j.motivo ?? "o período pedido não existe", regime,
        "Corrija as datas: a data inicial está depois da final.");
      continue;
    }
    if (!l) {
      // Não deve acontecer — mas devolver 0 calado seria afirmar que a linha
      // vale zero, quando a verdade é que ela não foi encontrada.
      linhas[id] = ausente(j, rotulo, "sem_base", "linha ausente na estrutura do relatório", regime);
      continue;
    }
    if (semLancamento) {
      linhas[id] = ausente(j, rotulo, "sem_lancamentos", "nenhum lançamento no período", regime,
        "Escolha outro período, ou importe o extrato se o movimento existiu e não entrou.");
      continue;
    }
    const movs = l.total.movimentos ?? [];
    linhas[id] = indicador(l.total.valor, j, rotulo, movs.length, movs, natureza(movs), regime);
  }

  /* ── As margens, com a guarda de denominador ──────────────────────────── */
  /*
   * ⚠️ **Nenhuma margem cai num denominador falso.** O caminho antigo do
   * `dreGerencial` usava `base = receitaLiquida > 0 ? receitaLiquida : 1` — e
   * dividir por 1 não é "aproximar": é apresentar o valor ABSOLUTO em reais com
   * um símbolo de porcentagem ao lado. Um EBITDA de −R$ 30.000 virava "−3.000.000%".
   * Sem receita não existe margem, e é isso que o indicador passa a dizer.
   */
  const rl = linhas.receita_liquida;
  const razao = (num: Indicador, formula: string): Indicador =>
    rl.indisponivel
      ? ausente(j, formula, rl.indisponivel.codigo, rl.indisponivel.motivo, regime, rl.indisponivel.comoResolver)
      : rl.valor === 0
        /*
         * ⚠️ O texto é parte da correção, não decoração. Ele precisa afastar
         * a leitura de "margem negativa": ter despesa e nenhuma receita é
         * PREJUÍZO, e prejuízo não tem margem — margem é uma razão SOBRE a
         * receita. Esta frase vinha de `core/indicadores/resultado`; ao migrar
         * aquele módulo para cá, ela veio junto, senão a migração teria trocado
         * uma explicação boa por uma curta.
         */
        ? ausente(j, formula, "sem_base",
            "não houve receita no período — margem é uma razão sobre a receita, e sem ela não existe", regime,
            "Escolha um período com faturamento. Ter despesa e nenhuma receita é prejuízo, não margem negativa.")
        : indicador(num.valor / rl.valor, j, formula,
            rl.procedencia.lancamentos, rl.procedencia.movimentos ?? [],
            num.procedencia.natureza, regime);

  const margemEbitda = razao(linhas.ebitda, "EBITDA ÷ receita líquida");
  const margemBruta = razao(linhas.lucro_bruto, "lucro bruto ÷ receita líquida");
  const margemLiquida = razao(linhas.resultado_liquido, "resultado líquido ÷ receita líquida");

  return { linhas, margemEbitda, margemBruta, margemLiquida, regime, relatorio };
}

/* ========================================================================== */
/* AS REGRAS, EM CÓDIGO                                                       */
/* ========================================================================== */

/**
 * As identidades que a cascata tem de respeitar, para a guarda cobrar.
 *
 * ⚠️ Elas moram AQUI e não no teste porque uma regra que só existe no teste é
 * uma regra que ninguém lê ao escrever a próxima tela. Cada entrada devolve a
 * diferença; zero é o esperado.
 */
export const REGRAS_CASCATA: {
  nome: string;
  porque: string;
  diferenca: (c: CascataDRE) => number;
}[] = [
  {
    nome: "Receita Líquida = Receita Bruta − Deduções",
    porque: "a linha '=' sai de fórmula sobre as outras, nunca de soma direta — é o que impede um valor entrar duas vezes",
    diferenca: (c) => c.linhas.receita_liquida.valor
      - (c.linhas.receita_bruta.valor - c.linhas.deducoes.valor),
  },
  {
    nome: "EBITDA = Margem de Contribuição − Despesas Operacionais",
    porque: "EBITDA é resultado OPERACIONAL: tudo que vem depois dele na cascata está, por definição, fora dele",
    diferenca: (c) => c.linhas.ebitda.valor
      - (c.linhas.margem_contribuicao.valor - c.linhas.despesas_operacionais.valor),
  },
  {
    nome: "O Resultado Financeiro NÃO entra na Receita Bruta",
    porque: "é o defeito original: os cartões somavam a receita financeira dentro da receita, inflando Receita Líquida e EBITDA pelo valor exato dos juros do período",
    // Se o financeiro tivesse entrado na receita, a identidade acima quebraria
    // — mas ela pode fechar com os dois lados errados. O que fixa a regra é o
    // EBITDA não se mover quando SÓ o financeiro muda, e é isso que a guarda
    // de contrato mede plantando um juros grande.
    diferenca: (c) => c.linhas.resultado_liquido.valor
      - (c.linhas.ebitda.valor + c.linhas.resultado_financeiro.valor
        - c.linhas.impostos_lucro.valor + c.linhas.nao_operacional.valor),
  },
];
