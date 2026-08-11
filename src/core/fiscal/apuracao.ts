/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A APURAÇÃO POR REGIME — com memória de cálculo item a item.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **Reprodutível quer dizer uma coisa específica:** dado o mesmo período, o
 * sistema mostra QUAIS lançamentos, QUAIS bases e QUAIS alíquotas geraram cada
 * centavo. Um total de imposto sem memória só pode ser aceito ou rejeitado —
 * não conferido. E o contador do outro lado não aceita o que não confere.
 *
 * ⚠️ **Nenhuma apuração sai de regime não declarado.** É a regra da ONDA 4
 * aplicada onde ela mais custa: lá a ausência virava R$ 0 numa tela; aqui
 * viraria uma guia com valor e vencimento, sobre uma obrigação legal que
 * ninguém declarou. Foi assim que R$ 284.823,41 foram apurados em Lucro
 * Presumido para uma empresa cujo cadastro diz Simples Nacional.
 *
 * ⚠️ **As alíquotas efetivas NÃO são constantes cravadas.** 4,8% de IRPJ e
 * 2,88% de CSLL no Presumido serviços são o RESULTADO de 15% e 9% sobre a base
 * presumida de 32% — e é essa conta que a memória mostra. Guardar só o produto
 * final esconde a base presumida, que é justamente o que muda quando a
 * atividade muda (comércio presume 8%, não 32%).
 *
 * Puro, tipado, demo-safe, sem I/O e sem relógio. Versão `fiscal/1.0.0`.
 */
import { calcularSimplesNacional, type AnexoSimples } from "@/core/tax";
import {
  type PerfilFiscal, type Regime, type LancamentoFiscal,
  ROTULO_REGIME, REGIMES_HABILITADOS,
} from "./perfil";

const round2 = (n: number) => Math.round(n * 100) / 100;

/* ========================================================================== */
/* A memória de cálculo                                                        */
/* ========================================================================== */

/** Uma linha da memória: o que foi feito, com que número, e por quê. */
export interface LinhaMemoria {
  /** A ordem em que a conta acontece — a memória é uma sequência, não um conjunto. */
  passo: number;
  descricao: string;
  /** A fórmula literal, com os números dentro. */
  formula: string;
  valor: number;
  /** Os lançamentos que entraram neste passo, quando há. */
  movimentos?: readonly string[];
}

export interface TributoApurado {
  sigla: string;
  nome: string;
  /** A alíquota aplicada, em fração. */
  aliquota: number;
  /** Sobre o quê ela incidiu. */
  base: number;
  valor: number;
  /** Quando vence, no mês seguinte ao de competência. */
  diaVencimento: number;
  memoria: LinhaMemoria[];
}

export interface Apuracao {
  regime: Regime;
  /** Competência apurada, YYYY-MM. */
  competencia: string;
  receitaBruta: number;
  tributos: TributoApurado[];
  total: number;
  /** Carga sobre a receita bruta, em fração. `null` sem receita. */
  cargaEfetiva: number | null;
  /** Preenchido = não houve apuração, e diz por quê. */
  indisponivel?: { motivo: string; comoResolver?: string };
  /** Todos os lançamentos que formaram a base — a reprodutibilidade. */
  movimentos: readonly string[];
}

const semApuracao = (
  regime: Regime, competencia: string, motivo: string, comoResolver?: string,
): Apuracao => ({
  regime, competencia, receitaBruta: 0, tributos: [], total: 0,
  cargaEfetiva: null, indisponivel: { motivo, comoResolver }, movimentos: [],
});

/* ========================================================================== */
/* A base — o que é receita para efeito de imposto                            */
/* ========================================================================== */

/**
 * ⚠️ A MESMA exclusão de `receitaTributavel` (ONDA 1) e de `calcularFatorR`.
 * Transferência entre contas próprias, resgate, empréstimo e receita financeira
 * entram como entrada e NÃO são faturamento. A ONDA 13 mediu: R$ 35.900 de
 * não-faturamento saíam da base ao aplicar isto. Um regex por módulo divergiria
 * na primeira categoria nova.
 */
const RE_FORA_DA_BASE =
  /\b(transfer[êe]ncia|transf|resgate|aplica[çc][ãa]o|rendimento|juros|empr[ée]stimo|financiamento|aporte|estorno|reembolso|devolu[çc][ãa]o)\b/i;

export interface BaseDoMes {
  receita: number;
  movimentos: readonly string[];
  /** O que foi EXCLUÍDO, para a memória poder mostrar. */
  excluidos: { id: string; categoria: string; valor: number }[];
}

