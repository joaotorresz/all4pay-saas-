/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FÉRIAS — quanto se paga, quanto se desconta, e ATÉ QUANDO.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **As férias são a despesa que mais surpreende o caixa de uma PME**, e por
 * um motivo estrutural: elas saem ANTES do mês em que o funcionário não
 * trabalha. O pagamento vence **até dois dias antes do início** (art. 145 da
 * CLT), o valor é o salário **mais um terço**, e nada disso aparece no fluxo de
 * caixa até alguém pedir férias.
 *
 * ⚠️ **O ABONO PECUNIÁRIO NÃO É TRIBUTADO, e é o erro mais comum aqui.**
 *
 * O funcionário pode VENDER até 1/3 das férias (10 dias). Esses 10 dias e o
 * terço sobre eles são **indenizatórios**: não sofrem INSS, não sofrem IRRF e
 * não geram FGTS. Tratá-los como salário desconta imposto de uma verba isenta —
 * dinheiro que sai do bolso do funcionário e que ele só recupera na declaração
 * anual, se souber pedir.
 *
 * ⚠️ **FALTAS INJUSTIFICADAS REDUZEM OS DIAS, em degraus** (art. 130). Não é
 * proporcional: 5 faltas não tiram nada, a 6ª tira seis dias de uma vez. Uma
 * regra linear erraria em qualquer ponto da tabela.
 *
 * Puro, tipado, sem I/O e sem relógio. Versão `folha-ferias/1.0.0`.
 */
import type { Regime, Anexo } from "@/core/fiscal/perfil";
import { inssDe, irrfDe, inssEmpregado, irrfEmpregado, TABELAS_PADRAO, type TabelasLegais } from "./tabelas";
import { anteciparParaDiaUtil } from "./calendario";
import { encargosPatronais, FGTS, type LinhaMemoria, type Colaborador } from "./index";

export const FERIAS_VERSION = "folha-ferias/1.0.0";

const round2 = (n: number) => Math.round(n * 100) / 100;
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/* ========================================================================== */
/* Direito                                                                     */
/* ========================================================================== */

/**
 * Os dias de férias a que o empregado tem direito, pelas faltas do período
 * aquisitivo (art. 130 da CLT).
 *
 * ⚠️ A tabela é em DEGRAUS, não proporcional. Da 5ª para a 6ª falta o direito
 * cai de 30 para 24 dias — seis dias de uma vez. Interpolar produziria 29 dias,
 * que não existe na lei.
 */
export function diasPorFaltas(faltas: number): number {
  if (faltas <= 5) return 30;
  if (faltas <= 14) return 24;
  if (faltas <= 23) return 18;
  if (faltas <= 32) return 12;
  return 0;
}

/** Quantos dias no máximo podem ser vendidos (1/3 do direito). */
export const maximoAbono = (diasDireito: number) => Math.floor(diasDireito / 3);

/* ========================================================================== */
/* A entrada                                                                   */
/* ========================================================================== */

export interface EntradaFerias {
  /** Data de início do gozo, "YYYY-MM-DD". */
  inicio: string;
  /** Dias de férias efetivamente gozados. */
  diasGozados: number;
  /** Dias vendidos (abono pecuniário) — no máximo 1/3 do direito. */
  diasAbono: number;
  /** Faltas injustificadas no período aquisitivo. */
  faltas: number;
  /** Antecipar a 1ª parcela do 13º junto com as férias (art. 2º da Lei 4.749). */
  adiantar13: boolean;
}

export const FERIAS_PADRAO: EntradaFerias = {
  inicio: "", diasGozados: 30, diasAbono: 0, faltas: 0, adiantar13: false,
};

/* ========================================================================== */
/* O cálculo                                                                   */
/* ========================================================================== */

