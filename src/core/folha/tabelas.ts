/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AS TABELAS LEGAIS DA FOLHA — e a regra de que elas VENCEM.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **Uma tabela de INSS desatualizada produz um número que parece certo.**
 *
 * Este é o defeito mais caro que um módulo de folha pode ter, e ele é
 * silencioso por natureza: as faixas do INSS e do IRRF mudam por lei todo ano,
 * o cálculo continua rodando com a tabela velha, e o resultado sai com duas
 * casas decimais e ar de exatidão. Ninguém desconfia de um número bem
 * formatado — descobre-se no fechamento, ou pior, numa autuação.
 *
 * Por isso as tabelas aqui **têm data de vigência** e o cálculo **declara qual
 * usou**. Quando a competência pedida é posterior à última tabela conhecida, o
 * motor não inventa: ele usa a última e marca o resultado como
 * `tabelaDesatualizada`, e a tela mostra isso ao lado do valor. É a mesma
 * disciplina da ONDA 4 — o que o sistema não sabe, ele diz que não sabe — só
 * que aplicada a uma regra que muda por fora do produto.
 *
 * ⚠️ **As tabelas são EDITÁVEIS de propósito.** O contador de cada empresa
 * recebe a atualização antes de qualquer software; travar os valores no código
 * transformaria cada mudança de lei numa publicação. O que o sistema garante é
 * a aritmética e o vencimento, não a alíquota — a mesma decisão já registrada
 * na tela de impostos sobre vendas.
 *
 * Puro, tipado, sem I/O e sem relógio. Versão `folha-tabelas/1.0.0`.
 */

export const TABELAS_VERSION = "folha-tabelas/1.0.0";

/* ========================================================================== */
/* INSS — contribuição do EMPREGADO, progressiva por faixa                     */
/* ========================================================================== */

export interface FaixaINSS {
  /** Teto da faixa, em reais. */
  ate: number;
  /** Alíquota da faixa (0.075 = 7,5%). */
  aliquota: number;
}

export interface TabelaINSS {
  /** Primeira competência em que vale, "YYYY-MM". */
  desde: string;
  /** De onde saiu — o rótulo que a tela mostra. */
  fonte: string;
  faixas: FaixaINSS[];
  /** Salário mínimo vigente — base do vale-transporte e do piso. */
  salarioMinimo: number;
}

/**
 * ⚠️ **A progressividade é POR FAIXA, não por alíquota única.**
 *
 * Quem ganha R$ 5.000 não paga 14% sobre 5.000: paga 7,5% sobre a primeira
 * faixa, 9% sobre o que passa dela, e assim por diante. Aplicar a alíquota da
 * faixa sobre o salário inteiro — que é o erro intuitivo — desconta quase o
 * dobro do devido, e o empregado recebe a menos.
 */
export const TABELAS_INSS: TabelaINSS[] = [
  {
    desde: "2024-01",
    fonte: "Portaria Interministerial MPS/MF 2/2024",
    salarioMinimo: 1412,
    faixas: [
      { ate: 1412.00, aliquota: 0.075 },
      { ate: 2666.68, aliquota: 0.09 },
      { ate: 4000.03, aliquota: 0.12 },
      { ate: 7786.02, aliquota: 0.14 },
    ],
  },
  {
    desde: "2025-01",
    fonte: "Portaria Interministerial MPS/MF 6/2025",
    salarioMinimo: 1518,
    faixas: [
      { ate: 1518.00, aliquota: 0.075 },
      { ate: 2793.88, aliquota: 0.09 },
      { ate: 4190.83, aliquota: 0.12 },
      { ate: 8157.41, aliquota: 0.14 },
    ],
  },
];

/* ========================================================================== */
/* IRRF — imposto de renda retido na fonte                                     */
/* ========================================================================== */

export interface FaixaIRRF {
  ate: number;
  aliquota: number;
  /** A parcela a deduzir do imposto apurado. */
  deduzir: number;
}