export function baseDoMes(
  lancamentos: readonly LancamentoFiscal[], competencia: string,
): BaseDoMes {
  const doMes = lancamentos.filter(
    (l) => l.tipo === "entrada" && l.competencia.slice(0, 7) === competencia,
  );
  const dentro = doMes.filter((l) => !RE_FORA_DA_BASE.test(l.categoria ?? ""));
  const fora = doMes.filter((l) => RE_FORA_DA_BASE.test(l.categoria ?? ""));
  return {
    receita: round2(dentro.reduce((s, l) => s + l.valor, 0)),
    movimentos: dentro.map((l) => l.id),
    excluidos: fora.map((l) => ({ id: l.id, categoria: l.categoria ?? "", valor: l.valor })),
  };
}

/** A receita bruta dos 12 meses anteriores ao mês apurado — a RBT12 do Simples. */
export function rbt12(
  lancamentos: readonly LancamentoFiscal[], competencia: string,
): { valor: number; movimentos: readonly string[] } {
  const [ano, mes] = competencia.split("-").map(Number);
  // ⚠️ Os 12 meses ANTERIORES, sem incluir o mês apurado — é a definição legal
  // da RBT12, e incluí-lo faria a alíquota do mês depender do próprio mês.
  const fim = new Date(Date.UTC(ano, mes - 1, 1));
  const ini = new Date(Date.UTC(ano, mes - 13, 1));
  const chave = (d: Date) => d.toISOString().slice(0, 7);
  const de = chave(ini), ate = chave(new Date(Date.UTC(ano, mes - 2, 1)));
  void fim;
  const dentro = lancamentos.filter(
    (l) => l.tipo === "entrada"
      && !RE_FORA_DA_BASE.test(l.categoria ?? "")
      && l.competencia.slice(0, 7) >= de && l.competencia.slice(0, 7) <= ate,
  );
  return {
    valor: round2(dentro.reduce((s, l) => s + l.valor, 0)),
    movimentos: dentro.map((l) => l.id),
  };
}

/* ========================================================================== */
/* SIMPLES NACIONAL                                                            */
/* ========================================================================== */

function apurarSimples(
  perfil: PerfilFiscal, lancamentos: readonly LancamentoFiscal[], competencia: string,
): Apuracao {
  if (!perfil.anexo) {
    return semApuracao(
      "simples", competencia,
      "o Simples Nacional foi declarado, mas sem anexo",
      "O anexo decide a alíquota — 6% no III contra 15,5% no V — e não há padrão a assumir. "
      + "Informe o anexo, ou deixe o fator R calculá-lo a partir da folha e da receita.",
    );
  }
  // O Anexo IV existe na lei e não está na tabela deste sistema.
  if (perfil.anexo === "IV") {
    return semApuracao(
      "simples", competencia,
      "o Anexo IV ainda não está implementado",
      "Ele tem a particularidade de não incluir a CPP no DAS — a contribuição patronal é "
      + "recolhida à parte, e apurá-lo com a tabela dos outros anexos erraria para menos.",
    );
  }

  const base = baseDoMes(lancamentos, competencia);
  const doze = rbt12(lancamentos, competencia);
  const r = calcularSimplesNacional(doze.valor, base.receita, perfil.anexo as AnexoSimples);

  const memoria: LinhaMemoria[] = [
    {
      passo: 1,
      descricao: "Receita bruta do mês (base do DAS)",
      formula: `soma de ${base.movimentos.length} lançamento(s) de entrada da competência ${competencia}`
        + (base.excluidos.length
          ? `, excluídos ${base.excluidos.length} de natureza não-faturamento `
            + `(${base.excluidos.map((e) => e.categoria).join(", ")})`
          : ""),
      valor: base.receita,
      movimentos: base.movimentos,
    },
    {
      passo: 2,
      descricao: "RBT12 — receita bruta dos 12 meses anteriores",
      formula: `soma de ${doze.movimentos.length} lançamento(s), sem incluir o mês apurado`,
      valor: doze.valor,
      movimentos: doze.movimentos,
    },
    {
      passo: 3,
      descricao: `Faixa ${r.faixa} do ${perfil.anexo === "III" ? "Anexo III" : `Anexo ${perfil.anexo}`}`,
      formula: `RBT12 de ${doze.valor.toFixed(2)} cai na faixa ${r.faixa}: alíquota nominal `
        + `${(r.aliquotaNominal * 100).toFixed(2)}%, parcela a deduzir ${r.parcelaDeduzir.toFixed(2)}`,
      valor: r.aliquotaNominal,
    },
    {
      passo: 4,
      // ⚠️ A alíquota EFETIVA é o coração do Simples e a fonte de metade das
      // dúvidas: ela nunca é a da tabela. Mostrar a conta é o que impede a
      // pessoa de conferir contra o número errado.
      descricao: "Alíquota efetiva (não é a da tabela)",
      formula: `(RBT12 × nominal − dedução) ÷ RBT12 = (${doze.valor.toFixed(2)} × `
        + `${(r.aliquotaNominal * 100).toFixed(2)}% − ${r.parcelaDeduzir.toFixed(2)}) ÷ ${doze.valor.toFixed(2)}`,
      valor: r.aliquotaEfetiva,
    },
    {
      passo: 5,
      descricao: "DAS do mês",
      formula: `receita do mês × alíquota efetiva = ${base.receita.toFixed(2)} × `
        + `${(r.aliquotaEfetiva * 100).toFixed(4)}%`,
      valor: r.das,
    },
  ];

  if (r.acimaDoTeto) {
    memoria.push({
      passo: 6,
      descricao: "⚠️ RBT12 acima do teto do Simples (R$ 4.800.000)",
      formula: "a empresa desenquadra do regime; o DAS acima é o da última faixa e NÃO é a apuração devida",
      valor: doze.valor,
    });
  }

  const tributo: TributoApurado = {
    sigla: "DAS",
    nome: `DAS — Simples Nacional, ${perfil.anexo === "III" ? "Anexo III" : `Anexo ${perfil.anexo}`}`,
    aliquota: r.aliquotaEfetiva,
    base: base.receita,
    valor: r.das,
    // O DAS vence no dia 20 do mês seguinte ao da competência.
    diaVencimento: 20,
    memoria,
  };

  return {
    regime: "simples",
    competencia,
    receitaBruta: base.receita,
    tributos: [tributo],
    total: r.das,
    cargaEfetiva: base.receita > 0 ? r.das / base.receita : null,
    movimentos: base.movimentos,
    ...(r.acimaDoTeto
      ? { indisponivel: {
          motivo: "a RBT12 passou do teto de R$ 4.800.000 — a empresa desenquadra do Simples",
          comoResolver: "Confirme com o contador o regime a partir do mês do desenquadramento.",
        } }
      : {}),
  };
}