export interface CalculoFerias {
  versao: string;
  /** Dias a que tem direito, já descontadas as faltas. */
  diasDireito: number;
  diasGozados: number;
  diasAbono: number;
  /* --- proventos --- */
  /** Remuneração dos dias gozados. */
  ferias: number;
  /** 1/3 constitucional sobre os dias gozados. */
  tercoFerias: number;
  /** Os dias vendidos. */
  abono: number;
  /** 1/3 sobre o abono. */
  tercoAbono: number;
  /** Adiantamento da 1ª parcela do 13º, quando pedido. */
  adiantamento13: number;
  totalProventos: number;
  /* --- descontos (só sobre a parte TRIBUTÁVEL) --- */
  baseTributavel: number;
  inss: number;
  irrf: number;
  totalDescontos: number;
  /** O que o funcionário recebe. */
  liquido: number;
  /* --- custo do empregador --- */
  fgts: number;
  patronal: number;
  custoTotal: number;
  /** Vencimento: até 2 dias ANTES do início do gozo. */
  vencimento: string;
  /** Volta ao trabalho em. */
  retorno: string;
  memoria: LinhaMemoria[];
  /** Recusas em português — preenchido, o cálculo não deve ser usado. */
  problemas: string[];
  tabelas: { desatualizada: boolean; mesesDeAtraso: number };
}

const somarDias = (iso: string, n: number) => {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
};

