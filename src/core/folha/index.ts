/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FOLHA SALARIAL — o que a empresa paga por um colaborador, e quando.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **O SALÁRIO NÃO É O CUSTO, e essa é a razão de este módulo existir.**
 *
 * Um CLT de R$ 5.000 custa entre R$ 6.400 e R$ 7.400 por mês dependendo do
 * regime da empresa — a diferença são encargos e provisões que não aparecem em
 * lugar nenhum até estourarem. O dono lança "salário 5.000" no contas a pagar,
 * planeja o caixa com esse número, e em dezembro descobre o 13º; em janeiro,
 * as férias; todo mês, o FGTS e o DARF que ele achava que já estavam no bruto.
 *
 * ⚠️ **CLT × PJ não é uma diferença de alíquota, é de QUEM RECOLHE.**
 *
 *  - No **CLT** a empresa DESCONTA do salário o que é do empregado (INSS e
 *    IRRF saem do bruto e não custam nada a mais) e PAGA POR CIMA o que é dela
 *    (FGTS sempre, contribuição patronal conforme o regime).
 *  - No **PJ** a empresa paga a nota e, acima de certos valores, RETÉM
 *    tributos que depois recolhe. O custo é a nota; as retenções saem do
 *    líquido do prestador.
 *
 * Tratar os dois como "um pagamento mensal" — que é como o contas a pagar os
 * tratava — apaga a diferença que decide o custo: o PJ de R$ 7.000 pode sair
 * mais barato que o CLT de R$ 5.000, ou não, e é essa comparação que a tela
 * precisa permitir.
 *
 * ⚠️ **A CONTRIBUIÇÃO PATRONAL DEPENDE DO REGIME**, e errar isso infla o custo
 * em 20% para a maioria das PMEs brasileiras. Empresa do Simples nos Anexos
 * I, II, III e V **não recolhe CPP à parte** — ela já está dentro do DAS.
 * Somente o **Anexo IV** e as empresas do Lucro Presumido/Real recolhem os 20%
 * patronais, o RAT e os terceiros por fora.
 *
 * Puro, tipado, demo-safe, sem I/O e sem relógio. Versão `folha/1.0.0`.
 */
import type { Regime, Anexo } from "@/core/fiscal/perfil";
import {
  inssDe, irrfDe, inssEmpregado, irrfEmpregado, tetoINSS,
  type TabelaINSS, type TabelaIRRF, type TabelasLegais, TABELAS_PADRAO,
} from "./tabelas";
import {
  vencimentoSalario, vencimentoFGTS, vencimentoDARF, vencimentoDecimo, mesSeguinte,
} from "./calendario";

export const FOLHA_VERSION = "folha/1.0.0";

export * from "./tabelas";
export * from "./calendario";

const round2 = (n: number) => Math.round(n * 100) / 100;

/* ========================================================================== */
/* O colaborador                                                               */
/* ========================================================================== */

export type Vinculo = "clt" | "pj";

export const ROTULO_VINCULO: Record<Vinculo, string> = {
  clt: "CLT (funcionário)",
  pj: "PJ (prestador com CNPJ)",
};

export const EXPLICACAO_VINCULO: Record<Vinculo, string> = {
  clt: "A empresa desconta INSS e IRRF do salário e paga FGTS e encargos por cima. O sistema calcula tudo e agenda cada vencimento.",
  pj: "A empresa paga a nota do prestador. Acima dos limites legais, retém tributos na fonte.",
};

export interface Colaborador {
  id: string;
  nome: string;
  vinculo: Vinculo;
  /** CPF (CLT) ou CNPJ (PJ) — só dígitos. */
  documento?: string | null;
  cargo?: string | null;
  /** Salário bruto mensal (CLT) ou valor da nota (PJ). */
  valor: number;
  /** Primeira competência em que ele custa, "YYYY-MM". */
  desde: string;
  /** Última competência (desligamento), quando houver. */
  ate?: string | null;
  /* --- só CLT --- */
  dependentes?: number;
  /** Desconto de vale-transporte, já líquido do que a lei permite descontar. */
  valeTransporte?: number;
  /** Desconto de vale-refeição / alimentação (coparticipação). */
  valeRefeicao?: number;
  /** Desconto de plano de saúde. */
  planoSaude?: number;
  /** Pensão alimentícia — deduz da base do IRRF. */
  pensao?: number;
  /** Outros descontos autorizados. */
  outrosDescontos?: number;
  /** Insalubridade/periculosidade/comissões já somados ao bruto. */
  centroCusto?: string | null;
}