/* ========================================================================== */
/* LUCRO PRESUMIDO                                                             */
/* ========================================================================== */

/**
 * As bases presumidas por atividade.
 *
 * ⚠️ **É AQUI que o 4,8% de IRPJ vem.** 15% sobre 32% de base presumida dá
 * 4,8%; sobre os 8% do comércio daria 1,2%. Guardar o produto final (4,8%) como
 * constante esconde a base — e a base é o que muda quando a atividade muda, que
 * é justamente o erro que ninguém vê.
 */
export const BASE_PRESUMIDA = {
  servicos: 0.32,
  comercio: 0.08,
  transporte_carga: 0.08,
  transporte_passageiros: 0.16,
} as const;
export type AtividadePresumida = keyof typeof BASE_PRESUMIDA;

/** Alíquotas legais do Lucro Presumido — as de LEI, não as efetivas. */
export const ALIQUOTAS_PRESUMIDO = {
  pis: 0.0065,
  cofins: 0.03,
  irpj: 0.15,
  /** Adicional de 10% sobre o que exceder R$ 20.000 de base POR MÊS. */
  irpjAdicional: 0.10,
  irpjLimiteMensal: 20000,
  csll: 0.09,
} as const;

function apurarPresumido(
  perfil: PerfilFiscal, lancamentos: readonly LancamentoFiscal[], competencia: string,
  atividade: AtividadePresumida = "servicos",
): Apuracao {
  const base = baseDoMes(lancamentos, competencia);
  const receita = base.receita;
  const A = ALIQUOTAS_PRESUMIDO;
  const presumida = BASE_PRESUMIDA[atividade];
  const basePresumida = round2(receita * presumida);

  const linhaBase: LinhaMemoria = {
    passo: 1,
    descricao: "Receita bruta do mês",
    formula: `soma de ${base.movimentos.length} lançamento(s) de entrada da competência ${competencia}`
      + (base.excluidos.length ? `, excluídos ${base.excluidos.length} de natureza não-faturamento` : ""),
    valor: receita,
    movimentos: base.movimentos,
  };

  const tributos: TributoApurado[] = [];

  // PIS e COFINS — sobre a receita BRUTA, no regime cumulativo.
  for (const [sigla, nome, aliq, dia] of [
    ["PIS", "PIS sobre faturamento (cumulativo)", A.pis, 25],
    ["COFINS", "COFINS sobre faturamento (cumulativo)", A.cofins, 25],
  ] as const) {
    tributos.push({
      sigla, nome, aliquota: aliq, base: receita, valor: round2(receita * aliq),
      diaVencimento: dia,
      memoria: [
        linhaBase,
        {
          passo: 2,
          descricao: `${sigla} — alíquota legal do regime cumulativo`,
          formula: `receita × ${(aliq * 100).toFixed(2)}% = ${receita.toFixed(2)} × ${(aliq * 100).toFixed(2)}%`,
          valor: round2(receita * aliq),
        },
      ],
    });
  }

  // IRPJ — 15% sobre a base presumida, mais adicional de 10% sobre o excedente.
  const irpjBasico = round2(basePresumida * A.irpj);
  const excedente = Math.max(0, basePresumida - A.irpjLimiteMensal);
  const adicional = round2(excedente * A.irpjAdicional);
  tributos.push({
    sigla: "IRPJ",
    nome: "IRPJ sobre o lucro presumido",
    aliquota: receita > 0 ? (irpjBasico + adicional) / receita : 0,
    base: basePresumida,
    valor: round2(irpjBasico + adicional),
    diaVencimento: 31,
    memoria: [
      linhaBase,
      {
        passo: 2,
        descricao: `Base presumida (${(presumida * 100).toFixed(0)}% da receita — ${atividade.replace(/_/g, " ")})`,
        formula: `${receita.toFixed(2)} × ${(presumida * 100).toFixed(0)}%`,
        valor: basePresumida,
      },
      {
        passo: 3,
        descricao: "IRPJ básico",
        formula: `base presumida × 15% = ${basePresumida.toFixed(2)} × 15%`,
        valor: irpjBasico,
      },
      {
        passo: 4,
        // ⚠️ O adicional é sobre o EXCEDENTE, não sobre a base inteira — e é o
        // erro mais comum de quem calcula à mão.
        descricao: "Adicional de 10% sobre o que excede R$ 20.000 de base no mês",
        formula: excedente > 0
          ? `(${basePresumida.toFixed(2)} − 20.000,00) × 10% = ${excedente.toFixed(2)} × 10%`
          : `base de ${basePresumida.toFixed(2)} não excede R$ 20.000 — sem adicional`,
        valor: adicional,
      },
      {
        passo: 5,
        descricao: "IRPJ do mês",
        formula: `básico + adicional = ${irpjBasico.toFixed(2)} + ${adicional.toFixed(2)}`,
        valor: round2(irpjBasico + adicional),
      },
    ],
  });

  // CSLL — 9% sobre a mesma base presumida, sem adicional.
  const csll = round2(basePresumida * A.csll);
  tributos.push({
    sigla: "CSLL",
    nome: "CSLL sobre o lucro presumido",
    aliquota: receita > 0 ? csll / receita : 0,
    base: basePresumida,
    valor: csll,
    diaVencimento: 31,
    memoria: [
      linhaBase,
      {
        passo: 2,
        descricao: `Base presumida (${(presumida * 100).toFixed(0)}% da receita)`,
        formula: `${receita.toFixed(2)} × ${(presumida * 100).toFixed(0)}%`,
        valor: basePresumida,
      },
      {
        passo: 3,
        descricao: "CSLL — 9% sobre a base, sem adicional",
        formula: `${basePresumida.toFixed(2)} × 9%`,
        valor: csll,
      },
    ],
  });

  // ISS — municipal. ⚠️ Sem alíquota declarada, ele NÃO entra com um palpite.
  if (perfil.issAliquota !== null) {
    const iss = round2(receita * perfil.issAliquota);
    tributos.push({
      sigla: "ISS",
      nome: `ISS — ${perfil.municipio ?? "município não informado"}`,
      aliquota: perfil.issAliquota,
      base: receita,
      valor: iss,
      diaVencimento: 10,
      memoria: [
        linhaBase,
        {
          passo: 2,
          descricao: "ISS pela alíquota do município",
          formula: `receita × ${(perfil.issAliquota * 100).toFixed(2)}% (lei do município `
            + `${perfil.municipio ?? "—"}; a faixa legal nacional é 2% a 5%)`,
          valor: iss,
        },
      ],
    });
  }

  const total = round2(tributos.reduce((s, t) => s + t.valor, 0));
  const semISS = perfil.issAliquota === null;

  return {
    regime: "presumido",
    competencia,
    receitaBruta: receita,
    tributos,
    total,
    cargaEfetiva: receita > 0 ? total / receita : null,
    movimentos: base.movimentos,
    ...(semISS
      ? { indisponivel: {
          motivo: "o ISS não entrou: a alíquota é municipal e não foi declarada",
          comoResolver:
            "A lei do município fixa entre 2% e 5%. Assumir 5% provisionaria a mais todo mês; "
            + "assumir 2%, a menos. O total acima está INCOMPLETO até o município ser informado.",
        } }
      : {}),
  };
}