export function calcularFerias(
  c: Colaborador, e: EntradaFerias, regime: Regime, anexo: Anexo | null,
  tabelas: TabelasLegais = TABELAS_PADRAO,
): CalculoFerias {
  const problemas: string[] = [];
  const diasDireito = diasPorFaltas(e.faltas);
  const competencia = (e.inicio || "").slice(0, 7);

  if (!e.inicio) problemas.push("Informe a data de início das férias.");
  if (diasDireito === 0) {
    problemas.push("Com mais de 32 faltas injustificadas, o período aquisitivo não gera direito a férias.");
  }
  if (e.diasGozados + e.diasAbono > diasDireito) {
    problemas.push(`O total de dias (${e.diasGozados + e.diasAbono}) passa do direito de ${diasDireito}.`);
  }
  // ⚠️ O teto do abono é 1/3 do DIREITO, não 1/3 do que se está tirando: quem
  // tem direito a 30 pode vender 10, mesmo tirando só 15.
  if (e.diasAbono > maximoAbono(diasDireito)) {
    problemas.push(`O abono não pode passar de ${maximoAbono(diasDireito)} dias (1/3 do direito).`);
  }
  /*
   * ⚠️ O FRACIONAMENTO TEM REGRA (art. 134 §1º, Reforma de 2017): em até três
   * períodos, um deles com no mínimo 14 dias e os demais com no mínimo 5. Um
   * período de 3 dias é ilegal, e o sistema que o aceita produz um recibo que
   * não se sustenta numa fiscalização.
   */
  if (e.diasGozados > 0 && e.diasGozados < 5) {
    problemas.push("Cada período de férias precisa ter no mínimo 5 dias corridos.");
  }

  const ti = inssDe(competencia || "2025-01", tabelas);
  const tr = irrfDe(competencia || "2025-01", tabelas);
  const enc = encargosPatronais(regime, anexo);
  const bruto = Math.max(0, c.valor);
  const diaria = bruto / 30;

  const ferias = round2(diaria * e.diasGozados);
  const tercoFerias = round2(ferias / 3);
  const abono = round2(diaria * e.diasAbono);
  const tercoAbono = round2(abono / 3);
  const adiantamento13 = e.adiantar13 ? round2(bruto / 2) : 0;

  /**
   * ⚠️ A BASE TRIBUTÁVEL EXCLUI O ABONO E O TERÇO SOBRE ELE.
   *
   * Abono pecuniário é verba INDENIZATÓRIA: não sofre INSS, não sofre IRRF e
   * não gera FGTS. Somá-lo à base — o erro fácil, porque ele sai no mesmo
   * recibo — desconta imposto de uma verba isenta.
   *
   * O adiantamento do 13º também fica de fora: ele é tributado na SEGUNDA
   * parcela, sobre o 13º inteiro, em dezembro. Tributar agora cobraria duas
   * vezes.
   */
  const baseTributavel = round2(ferias + tercoFerias);
  const inss = inssEmpregado(baseTributavel, ti.tabela);
  const ir = irrfEmpregado(baseTributavel, inss, c.dependentes ?? 0, c.pensao ?? 0, tr.tabela);

  const totalProventos = round2(ferias + tercoFerias + abono + tercoAbono + adiantamento13);
  const totalDescontos = round2(inss + ir.imposto);
  const liquido = round2(totalProventos - totalDescontos);

  // FGTS incide sobre férias gozadas + terço; NÃO sobre o abono.
  const fgts = round2(baseTributavel * FGTS);
  const patronal = round2(baseTributavel * enc.total);

  /**
   * ⚠️ VENCE ATÉ DOIS DIAS ANTES DO INÍCIO (art. 145). Não é "no mês das
   * férias": é antes de elas começarem, e o dia é corrido — se cair em fim de
   * semana ou feriado, ANTECIPA. Pagar no dia do início já é atraso, e o
   * atraso dobra a remuneração (Súmula 450 do TST).
   */
  const vencimento = e.inicio ? anteciparParaDiaUtil(somarDias(e.inicio, -2)) : "";
  const retorno = e.inicio ? somarDias(e.inicio, e.diasGozados) : "";

  const memoria: LinhaMemoria[] = [
    { passo: 1, descricao: `Direito do período`, formula: `${e.faltas} faltas injustificadas → ${diasDireito} dias (art. 130)`, valor: diasDireito },
    { passo: 2, descricao: `Férias · ${e.diasGozados} dias`, formula: `${brl(bruto)} ÷ 30 × ${e.diasGozados}`, valor: ferias },
    { passo: 3, descricao: "1/3 constitucional", formula: `${brl(ferias)} ÷ 3`, valor: tercoFerias },
    { passo: 4, descricao: `Abono pecuniário · ${e.diasAbono} dias`, formula: e.diasAbono > 0 ? `${brl(bruto)} ÷ 30 × ${e.diasAbono} — INDENIZATÓRIO, sem imposto` : "não vendeu dias", valor: abono },
    { passo: 5, descricao: "1/3 sobre o abono", formula: e.diasAbono > 0 ? "também indenizatório" : "—", valor: tercoAbono },
    { passo: 6, descricao: "Adiantamento do 13º", formula: e.adiantar13 ? "1ª parcela, tributada só em dezembro" : "não pedido", valor: adiantamento13 },
    { passo: 7, descricao: "(=) Total de proventos", formula: "férias + terço + abono + adiantamento", valor: totalProventos },
    { passo: 8, descricao: "(−) INSS", formula: `sobre ${brl(baseTributavel)} — o abono NÃO entra na base`, valor: -inss },
    { passo: 9, descricao: "(−) IRRF", formula: `base ${brl(ir.base)} · critério ${ir.criterio}`, valor: -ir.imposto },
    { passo: 10, descricao: "(=) Líquido a receber", formula: "proventos − descontos", valor: liquido },
    { passo: 11, descricao: "(+) FGTS", formula: `${brl(baseTributavel)} × 8% — o abono não gera FGTS`, valor: fgts },
    { passo: 12, descricao: "(+) Encargos patronais", formula: `${(enc.total * 100).toFixed(1)}% — ${enc.porque}`, valor: patronal },
    { passo: 13, descricao: "(=) Custo da empresa", formula: "proventos + FGTS + patronal", valor: round2(totalProventos + fgts + patronal) },
  ];

  return {
    versao: FERIAS_VERSION,
    diasDireito, diasGozados: e.diasGozados, diasAbono: e.diasAbono,
    ferias, tercoFerias, abono, tercoAbono, adiantamento13, totalProventos,
    baseTributavel, inss, irrf: ir.imposto, totalDescontos, liquido,
    fgts, patronal,
    custoTotal: round2(totalProventos + fgts + patronal),
    vencimento, retorno, memoria, problemas,
    tabelas: {
      desatualizada: ti.desatualizada || tr.desatualizada,
      mesesDeAtraso: Math.max(ti.mesesDeAtraso, tr.mesesDeAtraso),
    },
  };
}
