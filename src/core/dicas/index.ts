/**
 * DICAS all4pay — leituras da movimentação do próprio cliente.
 *
 * ⚠️ NÃO É UM MODELO TREINADO, e chamar isto de "machine learning" seria
 * exagerar o que ele faz. É aprendizado ESTATÍSTICO sobre o histórico do
 * próprio cliente: a linha de base sai dos meses anteriores DELE, e cada dica
 * compara o mês corrente contra essa base. É exatamente o que a pergunta do
 * exemplo pede ("custo fixo em R$ 30.000, 10% acima do mês passado") e não
 * precisa de treino, rótulo nem servidor de inferência para responder.
 *
 * A diferença importa na prática: um modelo treinado erra de formas que não
 * dá para explicar na tela, e aqui toda dica carrega a CONTA que a produziu
 * (`base`, `atual`, `variacao`) — quem lê pode conferir. Um número que a
 * pessoa não consegue conferir é um número em que ela não vai confiar duas
 * vezes.
 *
 * Puro, tipado, demo-safe, sem I/O e sem relógio (`hoje` vem do `RiskInput`).
 * Versão `dicas/1.0.0`.
 */
import type { RiskInput, RiskMovement } from "@/core/risk-engine/types";
import { assinado, liquidado } from "@/core/indicadores/convencoes";
import {
  entradas as entradasDe,
  saidas as saidasDe,
  resultado as resultadoDe,
  saldo as saldoDe,
  burn as burnDe,
  runway as runwayDe,
  inadimplencia as inadimplenciaDe,
  janelaMes,
  janelaDoMesDe,
} from "@/core/indicadores";

export const DICAS_VERSION = "dicas/1.0.0";

export type TomDica = "neutro" | "atencao" | "bom";

export interface Dica {
  id: string;
  /** Frase curta que abre a dica — o assunto. */
  titulo: string;
  /** A leitura, com o número e a comparação. */
  texto: string;
  tom: TomDica;
  /** Para onde a dica leva quem quiser conferir. */
  rota?: string;
  /**
   * A CONTA por trás da dica. Existe para a tela poder mostrar de onde o
   * número saiu — sem isso a dica é uma afirmação sem procedência.
   */
  base?: { rotulo: string; valor: number };
  atual?: number;
  variacao?: number;
}

/** Passo que falta para o sistema ter informação suficiente. */
export interface PassoDica {
  id: string;
  titulo: string;
  texto: string;
  rota: string;
  feito: boolean;
}

export interface ResultadoDicas {
  /** `onboarding` quando ainda não há histórico que sustente comparação. */
  modo: "dicas" | "onboarding";
  dicas: Dica[];
  passos: PassoDica[];
  /** Quantos meses de histórico a base usou — a "memória" disponível. */
  mesesDeHistorico: number;
}

/* ----------------------------- infraestrutura ----------------------------- */

const pct = (atual: number, base: number): number | null =>
  base === 0 ? null : ((atual - base) / Math.abs(base)) * 100;

const fmt = (n: number) =>
  "R$ " + Math.abs(Math.round(n)).toLocaleString("pt-BR");

const fmtPct = (n: number) => `${n < 0 ? "−" : "+"}${Math.abs(n).toFixed(1).replace(".", ",")}%`;

function partes(iso: string) {
  const [a, m] = iso.slice(0, 10).split("-").map(Number);
  return { ano: a, mes: m };
}

/** As janelas dos últimos `n` meses, do mais antigo ao mês corrente. */
function ultimosMeses(hoje: string, n: number) {
  const { ano, mes } = partes(hoje);
  return Array.from({ length: n }, (_, i) => {
    const k = n - 1 - i;
    const m = mes - k;
    return janelaMes(ano + Math.floor((m - 1) / 12), ((m - 1) % 12 + 12) % 12);
  });
}

/**
 * CUSTO FIXO — a despesa que se repete todo mês.
 *
 * ⚠️ "Fixo" aqui é uma DEFINIÇÃO, não um palpite: a categoria precisa
 * aparecer em pelo menos 3 dos meses observados. Sem essa exigência, uma
 * compra grande e única entraria como custo fixo e a dica diria que a
 * estrutura da empresa cresceu quando ela só comprou uma máquina.
 */