/* ========================================================================== */
/* MEI                                                                         */
/* ========================================================================== */

/** O DAS-MEI é valor FIXO mensal, não percentual — apurar por alíquota erraria. */
export const DAS_MEI_2026 = { comercio: 76.90, servicos: 80.90, comercioServicos: 81.90 };

function apurarMei(lancamentos: readonly LancamentoFiscal[], competencia: string): Apuracao {
  const base = baseDoMes(lancamentos, competencia);
  const valor = DAS_MEI_2026.servicos;
  return {
    regime: "mei",
    competencia,
    receitaBruta: base.receita,
    tributos: [{
      sigla: "DAS-MEI",
      nome: "DAS do MEI — valor fixo mensal",
      aliquota: base.receita > 0 ? valor / base.receita : 0,
      base: base.receita,
      valor,
      diaVencimento: 20,
      memoria: [{
        passo: 1,
        // ⚠️ O MEI não tem alíquota: o valor é fixo e independe do faturamento.
        // Exibir uma "carga de X%" aqui só faz sentido como leitura derivada.
        descricao: "DAS-MEI é valor fixo, não percentual",
        formula: `R$ ${valor.toFixed(2)} por mês, independentemente da receita `
          + `(que no mês foi ${base.receita.toFixed(2)})`,
        valor,
        movimentos: base.movimentos,
      }],
    }],
    total: valor,
    cargaEfetiva: base.receita > 0 ? valor / base.receita : null,
    movimentos: base.movimentos,
  };
}

