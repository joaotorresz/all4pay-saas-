/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O PERFIL FISCAL — uma fonte de verdade, e nenhum regime por omissão.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **O DEFEITO MEDIDO, e ele não era o que parecia.** A auditoria descreveu
 * "duas telas afirmando regimes diferentes" e supôs duas chaves em desacordo no
 * banco. Medido: o banco tem UMA empresa e UM valor — `regime: "Simples
 * Nacional"`. A contradição nasce em outro lugar:
 *
 *  - **Configurações** hidrata do servidor (`fetchCompany`) e mostra Simples.
 *  - **A tela de impostos** lê `loadCompany()`, que consulta **só o
 *    localStorage**, de forma síncrona. Com o cache vazio — navegador novo,
 *    cache limpo, outra máquina — ela recebe `null`.
 *  - E `regimeDaEmpresa(db, padrao = "presumido")` devolvia **"Lucro
 *    Presumido"** para o `null`.
 *
 * 16,33% é exatamente PIS 0,65 + COFINS 3 + ISS 5 + CSLL 2,88 + IRPJ 4,8 — o
 * Lucro Presumido serviços. Os **R$ 284.823,41 apurados em 12 meses saíram de
 * um regime que ninguém declarou.**
 *
 * ⚠️ **É a doença da ONDA 4 no domínio fiscal**, e aqui ela é pior: lá a
 * ausência virava R$ 0 numa tela; aqui vira uma guia de imposto com valor e
 * vencimento. Um padrão silencioso em cálculo tributário não é conveniência —
 * é uma afirmação sobre a obrigação legal de alguém, feita a partir de nada.
 *
 * Daí a regra deste módulo: **`nao_declarado` é um valor de primeira classe**.
 * Nenhuma função inventa regime, e a apuração não sai enquanto ele não existir.
 *
 * Puro, tipado, demo-safe, sem I/O e sem relógio. Versão `fiscal/1.0.0`.
 */

export const FISCAL_VERSION = "fiscal/1.0.0";

/* ========================================================================== */
/* Regime                                                                      */
/* ========================================================================== */

export const REGIMES = [
  "nao_declarado", "mei", "simples", "presumido", "real",
] as const;
export type Regime = (typeof REGIMES)[number];

export const ROTULO_REGIME: Record<Regime, string> = {
  nao_declarado: "Regime não declarado",
  mei: "MEI",
  simples: "Simples Nacional",
  presumido: "Lucro Presumido",
  real: "Lucro Real",
};

/** ⚠️ Só estes apuram. `real` está MODELADO e não habilitado — ver `apurar`. */
export const REGIMES_HABILITADOS: readonly Regime[] = ["mei", "simples", "presumido"];

/* ========================================================================== */
/* Anexos do Simples                                                           */
/* ========================================================================== */

export const ANEXOS = ["I", "II", "III", "IV", "V"] as const;
export type Anexo = (typeof ANEXOS)[number];

export const ROTULO_ANEXO: Record<Anexo, string> = {
  I: "Anexo I — Comércio",
  II: "Anexo II — Indústria",
  III: "Anexo III — Serviços (fator R ≥ 28%)",
  IV: "Anexo IV — Construção e serviços sem CPP",
  V: "Anexo V — Serviços (fator R < 28%)",
};

/* ========================================================================== */
/* PIS/COFINS                                                                  */
/* ========================================================================== */

/**
 * ⚠️ O regime de PIS/COFINS NÃO é consequência automática do regime de renda.
 * Presumido costuma ser cumulativo e Real não-cumulativo, mas há atividades no
 * Real que permanecem cumulativas por lei. Deduzir um do outro acerta na
 * maioria e erra em silêncio na exceção — que é onde o cliente perde dinheiro.
 */
export const REGIMES_PIS_COFINS = ["cumulativo", "nao_cumulativo", "nao_se_aplica"] as const;
export type RegimePisCofins = (typeof REGIMES_PIS_COFINS)[number];

/* ========================================================================== */
/* O perfil                                                                    */
/* ========================================================================== */