/* ========================================================================== */
/* Encargos por regime                                                         */
/* ========================================================================== */

/** CPP patronal — 20% sobre a folha. */
export const CPP = 0.20;
/** FGTS — 8% sobre salário, 13º e férias. Devido em QUALQUER regime. */
export const FGTS = 0.08;

export interface EncargosPatronais {
  /** Contribuição previdenciária patronal (0 quando está no DAS). */
  cpp: number;
  /** RAT/SAT — risco ambiental do trabalho, 1% a 3% ajustado pelo FAP. */
  rat: number;
  /** Terceiros / Sistema S. */
  terceiros: number;
  /** A soma das três, em percentual. */
  total: number;
  /** Por que é assim — a frase que a tela mostra. */
  porque: string;
}

/**
 * ⚠️ **O ANEXO IV É A EXCEÇÃO QUE INVERTE A REGRA.**
 *
 * No Simples, a contribuição patronal está embutida no DAS — menos no Anexo IV
 * (construção, limpeza, vigilância, advocacia), em que ela é recolhida por
 * fora. Uma empresa de limpeza tratada como "Simples, logo sem CPP" subestima
 * o custo de cada funcionário em 20% do salário, todo mês, e a diferença só
 * aparece quando a guia chega.
 */
export function encargosPatronais(
  regime: Regime, anexo: Anexo | null, ratPct = 0.02, terceirosPct = 0.058,
): EncargosPatronais {
  const noDAS = regime === "simples" && anexo !== null && anexo !== "IV";
  if (regime === "mei") {
    return {
      cpp: 0, rat: 0, terceiros: 0, total: 0,
      porque: "O MEI recolhe 3% do salário do único empregado permitido, fora deste cálculo.",
    };
  }
  if (noDAS) {
    return {
      cpp: 0, rat: 0, terceiros: 0, total: 0,
      porque: `Simples Nacional Anexo ${anexo}: a contribuição patronal já está no DAS.`,
    };
  }
  /**
   * ⚠️ REGIME NÃO DECLARADO USA O CENÁRIO MAIS CARO — e diz que é isso.
   *
   * A escolha é deliberada: para planejar caixa, errar para cima assusta e
   * errar para baixo quebra. Mas ela precisa vir com o rótulo certo — a
   * primeira versão desta tela chamava o resultado de "um piso", e ele é
   * exatamente o oposto: com 28% de encargo patronal, é o TETO. Declarar o
   * regime só pode DIMINUIR o número, nunca aumentá-lo.
   *
   * E o texto não pode afirmar um regime que a empresa não declarou: dizer
   * "Lucro Presumido/Real" para quem não disse nada é inventar um fato sobre
   * o cliente na própria tela que pede o dado.
   */
  const porque = regime === "nao_declarado"
    ? "Regime não declarado: aplicado o cenário mais caro (patronal, RAT e terceiros). Declarar o regime só pode reduzir este custo."
    : regime === "simples"
      ? "Simples Nacional Anexo IV: a contribuição patronal é recolhida FORA do DAS."
      : "Lucro Presumido/Real: patronal, RAT e terceiros recolhidos sobre a folha.";
  return {
    cpp: CPP, rat: ratPct, terceiros: terceirosPct,
    total: round2(CPP + ratPct + terceirosPct),
    porque,
  };
}

/* ========================================================================== */
/* O cálculo de um CLT                                                         */
/* ========================================================================== */

export interface LinhaMemoria {
  passo: number;
  descricao: string;
  formula: string;
  valor: number;
}

