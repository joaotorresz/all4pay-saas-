/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OS TRÊS MODOS DE LANÇAR UMA CONTA A PAGAR — e o que cada um cria.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Antes existia UM modo com uma caixinha "repetir lançamento" pendurada no pé
 * da tela. A caixinha escondia a única pergunta que muda tudo: **este valor é
 * o de cada vez, ou é o total?**
 *
 *  - **Conta única** — um título, um vencimento. O valor é o valor.
 *  - **Conta recorrente** — um compromisso que se repete. O valor é o de CADA
 *    ocorrência: aluguel de R$ 4.000 por 12 meses são R$ 48.000 de compromisso.
 *  - **Compra parcelada** — uma compra só, dividida. O valor é o TOTAL: uma
 *    compra de R$ 4.000 em 12x são R$ 4.000, e cada parcela é R$ 333,33.
 *
 * ⚠️ **É por isso que os dois não podem ser o mesmo controle.** Com uma
 * caixinha "repetir" e um campo "valor", o mesmo par de números — 4.000 e 12 —
 * significa R$ 48.000 num caso e R$ 4.000 no outro, e nada na tela dizia qual.
 * Quem lançava uma compra parcelada como recorrência multiplicava a própria
 * dívida por doze no fluxo de caixa.
 *
 * ⚠️ **A COMPETÊNCIA NÃO SE PARCELA.** Comprar em março para pagar em 6x é uma
 * despesa de março inteira — o DRE lê competência, o caixa lê vencimento. Na
 * recorrência é o contrário: cada ocorrência é um fato NOVO, e a competência
 * acompanha o vencimento. Esta é a diferença contábil entre os dois modos, e é
 * ela que decide em que mês o resultado aparece.
 *
 * Puro, tipado, sem I/O e sem relógio. Versão `contas-pagar-lancamento/1.0.0`.
 */

export const LANCAMENTO_VERSION = "contas-pagar-lancamento/1.0.0";

export type ModoLancamento = "unica" | "recorrente" | "parcelada";

export const ROTULO_MODO: Record<ModoLancamento, string> = {
  unica: "Conta única",
  recorrente: "Conta recorrente",
  parcelada: "Compra parcelada",
};

export const EXPLICACAO_MODO: Record<ModoLancamento, string> = {
  unica: "Um título, um vencimento. Lançado uma vez só.",
  recorrente: "Um compromisso que se repete. O valor informado é o de cada ocorrência.",
  parcelada: "Uma compra só, dividida em parcelas. O valor informado é o total da compra.",
};

export type Frequencia = "semanal" | "quinzenal" | "mensal" | "bimestral" | "trimestral" | "semestral" | "anual";

export const FREQUENCIAS: { valor: Frequencia; rotulo: string; meses: number; dias: number; porAno: number }[] = [
  { valor: "semanal", rotulo: "Semanal", meses: 0, dias: 7, porAno: 52 },
  { valor: "quinzenal", rotulo: "Quinzenal", meses: 0, dias: 14, porAno: 26 },
  { valor: "mensal", rotulo: "Mensal", meses: 1, dias: 0, porAno: 12 },
  { valor: "bimestral", rotulo: "Bimestral", meses: 2, dias: 0, porAno: 6 },
  { valor: "trimestral", rotulo: "Trimestral", meses: 3, dias: 0, porAno: 4 },
  { valor: "semestral", rotulo: "Semestral", meses: 6, dias: 0, porAno: 2 },
  { valor: "anual", rotulo: "Anual", meses: 12, dias: 0, porAno: 1 },
];

const freq = (f: Frequencia) => FREQUENCIAS.find((x) => x.valor === f) ?? FREQUENCIAS[2];

/* ========================================================================== */
/* A entrada                                                                   */
/* ========================================================================== */

export interface EntradaLancamento {
  modo: ModoLancamento;
  /** Primeiro vencimento (YYYY-MM-DD). */
  vencimento: string;
  /** Competência do fato (YYYY-MM-DD). */
  competencia: string;
  /**
   * No modo `unica` e `recorrente`, o valor de CADA título.
   * No modo `parcelada`, o valor TOTAL da compra.
   */
  valor: number;
  /* --- recorrente --- */
  frequencia?: Frequencia;
  /** Quantas ocorrências gerar. */
  ocorrencias?: number;
  /**
   * O valor é sempre o mesmo?
   *
   * ⚠️ É esta resposta — e não o fato de repetir — que separa **custo fixo** de
   * **despesa recorrente variável**. Aluguel repete e é fixo; conta de luz
   * repete e varia. Tratar as duas como a mesma coisa faz o "custo fixo
   * mensal" prometer uma previsibilidade que a conta de luz não tem.
   */
  valorFixo?: boolean;
  /* --- parcelada --- */
  /** Quantas parcelas. */
  parcelas?: number;
}

export interface TituloPlanejado {
  /** 1-based. */
  numero: number;
  /** Quantos títulos ao todo — `null` quando o modo não parcela. */
  de: number | null;
  vencimento: string;
  competencia: string;
  valor: number;
}

export interface PlanoLancamento {
  versao: string;
  modo: ModoLancamento;
  titulos: TituloPlanejado[];
  /** A soma do que vai ser criado. */
  total: number;
  /**
   * O compromisso MENSAL que este lançamento cria — `null` quando não há
   * cadência (conta única). É o número que alimenta o custo fixo.
   */
  mensal: number | null;
  /** Fica `true` só na recorrente de valor estável. */
  ehCustoFixo: boolean;
  /** Recusas de entrada, em português, na ordem em que se corrige. */
  problemas: string[];
}