/**
 * O REDUTOR da Lei 15.270/2025 — a isenção até R$ 5.000 por mês.
 *
 * ⚠️ **A reforma de 2025 NÃO mexeu nas faixas.** A leitura intuitiva de
 * "isento até cinco mil" é que a primeira faixa virou R$ 5.000 — e não virou. A
 * tabela mensal continua a mesma; o que entrou foi um ABATIMENTO sobre o
 * imposto já apurado, que zera em R$ 5.000 e se dissolve linearmente até
 * R$ 7.350. Reescrever as faixas para "chegar no mesmo lugar" acertaria os dois
 * extremos e erraria todo mundo no meio da rampa, que é justamente a faixa onde
 * mora o assalariado de PME.
 *
 * `redutor = max(0, base − fator × rendimento)`, e o resultado é subtraído do
 * imposto (nunca abaixo de zero — o redutor abate, não devolve).
 */
export interface RedutorIRRF {
  /** O intercepto da reta. */
  base: number;
  /** O coeficiente angular — quanto o abatimento cai por real de rendimento. */
  fator: number;
  /** Rendimento a partir do qual o abatimento acaba. */
  ate: number;
  fonte: string;
}

export interface TabelaIRRF {
  desde: string;
  fonte: string;
  faixas: FaixaIRRF[];
  /** Dedução por dependente, por mês. */
  porDependente: number;
  /**
   * O desconto simplificado mensal.
   *
   * ⚠️ Ele é uma ALTERNATIVA às deduções legais, não um acréscimo: aplica-se o
   * que for MAIS VANTAJOSO para o contribuinte. Somar os dois — o erro fácil —
   * reduz o imposto abaixo do devido e a diferença aparece na declaração anual
   * do empregado, não na empresa.
   */
  descontoSimplificado: number;
  /** Ausente até 2025; a partir de 2026 é o que produz a isenção até 5 mil. */
  redutor?: RedutorIRRF | null;
}

export const TABELAS_IRRF: TabelaIRRF[] = [
  {
    desde: "2024-02",
    fonte: "Lei 14.848/2024",
    porDependente: 189.59,
    descontoSimplificado: 564.80,
    faixas: [
      { ate: 2259.20, aliquota: 0, deduzir: 0 },
      { ate: 2826.65, aliquota: 0.075, deduzir: 169.44 },
      { ate: 3751.05, aliquota: 0.15, deduzir: 381.44 },
      { ate: 4664.68, aliquota: 0.225, deduzir: 662.77 },
      { ate: Infinity, aliquota: 0.275, deduzir: 896.00 },
    ],
  },
  {
    desde: "2025-05",
    fonte: "Lei 15.191/2025 (isenção até 2 salários mínimos)",
    porDependente: 189.59,
    descontoSimplificado: 607.20,
    faixas: [
      { ate: 2428.80, aliquota: 0, deduzir: 0 },
      { ate: 2826.65, aliquota: 0.075, deduzir: 182.16 },
      { ate: 3751.05, aliquota: 0.15, deduzir: 394.16 },
      { ate: 4664.68, aliquota: 0.225, deduzir: 675.49 },
      { ate: Infinity, aliquota: 0.275, deduzir: 908.73 },
    ],
  },
  {
    /**
     * ⚠️ A MUDANÇA QUE MAIS MEXE NO CONTRACHEQUE DE UMA PME.
     *
     * Quase todo salário de PME cai abaixo de R$ 5.000, e a partir de 01/01/2026
     * todos eles retêm ZERO de IRRF. Uma folha que continuasse rodando com a
     * tabela de 2025 descontaria imposto de quem a lei isentou — dinheiro
     * retirado do funcionário todo mês, que ele só recupera na declaração do ano
     * seguinte, se souber pedir.
     *
     * As faixas são as MESMAS de 2025-05, de propósito: a lei não as alterou.
     */
    desde: "2026-01",
    fonte: "Lei 15.270/2025 (isenção efetiva até R$ 5.000 pelo redutor)",
    porDependente: 189.59,
    descontoSimplificado: 607.20,
    faixas: [
      { ate: 2428.80, aliquota: 0, deduzir: 0 },
      { ate: 2826.65, aliquota: 0.075, deduzir: 182.16 },
      { ate: 3751.05, aliquota: 0.15, deduzir: 394.16 },
      { ate: 4664.68, aliquota: 0.225, deduzir: 675.49 },
      { ate: Infinity, aliquota: 0.275, deduzir: 908.73 },
    ],
    redutor: {
      base: 978.62,
      fator: 0.133145,
      ate: 7350,
      fonte: "Lei 15.270/2025",
    },
  },
];