export interface CalculoCLT {
  competencia: string;
  bruto: number;
  /* --- descontos do EMPREGADO (saem do bruto, não custam a mais) --- */
  inss: number;
  irrf: number;
  outros: number;
  totalDescontos: number;
  liquido: number;
  /* --- encargos do EMPREGADOR (custam por cima) --- */
  fgts: number;
  patronal: number;
  /* --- provisões (custo do mês, caixa depois) --- */
  provisaoDecimo: number;
  provisaoFerias: number;
  provisaoEncargosSobreProvisao: number;
  /** O que o colaborador custa POR MÊS, tudo somado. */
  custoTotal: number;
  /** custoTotal ÷ bruto — o multiplicador que quase ninguém tem na cabeça. */
  multiplicador: number;
  /** A conta, passo a passo, para poder conferir. */
  memoria: LinhaMemoria[];
  /** As tabelas usadas, e se alguma venceu. */
  tabelas: { inss: string; irrf: string; desatualizada: boolean; mesesDeAtraso: number };
  encargos: EncargosPatronais;
}

export function calcularCLT(
  c: Colaborador, competencia: string, regime: Regime, anexo: Anexo | null,
  tabelas: TabelasLegais = TABELAS_PADRAO,
): CalculoCLT {
  const ti = inssDe(competencia, tabelas);
  const tr = irrfDe(competencia, tabelas);
  const enc = encargosPatronais(regime, anexo);
  const bruto = round2(Math.max(0, c.valor));

  const inss = inssEmpregado(bruto, ti.tabela);
  const pensao = c.pensao ?? 0;
  const ir = irrfEmpregado(bruto, inss, c.dependentes ?? 0, pensao, tr.tabela);
  const outros = round2(
    (c.valeTransporte ?? 0) + (c.valeRefeicao ?? 0) + (c.planoSaude ?? 0)
    + pensao + (c.outrosDescontos ?? 0),
  );
  const totalDescontos = round2(inss + ir.imposto + outros);
  const liquido = round2(bruto - totalDescontos);

  const fgts = round2(bruto * FGTS);
  const patronal = round2(bruto * enc.total);

  // ⚠️ AS PROVISÕES SÃO CUSTO DO MÊS, mesmo saindo do caixa depois. Deixá-las
  // de fora faz o custo mensal parecer menor onze meses por ano e explodir no
  // décimo segundo — que é exatamente a surpresa que este módulo existe para
  // evitar.
  const provisaoDecimo = round2(bruto / 12);
  const provisaoFerias = round2((bruto * (1 + 1 / 3)) / 12);
  const provisaoEncargosSobreProvisao = round2((provisaoDecimo + provisaoFerias) * (FGTS + enc.total));

  const custoTotal = round2(
    bruto + fgts + patronal + provisaoDecimo + provisaoFerias + provisaoEncargosSobreProvisao,
  );

  const memoria: LinhaMemoria[] = [
    { passo: 1, descricao: "Salário bruto", formula: "informado no cadastro", valor: bruto },
    { passo: 2, descricao: "(−) INSS do empregado", formula: `progressivo por faixa · ${ti.tabela.fonte}`, valor: -inss },
    /**
     * ⚠️ O REDUTOR PRECISA APARECER, mesmo (e principalmente) quando zera o
     * imposto. Um "(−) IRRF R$ 0,00" sozinho num salário de R$ 5.000 lê como
     * defeito de cálculo — quem confere sabe que ali havia R$ 312,89 no ano
     * passado. Nomear a lei transforma o zero de suspeita em resposta.
     */
    { passo: 3, descricao: "(−) IRRF do empregado",
      formula: ir.redutor > 0
        ? `base ${brl(ir.base)} · critério ${ir.criterio} · tabela ${brl(ir.impostoDaTabela)} − redutor ${brl(ir.redutor)} (${tr.tabela.redutor?.fonte ?? "redutor legal"})`
        : `base ${brl(ir.base)} · critério ${ir.criterio} · ${tr.tabela.fonte}`,
      valor: -ir.imposto },
    { passo: 4, descricao: "(−) Outros descontos", formula: "VT + VR + saúde + pensão + outros", valor: -outros },
    { passo: 5, descricao: "(=) Líquido a receber", formula: "bruto − descontos", valor: liquido },
    { passo: 6, descricao: "(+) FGTS", formula: `${bruto} × 8%`, valor: fgts },
    { passo: 7, descricao: "(+) Encargos patronais", formula: `${bruto} × ${(enc.total * 100).toFixed(1)}% — ${enc.porque}`, valor: patronal },
    { passo: 8, descricao: "(+) Provisão de 13º", formula: `${bruto} ÷ 12`, valor: provisaoDecimo },
    { passo: 9, descricao: "(+) Provisão de férias + 1/3", formula: `${bruto} × 1,3333 ÷ 12`, valor: provisaoFerias },
    { passo: 10, descricao: "(+) Encargos sobre as provisões", formula: `(13º + férias) × ${((FGTS + enc.total) * 100).toFixed(1)}%`, valor: provisaoEncargosSobreProvisao },
    { passo: 11, descricao: "(=) Custo mensal da empresa", formula: "bruto + encargos + provisões", valor: custoTotal },
  ];

  return {
    competencia, bruto,
    inss, irrf: ir.imposto, outros, totalDescontos, liquido,
    fgts, patronal,
    provisaoDecimo, provisaoFerias, provisaoEncargosSobreProvisao,
    custoTotal,
    multiplicador: bruto > 0 ? Math.round((custoTotal / bruto) * 1000) / 1000 : 0,
    memoria,
    tabelas: {
      inss: ti.tabela.fonte, irrf: tr.tabela.fonte,
      desatualizada: ti.desatualizada || tr.desatualizada,
      mesesDeAtraso: Math.max(ti.mesesDeAtraso, tr.mesesDeAtraso),
    },
    encargos: enc,
  };
}

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/* ========================================================================== */
/* O cálculo de um PJ                                                          */
/* ========================================================================== */