function custoFixo(input: RiskInput, meses: ReturnType<typeof ultimosMeses>): Map<string, number[]> {
  const porCategoria = new Map<string, number[]>();
  const saidasDoMes = (i: number) =>
    input.movements.filter(
      (m) => m.type === "saida" && liquidado(m) && (m.paid_date ?? "").slice(0, 10) >= meses[i].de
        && (m.paid_date ?? "").slice(0, 10) <= meses[i].ate,
    );
  meses.forEach((_, i) => {
    for (const m of saidasDoMes(i)) {
      const cat = (m.category ?? "outros").toLowerCase();
      const arr = porCategoria.get(cat) ?? Array(meses.length).fill(0);
      arr[i] += Math.abs(m.amount);
      porCategoria.set(cat, arr);
    }
  });
  // só o que se repete
  for (const [cat, serie] of Array.from(porCategoria)) {
    if (serie.filter((v) => v > 0).length < 3) porCategoria.delete(cat);
  }
  return porCategoria;
}

/* --------------------------------- motor --------------------------------- */

/** Quantos lançamentos bastam para uma comparação valer alguma coisa. */
const MINIMO_PARA_COMPARAR = 12;
/** Quantos meses de histórico a base observa. */
const MESES_DE_BASE = 6;

export function montarDicas(input: RiskInput | undefined, contatos = 0): ResultadoDicas {
  if (!input || input.movements.length < MINIMO_PARA_COMPARAR) {
    return { modo: "onboarding", dicas: [], passos: passosQueFaltam(input, contatos), mesesDeHistorico: 0 };
  }

  const meses = ultimosMeses(input.hoje, MESES_DE_BASE);
  const jAtual = janelaDoMesDe(input.hoje);
  const jAnterior = meses[meses.length - 2];
  const dicas: Dica[] = [];

  /* 1. custo fixo do mês contra o mês anterior — a dica do exemplo */
  const fixos = custoFixo(input, meses);
  const series = Array.from(fixos.values());
  const totalFixoAtual = series.reduce((s, v) => s + v[v.length - 1], 0);
  const totalFixoAnterior = series.reduce((s, v) => s + v[v.length - 2], 0);
  if (totalFixoAtual > 0 && totalFixoAnterior > 0) {
    const v = pct(totalFixoAtual, totalFixoAnterior);
    if (v !== null) {
      dicas.push({
        id: "custo-fixo",
        titulo: "Custo fixo do mês",
        texto: `Seu custo fixo está em ${fmt(totalFixoAtual)}, ${fmtPct(v)} em relação ao mês passado.`,
        tom: v > 8 ? "atencao" : v < -5 ? "bom" : "neutro",
        rota: "/dashboard/reports/dre",
        base: { rotulo: "mês anterior", valor: totalFixoAnterior },
        atual: totalFixoAtual,
        variacao: v,
      });
    }
  }

  /* 2. a categoria que mais cresceu — onde o aumento nasceu */
  let pior: { cat: string; atual: number; base: number; v: number } | null = null;
  for (const [cat, serie] of Array.from(fixos)) {
    const atual = serie[serie.length - 1];
    const base: number[] = serie.slice(0, -1).filter((x: number) => x > 0);
    if (!base.length || atual === 0) continue;
    const media = base.reduce((s: number, x: number) => s + x, 0) / base.length;
    const v = pct(atual, media);
    if (v !== null && v > 15 && (!pior || v > pior.v)) pior = { cat, atual, base: media, v };
  }
  if (pior) {
    dicas.push({
      id: "categoria-crescendo",
      titulo: `${pior.cat[0].toUpperCase()}${pior.cat.slice(1)}`,
      texto: `Gastou ${fmt(pior.atual)} este mês, ${fmtPct(pior.v)} acima da média dos últimos meses (${fmt(pior.base)}).`,
      tom: "atencao",
      rota: "/dashboard/reports/dre",
      base: { rotulo: "média dos últimos meses", valor: pior.base },
      atual: pior.atual,
      variacao: pior.v,
    });
  }

  /* 3. receita do mês contra o mês anterior */
  const recAtual = entradasDe(input, jAtual).valor;
  const recAnterior = entradasDe(input, jAnterior).valor;
  const vRec = pct(recAtual, recAnterior);
  if (recAnterior > 0 && vRec !== null) {
    dicas.push({
      id: "receita",
      titulo: "Entradas do mês",
      texto: `Você recebeu ${fmt(recAtual)}, ${fmtPct(vRec)} em relação ao mês passado.`,
      tom: vRec >= 0 ? "bom" : "atencao",
      rota: "/dashboard/financial/statement",
      base: { rotulo: "mês anterior", valor: recAnterior },
      atual: recAtual,
      variacao: vRec,
    });
  }

  /* 4. o vencido — o dinheiro que já é seu e não entrou */
  const vencido = inadimplenciaDe(input).valor;
  if (vencido > 0) {
    dicas.push({
      id: "vencido",
      titulo: "A receber vencido",
      texto: `${fmt(vencido)} já venceram e não entraram. É o caixa mais barato que existe: já é seu.`,
      tom: "atencao",
      rota: "/dashboard/financial/receivables",
      atual: vencido,
    });
  }

  /* 5. fôlego — quanto tempo o caixa aguenta no ritmo atual */
  const dias = runwayDe(input).valor;
  const queima = burnDe(input).valor;
  if (queima > 0 && dias < 180) {
    dicas.push({
      id: "runway",
      titulo: "Fôlego de caixa",
      texto: `No ritmo dos últimos 90 dias, o caixa cobre cerca de ${Math.round(dias)} dias (${fmt(queima)} por mês).`,
      tom: dias < 90 ? "atencao" : "neutro",
      rota: "/fluxo-caixa",
      atual: dias,
    });
  }

  /* 6. o resultado do mês, quando negativo */
  const res = resultadoDe(input, jAtual).valor;
  if (res < 0) {
    dicas.push({
      id: "resultado",
      titulo: "Resultado do mês",
      texto: `Saiu ${fmt(Math.abs(res))} a mais do que entrou este mês. Saldo em conta: ${fmt(saldoDe(input).valor)}.`,
      tom: "atencao",
      rota: "/fluxo-caixa",
      atual: res,
    });
  }

  /* 7. concentração — de quem o faturamento depende */
  const porCliente = new Map<string, number>();
  for (const m of input.movements) {
    if (m.type !== "entrada" || !liquidado(m) || !m.party_id) continue;
    porCliente.set(m.party_id, (porCliente.get(m.party_id) ?? 0) + Math.abs(assinado(m)));
  }
  const total = Array.from(porCliente.values()).reduce((s, v) => s + v, 0);
  const maior = Array.from(porCliente.entries()).sort((a, b) => b[1] - a[1])[0];
  if (maior && total > 0) {
    const share = (maior[1] / total) * 100;
    if (share >= 30) {
      const nome = input.partyNames?.[maior[0]] ?? "um cliente";
      dicas.push({
        id: "concentracao",
        titulo: "Concentração de receita",
        texto: `${nome} responde por ${share.toFixed(0)}% do que você recebe. Perder esse cliente é perder um terço do faturamento.`,
        tom: share >= 50 ? "atencao" : "neutro",
        rota: "/dashboard/registrations/clients",
        atual: share,
      });
    }
  }

  const mesesComDado = meses.filter(
    (j) => entradasDe(input, j).valor > 0 || saidasDe(input, j).valor > 0,
  ).length;

  return { modo: "dicas", dicas, passos: [], mesesDeHistorico: mesesComDado };
}

