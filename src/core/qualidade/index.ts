/**
 * ═══════════════════════════════════════════════════════════════════════════
 * QUALIDADE DE DADOS — o que está sujo, quanto, e o que fazer a respeito.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **Dado sujo não avisa.** Um título de R$ 500.000 com o CNPJ da própria
 * empresa some no meio de 1.292 lançamentos; uma categoria em inglês vira uma
 * linha a mais no DRE; um produto duplicado divide o histórico de vendas em
 * dois. Nada disso derruba a tela — e por isso ninguém descobre até um
 * relatório ir para fora com o número errado.
 *
 * Esta camada existe para dar NÚMERO ao que hoje é impressão. Cada achado
 * carrega:
 *
 *  - **quantos** — porque "há dados sujos" não se prioriza e "190 títulos sem
 *    origem" se prioriza;
 *  - **por que é problema** — a consequência, não o sintoma. "Categoria em
 *    inglês" não diz nada; "esta categoria não casa com nenhuma linha do DRE, e
 *    o valor cai em Outras" diz o que se perde;
 *  - **a correção**, quando ela é mecânica o bastante para ser aplicada em
 *    massa. Quando não é, o achado diz isso em vez de oferecer um botão que
 *    faria a coisa errada em lote.
 *
 * ⚠️ **Crítico × atenção não é gosto.** Crítico é o que produz NÚMERO ERRADO em
 * relatório (título fantasma na carteira, despesa dentro de receita, produto
 * duplicado partindo o histórico). Atenção é o que empobrece a análise sem
 * mentir (lançamento sem centro de custo). Misturar os dois faz o portão de
 * saída — "zero item crítico" — ser inalcançável por causa de higiene opcional,
 * e aí ele é abandonado.
 *
 * Puro, tipado, demo-safe, sem I/O. Versão `qualidade/1.0.0`.
 */
import {
  pareceIngles, traduzirCategoria, ehOrigemDeTitulo,
  type Origem,
} from "@/core/dominio";
import {
  contraparteSuspeita, contraparteNoLadoErrado, mesmoDocumento, soDigitos,
} from "@/core/dominio/contraparte";

export const QUALIDADE_VERSION = "qualidade/1.0.0";

/* ========================================================================== */
/* A forma da entrada — mínima de propósito                                    */
/* ========================================================================== */

export interface LancamentoQ {
  id: string;
  tipo: "entrada" | "saida";
  situacao: string;
  valor: number;
  categoria?: string | null;
  contraparteId?: string | null;
  centroCustoId?: string | null;
  origem?: string | null;
  especie?: string | null;
}

export interface ContraparteQ {
  id: string;
  nome: string;
  documento?: string | null;
  ehCliente?: boolean;
  ehFornecedor?: boolean;
}

export interface CategoriaQ {
  id: string;
  nome: string;
  natureza: "receita" | "despesa";
  paiId?: string | null;
}

export interface ProdutoQ {
  id: string;
  nome: string;
  codigo?: string | null;
}

export interface BaseParaAuditar {
  lancamentos: readonly LancamentoQ[];
  contrapartes: readonly ContraparteQ[];
  categorias: readonly CategoriaQ[];
  produtos: readonly ProdutoQ[];
  /** O documento da PRÓPRIA organização — sem ele o achado do CNPJ próprio não existe. */
  documentoDaOrganizacao?: string | null;
  nomeDaOrganizacao?: string | null;
}

/* ========================================================================== */
/* O achado                                                                    */
/* ========================================================================== */

export type Gravidade = "critico" | "atencao";

export type CodigoAchado =
  | "titulo_sem_origem"
  | "titulo_com_cnpj_proprio"
  | "contraparte_suspeita"
  | "contraparte_no_lado_errado"
  | "categoria_em_ingles"
  | "categoria_duplicada"
  | "arvore_invalida"
  | "produto_codigo_duplicado"
  | "produto_nome_duplicado"
  | "lancamento_sem_centro_de_custo"
  | "valor_fora_de_faixa";

