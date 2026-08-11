/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O DICIONÁRIO DE DOMÍNIO — uma palavra para cada coisa, em português.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * **Uma lista por conceito. Nenhum módulo declara enum de negócio por conta
 * própria.** É a mesma tese da ONDA 1 aplicada ao VOCABULÁRIO em vez de à
 * aritmética: quando o mesmo conceito é declarado em cinco arquivos, os cinco
 * começam idênticos e divergem na primeira adição — e a divergência vira um
 * filtro que não acha, um relatório que perde linha e uma IA que classifica
 * errado.
 *
 * ⚠️ **O que estava errado NÃO era o valor dos enums.** Medido antes de
 * escrever: `MovementType`, `MovementStatus`, `CategoryKind`, `PaymentMethod`,
 * `PartyType` e a taxonomia da ingestão já saem em português. O que faltava era
 * (a) um lugar único que os declarasse, (b) o DE-PARA para o dado que entra em
 * inglês pela importação, e (c) uma guarda que impeça o próximo enum de nascer
 * solto. Renomear coluna de banco (`kind`, `type`, `status`) seria custo alto
 * sem nada visível do outro lado — e está declarado como não feito.
 *
 * ⚠️ **Empréstimo linguístico NÃO é palavra em inglês.** O primeiro detector
 * que escrevi acusou "Assinaturas / software" como categoria inglesa. Software,
 * marketing, site, e-mail, design, layout e outras entraram no português e são
 * o que um financeiro escreve o dia inteiro. Um detector que acusa isso treina
 * quem o lê a ignorar o aviso — e aí o aviso deixou de existir, que é o mesmo
 * defeito do detector de segredos da Central de Ajuda.
 *
 * Puro, tipado, sem I/O. Versão `dominio/1.0.0`.
 */

export const DOMINIO_VERSION = "dominio/1.0.0";

/* ========================================================================== */
/* 1. TIPO DE LANÇAMENTO — a direção do dinheiro                              */
/* ========================================================================== */

export const TIPOS_LANCAMENTO = ["entrada", "saida"] as const;
export type TipoLancamento = (typeof TIPOS_LANCAMENTO)[number];

export const ROTULO_TIPO: Record<TipoLancamento, string> = {
  entrada: "Entrada",
  saida: "Saída",
};

/* ========================================================================== */
/* 2. NATUREZA — o que o dinheiro É, além de para onde vai                    */
/* ========================================================================== */

/**
 * ⚠️ Natureza e tipo respondem perguntas DIFERENTES, e confundi-las é a raiz de
 * metade da sujeira desta onda. "Transferência entre contas" é uma entrada
 * (tipo) que não é receita (natureza); "estorno de tarifa" é uma entrada que
 * não é faturamento. Somar por tipo e chamar de receita foi o que pôs
 * despesa dentro de Receita Bruta Operacional.
 */
export const NATUREZAS = [
  "receita", "despesa", "transferencia", "imposto", "financeiro", "estorno",
] as const;
export type NaturezaLancamento = (typeof NATUREZAS)[number];

export const ROTULO_NATUREZA: Record<NaturezaLancamento, string> = {
  receita: "Receita",
  despesa: "Despesa",
  transferencia: "Transferência entre contas",
  imposto: "Imposto",
  financeiro: "Resultado financeiro",
  estorno: "Estorno",
};

/**
 * As naturezas que **não são faturamento** e por isso ficam fora da base de
 * receita — a mesma decisão que `receitaTributavel` já tomava por regex sobre a
 * categoria, agora disponível como dado.
 */
export const FORA_DA_RECEITA: readonly NaturezaLancamento[] =
  ["transferencia", "imposto", "financeiro", "estorno"];

/* ========================================================================== */
/* 3. SITUAÇÃO — o estado do título                                           */
/* ========================================================================== */

export const SITUACOES = ["pendente", "pago", "cancelado"] as const;
export type Situacao = (typeof SITUACOES)[number];

export const ROTULO_SITUACAO: Record<Situacao, string> = {
  pendente: "Em aberto",
  pago: "Liquidado",
  cancelado: "Cancelado",
};

