/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RESCISÃO — o que se deve, conforme COMO o contrato terminou.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **A MODALIDADE MUDA TUDO, e essa é a única coisa que não dá para errar.**
 *
 * As mesmas cinco verbas — saldo, aviso, 13º, férias, FGTS — aparecem ou somem
 * conforme quem terminou o contrato e por quê. Um sistema que calcula "a
 * rescisão" sem perguntar a modalidade acerta um caso e erra os outros quatro:
 *
 *  | Verba              | Sem justa causa | Pedido | Justa causa | Acordo |
 *  |--------------------|-----------------|--------|-------------|--------|
 *  | Saldo de salário   | sim             | sim    | sim         | sim    |
 *  | Aviso prévio       | recebe          | DESCONTA se não cumprir | não | metade |
 *  | 13º proporcional   | sim             | sim    | **NÃO**     | sim    |
 *  | Férias proporcionais | sim           | sim    | **NÃO**     | sim    |
 *  | Multa do FGTS      | 40%             | não    | não         | 20%    |
 *  | Saque do FGTS      | integral        | não    | não         | 80%    |
 *  | Seguro-desemprego  | sim             | não    | não         | **não**|
 *
 * ⚠️ **Férias VENCIDAS são devidas em TODAS as modalidades**, inclusive na
 * justa causa (Súmula 171 do TST). O que a justa causa tira são as
 * PROPORCIONAIS. Confundir as duas é o erro que mais aparece em reclamação
 * trabalhista, porque quem faz a conta pensa "justa causa não recebe nada".
 *
 * ⚠️ **O AVISO PRÉVIO CRESCE COM O TEMPO DE CASA**: 30 dias mais 3 por ano
 * completo, até 90 (Lei 12.506/2011). Fixar em 30 subestima o custo de demitir
 * quem está há dez anos em dois terços.
 *
 * Puro, tipado, sem I/O e sem relógio. Versão `folha-rescisao/1.0.0`.
 */
import type { Regime, Anexo } from "@/core/fiscal/perfil";
import { inssDe, irrfDe, inssEmpregado, irrfEmpregado } from "./tabelas";
import { anteciparParaDiaUtil } from "./calendario";
import { encargosPatronais, FGTS, type LinhaMemoria, type Colaborador } from "./index";

export const RESCISAO_VERSION = "folha-rescisao/1.0.0";

const round2 = (n: number) => Math.round(n * 100) / 100;
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/* ========================================================================== */
/* As modalidades                                                              */
/* ========================================================================== */

export type Modalidade =
  | "sem_justa_causa"
  | "pedido_demissao"
  | "justa_causa"
  | "acordo"
  | "fim_experiencia";

export const ROTULO_MODALIDADE: Record<Modalidade, string> = {
  sem_justa_causa: "Dispensa sem justa causa",
  pedido_demissao: "Pedido de demissão",
  justa_causa: "Dispensa por justa causa",
  acordo: "Acordo entre as partes",
  fim_experiencia: "Fim do contrato de experiência",
};

export const EXPLICACAO_MODALIDADE: Record<Modalidade, string> = {
  sem_justa_causa: "A empresa dispensa. Paga tudo, com multa de 40% do FGTS e aviso prévio.",
  pedido_demissao: "O funcionário pede para sair. Sem multa, sem saque, e o aviso é DESCONTADO se ele não cumprir.",
  justa_causa: "Falta grave comprovada. Só saldo de salário e férias VENCIDAS — as proporcionais não são devidas.",
  acordo: "Art. 484-A: metade do aviso, 20% de multa, saque de 80% e SEM seguro-desemprego.",
  fim_experiencia: "O contrato chegou ao fim previsto. Sem aviso prévio; as proporcionais são devidas.",
};