export interface Item {
  /** id do registro afetado — é por ele que a correção em massa age. */
  id: string;
  /** O que a pessoa vê na lista, para reconhecer o registro. */
  rotulo: string;
  /** A correção proposta, quando há uma. */
  sugestao?: string;
}

export interface Achado {
  codigo: CodigoAchado;
  gravidade: Gravidade;
  titulo: string;
  /** ⚠️ A CONSEQUÊNCIA, não o sintoma. Ver o cabeçalho. */
  porQueImporta: string;
  itens: Item[];
  /** `true` quando existe correção mecânica aplicável em lote. */
  corrigivelEmMassa: boolean;
  /** O texto do botão. Vazio quando não há correção automática. */
  acao?: string;
}

const achado = (
  codigo: CodigoAchado, gravidade: Gravidade, titulo: string,
  porQueImporta: string, itens: Item[],
  acao?: string,
): Achado | null =>
  itens.length === 0 ? null : {
    codigo, gravidade, titulo, porQueImporta, itens,
    corrigivelEmMassa: !!acao, acao,
  };

const chave = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/\s+/g, " ");

/* ========================================================================== */
/* Os achados, um por um                                                       */
/* ========================================================================== */

function titulosSemOrigem(b: BaseParaAuditar): Achado | null {
  const itens = b.lancamentos
    .filter((l) => l.especie !== "extrato")
    .filter((l) => !l.origem || !ehOrigemDeTitulo(l.origem))
    .map((l) => ({
      id: l.id,
      rotulo: `${l.tipo === "entrada" ? "A receber" : "A pagar"} · ${l.categoria ?? "sem categoria"}`,
      sugestao: l.origem === "extrato"
        ? "Marcar como lançamento de extrato — não é título"
        : "Informar de onde veio: venda, contrato, importação, manual ou conciliação",
    }));
  return achado(
    "titulo_sem_origem", "critico",
    "Títulos que não dizem de onde vieram",
    "Sem origem não há como responder por que o título existe — que é a primeira "
    + "pergunta de quem encontra um título estranho na lista de cobrança. É também "
    + "o que permite a uma linha de extrato aparecer como algo a receber.",
    itens,
    "Classificar em massa",
  );
}

