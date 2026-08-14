/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FILA DE REVISÃO — o que o sistema NÃO deve classificar sozinho
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **A regra que dá sentido a este módulo: nada aqui é classificado.** Ele
 * SEPARA. Cada item sai com o motivo pelo qual uma pessoa precisa olhar, e com
 * o que cada fonte diz — nunca com um palpite ocupando o lugar da resposta.
 *
 * O que a montou (auditoria de 14/08, org 835278a9):
 *
 *  - **Cinco lançamentos de R$ 35.000 com `category_id` que contradiz a
 *    descrição.** Quatro dizem "Salário" e apontam para *Assinaturas /
 *    software*; um diz "123" e aponta para *Aluguel*. Propagar a chave para o
 *    texto arquivaria R$ 140.000 de folha dentro de software — a chave existe e
 *    está errada, que é pior do que não existir, porque parece resolvida.
 *  - **Duas ENTRADAS de R$ 8.500 categorizadas como `Salary`.** Hoje entram em
 *    receita bruta. Salário é saída; entrada com nome de salário é reembolso,
 *    estorno, aporte ou erro — e as quatro mandam fazer coisas diferentes.
 *  - **Um lançamento cuja descrição é lixo de leitura ótica** (`! [=]E?s rica
 *    NE Bro,`), vencido desde 05/05/2023 e em aberto. Enquanto não for
 *    cancelado, ele é dinheiro dentro da projeção de caixa.
 *  - **Lançamentos de valor zero.** A entrada nova passou a recusá-los; os já
 *    gravados continuam ocupando linha em toda contagem.
 *
 * ⚠️ **A REGRA RECORRENTE ENTRA NA FILA, não só os títulos que ela gera.**
 * Foi a descoberta que mudou o desenho: os quatro "Salário" são filhos FIÉIS de
 * um cadastro que já nasce contraditório (descrição *Salário*, contraparte
 * *GOOGLE ADS CAMPANHA*, categoria *Assinaturas / software*). Corrigir os
 * títulos um a um e deixar a regra viva é varrer para debaixo do tapete: ela
 * materializa o mesmo defeito no mês seguinte, e a pessoa que corrigiu conclui
 * que o sistema desfez o trabalho dela.
 *
 * Puro, tipado, demo-safe, sem I/O e sem relógio. Versão `revisao/1.0.0`.
 */

export const REVISAO_VERSION = "revisao/1.0.0";

export type MotivoRevisao =
  /** Texto de categoria vazio, mas há chave — e a chave pode estar errada. */
  | "categoria_nao_propagada"
  /** Nenhuma classificação, por nenhum caminho. */
  | "sem_categoria"
  /** Entrada com vocabulário de remuneração — salário é saída. */
  | "entrada_com_cara_de_folha"
  /** A descrição não é texto legível: sobra de leitura ótica. */
  | "descritivo_ilegivel"
  /** Valor zero — não move caixa nem resultado, e ocupa linha em toda contagem. */
  | "valor_zero"
  /** Cadastro de recorrência cujos campos contam histórias diferentes. */
  | "regra_inconsistente";

export interface ItemRevisao {
  id: string;
  origem: "lancamento" | "recorrencia";
  descricao: string | null;
  valor: number;
  data: string;
  tipo: "entrada" | "saida";
  status?: string;
  /** O texto de categoria que o relatório lê. */
  categoriaTexto: string | null;
  /** O que a chave estrangeira diz — pode discordar do texto e da descrição. */
  categoriaChave: string | null;
  contraparte: string | null;
}

export interface AchadoRevisao extends ItemRevisao {
  motivo: MotivoRevisao;
  /** Frase para quem opera: o que está em desacordo, sem jargão. */
  explicacao: string;
  /** O que o sistema NÃO vai decidir sozinho. */
  pergunta: string;
}

export interface FilaRevisao {
  achados: AchadoRevisao[];
  /** Soma das magnitudes — o tamanho da dúvida, não um saldo. */
  total: number;
  porMotivo: Record<string, { n: number; total: number }>;
}

/* -------------------------------------------------------------------------- */

/**
 * ⚠️ Ancorado em `\b`: sem a borda, `folha` casaria dentro de "folhagem" e
 * `pj` dentro de qualquer sigla. É a mesma lição que fez `iss` casar dentro de
 * "com**iss**ão" em `core/relatorios`.
 */
const RE_FOLHA = /\bsal[áa]rio?\b|\bsalary\b|\bfolha\b|\bpayroll\b|\bpr[óo]-?labore\b|\b13[ºo]?\b/i;

/** Categoria que É de folha — a que torna a descrição de folha coerente. */
const RE_CATEGORIA_FOLHA = /folha|sal[áa]rio|payroll|encargo|inss|fgts|pr[óo]-?labore|benef[íi]cio/i;

/**
 * Texto que não é texto.
 *
 * ⚠️ **A primeira versão desta função errava nos DOIS sentidos, e a fixture
 * pegou.** Ela media a proporção de letras: `! [=]E?s rica NE Bro,` tem 65% de
 * letras e passava; `NF-e 123/45` tem 30% e era acusado. Ou seja, deixava
 * passar exatamente o caso medido e acusava o que um financeiro escreve o dia
 * inteiro — as duas metades do defeito que uma fila de revisão pode ter.
 *
 * O critério agora é a presença de marcas que leitura ótica produz e teclado
 * não: colchete, chave, igual, sinal de maior/menor, barra invertida, til e
 * circunflexo soltos — **duas ou mais**, porque uma sozinha pode ser um nome de
 * arquivo — ou pontuação de interrogação/exclamação DENTRO de uma palavra
 * (`E?s`), que é a assinatura clássica de caractere não reconhecido.
 *
 * ⚠️ O que NÃO entra no critério: a proporção de dígitos. Nota fiscal, DARF,
 * boleto e linha digitável são quase só número — e são o vocabulário normal de
 * quem opera. Um detector que os acusa treina a pessoa a fechar a aba, e aí ele
 * deixou de existir. Mesma regra do detector de segredos da Central de Ajuda.
 */