/* ------------------------------- onboarding ------------------------------- */

/**
 * ⚠️ CONTA NOVA NÃO RECEBE DICA, RECEBE CAMINHO.
 *
 * Sem histórico, toda comparação vira uma frase confiante sobre nada — "seu
 * custo fixo caiu 100%" quando o que houve foi um mês sem dado. É a pior
 * coisa que este card pode fazer, porque ele existe justamente para a pessoa
 * confiar no que lê. Enquanto a base não sustenta comparação, o card mostra o
 * que falta preencher para que ela passe a sustentar.
 */
export function passosQueFaltam(input: RiskInput | undefined, contatos: number): PassoDica[] {
  const movs = input?.movements.length ?? 0;
  const comCategoria = input?.movements.filter((m) => m.category).length ?? 0;
  const contas = input?.saldoAtual !== undefined && input.saldoAtual !== 0;
  return [
    {
      id: "importar",
      titulo: "Traga seu extrato",
      texto: "Um mês de extrato já liga o fluxo de caixa, o DRE e as leituras deste card.",
      rota: "/upload",
      feito: movs >= MINIMO_PARA_COMPARAR,
    },
    {
      id: "contas",
      titulo: "Cadastre suas contas",
      texto: "O saldo das contas é o que ancora o caixa — sem ele o sistema projeta no escuro.",
      rota: "/dashboard/registrations/bank-accounts",
      feito: Boolean(contas),
    },
    {
      id: "categorias",
      titulo: "Confira as categorias",
      texto: "É a categoria que separa custo fixo de compra pontual. Sem ela, não há comparação honesta.",
      rota: "/upload?aba=regras",
      feito: movs > 0 && comCategoria / Math.max(1, movs) >= 0.7,
    },
    {
      id: "contatos",
      titulo: "Complete os contatos",
      texto: "Com cliente e fornecedor identificados, o sistema mostra de quem você depende.",
      rota: "/dashboard/registrations/clients",
      feito: contatos >= 3,
    },
  ];
}
