/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CONTAS RECORRENTES — o que se repete, o que acaba, e quanto custa por mês.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A pergunta que esta camada responde é *"quanto a empresa compromete todo mês
 * só para continuar existindo"* — e ela não é a soma das contas do mês. O mês
 * corrente contém o aluguel (que volta), a parcela do notebook (que acaba em
 * março) e a compra avulsa de cadeiras (que não volta). Somar os três e chamar
 * de custo fixo promete uma previsibilidade que dois deles não têm.
 *
 * ⚠️ **AS TRÊS SEPARAÇÕES, e por que cada uma existe:**
 *
 *  1. **Parcelada × recorrente.** Pelo padrão dos lançamentos as duas são
 *     idênticas: mesmo valor, mesmo dia, todo mês. O que as separa é o FIM —
 *     e ele não está no padrão, está no dado (`parcelas`). Sem essa marca, o
 *     custo fixo sai inflado pela compra parcelada e a empresa acha que gasta
 *     mais do que gasta para existir.
 *  2. **Fixa × variável.** Aluguel repete e é sempre igual; energia repete e
 *     varia. As duas são compromisso, mas só a primeira dá para prometer. A
 *     variável entra pela MÉDIA, e a tela diz que é média.
 *  3. **Recorrente × avulsa.** Uma aparição não é padrão. Exige-se presença em
 *     pelo menos `MESES_MINIMOS` meses distintos — abaixo disso, chamar de
 *     recorrente é adivinhar.
 *
 * Puro, tipado, demo-safe, sem I/O e sem relógio. Versão `contas-recorrentes/1.0.0`.
 */
import type { RiskInput, RiskMovement } from "@/core/risk-engine/types";
import { magnitude, cancelado } from "@/core/indicadores/convencoes";

export const RECORRENTES_VERSION = "contas-recorrentes/1.0.0";

/** Quantos meses de histórico a classificação observa. */
export const JANELA_MESES = 6;
/** Em quantos meses distintos algo precisa aparecer para ser padrão. */
export const MESES_MINIMOS = 3;
/**
 * O quanto o valor pode oscilar e ainda ser "fixo" (coeficiente de variação).
 *
 * ⚠️ 15% não é rigor: aluguel reajusta, assinatura muda de câmbio, e a folha
 * varia com hora extra. Um teto apertado demais jogaria compromissos
 * genuinamente fixos para "variável" e esvaziaria o número que a tela promete.
 */
export const TETO_OSCILACAO = 0.15;

export type Especie = "fixa" | "variavel" | "parcelada" | "avulsa";

export const ROTULO_ESPECIE: Record<Especie, string> = {
  fixa: "Fixas",
  variavel: "Recorrentes variáveis",
  parcelada: "Parceladas",
  avulsa: "Avulsas",
};

export const TOKEN_ESPECIE: Record<Especie, string> = {
  // ⚠️ Rampa categórica do DS (`--a4p-cat-*`), montada por `color-mix` sobre os
  // tokens. Categorias se distinguem por INTENSIDADE do mesmo matiz — a paleta
  // tem um acento só, e quatro hexes avulsos aqui seriam quatro cores que
  // ninguém escolheu.
  fixa: "var(--a4p-cat-1)",
  variavel: "var(--a4p-cat-2)",
  parcelada: "var(--a4p-cat-3)",
  avulsa: "var(--a4p-cat-4)",
};

/* ========================================================================== */
/* Utilidades                                                                  */
/* ========================================================================== */