export interface PerfilFiscal {
  regime: Regime;
  /** Só faz sentido no Simples. `null` quando não se aplica ou não foi decidido. */
  anexo: Anexo | null;
  /** CNAE da atividade principal, só dígitos. */
  cnaePrincipal: string | null;
  /** Município do estabelecimento — o ISS depende dele, e não há padrão nacional. */
  municipio: string | null;
  uf: string | null;
  /**
   * Alíquota de ISS em fração (0,05 = 5%).
   * ⚠️ `null` NÃO vira 5%: a lei municipal fixa entre 2% e 5%, e escolher o teto
   * por comodidade provisiona a mais todo mês, sem ninguém decidir.
   */
  issAliquota: number | null;
  /** A empresa é substituída tributária em alguma operação? */
  substituicaoTributaria: boolean;
  regimePisCofins: RegimePisCofins;
  /** Desde quando este perfil vale (YYYY-MM-DD). */
  vigenteDe: string;
  /** Até quando. `null` = vigente. */
  vigenteAte: string | null;
  /** Quem declarou, para a trilha. */
  declaradoPor: string | null;
}

/**
 * O perfil de quem ainda não declarou nada.
 *
 * ⚠️ Ele NÃO é "presumido com campos vazios". É a ausência, nomeada — e é o que
 * faz a tela dizer "não declarado" em vez de exibir uma carga tributária que
 * ninguém pediu.
 */
export const PERFIL_NAO_DECLARADO: PerfilFiscal = {
  regime: "nao_declarado",
  anexo: null,
  cnaePrincipal: null,
  municipio: null,
  uf: null,
  issAliquota: null,
  substituicaoTributaria: false,
  regimePisCofins: "nao_se_aplica",
  vigenteDe: "1900-01-01",
  vigenteAte: null,
  declaradoPor: null,
};

/* ========================================================================== */
/* O histórico — porque regime MUDA, e a apuração antiga não muda com ele      */
/* ========================================================================== */

/**
 * ⚠️ **Regime tem VIGÊNCIA, e essa é a razão de existir histórico.** Uma empresa
 * que saiu do Simples em 01/01 tem onze meses no Simples e um no Presumido no
 * mesmo ano. Guardar só o regime ATUAL faz a apuração de fevereiro do ano
 * passado ser recalculada com a regra de hoje — e o número muda sozinho, sem
 * nenhum lançamento ter sido tocado, no exato relatório que já foi entregue ao
 * contador.
 */
export interface HistoricoFiscal {
  perfis: readonly PerfilFiscal[];
}

/** O perfil vigente numa data. Devolve o não-declarado quando nenhum cobre. */
export function perfilEm(h: HistoricoFiscal, dataISO: string): PerfilFiscal {
  const d = dataISO.slice(0, 10);
  const cobrem = h.perfis.filter(
    (p) => p.vigenteDe <= d && (p.vigenteAte === null || p.vigenteAte >= d),
  );
  if (cobrem.length === 0) return PERFIL_NAO_DECLARADO;
  // O mais recente vence — dois perfis cobrindo a mesma data é erro de cadastro,
  // e `problemasDoHistorico` o denuncia em vez de esconder.
  return cobrem.reduce((a, b) => (a.vigenteDe >= b.vigenteDe ? a : b));
}

/** O perfil de hoje. */
export const perfilVigente = (h: HistoricoFiscal, hoje: string): PerfilFiscal =>
  perfilEm(h, hoje);

/**
 * Os defeitos do histórico, em português.
 *
 * ⚠️ Sobreposição é o mais perigoso: dois perfis cobrindo a mesma data fazem a
 * apuração depender de qual deles a função escolheu, e o resultado muda sem
 * nada visível ter mudado.
 */