/**
 * ⚠️ As retenções do PJ têm **limite de dispensa**, e é ele que separa o
 * prestador pequeno do grande. O IRRF de 1,5% só se aplica quando o imposto
 * apurado passa de R$ 10,00; PIS/COFINS/CSLL (4,65%) são dispensados em
 * pagamentos de até R$ 5.000 no mês para o mesmo prestador; e nenhuma delas se
 * aplica quando o prestador é do Simples Nacional e declara isso na nota.
 *
 * Reter de quem é dispensado tira dinheiro do prestador que ele só recupera na
 * declaração anual — e não reter de quem é obrigado deixa a responsabilidade
 * com a fonte pagadora, ou seja, com a empresa.
 */
export const LIMITE_IRRF_PJ = 10;
export const LIMITE_PCC_MENSAL = 5000;
export const ALIQUOTA_IRRF_PJ = 0.015;
export const ALIQUOTA_PCC = 0.0465;

export interface CalculoPJ {
  competencia: string;
  bruto: number;
  irrf: number;
  pisCofinsCsll: number;
  iss: number;
  totalRetido: number;
  /** O que o prestador recebe. */
  liquido: number;
  /** O que a empresa gasta — a nota cheia, sem provisão nem encargo. */
  custoTotal: number;
  multiplicador: number;
  memoria: LinhaMemoria[];
}