const mesDe = (iso: string) => iso.slice(0, 7);
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Desloca um mês "YYYY-MM" por n posições. */
export function deslocarMes(mes: string, n: number): string {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * A data que importa para uma conta a pagar: quando o dinheiro SAI (pagamento)
 * ou quando vai sair (vencimento). É a mesma escolha do painel.
 */
const dataDe = (m: RiskMovement) => (m.paid_date ?? m.due_date).slice(0, 10);

const ehContaAPagar = (m: RiskMovement) => m.type === "saida" && !cancelado(m);

/**
 * A chave do compromisso: contraparte + categoria.
 *
 * ⚠️ Só a contraparte não basta — o mesmo fornecedor manda o aluguel e uma
 * reforma pontual, e juntar os dois faria a reforma virar custo fixo. Só a
 * categoria também não: "Serviços" cobre dez fornecedores diferentes, e a
 * soma deles oscilaria demais para qualquer um ser fixo.
 */
function chave(m: RiskMovement, nomes: Record<string, string>): string {
  const parte = (m.party_id ? nomes[m.party_id] : null) ?? m.party_id ?? "—";
  return `${parte.trim().toLowerCase()}·${(m.category ?? "—").trim().toLowerCase()}`;
}

/* ========================================================================== */
/* O grupo                                                                     */
/* ========================================================================== */

export interface GrupoRecorrente {
  chave: string;
  contraparte: string;
  categoria: string;
  especie: Especie;
  /** Em quantos meses distintos apareceu na janela. */
  meses: number;
  /** Quantos lançamentos. */
  lancamentos: number;
  /** O que custa por mês — média sobre os meses OBSERVADOS. */
  mediaMensal: number;
  /** O último valor visto, para a pessoa reconhecer a conta. */
  ultimoValor: number;
  /** Quanto o valor oscila (coeficiente de variação). `null` com um único valor. */
  oscilacao: number | null;
  /** Nas parceladas, quantas faltam a partir do mês de referência. */
  parcelasRestantes: number | null;
}

/* ========================================================================== */
/* O painel                                                                    */
/* ========================================================================== */

export interface FatiaCategoria {
  categoria: string;
  valor: number;
  quantidade: number;
  fracao: number;
}

export interface MesDoGrafico {
  /** "YYYY-MM". */
  mes: string;
  rotulo: string;
  fixa: number;
  variavel: number;
  parcelada: number;
  avulsa: number;
  total: number;
}

export interface PainelRecorrentes {
  versao: string;
  /** Mês de referência, "YYYY-MM". */
  mes: string;
  /** ① Total de contas a pagar do mês de referência. */
  totalDoMes: number;
  quantidadeDoMes: number;
  /** ① O custo fixo mensal estimado. */
  custoFixoMensal: number;
  /** Quantos compromissos compõem o custo fixo — sem isso o número é um oráculo. */
  compromissosFixos: number;
  /**
   * POR QUE o custo fixo não pode ser respondido — `null` quando pode.
   *
   * ⚠️ Preenchido, `custoFixoMensal` NÃO deve ser exibido. É a regra da ONDA 4:
   * zero é um valor, não a ausência de valor. Com dois meses de histórico o
   * cálculo devolve R$ 0,00 corretamente — nada se repetiu o bastante para ser
   * padrão — e "seu custo fixo mensal é R$ 0,00" afirma que a empresa não tem
   * custo fixo, que é o oposto do que a base diz. Ela não diz nada ainda.
   */
  custoFixoIndisponivel: { motivo: string; comoResolver: string } | null;
  /** Em quantos meses da janela existe algum lançamento — a base da resposta acima. */
  mesesComDados: number;
  /** ② Os meses do gráfico, do mais antigo ao mês de referência. */
  meses: MesDoGrafico[];
  /** ③ O mês por categoria. */
  categorias: FatiaCategoria[];
  /** ④ A divisão do mês por espécie. */
  especies: { especie: Especie; rotulo: string; valor: number; quantidade: number; fracao: number }[];
  /** A lista, para a tela poder mostrar de onde o custo fixo veio. */
  grupos: GrupoRecorrente[];
}

/* ========================================================================== */
/* O motor                                                                     */
/* ========================================================================== */

export function montarPainelRecorrentes(input: RiskInput, mesRef?: string): PainelRecorrentes {
  const hoje = input.hoje.slice(0, 10);
  const mes = mesRef ?? mesDe(hoje);
  const nomes = input.partyNames ?? {};

  const primeiroMes = deslocarMes(mes, -(JANELA_MESES - 1));
  const contas = input.movements.filter(ehContaAPagar);
  const naJanela = contas.filter((m) => {
    const mm = mesDe(dataDe(m));
    return mm >= primeiroMes && mm <= mes;
  });

  /* ---- 1. agrupar --------------------------------------------------------- */
  const bruto = new Map<string, RiskMovement[]>();
  for (const m of naJanela) {
    const k = chave(m, nomes);
    const l = bruto.get(k);
    if (l) l.push(m); else bruto.set(k, [m]);
  }

  const grupos: GrupoRecorrente[] = [];
  for (const [k, ms] of Array.from(bruto.entries())) {
    const mesesDistintos = new Set(ms.map((m) => mesDe(dataDe(m))));
    const valores = ms.map(magnitude);
    const total = valores.reduce((s, v) => s + v, 0);
    const media = total / valores.length;
    // Coeficiente de variação: desvio ÷ média. Com um valor só não há oscilação
    // a medir — e `0` diria "é perfeitamente estável", que é outra afirmação.
    const oscilacao = valores.length < 2 || media === 0
      ? null
      : Math.sqrt(valores.reduce((s, v) => s + (v - media) ** 2, 0) / valores.length) / media;

    const parceladas = ms.filter((m) => (m.parcelas ?? 0) > 1);
    const ehParcelada = parceladas.length > 0 && parceladas.length >= ms.length / 2;

    let especie: Especie;
    if (ehParcelada) especie = "parcelada";
    else if (mesesDistintos.size < MESES_MINIMOS) especie = "avulsa";
    else if (oscilacao !== null && oscilacao > TETO_OSCILACAO) especie = "variavel";
    else especie = "fixa";

    const ordenados = [...ms].sort((a, b) => dataDe(a).localeCompare(dataDe(b)));
    const ultimo = ordenados[ordenados.length - 1];

    grupos.push({
      chave: k,
      contraparte: (ultimo.party_id ? nomes[ultimo.party_id] : null) ?? ultimo.category ?? "Sem contraparte",
      categoria: ultimo.category ?? "Sem categoria",
      especie,
      meses: mesesDistintos.size,
      lancamentos: ms.length,
      // ⚠️ Média sobre os meses OBSERVADOS, não sobre os 6 da janela: um
      // contrato que começou há dois meses custa o que custa por mês, e dividir
      // por seis o faria parecer um terço do que é.
      mediaMensal: round2(total / mesesDistintos.size),
      ultimoValor: round2(magnitude(ultimo)),
      oscilacao: oscilacao === null ? null : Math.round(oscilacao * 1000) / 1000,
      parcelasRestantes: ehParcelada
        ? Math.max(0, (ultimo.parcelas ?? 0) - (ultimo.parcela ?? 0))
        : null,
    });
  }
  grupos.sort((a, b) => b.mediaMensal - a.mediaMensal);

  const especieDaChave = new Map(grupos.map((g) => [g.chave, g.especie]));

  /* ---- 2. o mês de referência --------------------------------------------- */
  const doMes = naJanela.filter((m) => mesDe(dataDe(m)) === mes);
  const totalDoMes = round2(doMes.reduce((s, m) => s + magnitude(m), 0));

  /* ---- 3. o custo fixo ---------------------------------------------------- */
  const fixos = grupos.filter((g) => g.especie === "fixa");
  const custoFixoMensal = round2(fixos.reduce((s, g) => s + g.mediaMensal, 0));

  /**
   * ⚠️ SEM HISTÓRICO NÃO HÁ PADRÃO, e não haver padrão não é "custo fixo zero".
   *
   * A pergunta exige ver a mesma conta voltar. Com menos de `MESES_MINIMOS`
   * meses de lançamento na janela, nenhum grupo pode alcançar o mínimo — o zero
   * que sai daí não é uma medição, é o formato vazio do cálculo. Exibi-lo diria
   * a uma empresa recém-importada que ela não tem custo fixo nenhum.
   */
  const mesesComDados = new Set(naJanela.map((m) => mesDe(dataDe(m)))).size;
  const custoFixoIndisponivel = mesesComDados < MESES_MINIMOS
    ? {
      motivo: `Só há ${mesesComDados} ${mesesComDados === 1 ? "mês" : "meses"} de lançamentos — um padrão precisa de ao menos ${MESES_MINIMOS}.`,
      comoResolver: "Importe o extrato dos meses anteriores em Entrada de dados.",
    }
    : null;

  /* ---- 4. os meses do gráfico --------------------------------------------- */
  const meses: MesDoGrafico[] = Array.from({ length: JANELA_MESES }, (_, k) => {
    const mm = deslocarMes(primeiroMes, k);
    const linha: MesDoGrafico = {
      mes: mm, rotulo: rotuloMes(mm),
      fixa: 0, variavel: 0, parcelada: 0, avulsa: 0, total: 0,
    };
    for (const m of naJanela) {
      if (mesDe(dataDe(m)) !== mm) continue;
      const e = especieDaChave.get(chave(m, nomes)) ?? "avulsa";
      const v = magnitude(m);
      linha[e] = round2(linha[e] + v);
      linha.total = round2(linha.total + v);
    }
    return linha;
  });

  /* ---- 5. o mês por categoria --------------------------------------------- */
  const porCat = new Map<string, { valor: number; quantidade: number }>();
  for (const m of doMes) {
    const c = m.category ?? "Sem categoria";
    const x = porCat.get(c) ?? { valor: 0, quantidade: 0 };
    porCat.set(c, { valor: round2(x.valor + magnitude(m)), quantidade: x.quantidade + 1 });
  }
  const categorias: FatiaCategoria[] = Array.from(porCat.entries())
    .map(([categoria, x]) => ({
      categoria, ...x,
      fracao: totalDoMes > 0 ? x.valor / totalDoMes : 0,
    }))
    .sort((a, b) => b.valor - a.valor);

  /* ---- 6. o mês por espécie ----------------------------------------------- */
  const porEsp = new Map<Especie, { valor: number; quantidade: number }>();
  for (const m of doMes) {
    const e = especieDaChave.get(chave(m, nomes)) ?? "avulsa";
    const x = porEsp.get(e) ?? { valor: 0, quantidade: 0 };
    porEsp.set(e, { valor: round2(x.valor + magnitude(m)), quantidade: x.quantidade + 1 });
  }
  const ORDEM: Especie[] = ["fixa", "parcelada", "variavel", "avulsa"];
  const especies = ORDEM.map((e) => {
    const x = porEsp.get(e) ?? { valor: 0, quantidade: 0 };
    return {
      especie: e, rotulo: ROTULO_ESPECIE[e], ...x,
      fracao: totalDoMes > 0 ? x.valor / totalDoMes : 0,
    };
  });

  return {
    versao: RECORRENTES_VERSION,
    mes,
    totalDoMes,
    quantidadeDoMes: doMes.length,
    custoFixoMensal,
    compromissosFixos: fixos.length,
    custoFixoIndisponivel,
    mesesComDados,
    meses,
    categorias,
    especies,
    grupos,
  };
}

const NOMES_MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "2026-08" → "ago/26". Fatiado da string — `new Date` cairia no mês anterior. */
export function rotuloMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return `${NOMES_MES[m - 1]}/${String(a).slice(2)}`;
}