/* ========================================================================== */
/* O despachante                                                               */
/* ========================================================================== */

/**
 * Apura o mês segundo o perfil vigente.
 *
 * ⚠️ Regime não declarado NÃO apura. É a decisão central desta onda: um número
 * de imposto sobre um regime assumido é pior que nenhum número, porque ele tem
 * a mesma cara de um número apurado.
 */
export function apurar(
  perfil: PerfilFiscal,
  lancamentos: readonly LancamentoFiscal[],
  competencia: string,
  atividade: AtividadePresumida = "servicos",
): Apuracao {
  if (perfil.regime === "nao_declarado") {
    return semApuracao(
      "nao_declarado", competencia,
      "o regime tributário da empresa não foi declarado",
      "Nenhum imposto pode ser apurado sem ele — o mesmo faturamento gera valores muito "
      + "diferentes no Simples e no Presumido. Informe o regime em Configurações.",
    );
  }
  if (!REGIMES_HABILITADOS.includes(perfil.regime)) {
    return semApuracao(
      perfil.regime, competencia,
      `a apuração do ${ROTULO_REGIME[perfil.regime]} ainda não está habilitada`,
      "A estrutura existe e o regime pode ser declarado, mas o cálculo do Lucro Real depende "
      + "da escrituração completa (LALUR, adições e exclusões) que o sistema ainda não mantém. "
      + "Apurá-lo pela receita daria um número plausível e errado.",
    );
  }
  if (perfil.regime === "mei") return apurarMei(lancamentos, competencia);
  if (perfil.regime === "simples") return apurarSimples(perfil, lancamentos, competencia);
  return apurarPresumido(perfil, lancamentos, competencia, atividade);
}

/** A apuração de vários meses, cada um com o perfil vigente NAQUELE mês. */
export function apurarPeriodo(
  perfilEm: (competencia: string) => PerfilFiscal,
  lancamentos: readonly LancamentoFiscal[],
  competencias: readonly string[],
  atividade: AtividadePresumida = "servicos",
): { meses: Apuracao[]; total: number; apurados: number; semApuracao: number } {
  // ⚠️ O perfil é consultado POR MÊS, não uma vez. Uma empresa que trocou de
  // regime no meio do ano tem meses em regimes diferentes, e apurar os doze com
  // o regime de hoje recalcula o passado com a regra do presente.
  const meses = competencias.map((c) => apurar(perfilEm(c), lancamentos, c, atividade));
  const validos = meses.filter((m) => !m.indisponivel);
  return {
    meses,
    total: round2(validos.reduce((s, m) => s + m.total, 0)),
    apurados: validos.length,
    semApuracao: meses.length - validos.length,
  };
}