export function calcularPJ(
  c: Colaborador, competencia: string,
  opcoes: { doSimples?: boolean; issRetidoPct?: number } = {},
): CalculoPJ {
  const bruto = round2(Math.max(0, c.valor));
  const doSimples = opcoes.doSimples ?? true;

  const irBruto = round2(bruto * ALIQUOTA_IRRF_PJ);
  const irrf = doSimples || irBruto <= LIMITE_IRRF_PJ ? 0 : irBruto;
  const pisCofinsCsll = doSimples || bruto <= LIMITE_PCC_MENSAL ? 0 : round2(bruto * ALIQUOTA_PCC);
  const iss = round2(bruto * (opcoes.issRetidoPct ?? 0));
  const totalRetido = round2(irrf + pisCofinsCsll + iss);

  return {
    competencia, bruto, irrf, pisCofinsCsll, iss, totalRetido,
    liquido: round2(bruto - totalRetido),
    // ⚠️ O custo da empresa é a nota CHEIA. As retenções não são desconto dela:
    // são dinheiro do prestador que a empresa recolhe no lugar dele.
    custoTotal: bruto,
    multiplicador: 1,
    memoria: [
      { passo: 1, descricao: "Valor da nota", formula: "informado no cadastro", valor: bruto },
      { passo: 2, descricao: "(−) IRRF retido", formula: doSimples ? "dispensado — prestador do Simples Nacional" : `1,5% (dispensado até ${brl(LIMITE_IRRF_PJ)} de imposto)`, valor: -irrf },
      { passo: 3, descricao: "(−) PIS/COFINS/CSLL", formula: doSimples ? "dispensado — prestador do Simples Nacional" : `4,65% (dispensado até ${brl(LIMITE_PCC_MENSAL)} no mês)`, valor: -pisCofinsCsll },
      { passo: 4, descricao: "(−) ISS retido", formula: `${((opcoes.issRetidoPct ?? 0) * 100).toFixed(1)}% — varia por município`, valor: -iss },
      { passo: 5, descricao: "(=) Líquido ao prestador", formula: "nota − retenções", valor: round2(bruto - totalRetido) },
      { passo: 6, descricao: "(=) Custo da empresa", formula: "a nota cheia — as retenções são do prestador", valor: bruto },
    ],
  };
}

/* ========================================================================== */
/* Os títulos que a folha gera                                                 */
/* ========================================================================== */

export type TipoTituloFolha = "salario" | "fgts" | "darf" | "decimo" | "nota";

export const ROTULO_TITULO: Record<TipoTituloFolha, string> = {
  salario: "Salário",
  fgts: "FGTS",
  darf: "INSS e IRRF (DARF)",
  decimo: "13º salário",
  nota: "Nota do prestador",
};

export interface TituloFolha {
  tipo: TipoTituloFolha;
  colaboradorId: string;
  colaborador: string;
  descricao: string;
  valor: number;
  vencimento: string;
  competencia: string;
  categoria: string;
}

/**
 * Os títulos de UMA competência.
 *
 * ⚠️ São TRÊS títulos por CLT, não um. O salário líquido no 5º dia útil, o
 * FGTS no dia 20 e o DARF no dia 20 — três saídas de caixa em datas
 * diferentes, de valores diferentes, para credores diferentes. Lançar "folha"
 * como um pagamento só no dia 5 erra a data de dois deles e o valor do
 * terceiro.
 */
export function titulosDaCompetencia(
  c: Colaborador, competencia: string, regime: Regime, anexo: Anexo | null,
  tabelas: TabelasLegais = TABELAS_PADRAO,
): TituloFolha[] {
  if (!ativoEm(c, competencia)) return [];
  const base = { colaboradorId: c.id, colaborador: c.nome, competencia };

  if (c.vinculo === "pj") {
    const p = calcularPJ(c, competencia);
    return [{
      ...base, tipo: "nota",
      descricao: `Nota · ${c.nome}`,
      valor: p.liquido,
      // A nota do prestador segue o combinado; o 5º dia útil é a data que a
      // maioria dos contratos usa por espelhar a folha.
      vencimento: vencimentoSalario(competencia),
      categoria: "Serviços de terceiros",
    }];
  }

  const k = calcularCLT(c, competencia, regime, anexo, tabelas);
  const titulos: TituloFolha[] = [
    {
      ...base, tipo: "salario",
      descricao: `Salário · ${c.nome}`,
      valor: k.liquido,
      vencimento: vencimentoSalario(competencia),
      categoria: "Folha de pagamento",
    },
    {
      ...base, tipo: "fgts",
      descricao: `FGTS · ${c.nome}`,
      valor: k.fgts,
      vencimento: vencimentoFGTS(competencia),
      categoria: "Encargos sobre a folha",
    },
  ];
  // ⚠️ O DARF só existe quando há o que recolher. Um título de R$ 0,00 na lista
  // de contas a pagar é ruído que ensina a ignorar a lista — e quem ganha até a
  // faixa de isenção não gera guia nenhuma.
  const darf = round2(k.inss + k.irrf + k.patronal);
  if (darf > 0) {
    titulos.push({
      ...base, tipo: "darf",
      descricao: `INSS e IRRF · ${c.nome}`,
      valor: darf,
      vencimento: vencimentoDARF(competencia),
      categoria: "Encargos sobre a folha",
    });
  }
  return titulos;
}

