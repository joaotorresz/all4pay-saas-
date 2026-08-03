/**
 * ═══════════════════════════════════════════════════════════════════════════
 * INGESTÃO — o pipeline ÚNICO de entrada de dados.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Toda porta por onde um lançamento entra passa por aqui: extrato em lote
 * (CSV/OFX), documento avulso (OCR), Open Finance, importação de planilha.
 * Antes eram dois pipelines com taxonomias diferentes, e o mesmo gasto entrava
 * com nomes diferentes conforme a porta.
 *
 * As três garantias:
 *
 *  1. **IDEMPOTÊNCIA** — `chaveIdempotencia` (conta · data · valor · sinal ·
 *     descritivo normalizado). Reimportar o mesmo extrato não duplica nada.
 *  2. **DESCRITIVO BRUTO PRESERVADO** — a normalização entra na chave e na
 *     classificação; o texto original vive em `descritivoBruto` e nunca é
 *     sobrescrito. É a única evidência de onde a linha veio.
 *  3. **CONFIRMAÇÃO EXPLÍCITA** — `prepararIngestao` não grava nada. Devolve um
 *     plano (`PlanoIngestao`) para a tela mostrar; gravar é outra chamada,
 *     depois de o usuário confirmar.
 *
 * Puro, tipado, demo-safe, sem I/O e sem relógio. Versão ingestao/1.0.0.
 */
import { chaveIdempotencia, chaveAproximada, chaveDeMovimento, normalizarDescritivo, INGESTAO_VERSION } from "./chave";
import { classificar, TAXONOMIA, CATEGORIAS_TODAS, type Classificacao, type Natureza } from "./taxonomia";

export * from "./chave";
export * from "./taxonomia";
export { INGESTAO_VERSION };

/* ========================================================================== */
/* O que entra                                                                 */
/* ========================================================================== */

/** Uma linha crua, como qualquer conector a entrega. */
export interface LinhaBruta {
  /** Id da ORIGEM (linha do arquivo, id do banco). Não entra na chave. */
  idOrigem?: string;
  contaId?: string | null;
  /** YYYY-MM-DD. */
  data: string;
  valor: number;
  tipo: "entrada" | "saida";
  /** O texto exatamente como veio. Nunca alterado. */
  descritivo: string;
  /** Contraparte, quando a origem sabe distingui-la do descritivo. */
  contraparte?: string | null;
  documento?: string | null;
  /** De onde veio: extrato, ocr, openfinance, planilha, manual. */
  origem: OrigemIngestao;
}

export type OrigemIngestao = "extrato" | "ocr" | "openfinance" | "planilha" | "manual" | "recorrencia";

/** Uma linha já processada — o que a tela de revisão mostra e o que se grava. */
export interface MovimentoIngerido {
  chave: string;
  idOrigem?: string;
  contaId: string | null;
  data: string;
  valor: number;
  tipo: "entrada" | "saida";
  /** ⚠️ O texto ORIGINAL, preservado. Campo separado, por definição. */
  descritivoBruto: string;
  /** O mesmo texto normalizado — é ele que alimenta chave e classificação. */
  descritivoNormalizado: string;
  contraparte: string | null;
  documento: string | null;
  origem: OrigemIngestao;
  classificacao: Classificacao;
  /** Situação em relação ao que já existe na base. */
  situacao: SituacaoLinha;
  /** Quando duplicada, a chave/id do lançamento que já existe. */
  duplicataDe?: string;
}

export type SituacaoLinha =
  /** Nova — entra. */
  | "nova"
  /** Já existe na base com a mesma chave — não entra. */
  | "duplicata_base"
  /** Repetida DENTRO do próprio arquivo — entra uma vez só. */
  | "duplicata_arquivo"
  /** Entra, mas a classificação é fraca e precisa de conferência. */
  | "revisar"
  /**
   * Mesma conta, dia, valor e sentido de algo que já existe — mas descritivo
   * diferente. ⚠️ **Entra por padrão**: descartar sozinho apagaria dinheiro
   * real (duas vendas iguais no mesmo dia acontecem). A tela marca e pergunta.
   */
  | "possivel_duplicata";

/* ========================================================================== */
/* O plano — o que a tela de pré-visualização mostra                           */
/* ========================================================================== */

export interface PlanoIngestao {
  versao: string;
  linhas: MovimentoIngerido[];
  resumo: {
    lidas: number;
    novas: number;
    duplicatasBase: number;
    duplicatasArquivo: number;
    revisar: number;
    possiveisDuplicatas: number;
    entradas: number;
    saidas: number;
    resultado: number;
    /** Primeira e última data do lote — a janela que será afetada. */
    de: string | null;
    ate: string | null;
  };
  /** Categorias sugeridas com contagem, para a tela agrupar. */
  porCategoria: { categoria: string; natureza: Natureza; quantidade: number; total: number }[];
  /** Contrapartes ainda não cadastradas. */
  contrapartesNovas: string[];
}

/**
 * Uma linha que já está na base, no mínimo necessário para deduplicar.
 * O chamador entrega o que tem (demo: o dataset local; live: uma consulta).
 */