/* ========================================================================== */
/* Datas                                                                       */
/* ========================================================================== */

const partes = (iso: string) => iso.slice(0, 10).split("-").map(Number) as [number, number, number];

/**
 * Avança `n` passos a partir de uma data-só.
 *
 * ⚠️ Dia 31 num mês de 30 vira o ÚLTIMO dia do mês, nunca o dia 1º do mês
 * seguinte: escorregar adiantaria a cobrança em um mês inteiro. E tudo em
 * `Date.UTC` — `new Date("YYYY-MM-DD")` lido em UTC−3 devolve o dia anterior.
 */
export function avancar(iso: string, f: Frequencia, n: number): string {
  const [a, m, d] = partes(iso);
  const { meses, dias } = freq(f);
  if (meses > 0) {
    const alvo = new Date(Date.UTC(a, m - 1 + meses * n, 1));
    const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
    return new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth(), Math.min(d, ultimo)))
      .toISOString().slice(0, 10);
  }
  return new Date(Date.UTC(a, m - 1, d + dias * n)).toISOString().slice(0, 10);
}

/* ========================================================================== */
/* O planejador                                                                */
/* ========================================================================== */

const round2 = (n: number) => Math.round(n * 100) / 100;

const TETO_OCORRENCIAS = 120;
const TETO_PARCELAS = 120;

export function planejarLancamento(e: EntradaLancamento): PlanoLancamento {
  const problemas: string[] = [];
  if (!e.vencimento) problemas.push("Informe a data de vencimento.");
  if (!e.competencia) problemas.push("Informe a data de competência.");
  if (!e.valor || e.valor <= 0) problemas.push("Informe o valor.");

  const vazio = (): PlanoLancamento => ({
    versao: LANCAMENTO_VERSION, modo: e.modo, titulos: [], total: 0, mensal: null,
    ehCustoFixo: false, problemas,
  });

  if (e.modo === "recorrente") {
    const n = e.ocorrencias ?? 0;
    // ⚠️ Sem quantidade, a recorrência geraria título para sempre — e "para
    // sempre" num fluxo de caixa é um passivo que nunca termina de aparecer.
    if (n < 2) problemas.push("Uma recorrência precisa de ao menos 2 ocorrências.");
    if (n > TETO_OCORRENCIAS) problemas.push(`No máximo ${TETO_OCORRENCIAS} ocorrências de uma vez.`);
    if (!e.frequencia) problemas.push("Selecione a frequência.");
  }
  if (e.modo === "parcelada") {
    const n = e.parcelas ?? 0;
    if (n < 2) problemas.push("Uma compra parcelada precisa de ao menos 2 parcelas.");
    if (n > TETO_PARCELAS) problemas.push(`No máximo ${TETO_PARCELAS} parcelas.`);
  }
  if (problemas.length > 0) return vazio();

  if (e.modo === "unica") {
    const t: TituloPlanejado = {
      numero: 1, de: null, vencimento: e.vencimento, competencia: e.competencia, valor: round2(e.valor),
    };
    return {
      versao: LANCAMENTO_VERSION, modo: e.modo, titulos: [t], total: t.valor,
      mensal: null, ehCustoFixo: false, problemas,
    };
  }

  if (e.modo === "recorrente") {
    const f = e.frequencia ?? "mensal";
    const n = e.ocorrencias ?? 0;
    const titulos = Array.from({ length: n }, (_, k) => {
      const venc = avancar(e.vencimento, f, k);
      return {
        numero: k + 1, de: n, vencimento: venc,
        // ⚠️ Cada ocorrência é um FATO NOVO: a competência acompanha o
        // vencimento. Repetir a competência do primeiro mês jogaria doze
        // aluguéis no resultado de janeiro.
        competencia: k === 0 ? e.competencia : venc,
        valor: round2(e.valor),
      };
    });
    return {
      versao: LANCAMENTO_VERSION, modo: e.modo, titulos,
      total: round2(e.valor * n),
      // Normalizado para o MÊS: um anual de 1.200 pesa 100 por mês.
      mensal: round2((e.valor * freq(f).porAno) / 12),
      ehCustoFixo: e.valorFixo !== false,
      problemas,
    };
  }

  /* ---- parcelada --------------------------------------------------------- */
  const n = e.parcelas ?? 0;
  const bruta = Math.floor((e.valor / n) * 100) / 100;
  // ⚠️ O RESTO VAI NA ÚLTIMA. 100 ÷ 3 dá 33,33 e três delas somam 99,99: sem
  // acertar a última, a compra nasceria com um centavo a menos que o preço, e
  // a diferença só apareceria na conciliação, onde ninguém a atribui a isto.
  const resto = round2(e.valor - bruta * n);
  const titulos = Array.from({ length: n }, (_, k) => ({
    numero: k + 1, de: n,
    vencimento: avancar(e.vencimento, "mensal", k),
    // ⚠️ A COMPETÊNCIA NÃO SE PARCELA — a despesa é inteira no mês da compra.
    competencia: e.competencia,
    valor: k === n - 1 ? round2(bruta + resto) : bruta,
  }));
  return {
    versao: LANCAMENTO_VERSION, modo: e.modo, titulos,
    total: round2(e.valor),
    // Uma parcela por mês é compromisso mensal enquanto durar — mas NÃO é custo
    // fixo: ela acaba, e um custo que acaba não pode entrar na conta de
    // "quanto a empresa gasta todo mês para existir".
    mensal: bruta,
    ehCustoFixo: false,
    problemas,
  };
}