/** O colaborador custa nesta competência? */
export function ativoEm(c: Colaborador, competencia: string): boolean {
  if (competencia < c.desde) return false;
  if (c.ate && competencia > c.ate) return false;
  return true;
}

/**
 * As duas parcelas do 13º de um ano.
 *
 * ⚠️ A primeira parcela é **metade do salário SEM descontos**; a segunda é o
 * restante COM INSS e IRRF sobre o 13º inteiro. É por isso que a segunda vem
 * menor que a primeira, e é a pergunta que todo dono faz em dezembro.
 */
export function titulosDoDecimo(
  c: Colaborador, ano: number, regime: Regime, anexo: Anexo | null,
  tabelas: TabelasLegais = TABELAS_PADRAO,
): TituloFolha[] {
  if (c.vinculo !== "clt") return [];
  const dez = `${ano}-12`;
  if (!ativoEm(c, dez)) return [];
  const { primeira, segunda } = vencimentoDecimo(ano);
  const k = calcularCLT(c, dez, regime, anexo, tabelas);
  const metade = round2(k.bruto / 2);
  const segundaParcela = round2(k.bruto - metade - k.inss - k.irrf);
  return [
    {
      colaboradorId: c.id, colaborador: c.nome, competencia: dez, tipo: "decimo",
      descricao: `13º · 1ª parcela · ${c.nome}`,
      valor: metade, vencimento: primeira, categoria: "Folha de pagamento",
    },
    {
      colaboradorId: c.id, colaborador: c.nome, competencia: dez, tipo: "decimo",
      descricao: `13º · 2ª parcela · ${c.nome}`,
      valor: Math.max(0, segundaParcela), vencimento: segunda, categoria: "Folha de pagamento",
    },
  ];
}

/* ========================================================================== */
/* O painel da folha                                                           */
/* ========================================================================== */

export interface LinhaFolha {
  colaborador: Colaborador;
  clt: CalculoCLT | null;
  pj: CalculoPJ | null;
  custoTotal: number;
  liquido: number;
  titulos: TituloFolha[];
}

export interface PainelFolha {
  versao: string;
  competencia: string;
  regime: Regime;
  anexo: Anexo | null;
  linhas: LinhaFolha[];
  /** Quantos de cada vínculo. */
  quantosCLT: number;
  quantosPJ: number;
  /** A soma dos salários/notas brutos. */
  totalBruto: number;
  /** O que sai do caixa como salário/nota líquida. */
  totalLiquido: number;
  /** FGTS + patronal + provisões — o que não está no bruto. */
  totalEncargos: number;
  /** O custo de verdade. */
  custoTotal: number;
  /** custoTotal ÷ totalBruto. */
  multiplicador: number;
  /** Todos os títulos da competência, ordenados por vencimento. */
  titulos: TituloFolha[];
  /** Alguma tabela legal venceu? */
  tabelaDesatualizada: boolean;
  encargos: EncargosPatronais;
}

