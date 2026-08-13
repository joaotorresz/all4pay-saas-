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
import { montarDRE, type FiltroRelatorio, type Relatorio } from "./index";
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
  /** O relatório inteiro, para quem precisa das colunas e do drill-down. */
  relatorio: Relatorio;
}

/**
 * O filtro da cascata — o MESMO do relatório, sem o regime (a DRE é sempre
 * competência). `tipo` é a análise (vertical/horizontal) e não muda os valores.
 */
export type FiltroCascata = Omit<FiltroRelatorio, "regime" | "tipo">
  & Partial<Pick<FiltroRelatorio, "tipo">>;

const jan = (f: FiltroCascata): Janela => ({
  de: f.intervalo.de, ate: f.intervalo.ate,
  label: "Período do relatório",
  vazia: f.intervalo.de > f.intervalo.ate,
  motivo: f.intervalo.de > f.intervalo.ate
    ? "a data inicial está depois da final" : undefined,
  contemHoje: false,
} as Janela);

const REGIME: Regime = "competencia";

function indicador(
  valor: number, j: Janela, formula: string,
  lancamentos: number, movimentos: readonly string[], natureza: Natureza,
): Indicador {
  return {
    valor,
    procedencia: { lancamentos, regime: REGIME, janela: j, formula, natureza, movimentos },
  };
}

function ausente(
  j: Janela, formula: string,
  codigo: MotivoIndisponivel,
  motivo: string, comoResolver?: string,
): Indicador {
  return {
    valor: 0,
    indisponivel: { codigo, motivo, comoResolver },
    procedencia: { lancamentos: 0, regime: REGIME, janela: j, formula, natureza: "fato" },
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
  // ⚠️ `montarDRE` é EXATAMENTE a chamada que desenha a tabela desta tela
  // (`DemonstrativoView`). Não é "a mesma aritmética"; é a mesma função.
  const relatorio = montarDRE(input, { tipo: "vertical", ...filtro });

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
        j.motivo ?? "o período pedido não existe",
        "Corrija as datas: a data inicial está depois da final.");
      continue;
    }
    if (!l) {
      // Não deve acontecer — mas devolver 0 calado seria afirmar que a linha
      // vale zero, quando a verdade é que ela não foi encontrada.
      linhas[id] = ausente(j, rotulo, "sem_base", "linha ausente na estrutura do relatório");
      continue;
    }
    if (semLancamento) {
      linhas[id] = ausente(j, rotulo, "sem_lancamentos", "nenhum lançamento no período",
        "Escolha outro período, ou importe o extrato se o movimento existiu e não entrou.");
      continue;
    }
    const movs = l.total.movimentos ?? [];
    linhas[id] = indicador(l.total.valor, j, rotulo, movs.length, movs, natureza(movs));
  }

  /* ── A margem, com a guarda de denominador ────────────────────────────── */
  const rl = linhas.receita_liquida, eb = linhas.ebitda;
  const formulaMargem = "EBITDA ÷ receita líquida";
  const margemEbitda: Indicador =
    rl.indisponivel
      ? ausente(j, formulaMargem, rl.indisponivel.codigo, rl.indisponivel.motivo, rl.indisponivel.comoResolver)
      : rl.valor === 0
        ? ausente(j, formulaMargem, "sem_base",
            "não houve receita líquida no período",
            "Sem receita não existe margem — o percentual só passa a existir quando houver faturamento.")
        : indicador(eb.valor / rl.valor, j, formulaMargem,
            rl.procedencia.lancamentos, rl.procedencia.movimentos ?? [],
            eb.procedencia.natureza);

  return { linhas, margemEbitda, relatorio };
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