/** As regras de cada modalidade, em dados — não em `if` espalhado. */
export interface RegraModalidade {
  /** Recebe aviso prévio indenizado? */
  avisoRecebe: boolean;
  /** O aviso é DESCONTADO quando não cumprido? */
  avisoDesconta: boolean;
  /** Fração do aviso (0,5 no acordo). */
  avisoFracao: number;
  decimoProporcional: boolean;
  feriasProporcionais: boolean;
  /** Percentual da multa do FGTS. */
  multaFGTS: number;
  saqueFGTS: number;
  seguroDesemprego: boolean;
}

export const REGRAS: Record<Modalidade, RegraModalidade> = {
  sem_justa_causa: { avisoRecebe: true, avisoDesconta: false, avisoFracao: 1, decimoProporcional: true, feriasProporcionais: true, multaFGTS: 0.40, saqueFGTS: 1, seguroDesemprego: true },
  pedido_demissao: { avisoRecebe: false, avisoDesconta: true, avisoFracao: 1, decimoProporcional: true, feriasProporcionais: true, multaFGTS: 0, saqueFGTS: 0, seguroDesemprego: false },
  // ⚠️ Férias VENCIDAS continuam devidas — o que sai são as proporcionais.
  justa_causa: { avisoRecebe: false, avisoDesconta: false, avisoFracao: 1, decimoProporcional: false, feriasProporcionais: false, multaFGTS: 0, saqueFGTS: 0, seguroDesemprego: false },
  acordo: { avisoRecebe: true, avisoDesconta: false, avisoFracao: 0.5, decimoProporcional: true, feriasProporcionais: true, multaFGTS: 0.20, saqueFGTS: 0.8, seguroDesemprego: false },
  fim_experiencia: { avisoRecebe: false, avisoDesconta: false, avisoFracao: 1, decimoProporcional: true, feriasProporcionais: true, multaFGTS: 0, saqueFGTS: 1, seguroDesemprego: false },
};

/* ========================================================================== */
/* Aviso prévio                                                                */
/* ========================================================================== */

/**
 * Dias de aviso prévio: 30 + 3 por ano completo, teto de 90.
 *
 * ⚠️ Fixar em 30 subestima o custo de demitir quem tem tempo de casa em até
 * dois terços — e é justamente quem tem tempo de casa que custa caro dispensar.
 */
export function diasAviso(anosCompletos: number): number {
  return Math.min(90, 30 + 3 * Math.max(0, anosCompletos));
}

/* ========================================================================== */
/* A entrada                                                                   */
/* ========================================================================== */

export interface EntradaRescisao {
  modalidade: Modalidade;
  /** Último dia de trabalho, "YYYY-MM-DD". */
  desligamento: string;
  /** Data de admissão, "YYYY-MM-DD". */
  admissao: string;
  /** O aviso foi trabalhado? (Se não, é indenizado ou descontado.) */
  avisoTrabalhado: boolean;
  /** Dias de férias VENCIDAS ainda não gozadas. */
  diasFeriasVencidas: number;
  /**
   * Saldo do FGTS depositado, para a multa.
   *
   * ⚠️ Informado, e não calculado, de propósito — ver `estimarFGTS`.
   */
  saldoFGTS: number;
  /** Usar a estimativa em vez do saldo informado. */
  estimarSaldo: boolean;
}

/**
 * Uma ESTIMATIVA do saldo de FGTS: 8% do salário por mês trabalhado.
 *
 * ⚠️ **Ela subestima, e a tela precisa dizer isso.** O saldo real inclui os
 * depósitos sobre 13º e férias, a correção monetária e a distribuição de
 * resultados — e desconta saques anteriores (moradia, aniversário). A multa de
 * 40% sobre uma estimativa baixa é uma multa baixa, e a diferença aparece na
 * homologação, quando já não há o que renegociar.
 *
 * O número certo está no extrato do FGTS. Esta função existe para dar uma ordem
 * de grandeza a quem ainda não tem o extrato na mão, nunca para substituí-lo.
 */
export function estimarFGTS(salario: number, mesesTrabalhados: number): number {
  return round2(salario * FGTS * Math.max(0, mesesTrabalhados));
}

/* ========================================================================== */
/* O cálculo                                                                   */
/* ========================================================================== */