export interface LinhaExistente {
  id: string;
  chave?: string | null;
  account_id?: string | null;
  paid_date?: string | null;
  due_date: string;
  amount: number;
  type: "entrada" | "saida";
  description?: string | null;
  descritivo_bruto?: string | null;
  category?: string | null;
}

/**
 * PREPARA a ingestão — **não grava nada**.
 *
 * ⚠️ Esta separação é a regra da onda: importar deixou de ser um botão que
 * escreve no banco e virou um plano que se confere antes. A tela mostra o
 * `PlanoIngestao`; gravar é decisão explícita, depois.
 *
 * @param linhas      as linhas cruas do conector
 * @param existentes  o que já está na base (para deduplicar)
 * @param aprendizado contraparte normalizada → categoria confirmada antes
 * @param contatos    nomes de contrapartes já cadastradas
 */
export function prepararIngestao(
  linhas: LinhaBruta[],
  existentes: LinhaExistente[] = [],
  aprendizado: Record<string, string> = {},
  contatos: string[] = [],
): PlanoIngestao {
  // Índice do que já existe. Usa a chave gravada quando há (base nova) e
  // recalcula quando não há (base anterior à ONDA 2) — é o que permite
  // deduplicar contra o histórico já gravado sem migração prévia.
  const naBase = new Map<string, string>();
  /** Índice APROXIMADO (sem descritivo) — alimenta a suspeita, nunca o descarte. */
  const aproximadas = new Map<string, string>();
  for (const e of existentes) {
    const k = e.chave || chaveDeMovimento(e);
    if (!naBase.has(k)) naBase.set(k, e.id);
    const ka = chaveAproximada({
      contaId: e.account_id, data: (e.paid_date || e.due_date), valor: e.amount, tipo: e.type,
    });
    if (!aproximadas.has(ka)) aproximadas.set(ka, e.id);
  }

  const vistasNoArquivo = new Set<string>();
  const contatosNorm = new Set(contatos.map((c) => normalizarDescritivo(c)).filter(Boolean));
  const novasContrapartes = new Set<string>();

  const out: MovimentoIngerido[] = [];
  for (const l of linhas) {
    const descritivoBruto = l.descritivo ?? "";
    const normalizado = normalizarDescritivo(
      // A contraparte, quando a origem a separa, é o sinal mais forte do que é
      // aquela linha; o descritivo completo entra junto para não perder o resto.
      l.contraparte ? `${l.contraparte} ${descritivoBruto}` : descritivoBruto,
    );
    const chave = chaveIdempotencia({
      contaId: l.contaId, data: l.data, valor: l.valor, tipo: l.tipo, descritivo: descritivoBruto,
    });

    const cls = classificar(normalizado, l.tipo, aprendizado[normalizado]);

    let situacao: SituacaoLinha;
    let duplicataDe: string | undefined;
    if (naBase.has(chave)) {
      situacao = "duplicata_base";
      duplicataDe = naBase.get(chave);
    } else if (vistasNoArquivo.has(chave)) {
      situacao = "duplicata_arquivo";
    } else {
      vistasNoArquivo.add(chave);
      const ka = chaveAproximada({ contaId: l.contaId, data: l.data, valor: l.valor, tipo: l.tipo });
      if (aproximadas.has(ka)) {
        situacao = "possivel_duplicata";
        duplicataDe = aproximadas.get(ka);
      } else {
        // ⚠️ O limiar é 0.9 — o MESMO que a cascata de classificação usa para
        // decidir o que o CNAE e a IA podem sobrescrever. Dois limiares
        // diferentes fariam a tela destacar uma coisa e o motor outra.
        situacao = cls.confianca >= 0.9 ? "nova" : "revisar";
      }
    }

    const contraparte = l.contraparte?.trim() || null;
    if (situacao !== "duplicata_base" && contraparte) {
      const n = normalizarDescritivo(contraparte);
      if (n && !contatosNorm.has(n)) novasContrapartes.add(contraparte);
    }

    out.push({
      chave, idOrigem: l.idOrigem, contaId: l.contaId ?? null, data: l.data.slice(0, 10),
      valor: Math.abs(l.valor), tipo: l.tipo,
      descritivoBruto, descritivoNormalizado: normalizado,
      contraparte, documento: l.documento ?? null, origem: l.origem,
      classificacao: cls, situacao, duplicataDe,
    });
  }

  return { versao: INGESTAO_VERSION, ...resumir(out), contrapartesNovas: Array.from(novasContrapartes) };
}