/* ========================================================================== */
/* A escolha da tabela — e o aviso quando ela venceu                           */
/* ========================================================================== */

/**
 * O par de tabelas que um cálculo usa.
 *
 * ⚠️ **Elas entram por PARÂMETRO, não por estado de módulo.** A tentação é
 * deixar o app "registrar" a tabela nova numa variável que o motor lê — e aí o
 * resultado de `calcularCLT` passa a depender de algo que não está na chamada:
 * o mesmo colaborador, na mesma competência, dá números diferentes conforme o
 * que rodou antes. Um motor de folha auditável não pode ter memória escondida.
 */
export interface TabelasLegais {
  inss: TabelaINSS[];
  irrf: TabelaIRRF[];
}

/** As tabelas que vêm no produto — o ponto de partida de toda empresa. */
export const TABELAS_PADRAO: TabelasLegais = { inss: TABELAS_INSS, irrf: TABELAS_IRRF };

export interface TabelaEscolhida<T> {
  tabela: T;
  /**
   * A competência pedida é POSTERIOR à última tabela conhecida.
   *
   * ⚠️ Não é erro: é o estado normal de todo janeiro, até alguém atualizar. O
   * que não pode é passar despercebido — o número sai igualzinho a um número
   * certo.
   */
  desatualizada: boolean;
  /** Quantos meses além da última tabela conhecida. */
  mesesDeAtraso: number;
}

/** Diferença em meses entre duas competências "YYYY-MM". */
export function mesesEntre(de: string, ate: string): number {
  const [a1, m1] = de.split("-").map(Number);
  const [a2, m2] = ate.split("-").map(Number);
  return (a2 - a1) * 12 + (m2 - m1);
}

function escolher<T extends { desde: string }>(tabelas: T[], competencia: string): TabelaEscolhida<T> {
  const ordenadas = [...tabelas].sort((a, b) => a.desde.localeCompare(b.desde));
  // A última tabela cuja vigência começou até a competência pedida.
  const validas = ordenadas.filter((t) => t.desde <= competencia);
  // ⚠️ Competência ANTERIOR a toda tabela conhecida cai na mais antiga, e isso
  // também é um desalinhamento — mas para trás. Marcar só o futuro deixaria um
  // recálculo de 2019 sair com a tabela de 2025 sem nenhum aviso.
  const tabela = validas[validas.length - 1] ?? ordenadas[0];
  const ultima = ordenadas[ordenadas.length - 1];
  const atraso = mesesEntre(ultima.desde, competencia);

  /**
   * ⚠️ **"DESATUALIZADA" É SOBRE EXTRAPOLAR, NÃO SOBRE SER ANTIGA.**
   *
   * A primeira versão marcava `tabela !== ultima` — qualquer competência que
   * não usasse a tabela mais nova. Funcionou enquanto a mais nova era também a
   * vigente. No instante em que entrou uma vigência de 2026, todo recálculo de
   * 2025 passou a ser acusado, e ele está CERTO: a folha de junho de 2025 se
   * calcula com a tabela de 2025, não com a do ano seguinte.
   *
   * Uma guarda que acusa o cálculo correto é uma guarda que se aprende a
   * ignorar — e é justamente o aviso que precisa ser levado a sério em janeiro.
   *
   * A pergunta certa é: **a competência pedida está além do que se conhece?**
   * O corte é o ANO, porque é essa a cadência da lei: as faixas do INSS mudam
   * por portaria todo janeiro. Uma tabela de 2025 aplicada a qualquer mês de
   * 2026 está velha; aplicada a dezembro de 2025, está certa.
   */
  const anoDaCompetencia = Number(competencia.slice(0, 4));
  const anoDaUltima = Number(ultima.desde.slice(0, 4));
  const antesDeTudo = competencia < ordenadas[0].desde;
  const alemDoConhecido = Number.isFinite(anoDaCompetencia) && anoDaCompetencia > anoDaUltima;

  return {
    tabela,
    desatualizada: antesDeTudo || alemDoConhecido,
    mesesDeAtraso: Math.max(0, atraso),
  };
}

export const inssDe = (competencia: string, t: TabelasLegais = TABELAS_PADRAO) =>
  escolher(t.inss.length ? t.inss : TABELAS_INSS, competencia);