/* ========================================================================== */
/* 4. FORMA DE PAGAMENTO                                                      */
/* ========================================================================== */

export const FORMAS_PAGAMENTO = [
  "pix", "boleto", "cartao", "dinheiro", "transferencia", "debito_automatico",
] as const;
export type FormaPagamento = (typeof FORMAS_PAGAMENTO)[number];

export const ROTULO_FORMA: Record<FormaPagamento, string> = {
  pix: "Pix",
  boleto: "Boleto",
  cartao: "Cartão",
  dinheiro: "Dinheiro",
  transferencia: "Transferência",
  debito_automatico: "Débito automático",
};

/* ========================================================================== */
/* 5. ORIGEM — de onde o registro veio                                        */
/* ========================================================================== */

/**
 * ⚠️ **Origem é OBRIGATÓRIA em título**, e é a peça que faltava para separar
 * extrato de título. Medido: `movements.origem` estava preenchida em **0 de
 * 1.292** linhas, e 190 títulos pendentes não sabiam dizer de onde vieram.
 * Sem origem não há como responder "por que este título existe?" — e é
 * exatamente essa pergunta que ninguém consegue responder quando "APPLE COM
 * BILL" aparece na lista de contas a receber.
 */
export const ORIGENS = [
  "venda", "contrato", "importacao", "manual", "conciliacao", "extrato",
] as const;
export type Origem = (typeof ORIGENS)[number];

export const ROTULO_ORIGEM: Record<Origem, string> = {
  venda: "Venda",
  contrato: "Contrato",
  importacao: "Importação",
  manual: "Lançamento manual",
  conciliacao: "Conciliação",
  extrato: "Extrato bancário",
};

/**
 * ⚠️ As origens que produzem TÍTULO. `extrato` está de fora **de propósito**:
 * uma linha de extrato é o registro de um dinheiro que JÁ se moveu, e um título
 * é uma obrigação que ainda vai vencer. Tratá-los como a mesma coisa é o que
 * põe "DISNEY PLUS" na lista do que se tem a receber.
 */
export const ORIGENS_DE_TITULO: readonly Origem[] =
  ["venda", "contrato", "importacao", "manual", "conciliacao"];

export const ehOrigemDeTitulo = (o: string): o is Origem =>
  (ORIGENS_DE_TITULO as readonly string[]).includes(o);

/* ========================================================================== */
/* 6. ESPÉCIE DO REGISTRO — extrato × título × nota fiscal                     */
/* ========================================================================== */

/**
 * Os três conceitos que hoje se misturam, agora nomeados.
 *
 *  - **`extrato`** — o dinheiro que passou pela conta. Fato consumado, data de
 *    caixa, sem vencimento a cobrar.
 *  - **`titulo`** — a obrigação a receber ou a pagar. Tem vencimento, tem
 *    origem, e é sobre ele que se cobra.
 *  - **`nota`** — o documento fiscal. Ampara o título, e não é o título: uma
 *    venda pode ter NF sem o dinheiro ter entrado, e vice-versa.
 */
export const ESPECIES = ["extrato", "titulo", "nota"] as const;
export type Especie = (typeof ESPECIES)[number];

export const ROTULO_ESPECIE: Record<Especie, string> = {
  extrato: "Lançamento de extrato",
  titulo: "Título",
  nota: "Nota fiscal",
};

/* ========================================================================== */
/* 7. TIPO DE CONTRAPARTE                                                     */
/* ========================================================================== */

/**
 * ⚠️ `nao_identificada` existe e é o valor mais importante da lista.
 *
 * "DISNEY PLUS" não é cliente, não é fornecedor e não é pessoa: é o descritivo
 * de uma cobrança que a importação transformou em cadastro. Sem um nome para
 * isso, o sistema só tinha as opções que já usava — e escolheu "cliente", que
 * é o que fez um score de crédito ser atribuído a uma assinatura de streaming.
 */
export const TIPOS_CONTRAPARTE = [
  "cliente", "fornecedor", "transportadora", "instituicao_financeira",
  "orgao_publico", "propria_empresa", "nao_identificada",
] as const;
export type TipoContraparte = (typeof TIPOS_CONTRAPARTE)[number];