export function montarPainelFolha(
  colaboradores: Colaborador[], competencia: string, regime: Regime, anexo: Anexo | null,
  tabelas: TabelasLegais = TABELAS_PADRAO,
): PainelFolha {
  const ativos = colaboradores.filter((c) => ativoEm(c, competencia));
  const linhas: LinhaFolha[] = ativos.map((c) => {
    const titulos = titulosDaCompetencia(c, competencia, regime, anexo, tabelas);
    if (c.vinculo === "pj") {
      const pj = calcularPJ(c, competencia);
      return { colaborador: c, clt: null, pj, custoTotal: pj.custoTotal, liquido: pj.liquido, titulos };
    }
    const clt = calcularCLT(c, competencia, regime, anexo, tabelas);
    return { colaborador: c, clt, pj: null, custoTotal: clt.custoTotal, liquido: clt.liquido, titulos };
  });
  linhas.sort((a, b) => b.custoTotal - a.custoTotal);

  const totalBruto = round2(linhas.reduce((s, l) => s + l.colaborador.valor, 0));
  const totalLiquido = round2(linhas.reduce((s, l) => s + l.liquido, 0));
  const custoTotal = round2(linhas.reduce((s, l) => s + l.custoTotal, 0));

  return {
    versao: FOLHA_VERSION,
    competencia, regime, anexo, linhas,
    quantosCLT: linhas.filter((l) => l.colaborador.vinculo === "clt").length,
    quantosPJ: linhas.filter((l) => l.colaborador.vinculo === "pj").length,
    totalBruto, totalLiquido,
    totalEncargos: round2(custoTotal - totalBruto),
    custoTotal,
    multiplicador: totalBruto > 0 ? Math.round((custoTotal / totalBruto) * 1000) / 1000 : 0,
    titulos: linhas.flatMap((l) => l.titulos).sort((a, b) => a.vencimento.localeCompare(b.vencimento)),
    tabelaDesatualizada: linhas.some((l) => l.clt?.tabelas.desatualizada ?? false),
    encargos: encargosPatronais(regime, anexo),
  };
}

/**
 * O custo ANUAL da folha — o número que muda a decisão de contratar.
 *
 * ⚠️ Ele NÃO é o custo mensal × 12. O 13º e as férias já entram provisionados
 * no mensal, então multiplicar por doze os contaria de novo. O anual é a soma
 * das doze competências, cada uma com a sua tabela.
 */
export function custoAnual(
  colaboradores: Colaborador[], ano: number, regime: Regime, anexo: Anexo | null,
  tabelas: TabelasLegais = TABELAS_PADRAO,
): number {
  let total = 0;
  for (let m = 1; m <= 12; m++) {
    const comp = `${ano}-${String(m).padStart(2, "0")}`;
    total += montarPainelFolha(colaboradores, comp, regime, anexo, tabelas).custoTotal;
  }
  return round2(total);
}

/**
 * Quanto CUSTA a mais contratar um CLT em vez de um PJ pelo mesmo bruto.
 *
 * ⚠️ Esta comparação é legítima como CUSTO e ilegítima como conselho: a
 * escolha entre CLT e PJ não é financeira, é jurídica — contratar como PJ quem
 * trabalha com subordinação, habitualidade e exclusividade é o que a Justiça
 * do Trabalho chama de pejotização, e o passivo de um reconhecimento de
 * vínculo é maior que a economia de todos os meses somados. O motor devolve o
 * número; quem decide precisa saber que ele não é o único critério.
 */
export function compararVinculo(
  bruto: number, competencia: string, regime: Regime, anexo: Anexo | null,
  tabelas: TabelasLegais = TABELAS_PADRAO,
): { clt: number; pj: number; diferenca: number; percentual: number; alerta: string } {
  const base: Colaborador = { id: "sim", nome: "Simulação", vinculo: "clt", valor: bruto, desde: competencia };
  const clt = calcularCLT(base, competencia, regime, anexo, tabelas).custoTotal;
  const pj = calcularPJ({ ...base, vinculo: "pj" }, competencia).custoTotal;
  return {
    clt, pj,
    diferenca: round2(clt - pj),
    percentual: pj > 0 ? Math.round(((clt - pj) / pj) * 1000) / 10 : 0,
    alerta:
      "A diferença é de CUSTO. A escolha entre CLT e PJ é jurídica: contratar "
      + "como PJ quem trabalha com subordinação, habitualidade e exclusividade "
      + "expõe a empresa ao reconhecimento de vínculo, cujo passivo supera a "
      + "economia acumulada.",
  };
}

export { mesSeguinte };

/* ========================================================================== */
/* Férias e rescisão                                                           */
/* ========================================================================== */
/**
 * ⚠️ Reexportados no FIM do arquivo, não no topo: os dois módulos importam
 * `encargosPatronais` e `FGTS` daqui, e um `export *` antes das definições
 * fecharia um ciclo em que o import chega com `undefined`.
 */
export * from "./ferias";
export * from "./rescisao";