const RE_JUNK = /[[\]{}=<>|\\~^]/g;
const RE_INTERRUPCAO = /[A-Za-zÀ-ÖØ-öø-ÿ][?!][A-Za-zÀ-ÖØ-öø-ÿ]/;

export function descritivoIlegivel(texto: string | null | undefined): boolean {
  const t = (texto ?? "").trim();
  if (t.length < 3) return false; // vazio é outro motivo, não este
  if (RE_INTERRUPCAO.test(t)) return true;
  return (t.match(RE_JUNK) ?? []).length >= 2;
}

/** Um item entra na fila? Devolve o motivo, ou `null` quando não há dúvida. */
export function motivoDe(it: ItemRevisao): MotivoRevisao | null {
  if (it.origem === "recorrencia") {
    const desc = RE_FOLHA.test(it.descricao ?? "");
    const cat = it.categoriaChave ?? it.categoriaTexto ?? "";
    return desc && cat && !RE_CATEGORIA_FOLHA.test(cat) ? "regra_inconsistente" : null;
  }
  if (it.valor === 0) return "valor_zero";
  const semTexto = !(it.categoriaTexto ?? "").trim();
  if (semTexto && it.categoriaChave) return "categoria_nao_propagada";
  if (descritivoIlegivel(it.descricao)) return "descritivo_ilegivel";
  if (it.tipo === "entrada" && RE_FOLHA.test(`${it.categoriaTexto ?? ""} ${it.descricao ?? ""}`)) {
    return "entrada_com_cara_de_folha";
  }
  if (semTexto) return "sem_categoria";
  return null;
}

const FRASES: Record<MotivoRevisao, { explicacao: (it: ItemRevisao) => string; pergunta: string }> = {
  categoria_nao_propagada: {
    explicacao: (it) =>
      `A classificação existe (${it.categoriaChave}) mas não chegou ao campo que os relatórios leem`
      + (it.descricao ? `, e a descrição diz "${it.descricao}"` : ""),
    pergunta: "A classificação está certa, ou a descrição é que diz a verdade?",
  },
  sem_categoria: {
    explicacao: () => "Nenhuma classificação, por nenhum caminho — cai em despesa genérica",
    pergunta: "A que categoria este lançamento pertence?",
  },
  entrada_com_cara_de_folha: {
    explicacao: () => "É uma ENTRADA com nome de remuneração; hoje entra no faturamento",
    pergunta: "É reembolso, estorno, aporte do sócio — ou o tipo está invertido?",
  },
  descritivo_ilegivel: {
    explicacao: (it) => `A descrição não é texto legível ("${(it.descricao ?? "").slice(0, 40)}")`,
    pergunta: "Este lançamento existiu? Se não, cancele — em aberto ele entra na projeção de caixa.",
  },
  valor_zero: {
    explicacao: () => "Valor zero: não move caixa nem resultado, e ocupa linha em toda contagem",
    pergunta: "Faltou o valor, ou o lançamento não deveria existir?",
  },
  regra_inconsistente: {
    explicacao: (it) =>
      `A regra diz "${it.descricao}", a contraparte é ${it.contraparte ?? "—"} e a categoria é `
      + `${it.categoriaChave ?? it.categoriaTexto ?? "—"} — três campos, três histórias`,
    pergunta: "Qual dos três está certo? Enquanto ela viver, gera um título novo por mês.",
  },
};

/** Monta a fila. Não classifica nada — separa e explica. */
export function montarFilaRevisao(itens: readonly ItemRevisao[]): FilaRevisao {
  const achados: AchadoRevisao[] = [];
  for (const it of itens) {
    const motivo = motivoDe(it);
    if (!motivo) continue;
    const f = FRASES[motivo];
    achados.push({ ...it, motivo, explicacao: f.explicacao(it), pergunta: f.pergunta });
  }
  // O maior primeiro: a fila é trabalho humano, e trabalho humano se prioriza
  // por consequência. Empate pela data, do mais antigo — o velho é o que já
  // atravessou fechamentos.
  achados.sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor) || a.data.localeCompare(b.data));

  const porMotivo: Record<string, { n: number; total: number }> = {};
  for (const a of achados) {
    const e = porMotivo[a.motivo] ?? { n: 0, total: 0 };
    porMotivo[a.motivo] = { n: e.n + 1, total: e.total + Math.abs(a.valor) };
  }
  return { achados, total: achados.reduce((s, a) => s + Math.abs(a.valor), 0), porMotivo };
}

/** Rótulo em português de cada motivo — a tela não fala `categoria_nao_propagada`. */
export const ROTULO_MOTIVO: Record<MotivoRevisao, string> = {
  categoria_nao_propagada: "Classificação não propagada",
  sem_categoria: "Sem categoria",
  entrada_com_cara_de_folha: "Entrada com nome de salário",
  descritivo_ilegivel: "Descrição ilegível",
  valor_zero: "Valor zero",
  regra_inconsistente: "Regra recorrente contraditória",
};