export const ROTULO_CONTRAPARTE: Record<TipoContraparte, string> = {
  cliente: "Cliente",
  fornecedor: "Fornecedor",
  transportadora: "Transportadora",
  instituicao_financeira: "Instituição financeira",
  orgao_publico: "Órgão público",
  propria_empresa: "A própria empresa",
  nao_identificada: "Não identificada",
};

/**
 * ⚠️ **Só cliente identificado recebe score de crédito.** Score é uma
 * afirmação sobre a probabilidade de ALGUÉM pagar; atribuí-lo a "IOF ROTATIVO"
 * não é só inútil, é um número com aparência de análise no meio de uma
 * carteira, e ele entra na média da carteira inteira.
 */
export const PODE_TER_SCORE: readonly TipoContraparte[] = ["cliente"];

export const podeTerScore = (t: TipoContraparte): boolean =>
  PODE_TER_SCORE.includes(t);

/* ========================================================================== */
/* O DE-PARA — o dado que entra em outra língua                               */
/* ========================================================================== */

/**
 * ⚠️ Este mapa existe porque o defeito está no DADO, não no código. Medido: as
 * categorias do produto já nascem em português (seed, taxonomia da ingestão,
 * plano de contas padrão). O que chega em inglês vem de extrato de banco
 * internacional, de exportação de outro ERP e de planilha herdada — e chegou
 * como CADASTRO, não como texto de tela.
 *
 * A chave é comparada em minúsculas e sem acento; o valor é a categoria
 * canônica do sistema.
 */
export const DE_PARA_CATEGORIA: Record<string, string> = {
  // Folha
  salary: "Folha de pagamento",
  salaries: "Folha de pagamento",
  payroll: "Folha de pagamento",
  wages: "Folha de pagamento",
  // Utilidades
  electricity: "Utilidades",
  power: "Utilidades",
  water: "Utilidades",
  gas: "Utilidades",
  utilities: "Utilidades",
  telecommunications: "Utilidades",
  telecom: "Utilidades",
  internet: "Utilidades",
  phone: "Utilidades",
  // Ocupação
  rent: "Aluguel",
  lease: "Aluguel",
  "office rent": "Aluguel",
  // Fornecedores
  suppliers: "Fornecedores e insumos",
  supplier: "Fornecedores e insumos",
  vendors: "Fornecedores e insumos",
  "cost of goods sold": "Fornecedores e insumos",
  cogs: "Fornecedores e insumos",
  // Financeiro
  "bank fees": "Tarifas bancárias",
  "bank charges": "Tarifas bancárias",
  fees: "Tarifas bancárias",
  interest: "Juros e encargos",
  "interest expense": "Juros e encargos",
  // Imposto
  taxes: "Impostos",
  tax: "Impostos",
  vat: "Impostos",
  // Receita
  revenue: "Receita de vendas",
  sales: "Receita de vendas",
  income: "Receita de vendas",
  "service revenue": "Receita de serviços",
  services: "Receita de serviços",
  // Operacional
  insurance: "Serviços profissionais",
  legal: "Serviços profissionais",
  accounting: "Serviços profissionais",
  consulting: "Serviços profissionais",
  travel: "Viagens e deslocamento",
  advertising: "Marketing",
  "other expenses": "Outras despesas",
  "other income": "Outras receitas",
  miscellaneous: "Outras despesas",
};

const semAcento = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * A categoria canônica para um nome que possa ter vindo em inglês.
 * Devolve `null` quando não há tradução conhecida — nunca inventa.
 */
export function traduzirCategoria(nome: string | null | undefined): string | null {
  if (!nome) return null;
  return DE_PARA_CATEGORIA[semAcento(nome)] ?? null;
}

/* ========================================================================== */
/* O DETECTOR DE INGLÊS — e por que ele é conservador                          */
/* ========================================================================== */

/**
 * ⚠️ **Empréstimos linguísticos NÃO contam.** Software, marketing, site,
 * e-mail, design, layout, cloud, streaming, delivery, checkout, feedback e
 * outros entraram no português e são o que um financeiro escreve o dia inteiro.
 * O primeiro detector que escrevi acusou "Assinaturas / software" — e um
 * detector que grita lobo é um detector que ninguém lê.
 */