function cnpjProprio(b: BaseParaAuditar): Achado | null {
  const doc = b.documentoDaOrganizacao;
  if (!soDigitos(doc)) return null;
  const proprias = new Set(
    b.contrapartes.filter((c) => mesmoDocumento(c.documento, doc)).map((c) => c.id),
  );
  if (proprias.size === 0) return null;
  const itens = b.lancamentos
    .filter((l) => l.contraparteId && proprias.has(l.contraparteId))
    .map((l) => ({
      id: l.id,
      rotulo: `${l.categoria ?? "sem categoria"} · ${l.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
      sugestao: "Reclassificar como movimentação interna",
    }));
  return achado(
    "titulo_com_cnpj_proprio", "critico",
    `Títulos com o documento da própria ${b.nomeDaOrganizacao ?? "organização"}`,
    "Uma empresa não tem título a receber de si mesma. Isto costuma ser uma linha "
    + "de extrato — rendimento, resgate ou transferência entre contas próprias — que "
    + "entrou como título na importação, e entra na carteira, na projeção de caixa e "
    + "na base de receita.",
    itens,
    "Reclassificar como movimentação interna",
  );
}

function contrapartesSuspeitas(b: BaseParaAuditar): Achado | null {
  const itens: Item[] = [];
  for (const c of b.contrapartes) {
    const s = contraparteSuspeita(c.nome);
    if (!s) continue;
    itens.push({
      id: c.id,
      rotulo: c.nome,
      sugestao: `Classificar como ${s.categoriaSugerida.toLowerCase()}`,
    });
  }
  return achado(
    "contraparte_suspeita", "critico",
    "Cadastros que não são contrapartes",
    "Tarifa, imposto, transferência interna e estorno viraram cadastro na "
    + "importação. Como o cadastro existe, o motor de crédito os trata como "
    + "clientes e lhes atribui probabilidade de pagamento — um número com "
    + "aparência de análise, que ainda entra na média da carteira inteira.",
    itens,
    "Reclassificar cadastros",
  );
}

function ladoErrado(b: BaseParaAuditar): Achado | null {
  const hist = new Map<string, { entradas: number; saidas: number }>();
  for (const l of b.lancamentos) {
    if (!l.contraparteId) continue;
    const h = hist.get(l.contraparteId) ?? { entradas: 0, saidas: 0 };
    if (l.tipo === "entrada") h.entradas++; else h.saidas++;
    hist.set(l.contraparteId, h);
  }
  const nomePor = new Map(b.contrapartes.map((c) => [c.id, c.nome]));
  const itens: Item[] = [];
  for (const l of b.lancamentos) {
    if (!l.contraparteId || l.situacao !== "pendente") continue;
    const h = hist.get(l.contraparteId);
    if (!h) continue;
    // ⚠️ O histórico do PRÓPRIO título não pode contar contra ele: senão um
    // título isolado sempre se acusaria, e o achado viraria ruído puro.
    const semEste = l.tipo === "entrada"
      ? { ...h, entradas: h.entradas - 1 }
      : { ...h, saidas: h.saidas - 1 };
    const erro = contraparteNoLadoErrado(
      { nome: nomePor.get(l.contraparteId), ...semEste }, l.tipo,
    );
    if (!erro) continue;
    itens.push({
      id: l.id,
      rotulo: `${nomePor.get(l.contraparteId) ?? l.contraparteId} · ${l.tipo === "entrada" ? "a receber" : "a pagar"}`,
      sugestao: erro.codigo === "fornecedor_como_cliente"
        ? "Provavelmente é uma compra que entrou do lado errado"
        : "Confira antes de provisionar a saída",
    });
  }
  return achado(
    "contraparte_no_lado_errado", "critico",
    "Contrapartes do lado errado do título",
    "Uma contraparte cujo histórico inteiro é de pagamento não pode dever à "
    + "empresa. É como assinatura e compra de cartão aparecem na lista do que se "
    + "tem a receber — e elas inflam a carteira e a projeção de entrada.",
    itens,
  );
}

function categoriasEmIngles(b: BaseParaAuditar): Achado | null {
  const itens = b.categorias
    .filter((c) => pareceIngles(c.nome))
    .map((c) => {
      const traducao = traduzirCategoria(c.nome);
      return {
        id: c.id,
        rotulo: c.nome,
        // ⚠️ Sem tradução conhecida, o item NÃO ganha sugestão inventada. Um
        // palpite de tradução numa categoria contábil move dinheiro de linha.
        sugestao: traducao ? `Renomear para "${traducao}"` : "Sem tradução conhecida — renomeie à mão",
      };
    });
  return achado(
    "categoria_em_ingles", "critico",
    "Categorias que não foram traduzidas",
    "Uma categoria em inglês não casa com nenhuma regra de classificação do DRE, "
    + "e o valor cai em Outras — some da linha a que pertence sem nada parecer "
    + "quebrado. Empréstimos como software e marketing NÃO entram nesta lista.",
    itens,
    "Traduzir as conhecidas",
  );
}

function categoriasDuplicadas(b: BaseParaAuditar): Achado | null {
  const por = new Map<string, CategoriaQ[]>();
  for (const c of b.categorias) {
    const k = `${c.natureza}:${chave(c.nome)}`;
    por.set(k, [...(por.get(k) ?? []), c]);
  }
  const itens: Item[] = [];
  for (const grupo of Array.from(por.values())) {
    if (grupo.length < 2) continue;
    // ⚠️ Mantém a PRIMEIRA e lista as demais — o mesmo critério da limpeza de
    // duplicatas da ONDA 2: é a primeira que os lançamentos já referenciam.
    for (const c of grupo.slice(1)) {
      itens.push({ id: c.id, rotulo: c.nome, sugestao: `Fundir na primeira "${grupo[0].nome}"` });
    }
  }
  return achado(
    "categoria_duplicada", "critico",
    "Categorias repetidas",
    "O mesmo gasto entra ora numa, ora noutra, e o relatório mostra duas linhas "
    + "com metade do valor cada — o total fecha e a leitura por categoria não.",
    itens,
    "Fundir duplicatas",
  );
}

function arvoreInvalida(b: BaseParaAuditar): Achado | null {
  const por = new Map(b.categorias.map((c) => [c.id, c]));
  const itens = b.categorias
    .filter((c) => c.paiId && por.get(c.paiId) && por.get(c.paiId)!.natureza !== c.natureza)
    .map((c) => ({
      id: c.id,
      rotulo: `${c.nome} (${c.natureza}) dentro de ${por.get(c.paiId!)!.nome} (${por.get(c.paiId!)!.natureza})`,
      sugestao: "Mover para a raiz ou para um grupo da mesma natureza",
    }));
  return achado(
    "arvore_invalida", "critico",
    "Contas fora da árvore correta",
    "Uma despesa dentro de um grupo de receita faz o valor entrar na linha errada "
    + "do DRE — é assim que despesa aparece dentro de Receita Bruta Operacional, "
    + "inflando o faturamento e o lucro ao mesmo tempo.",
    itens,
    "Mover para a raiz",
  );
}

function produtosDuplicados(b: BaseParaAuditar): { codigo: Achado | null; nome: Achado | null } {
  const porCodigo = new Map<string, ProdutoQ[]>();
  const porNome = new Map<string, ProdutoQ[]>();
  for (const p of b.produtos) {
    const c = (p.codigo ?? "").trim();
    if (c) porCodigo.set(chave(c), [...(porCodigo.get(chave(c)) ?? []), p]);
    porNome.set(chave(p.nome), [...(porNome.get(chave(p.nome)) ?? []), p]);
  }
  const itensCodigo: Item[] = [];
  for (const g of Array.from(porCodigo.values())) {
    if (g.length < 2) continue;
    for (const p of g.slice(1)) {
      itensCodigo.push({ id: p.id, rotulo: `${p.nome} · código ${p.codigo}`, sugestao: `Fundir em "${g[0].nome}"` });
    }
  }
  const itensNome: Item[] = [];
  for (const g of Array.from(porNome.values())) {
    if (g.length < 2) continue;
    for (const p of g.slice(1)) {
      itensNome.push({ id: p.id, rotulo: p.nome, sugestao: `Fundir em "${g[0].nome}" (${g[0].id.slice(0, 8)})` });
    }
  }
  return {
    codigo: achado(
      "produto_codigo_duplicado", "critico",
      "Produtos com o mesmo código",
      "O código é o que a nota fiscal, o pedido e o estoque usam para achar o "
      + "produto. Dois com o mesmo código fazem cada documento apontar para um "
      + "deles ao acaso, e o histórico de vendas se parte em dois.",
      itensCodigo, "Fundir produtos",
    ),
    nome: achado(
      "produto_nome_duplicado", "atencao",
      "Produtos com o mesmo nome",
      "Nome repetido não quebra nada sozinho — o código é que identifica —, mas "
      + "quem escolhe o produto na tela não tem como saber qual dos dois é o certo, "
      + "e a escolha errada só aparece no relatório do mês seguinte.",
      itensNome, "Fundir produtos",
    ),
  };
}

function semCentroDeCusto(b: BaseParaAuditar): Achado | null {
  const itens = b.lancamentos
    .filter((l) => !l.centroCustoId)
    .map((l) => ({ id: l.id, rotulo: `${l.categoria ?? "sem categoria"} · ${l.valor.toFixed(2)}` }));
  return achado(
    "lancamento_sem_centro_de_custo", "atencao",
    "Lançamentos sem centro de custo",
    "Não torna nenhum número errado — o total continua certo. O que se perde é a "
    + "resposta a 'qual área gastou isso', e ela só pode ser reconstruída enquanto "
    + "alguém ainda lembra do lançamento.",
    itens,
  );
}

/**
 * ⚠️ **Faixa é RELATIVA à própria base, nunca um número fixo.** Um teto em reais
 * cravado no código estaria errado para todo cliente que não fosse o do dia em
 * que foi escrito: R$ 500.000 é absurdo numa padaria e é terça-feira numa
 * distribuidora. A régua é a mediana da própria empresa.
 */
function foraDeFaixa(b: BaseParaAuditar): Achado | null {
  const valores = b.lancamentos.map((l) => Math.abs(l.valor)).filter((v) => v > 0).sort((a, c) => a - c);
  // Sem base o achado não existe — acusar sem régua é o começo do aviso ignorado.
  if (valores.length < 20) return null;
  const mediana = valores[Math.floor(valores.length / 2)];
  const teto = mediana * 100;
  const itens = b.lancamentos
    .filter((l) => Math.abs(l.valor) > teto)
    .map((l) => ({
      id: l.id,
      rotulo: `${l.categoria ?? "sem categoria"} · ${l.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
      sugestao: `Mais de 100× a mediana da empresa (${mediana.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })})`,
    }));
  return achado(
    "valor_fora_de_faixa", "atencao",
    "Valores muito fora da faixa da empresa",
    "Um lançamento cem vezes maior que a mediana costuma ser erro de casa decimal "
    + "ou linha de extrato agregada. Nem sempre é erro — mas é sempre o número que "
    + "mais mexe no relatório, e vale conferir um a um.",
    itens,
  );
}

/* ========================================================================== */
/* O relatório                                                                 */
/* ========================================================================== */

export interface RelatorioQualidade {
  versao: string;
  achados: Achado[];
  criticos: number;
  atencao: number;
  /** ⚠️ O portão de saída da ONDA 5 é este: zero item CRÍTICO. */
  limpo: boolean;
}

export function auditarQualidade(b: BaseParaAuditar): RelatorioQualidade {
  const prod = produtosDuplicados(b);
  const achados = [
    titulosSemOrigem(b),
    cnpjProprio(b),
    contrapartesSuspeitas(b),
    ladoErrado(b),
    categoriasEmIngles(b),
    categoriasDuplicadas(b),
    arvoreInvalida(b),
    prod.codigo,
    prod.nome,
    semCentroDeCusto(b),
    foraDeFaixa(b),
  ].filter((a): a is Achado => a !== null);

  const conta = (g: Gravidade) =>
    achados.filter((a) => a.gravidade === g).reduce((s, a) => s + a.itens.length, 0);

  const criticos = conta("critico");
  return {
    versao: QUALIDADE_VERSION,
    achados,
    criticos,
    atencao: conta("atencao"),
    limpo: criticos === 0,
  };
}

/* ========================================================================== */
/* A fusão de produtos                                                         */
/* ========================================================================== */

export interface PlanoDeFusao {
  /** O que fica — e é sempre o PRIMEIRO, pelo mesmo motivo da ONDA 2. */
  mantido: string;
  /** Os que somem. */
  absorvidos: string[];
  /** Quantos vínculos históricos serão reapontados. */
  vinculos: number;
}

/**
 * ⚠️ **Fundir não é apagar.** O produto absorvido é referenciado por itens de
 * venda, notas e movimentos de estoque; apagá-lo sem reapontar deixaria
 * documentos órfãos apontando para um id que não existe — e um pedido antigo
 * que não abre é pior que um catálogo duplicado.
 *
 * O MANTIDO é sempre o primeiro (id estável), porque é ele que a maior parte do
 * histórico já referencia — o mesmo critério de `planejarLimpeza` na ingestão.
 */
export function planejarFusao(
  ids: readonly string[], vinculosPorProduto: Readonly<Record<string, number>> = {},
): PlanoDeFusao | null {
  if (ids.length < 2) return null;
  const [mantido, ...absorvidos] = ids;
  return {
    mantido,
    absorvidos,
    vinculos: absorvidos.reduce((s, id) => s + (vinculosPorProduto[id] ?? 0), 0),
  };
}

export type { Origem };