function resumir(linhas: MovimentoIngerido[]) {
  // ⚠️ A "possível duplicata" ENTRA. Ela é uma pergunta, não um veredito —
  // deixá-la de fora por padrão faria o sistema perder lançamentos legítimos
  // (duas vendas de mesmo valor no mesmo dia) sem ninguém decidir isso.
  const entra = (l: MovimentoIngerido) =>
    l.situacao === "nova" || l.situacao === "revisar" || l.situacao === "possivel_duplicata";
  const aceitas = linhas.filter(entra);
  const datas = aceitas.map((l) => l.data).sort();
  const porCat = new Map<string, { natureza: Natureza; quantidade: number; total: number }>();
  for (const l of aceitas) {
    const c = porCat.get(l.classificacao.categoria) ?? { natureza: l.classificacao.natureza, quantidade: 0, total: 0 };
    c.quantidade++; c.total += l.valor;
    porCat.set(l.classificacao.categoria, c);
  }
  const entradas = aceitas.filter((l) => l.tipo === "entrada").reduce((s, l) => s + l.valor, 0);
  const saidas = aceitas.filter((l) => l.tipo === "saida").reduce((s, l) => s + l.valor, 0);
  return {
    linhas,
    resumo: {
      lidas: linhas.length,
      novas: linhas.filter((l) => l.situacao === "nova").length,
      duplicatasBase: linhas.filter((l) => l.situacao === "duplicata_base").length,
      duplicatasArquivo: linhas.filter((l) => l.situacao === "duplicata_arquivo").length,
      revisar: linhas.filter((l) => l.situacao === "revisar").length,
      possiveisDuplicatas: linhas.filter((l) => l.situacao === "possivel_duplicata").length,
      entradas: round2(entradas),
      saidas: round2(saidas),
      resultado: round2(entradas - saidas),
      de: datas[0] ?? null,
      ate: datas[datas.length - 1] ?? null,
    },
    porCategoria: Array.from(porCat, ([categoria, v]) => ({ categoria, ...v, total: round2(v.total) }))
      .sort((a, b) => b.total - a.total),
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** As linhas que de fato serão gravadas — o que o botão "Confirmar" aplica. */
export const linhasAGravar = (p: PlanoIngestao): MovimentoIngerido[] =>
  p.linhas.filter((l) =>
    l.situacao === "nova" || l.situacao === "revisar" || l.situacao === "possivel_duplicata");

/* ========================================================================== */
/* Limpeza retroativa                                                          */
/* ========================================================================== */

export interface RelatorioLimpeza {
  analisados: number;
  /** Ids a REMOVER — as cópias, nunca o primeiro de cada grupo. */
  remover: string[];
  /** Grupos com mais de uma ocorrência da mesma chave. */
  grupos: { chave: string; manter: string; remover: string[]; descritivo: string; valor: number; data: string }[];
  /** Impacto no caixa: o que a base contava a mais por causa das cópias. */
  impactoEntradas: number;
  impactoSaidas: number;
  impactoResultado: number;
}

/**
 * LIMPEZA RETROATIVA — encontra as duplicatas que já estão gravadas.
 *
 * ⚠️ **Mantém o PRIMEIRO de cada grupo, não o último.** O primeiro é o que os
 * lançamentos derivados já referenciam (baixas, conciliações, comprovantes,
 * lançamentos do razão por `mov:<id>`); apagá-lo em favor de uma cópia mais
 * recente deixaria essas referências órfãs. "Primeiro" é por ordem de id, que
 * é estável — ordenar por data de criação não serve porque a base antiga nem
 * sempre a tem.
 *
 * Devolve um RELATÓRIO. Quem apaga é o chamador, depois de mostrar o impacto:
 * uma limpeza que roda sozinha é indistinguível de perda de dados.
 */
export function planejarLimpeza(existentes: LinhaExistente[]): RelatorioLimpeza {
  const grupos = new Map<string, LinhaExistente[]>();
  for (const e of existentes) {
    const k = e.chave || chaveDeMovimento(e);
    const g = grupos.get(k) ?? [];
    g.push(e);
    grupos.set(k, g);
  }

  const detalhe: RelatorioLimpeza["grupos"] = [];
  const remover: string[] = [];
  let impactoEntradas = 0, impactoSaidas = 0;

  for (const [chave, g] of Array.from(grupos)) {
    if (g.length < 2) continue;
    const ordenado = [...g].sort((a, b) => a.id.localeCompare(b.id));
    const [manter, ...copias] = ordenado;
    const ids = copias.map((c) => c.id);
    remover.push(...ids);
    for (const c of copias) {
      if (c.type === "entrada") impactoEntradas += Math.abs(c.amount);
      else impactoSaidas += Math.abs(c.amount);
    }
    detalhe.push({
      chave, manter: manter.id, remover: ids,
      descritivo: manter.descritivo_bruto || manter.description || manter.category || "—",
      valor: Math.abs(manter.amount), data: (manter.paid_date || manter.due_date).slice(0, 10),
    });
  }

  return {
    analisados: existentes.length,
    remover,
    grupos: detalhe.sort((a, b) => b.valor - a.valor),
    impactoEntradas: round2(impactoEntradas),
    impactoSaidas: round2(impactoSaidas),
    impactoResultado: round2(impactoEntradas - impactoSaidas),
  };
}

/** Reexportações usadas pelas telas. */
export { classificar, TAXONOMIA, CATEGORIAS_TODAS, normalizarDescritivo, chaveIdempotencia, chaveAproximada, chaveDeMovimento };
export type { Classificacao, Natureza };