export const EMPRESTIMOS = new Set([
  "software", "marketing", "site", "email", "e-mail", "design", "layout",
  "cloud", "streaming", "delivery", "checkout", "feedback", "kit", "show",
  "online", "internet", "web", "app", "link", "mouse", "notebook", "tablet",
  "shopping", "outlet", "franchising", "leasing", "factoring", "know-how",
  "hardware", "backup", "download", "upload", "digital", "banner", "outdoor",
]);

/**
 * As palavras que, sozinhas, denunciam um rótulo que não foi traduzido. A lista
 * é CURADA e curta de propósito: ela cobre o vocabulário de plano de contas de
 * ERP estrangeiro, que é de onde o dado sujo veio.
 */
const PALAVRAS_INGLESAS = new Set([
  ...Object.keys(DE_PARA_CATEGORIA).flatMap((k) => k.split(/\s+/)),
  "expense", "expenses", "cost", "costs", "payable", "receivable",
  "invoice", "invoices", "payment", "payments", "customer", "vendor",
  "account", "balance", "credit", "debit", "transfer", "withdrawal",
  "deposit", "refund", "chargeback", "subscription", "maintenance",
  "training", "equipment", "supplies", "freight", "shipping",
]);

/**
 * `true` quando o texto tem ao menos uma palavra inglesa que **não** é
 * empréstimo. Uma palavra basta: rótulo de cadastro é curto, e "Bank Fees" não
 * fica menos inglês por ter duas palavras em vez de cinco.
 */
export function pareceIngles(texto: string | null | undefined): boolean {
  if (!texto) return false;
  const palavras = semAcento(texto).split(/[^a-z0-9-]+/).filter(Boolean);
  return palavras.some((p) => PALAVRAS_INGLESAS.has(p) && !EMPRESTIMOS.has(p));
}

/* ========================================================================== */
/* A guarda declarada — o inventário do vocabulário                            */
/* ========================================================================== */

/**
 * Todo conjunto de valores de domínio do sistema, num lugar só.
 *
 * ⚠️ Serve à guarda: um enum de negócio declarado fora daqui é um vocabulário
 * paralelo esperando para divergir. A lista é o que torna "nenhum enum solto"
 * verificável em vez de intenção.
 */
export const VOCABULARIO = {
  tipoLancamento: TIPOS_LANCAMENTO,
  natureza: NATUREZAS,
  situacao: SITUACOES,
  formaPagamento: FORMAS_PAGAMENTO,
  origem: ORIGENS,
  especie: ESPECIES,
  tipoContraparte: TIPOS_CONTRAPARTE,
} as const;

/** Todo valor de domínio é minúsculo, sem espaço e sem acento — chave, não rótulo. */
export function valoresBemFormados(): string[] {
  const ruins: string[] = [];
  for (const [conceito, lista] of Object.entries(VOCABULARIO)) {
    for (const v of lista as readonly string[]) {
      if (!/^[a-z][a-z0-9_]*$/.test(v)) ruins.push(`${conceito}.${v}`);
    }
  }
  return ruins;
}

/** Todo valor tem rótulo em português — sem rótulo, a tela mostra a chave crua. */
export const ROTULOS: Record<string, Record<string, string>> = {
  tipoLancamento: ROTULO_TIPO,
  natureza: ROTULO_NATUREZA,
  situacao: ROTULO_SITUACAO,
  formaPagamento: ROTULO_FORMA,
  origem: ROTULO_ORIGEM,
  especie: ROTULO_ESPECIE,
  tipoContraparte: ROTULO_CONTRAPARTE,
};

export function valoresSemRotulo(): string[] {
  const faltando: string[] = [];
  for (const [conceito, lista] of Object.entries(VOCABULARIO)) {
    const mapa = ROTULOS[conceito] ?? {};
    for (const v of lista as readonly string[]) {
      if (!mapa[v]) faltando.push(`${conceito}.${v}`);
    }
  }
  return faltando;
}