export interface VerbaRescisoria {
  nome: string;
  valor: number;
  /** `provento` soma, `desconto` subtrai. */
  natureza: "provento" | "desconto";
  /** Sofre INSS/IRRF? Indenizatórias não sofrem. */
  tributavel: boolean;
  explicacao: string;
}

export interface CalculoRescisao {
  versao: string;
  modalidade: Modalidade;
  regra: RegraModalidade;
  /** Meses trabalhados, para as proporcionais. */
  mesesTrabalhados: number;
  anosCompletos: number;
  diasAviso: number;
  verbas: VerbaRescisoria[];
  totalProventos: number;
  totalDescontos: number;
  baseTributavel: number;
  inss: number;
  irrf: number;
  /** O que o funcionário recebe. */
  liquido: number;
  /** A multa do FGTS — depositada na conta vinculada, não paga ao empregado. */
  multaFGTS: number;
  /** O saldo usado no cálculo da multa, e se foi estimado. */
  saldoFGTS: number;
  saldoEstimado: boolean;
  /** O custo TOTAL da rescisão para a empresa. */
  custoTotal: number;
  /** Até quando pagar: 10 dias corridos do desligamento (art. 477 §6º). */
  vencimento: string;
  memoria: LinhaMemoria[];
  problemas: string[];
  alertas: string[];
}

const somarDias = (iso: string, n: number) => {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
};

/** Meses inteiros entre duas datas, contando fração ≥15 dias como mês (art. 146). */
function mesesEntreDatas(de: string, ate: string): number {
  const [a1, m1, d1] = de.slice(0, 10).split("-").map(Number);
  const [a2, m2, d2] = ate.slice(0, 10).split("-").map(Number);
  let meses = (a2 - a1) * 12 + (m2 - m1);
  // ⚠️ Fração de 15 dias ou mais conta como mês inteiro para as proporcionais.
  // Truncar sempre para baixo tiraria até um doze avos do 13º e das férias de
  // quem foi dispensado no fim do mês.
  if (d2 - d1 >= 14) meses += 1;
  else if (d2 < d1) meses -= 1;
  return Math.max(0, meses);
}