export function problemasDoHistorico(h: HistoricoFiscal): string[] {
  const out: string[] = [];
  const ordenados = [...h.perfis].sort((a, b) => a.vigenteDe.localeCompare(b.vigenteDe));
  for (let i = 0; i < ordenados.length; i++) {
    const p = ordenados[i];
    if (p.vigenteAte && p.vigenteAte < p.vigenteDe) {
      out.push(`Vigência invertida: ${ROTULO_REGIME[p.regime]} começa em ${p.vigenteDe} e termina em ${p.vigenteAte}.`);
    }
    const prox = ordenados[i + 1];
    if (prox && (p.vigenteAte === null || p.vigenteAte >= prox.vigenteDe)) {
      out.push(
        `Dois regimes cobrem ${prox.vigenteDe}: ${ROTULO_REGIME[p.regime]} e ${ROTULO_REGIME[prox.regime]}. `
        + "Feche a vigência do anterior no dia anterior ao início do seguinte.",
      );
    }
    if (p.regime === "simples" && !p.anexo) {
      out.push("Simples Nacional sem anexo: a alíquota depende do anexo e não há padrão a assumir.");
    }
    if (p.regime === "presumido" && p.issAliquota === null) {
      out.push("Lucro Presumido sem alíquota de ISS: ela é municipal (2% a 5%) e não tem valor nacional.");
    }
  }
  return out;
}

/* ========================================================================== */
/* A leitura do cadastro legado — e por que ela NÃO tem padrão                 */
/* ========================================================================== */

/**
 * Lê o regime do cadastro antigo (`a4p_company.db`), sem inventar nada.
 *
 * ⚠️ **A assinatura mudou de propósito e é o coração desta onda.** A anterior
 * era `regimeDaEmpresa(db, padrao = "presumido")` — e foi esse parâmetro que
 * transformou um localStorage vazio em R$ 284.823,41 de imposto apurado. Agora
 * a ausência devolve `nao_declarado`, e quem consome é obrigado a tratar.
 *
 * Ela ainda lê as DUAS chaves históricas (`regimeTributario` e `regime`) porque
 * o dado gravado é o que é; o que sai é um valor só.
 */
export function regimeDoCadastro(db: Record<string, unknown> | null | undefined): Regime {
  const bruto = String(db?.regimeTributario ?? db?.regime ?? "").toLowerCase().trim();
  if (!bruto) return "nao_declarado";
  if (bruto.includes("simples")) return "simples";
  if (bruto.includes("mei")) return "mei";
  if (bruto.includes("real")) return "real";
  if (bruto.includes("presumido")) return "presumido";
  return "nao_declarado";
}

export interface DivergenciaDeRegime {
  /** `true` quando as duas chaves do cadastro discordam entre si. */
  conflito: boolean;
  /** O que cada uma diz, para a tela mostrar AS DUAS. */
  cadastro?: Regime;
  edicao?: Regime;
}

/**
 * ⚠️ Resolver a precedência em silêncio conserta o número e esconde o defeito:
 * alguém preencheu dois campos com respostas diferentes, e só a empresa sabe
 * qual está certa. A ONDA 6 exige apresentar as duas e parar.
 */
export function divergenciaDeRegime(
  db: Record<string, unknown> | null | undefined,
): DivergenciaDeRegime {
  const a = String(db?.regimeTributario ?? "").trim();
  const b = String(db?.regime ?? "").trim();
  if (!a || !b) return { conflito: false };
  const ra = regimeDoCadastro({ regime: a });
  const rb = regimeDoCadastro({ regime: b });
  return ra === rb ? { conflito: false } : { conflito: true, cadastro: ra, edicao: rb };
}

/* ========================================================================== */
/* FATOR R — o anexo como CONSEQUÊNCIA do dado, não como escolha               */
/* ========================================================================== */

/**
 * O **fator R** = folha de pagamento dos últimos 12 meses ÷ receita bruta dos
 * últimos 12 meses. Ele decide entre o **Anexo III** (≥ 28%) e o **Anexo V**
 * (< 28%) para boa parte dos serviços — e a diferença entre os dois começa em
 * 6% contra 15,5%, ou seja, mais que o dobro.
 *
 * ⚠️ **Ele não é uma escolha, é uma medição** — e por isso mora aqui, calculado
 * sobre os lançamentos que o sistema já tem, com a lista do que entrou. Deixá-lo
 * como campo digitado convidaria alguém a marcar "Anexo III" porque a alíquota é
 * menor, e a fiscalização compara com a folha real.
 *
 * ⚠️ **Sem receita não há fator R** — é uma razão sobre a receita, e a mesma
 * regra da margem na ONDA 4 vale aqui: "0%" leria como "não tem folha", quando
 * a verdade é "não faturou". Devolve `null` e a tela diz por quê.
 */