export const irrfDe = (competencia: string, t: TabelasLegais = TABELAS_PADRAO) =>
  escolher(t.irrf.length ? t.irrf : TABELAS_IRRF, competencia);

/* ========================================================================== */
/* Os cálculos das duas tabelas                                                */
/* ========================================================================== */

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * INSS do empregado, progressivo por faixa, limitado ao teto.
 *
 * ⚠️ O TETO é o teto da ÚLTIMA faixa: acima dele a contribuição não cresce.
 * Sem o corte, um salário de R$ 30.000 descontaria R$ 4.200 de INSS — três
 * vezes o devido, direto do contracheque de quem mais ganha.
 */
export function inssEmpregado(bruto: number, t: TabelaINSS): number {
  let restante = Math.max(0, bruto);
  let anterior = 0;
  let total = 0;
  for (const f of t.faixas) {
    const naFaixa = Math.min(restante, f.ate - anterior);
    if (naFaixa <= 0) break;
    total += naFaixa * f.aliquota;
    restante -= naFaixa;
    anterior = f.ate;
  }
  return round2(total);
}

/** O teto de contribuição: o que quem ganha acima do teto paga. */
export function tetoINSS(t: TabelaINSS): number {
  return inssEmpregado(t.faixas[t.faixas.length - 1].ate, t);
}

export interface ResultadoIRRF {
  base: number;
  /** O imposto DEPOIS do redutor — é este que se retém. */
  imposto: number;
  /** O que a tabela apurou antes do abatimento. */
  impostoDaTabela: number;
  /** Quanto o redutor abateu (0 quando a tabela não tem redutor). */
  redutor: number;
  /** `simplificado` quando o desconto único venceu as deduções legais. */
  criterio: "legal" | "simplificado";
  aliquotaEfetiva: number;
}

/**
 * IRRF sobre o salário, pelo critério MAIS VANTAGEM para o empregado.
 *
 * ⚠️ Duas bases concorrem, e a lei manda usar a menor: a **legal** (bruto −
 * INSS − dependentes − pensão) e a **simplificada** (bruto − desconto único).
 * Calcular só a legal cobra imposto a mais de quem tem poucos dependentes;
 * calcular só a simplificada cobra a mais de quem tem muitos. As duas rodam, e
 * ganha a que resulta em menos imposto.
 */
export function irrfEmpregado(
  bruto: number, inss: number, dependentes: number, pensao: number, t: TabelaIRRF,
): ResultadoIRRF {
  const aplicar = (base: number) => {
    const f = t.faixas.find((x) => base <= x.ate) ?? t.faixas[t.faixas.length - 1];
    return Math.max(0, round2(base * f.aliquota - f.deduzir));
  };
  const baseLegal = Math.max(0, bruto - inss - dependentes * t.porDependente - pensao);
  const baseSimples = Math.max(0, bruto - t.descontoSimplificado - pensao);
  const impostoLegal = aplicar(baseLegal);
  const impostoSimples = aplicar(baseSimples);
  const simplificadoVence = impostoSimples < impostoLegal;
  const base = simplificadoVence ? baseSimples : baseLegal;
  const impostoDaTabela = simplificadoVence ? impostoSimples : impostoLegal;

  /**
   * ⚠️ O redutor entra DEPOIS da escolha do critério, sobre o imposto apurado —
   * não sobre a base. Abatê-lo da base o faria valer 27,5% do próprio valor
   * para quem está no topo e 7,5% para quem está embaixo, quando a lei o define
   * em reais de imposto, iguais para todos.
   *
   * E ele nunca vira crédito: `max(0, …)`. Um redutor maior que o imposto
   * significa isento, não restituição na folha.
   */
  const redutor = t.redutor
    ? Math.max(0, round2(t.redutor.base - t.redutor.fator * Math.max(0, bruto)))
    : 0;
  const imposto = Math.max(0, round2(impostoDaTabela - redutor));

  return {
    base: round2(base),
    imposto,
    impostoDaTabela,
    redutor: Math.min(redutor, impostoDaTabela),
    criterio: simplificadoVence ? "simplificado" : "legal",
    aliquotaEfetiva: bruto > 0 ? Math.round((imposto / bruto) * 10000) / 10000 : 0,
  };
}