export function calcularRescisao(
  c: Colaborador, e: EntradaRescisao, regime: Regime, anexo: Anexo | null,
): CalculoRescisao {
  const problemas: string[] = [];
  const alertas: string[] = [];
  if (!e.admissao) problemas.push("Informe a data de admissão.");
  if (!e.desligamento) problemas.push("Informe a data do desligamento.");
  if (e.admissao && e.desligamento && e.desligamento < e.admissao) {
    problemas.push("O desligamento é anterior à admissão.");
  }

  const regra = REGRAS[e.modalidade];
  const competencia = (e.desligamento || "").slice(0, 7);
  const ti = inssDe(competencia || "2025-01");
  const tr = irrfDe(competencia || "2025-01");
  const enc = encargosPatronais(regime, anexo);
  const bruto = Math.max(0, c.valor);
  const diaria = bruto / 30;

  const mesesTrabalhados = e.admissao && e.desligamento ? mesesEntreDatas(e.admissao, e.desligamento) : 0;
  const anosCompletos = Math.floor(mesesTrabalhados / 12);
  const dias = regra.avisoRecebe || regra.avisoDesconta
    ? Math.round(diasAviso(anosCompletos) * regra.avisoFracao)
    : 0;

  // Meses do ano corrente, para as proporcionais (avos).
  const avosNoAno = e.desligamento
    ? mesesEntreDatas(`${e.desligamento.slice(0, 4)}-01-01`, e.desligamento)
    : 0;
  const avos = Math.min(12, Math.max(0, avosNoAno));

  const verbas: VerbaRescisoria[] = [];

  /* ---- saldo de salário: os dias do mês até o desligamento --------------- */
  const diasNoMes = e.desligamento ? Number(e.desligamento.slice(8, 10)) : 0;
  const saldo = round2(diaria * diasNoMes);
  verbas.push({
    nome: `Saldo de salário · ${diasNoMes} dias`,
    valor: saldo, natureza: "provento", tributavel: true,
    explicacao: "Os dias trabalhados no mês do desligamento. Devido em TODAS as modalidades.",
  });

  /* ---- aviso prévio ------------------------------------------------------ */
  if (dias > 0 && !e.avisoTrabalhado) {
    const valorAviso = round2(diaria * dias);
    if (regra.avisoRecebe) {
      verbas.push({
        nome: `Aviso prévio indenizado · ${dias} dias`,
        valor: valorAviso, natureza: "provento",
        // ⚠️ Aviso INDENIZADO é verba indenizatória: não sofre INSS nem IRRF.
        // O trabalhado, sim — mas ele entra como salário normal, não aqui.
        tributavel: false,
        explicacao: `30 dias + 3 por ano completo (${anosCompletos} anos), teto de 90. Indenizatório: sem INSS e sem IRRF.`,
      });
    } else if (regra.avisoDesconta) {
      verbas.push({
        nome: `Aviso prévio não cumprido · ${dias} dias`,
        valor: valorAviso, natureza: "desconto", tributavel: false,
        explicacao: "Quem pede demissão e não cumpre o aviso tem o período descontado da rescisão.",
      });
    }
  }

  /* ---- 13º proporcional -------------------------------------------------- */
  if (regra.decimoProporcional && avos > 0) {
    const v = round2((bruto / 12) * avos);
    verbas.push({
      nome: `13º proporcional · ${avos}/12`,
      valor: v, natureza: "provento", tributavel: true,
      explicacao: "Um doze avos por mês trabalhado no ano, com fração de 15 dias contando como mês.",
    });
  } else if (!regra.decimoProporcional) {
    alertas.push("A justa causa NÃO gera 13º proporcional.");
  }

  /* ---- férias vencidas: devidas SEMPRE ----------------------------------- */
  if (e.diasFeriasVencidas > 0) {
    const v = round2(diaria * e.diasFeriasVencidas);
    const terco = round2(v / 3);
    verbas.push({
      nome: `Férias vencidas · ${e.diasFeriasVencidas} dias`,
      valor: round2(v + terco), natureza: "provento", tributavel: false,
      explicacao:
        "Devidas em TODAS as modalidades, inclusive na justa causa (Súmula 171 do TST). "
        + "Indenizatórias na rescisão: sem INSS e sem IRRF.",
    });
  }

  /* ---- férias proporcionais ---------------------------------------------- */
  if (regra.feriasProporcionais && avos > 0) {
    const v = round2((bruto / 12) * avos);
    const terco = round2(v / 3);
    verbas.push({
      nome: `Férias proporcionais + 1/3 · ${avos}/12`,
      valor: round2(v + terco), natureza: "provento", tributavel: false,
      explicacao: "Um doze avos por mês, mais o terço constitucional. Indenizatórias.",
    });
  } else if (!regra.feriasProporcionais) {
    alertas.push("A justa causa NÃO gera férias proporcionais — só as VENCIDAS.");
  }

  /* ---- FGTS: multa e saque ----------------------------------------------- */
  const saldoEstimado = e.estimarSaldo || e.saldoFGTS <= 0;
  const saldoFGTS = saldoEstimado ? estimarFGTS(bruto, mesesTrabalhados) : e.saldoFGTS;
  const multaFGTS = round2(saldoFGTS * regra.multaFGTS);
  if (saldoEstimado && regra.multaFGTS > 0) {
    alertas.push(
      "O saldo do FGTS foi ESTIMADO (8% do salário por mês). O saldo real inclui "
      + "depósitos sobre 13º e férias e correção monetária — busque o extrato antes de homologar.",
    );
  }
  if (regra.seguroDesemprego) alertas.push("O funcionário tem direito ao seguro-desemprego.");
  else if (e.modalidade === "acordo") alertas.push("No acordo do art. 484-A NÃO há seguro-desemprego.");

  /* ---- tributação: só sobre o que é salarial ----------------------------- */
  const baseTributavel = round2(
    verbas.filter((v) => v.natureza === "provento" && v.tributavel).reduce((s, v) => s + v.valor, 0),
  );
  const inss = inssEmpregado(baseTributavel, ti.tabela);
  const ir = irrfEmpregado(baseTributavel, inss, c.dependentes ?? 0, c.pensao ?? 0, tr.tabela);

  const totalProventos = round2(verbas.filter((v) => v.natureza === "provento").reduce((s, v) => s + v.valor, 0));
  const outrosDescontos = round2(verbas.filter((v) => v.natureza === "desconto").reduce((s, v) => s + v.valor, 0));
  const totalDescontos = round2(inss + ir.imposto + outrosDescontos);
  const liquido = round2(totalProventos - totalDescontos);

  const fgtsSobreVerbas = round2(baseTributavel * FGTS);
  const patronal = round2(baseTributavel * enc.total);
  // ⚠️ O CUSTO inclui a multa, que NÃO vai para o empregado: ela é depositada
  // na conta vinculada. Somá-la ao líquido pagaria a multa duas vezes; deixá-la
  // fora do custo subestimaria a dispensa em 40% do saldo.
  const custoTotal = round2(totalProventos - outrosDescontos + fgtsSobreVerbas + patronal + multaFGTS);

  /**
   * ⚠️ **DEZ DIAS CORRIDOS do término**, sem distinção entre aviso trabalhado e
   * indenizado (art. 477 §6º, redação da Reforma de 2017). O prazo antigo — um
   * dia útil no trabalhado, dez dias no indenizado — ainda circula, e usá-lo
   * atrasa a rescisão em nove dias, o que custa **um salário** de multa ao
   * empregado (art. 477 §8º).
   */
  const vencimento = e.desligamento ? anteciparParaDiaUtil(somarDias(e.desligamento, 10)) : "";

  const memoria: LinhaMemoria[] = [
    { passo: 1, descricao: ROTULO_MODALIDADE[e.modalidade], formula: EXPLICACAO_MODALIDADE[e.modalidade], valor: 0 },
    { passo: 2, descricao: "Tempo de casa", formula: `${mesesTrabalhados} meses · ${anosCompletos} anos completos`, valor: mesesTrabalhados },
    ...verbas.map((v, k) => ({
      passo: 3 + k,
      descricao: `${v.natureza === "desconto" ? "(−) " : "(+) "}${v.nome}`,
      formula: v.explicacao,
      valor: v.natureza === "desconto" ? -v.valor : v.valor,
    })),
    { passo: 3 + verbas.length, descricao: "(−) INSS", formula: `sobre ${brl(baseTributavel)} — só as verbas salariais`, valor: -inss },
    { passo: 4 + verbas.length, descricao: "(−) IRRF", formula: `base ${brl(ir.base)} · critério ${ir.criterio}`, valor: -ir.imposto },
    { passo: 5 + verbas.length, descricao: "(=) Líquido ao funcionário", formula: "proventos − descontos", valor: liquido },
    { passo: 6 + verbas.length, descricao: `(+) Multa do FGTS · ${(regra.multaFGTS * 100).toFixed(1).replace(".", ",")}%`, formula: saldoEstimado ? `sobre ${brl(saldoFGTS)} ESTIMADO — busque o extrato` : `sobre ${brl(saldoFGTS)} informado`, valor: multaFGTS },
    { passo: 7 + verbas.length, descricao: "(=) Custo da rescisão", formula: "verbas + FGTS + patronal + multa", valor: custoTotal },
  ];

  return {
    versao: RESCISAO_VERSION,
    modalidade: e.modalidade, regra,
    mesesTrabalhados, anosCompletos, diasAviso: dias,
    verbas, totalProventos, totalDescontos, baseTributavel,
    inss, irrf: ir.imposto, liquido,
    multaFGTS, saldoFGTS, saldoEstimado,
    custoTotal, vencimento, memoria, problemas, alertas,
  };
}