export interface FatorR {
  /** A razão, em fração. `null` quando não há base. */
  valor: number | null;
  folha12m: number;
  receita12m: number;
  /** O anexo que o fator R indica, quando ele existe. */
  anexoIndicado: Anexo | null;
  /** Por que não há número, quando não há. */
  indisponivel?: string;
  /** Os ids dos lançamentos que entraram em cada lado — a reprodutibilidade. */
  movimentosFolha: readonly string[];
  movimentosReceita: readonly string[];
}

export const LIMITE_FATOR_R = 0.28;

export interface LancamentoFiscal {
  id: string;
  tipo: "entrada" | "saida";
  /** Magnitude, sempre positiva — a convenção da ONDA 1. */
  valor: number;
  categoria?: string | null;
  /** A data de competência (YYYY-MM-DD). */
  competencia: string;
  /** `true` quando o lançamento já aconteceu. */
  liquidado: boolean;
}

/** Categorias que compõem a folha para efeito de fator R. */
const RE_FOLHA = /\b(folha|salari|sal[aá]rio|pro ?labore|pró ?labore|encargo|fgts|inss|13|decimo terceiro|d[eé]cimo terceiro|ferias|f[ée]rias|rescis[aã]o|vale transporte|vale refei[çc][aã]o|vale alimenta[çc][aã]o|pessoal)\b/i;

/**
 * ⚠️ O que NÃO é receita para o fator R: transferência entre contas próprias,
 * resgate, empréstimo e receita financeira. É a MESMA exclusão de
 * `receitaTributavel` (ONDA 1), e por um motivo que vale repetir — sem ela, um
 * resgate de aplicação infla a receita, derruba o fator R e joga a empresa no
 * Anexo V, que custa mais que o dobro.
 */
const RE_FORA_DA_RECEITA =
  /\b(transfer[êe]ncia|transf|resgate|aplica[çc][ãa]o|rendimento|juros|empr[ée]stimo|financiamento|aporte|estorno|reembolso|devolu[çc][ãa]o)\b/i;

export function calcularFatorR(
  lancamentos: readonly LancamentoFiscal[],
  de: string,
  ate: string,
): FatorR {
  const naJanela = (l: LancamentoFiscal) =>
    l.competencia >= de && l.competencia <= ate;

  const folha = lancamentos.filter(
    (l) => naJanela(l) && l.tipo === "saida" && RE_FOLHA.test(l.categoria ?? ""),
  );
  const receita = lancamentos.filter(
    (l) => naJanela(l) && l.tipo === "entrada" && !RE_FORA_DA_RECEITA.test(l.categoria ?? ""),
  );

  const folha12m = folha.reduce((s, l) => s + l.valor, 0);
  const receita12m = receita.reduce((s, l) => s + l.valor, 0);

  const base = {
    folha12m, receita12m,
    movimentosFolha: folha.map((l) => l.id),
    movimentosReceita: receita.map((l) => l.id),
  };

  if (receita12m <= 0) {
    return {
      ...base, valor: null, anexoIndicado: null,
      indisponivel:
        "não houve receita tributável nos 12 meses — o fator R é uma razão sobre a receita, "
        + "e sem ela não existe. Um 0% aqui leria como 'não tem folha', que é outra coisa.",
    };
  }

  const valor = folha12m / receita12m;
  return { ...base, valor, anexoIndicado: valor >= LIMITE_FATOR_R ? "III" : "V" };
}

/** A frase que a tela mostra ao lado do número — o porquê do anexo. */
export function explicarFatorR(f: FatorR): string {
  if (f.valor === null) return f.indisponivel ?? "sem base para calcular";
  const pct = (f.valor * 100).toFixed(1).replace(".", ",");
  const limite = (LIMITE_FATOR_R * 100).toFixed(0);
  return f.valor >= LIMITE_FATOR_R
    ? `Folha de ${pct}% da receita, acima dos ${limite}% — indica o Anexo III (alíquota inicial 6%).`
    : `Folha de ${pct}% da receita, abaixo dos ${limite}% — indica o Anexo V (alíquota inicial 15,5%).`;
}
