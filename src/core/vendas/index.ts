/**
 * VENDAS E NOTAS FISCAIS — a venda como documento-mãe.
 *
 * A venda é o fato que propaga: gera recebível, ampara a nota fiscal e é a base
 * dos impostos. Por isso ela guarda TUDO num registro só — itens, taxas de
 * plataforma, comissões, status do pagamento e status da NF — e o valor líquido
 * sai de um cálculo único, não de contas espalhadas por tela.
 *
 * Puro, tipado, demo-safe. Versão vendas/1.0.0.
 */

import { gerarPixCopiaECola } from "@/core/pix";

export const VENDAS_VERSION = "vendas/1.0.0";

const round2 = (n: number) => Math.round(n * 100) / 100;
const semAcento = (s: string) =>
  (s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/* ================================ o modelo ================================ */

export type StatusVenda =
  | "iniciada" | "boleto_gerado" | "aguardando" | "em_analise" | "aprovada"
  | "completa" | "expirada" | "atrasada" | "cancelada" | "reclamada"
  | "reembolsada" | "reembolso_manual" | "chargeback";

export const STATUS_VENDA: { id: StatusVenda; label: string }[] = [
  { id: "iniciada", label: "Iniciada" },
  { id: "boleto_gerado", label: "Boleto gerado" },
  { id: "aguardando", label: "Aguardando pagamento" },
  { id: "em_analise", label: "Em análise" },
  { id: "aprovada", label: "Aprovada" },
  { id: "completa", label: "Completa" },
  { id: "expirada", label: "Expirada" },
  { id: "atrasada", label: "Atrasada" },
  { id: "cancelada", label: "Cancelada" },
  { id: "reclamada", label: "Reclamada" },
  { id: "reembolsada", label: "Reembolsada" },
  { id: "reembolso_manual", label: "Reembolso manual" },
  { id: "chargeback", label: "Chargeback" },
];

export type MetodoPagamento =
  | "credito" | "debito" | "boleto" | "pix" | "ted"
  | "saldo_plataforma" | "perguntar" | "outros";

export const METODOS_PAGAMENTO: { id: MetodoPagamento; label: string }[] = [
  { id: "credito", label: "Crédito" },
  { id: "debito", label: "Débito" },
  { id: "boleto", label: "Boleto" },
  { id: "pix", label: "PIX" },
  { id: "ted", label: "TED / DOC" },
  { id: "saldo_plataforma", label: "Saldo plataforma externa" },
  { id: "perguntar", label: "Perguntar ao cliente" },
  { id: "outros", label: "Outros" },
];

export const PLATAFORMAS = [
  "Hotmart", "Pagar.me", "Provi", "Cielo", "BlitzPay", "PayPal", "Ticto",
  "Eduzz", "Monetizze", "Asaas", "Kiwify", "TMB", "Pagar.me 2", "Hubla",
  "Stripe", "Visage", "B4You", "Basspago", "OnProfit", "Iugu", "Outros",
];

export type StatusNF = "a_emitir" | "processando" | "emitida" | "cancelada" | "negada";

export const STATUS_NF: { id: StatusNF; label: string }[] = [
  { id: "a_emitir", label: "A emitir" },
  { id: "processando", label: "Processando" },
  { id: "emitida", label: "Emitida" },
  { id: "cancelada", label: "Cancelada" },
  { id: "negada", label: "Negada" },
];

export interface ItemVenda {
  produtoId: string;
  nome: string;
  quantidade: number;
  precoUnitario: number;
}

/** Uma taxa com o fornecedor que a cobra — é o par que o print pede. */
export interface TaxaVenda { valor: number; fornecedorId: string }

export interface Venda {
  id: string;
  numero: string;
  clienteId: string;
  clienteNome: string;
  competencia: string;
  vencimento: string;
  itens: ItemVenda[];
  valorTotal: number;
  valorTotalComJuros: number;
  taxaPlataforma: TaxaVenda;
  taxaAntecipacao: TaxaVenda;
  taxaStreaming: TaxaVenda;
  comissaoCoprodutor: TaxaVenda;
  comissaoAfiliado: TaxaVenda;
  contaId: string;
  operacao: "venda" | "remessa";
  status: StatusVenda;
  metodo: MetodoPagamento;
  idExterno: string;
  /** Id da categoria de RECEITA (`public.categories`) — é o que o título referencia. */
  categoria: string;
  /** O nome da mesma categoria, para o texto do título e da lista. */
  categoriaNome?: string;
  tipoPagamento: "avista" | "parcelado";
  plataforma: string;
  chaveTransacao: string;
  pago: boolean;
  valorPago: number;
  dataPagamento: string | null;
  projetos: { id: string; percentual: number }[];
  centros: { id: string; percentual: number }[];
  descricao: string;
  textoDocumentoFiscal: string;
  observacoes: string;
  statusNF: StatusNF;
  numeroNF: string;
  criadoEm: string;
}

/* ============================== os cálculos ============================== */

export const totalDosItens = (itens: ItemVenda[]): number =>
  round2(itens.reduce((s, i) => s + (Number(i.quantidade) || 0) * (Number(i.precoUnitario) || 0), 0));

export const somaDasTaxas = (v: Venda): number =>
  round2([v.taxaPlataforma, v.taxaAntecipacao, v.taxaStreaming, v.comissaoCoprodutor, v.comissaoAfiliado]
    .reduce((s, t) => s + (Number(t?.valor) || 0), 0));

/**
 * O valor LÍQUIDO — o que sobra para a empresa.
 *
 * Parte do total COM juros quando ele existe (é o que o cliente pagou de fato)
 * e desconta as cinco taxas. Usar o total sem juros deixaria o juro cobrado do
 * cliente parecendo margem, quando ele já foi para a plataforma.
 */
export const valorLiquido = (v: Venda): number =>
  round2((v.valorTotalComJuros || v.valorTotal) - somaDasTaxas(v));

export function validarVenda(v: Partial<Venda>): Record<string, string> {
  const e: Record<string, string> = {};
  if (!v.clienteId) e.clienteId = "Selecione o cliente.";
  if (!v.competencia) e.competencia = "Informe a data de competência.";
  if (!v.vencimento) e.vencimento = "Informe a data de vencimento.";
  if (!v.itens?.length || !v.itens.some((i) => i.produtoId)) e.itens = "Adicione ao menos um produto.";
  else if (v.itens.some((i) => i.produtoId && (!i.quantidade || i.quantidade <= 0))) e.itens = "Quantidade precisa ser maior que zero.";
  else if (v.itens.some((i) => i.produtoId && (!i.precoUnitario || i.precoUnitario <= 0))) e.itens = "Preço unitário precisa ser maior que zero.";
  if (!v.valorTotal || v.valorTotal <= 0) e.valorTotal = "Informe o valor total.";
  if (!v.contaId) e.contaId = "Selecione a conta bancária.";
  if (!v.categoria) e.categoria = "Selecione a categoria da conta a receber.";
  if (v.pago && (!v.valorPago || v.valorPago <= 0)) e.valorPago = "Informe o valor pago.";
  if (v.pago && !v.dataPagamento) e.dataPagamento = "Informe a data do pagamento.";
  return e;
}

/* ================================ os painéis ================================ */

export interface CardVenda {
  id: string;
  label: string;
  valor: number;
  quantidade: number;
  percentual: number;
}

/** Os 6 cards de status da venda do print (5 estados + total). */
const GRUPOS_STATUS: { id: string; label: string; casa: (s: StatusVenda) => boolean }[] = [
  { id: "iniciada", label: "Iniciada", casa: (s) => ["iniciada", "boleto_gerado", "aguardando", "em_analise"].includes(s) },
  { id: "aprovada", label: "Aprovada", casa: (s) => s === "aprovada" },
  { id: "completa", label: "Completa", casa: (s) => s === "completa" },
  { id: "reembolsada", label: "Reembolsada", casa: (s) => s === "reembolsada" || s === "reembolso_manual" },
  { id: "chargeback", label: "Chargeback", casa: (s) => s === "chargeback" },
];

function cards(
  vendas: Venda[],
  grupos: { id: string; label: string; casa: (v: Venda) => boolean }[],
  rotuloTotal: string,
): CardVenda[] {
  const total = round2(vendas.reduce((s, v) => s + v.valorTotal, 0));
  const out = grupos.map((g) => {
    const l = vendas.filter((v) => g.casa(v));
    const soma = round2(l.reduce((s, v) => s + v.valorTotal, 0));
    return {
      id: g.id, label: g.label, valor: soma, quantidade: l.length,
      percentual: total > 0 ? Math.round((soma / total) * 1000) / 10 : 0,
    };
  });
  return [...out, {
    id: "total", label: rotuloTotal, valor: total, quantidade: vendas.length,
    percentual: total > 0 ? 100 : 0,
  }];
}

export const painelStatusVendas = (vendas: Venda[]): CardVenda[] =>
  cards(vendas, GRUPOS_STATUS.map((g) => ({ ...g, casa: (v: Venda) => g.casa(v.status) })), "Total");

/**
 * Os estados em que a venda NÃO houve: não há faturamento a tributar nem nota
 * a emitir. Uma lista só — o provisionamento de impostos, o painel de NF e o
 * botão "Emitir NF" perguntam a mesma coisa, e três listas divergiriam na
 * primeira vez que alguém acrescentasse um status.
 */
export const STATUS_SEM_FATURAMENTO: readonly StatusVenda[] = ["cancelada", "reembolsada", "reembolso_manual", "chargeback", "expirada"];
export const temFaturamento = (v: Pick<Venda, "status">): boolean => !STATUS_SEM_FATURAMENTO.includes(v.status);

/**
 * Os 4 cards de NF. "A emitir" e "com erro" são o trabalho pendente.
 *
 * ⚠️ Pendente só é a venda que ACONTECEU. Uma venda com chargeback ou cancelada
 * continuava "a emitir" com o valor cheio — o card mandava emitir nota de um
 * dinheiro que voltou ao cliente, e o botão da própria linha (`podeEmitirNota`)
 * já recusava a emissão: a tela pedia um trabalho que ela mesma não deixava
 * fazer.
 */
export const painelStatusNF = (vendas: Venda[]): CardVenda[] =>
  cards(vendas, [
    { id: "emitidas", label: "NFs emitidas", casa: (v: Venda) => v.statusNF === "emitida" },
    { id: "a_emitir", label: "NFs a emitir", casa: (v: Venda) => (v.statusNF === "a_emitir" || v.statusNF === "processando") && temFaturamento(v) },
    { id: "erro", label: "NFs com erro", casa: (v: Venda) => v.statusNF === "negada" && temFaturamento(v) },
  ], "Total de notas fiscais");

/** O resumo da tela de Notas Fiscais (emitidas · processando · canceladas · negadas). */
export const painelNotasFiscais = (vendas: Venda[]): CardVenda[] =>
  cards(vendas, [
    { id: "emitida", label: "NF emitidas", casa: (v: Venda) => v.statusNF === "emitida" },
    { id: "processando", label: "NF processando", casa: (v: Venda) => v.statusNF === "processando" },
    { id: "cancelada", label: "NF canceladas", casa: (v: Venda) => v.statusNF === "cancelada" },
    { id: "negada", label: "NF negadas", casa: (v: Venda) => v.statusNF === "negada" },
  ], "Total de NFs");

export interface FiltroVendas {
  de?: string | null;
  ate?: string | null;
  status?: StatusVenda | "todos";
  statusNF?: StatusNF | "todos";
  cliente?: string | null;
  plataforma?: string | null;
  busca?: string;
}

export function filtrarVendas(vendas: Venda[], f: FiltroVendas = {}): Venda[] {
  const q = semAcento((f.busca ?? "").trim());
  return vendas.filter((v) => {
    if (f.de && v.competencia < f.de) return false;
    if (f.ate && v.competencia > f.ate) return false;
    if (f.status && f.status !== "todos" && v.status !== f.status) return false;
    if (f.statusNF && f.statusNF !== "todos" && v.statusNF !== f.statusNF) return false;
    if (f.cliente && v.clienteId !== f.cliente) return false;
    if (f.plataforma && v.plataforma !== f.plataforma) return false;
    if (!q) return true;
    return [v.numero, v.clienteNome, v.idExterno, v.numeroNF, ...v.itens.map((i) => i.nome)]
      .some((s) => s && semAcento(String(s)).includes(q));
  }).sort((a, b) => b.competencia.localeCompare(a.competencia));
}

/* ============================== os impostos ============================== */

export type Regime = "simples" | "presumido" | "real";
export type Imposto = "icms" | "pis" | "cofins" | "ipi" | "iss" | "csll" | "inss" | "irpj";

export const IMPOSTOS: Imposto[] = ["icms", "pis", "cofins", "ipi", "iss", "csll", "inss", "irpj"];
export const ROTULO_IMPOSTO: Record<Imposto, string> = {
  icms: "ICMS", pis: "PIS", cofins: "COFINS", ipi: "IPI",
  iss: "ISS", csll: "CSLL", inss: "INSS", irpj: "IRPJ",
};

/** A qual esfera cada imposto pertence — é como o print agrupa o cadastro. */
export type Esfera = "municipal" | "estadual" | "federal";
export const ESFERA: Record<Imposto, Esfera> = {
  iss: "municipal",
  icms: "estadual",
  pis: "federal", cofins: "federal", ipi: "federal",
  csll: "federal", inss: "federal", irpj: "federal",
};
export const ROTULO_ESFERA: Record<Esfera, string> = {
  municipal: "Municipais · Prefeitura",
  estadual: "Estaduais · Fazenda Estadual",
  federal: "Federais · Ministério da Fazenda",
};

/**
 * Alíquotas EFETIVAS sobre a receita, por regime.
 *
 * ⚠️ São PADRÕES, não verdade universal: ISS varia de 2% a 5% por município,
 * ICMS por estado e por produto, e o Lucro Presumido muda a base conforme a
 * atividade (32% serviços × 8% comércio). Por isso a tela deixa cada alíquota
 * editável e diz que o contador é quem confirma. O que o sistema garante é a
 * ARITMÉTICA e o vencimento, não a alíquota.
 *
 * Presumido (serviços, base 32%): IRPJ 32%×15% = 4,8% · CSLL 32%×9% = 2,88%.
 */
export const ALIQUOTAS_PADRAO: Record<Regime, Record<Imposto, number>> = {
  simples: { icms: 0, pis: 0, cofins: 0, ipi: 0, iss: 0, csll: 0, inss: 0, irpj: 0 },
  presumido: { icms: 0, pis: 0.65, cofins: 3, ipi: 0, iss: 5, csll: 2.88, inss: 0, irpj: 4.8 },
  real: { icms: 0, pis: 1.65, cofins: 7.6, ipi: 0, iss: 5, csll: 9, inss: 0, irpj: 15 },
};

/**
 * Dia de vencimento padrão por imposto (Lucro Presumido).
 * `0` = último dia do mês — é assim que IRPJ, CSLL e IPI vencem.
 */
export const DIA_VENCIMENTO_PADRAO: Record<Imposto, number> = {
  pis: 25, cofins: 25, iss: 10, icms: 20, irpj: 0, csll: 0, ipi: 0, inss: 20,
};

export interface ConfigImpostos {
  regime: Regime;
  aliquotas: Record<Imposto, number>;
  /** Fornecedor por esfera — é para ele que a conta a pagar sai. */
  fornecedores: Record<Esfera, string>;
  categorias: Record<Imposto, string>;
  diasVencimento: Record<Imposto, number>;
  contaId: string;
}

/**
 * ⚠️ O regime é OBRIGATÓRIO. Esta função tinha `regime = "presumido"` como
 * padrão, e todo chamador que esquecia de dizer o regime recebia as alíquotas
 * do Lucro Presumido sem ninguém ter decidido isso. Sem padrão, esquecer é erro
 * de compilação, não imposto inventado.
 */
export const configPadrao = (regime: Regime): ConfigImpostos => ({
  regime,
  aliquotas: { ...ALIQUOTAS_PADRAO[regime] },
  fornecedores: { municipal: "", estadual: "", federal: "" },
  categorias: { icms: "", pis: "", cofins: "", ipi: "", iss: "", csll: "", inss: "", irpj: "" },
  diasVencimento: { ...DIA_VENCIMENTO_PADRAO },
  contaId: "",
});

/**
 * A estimativa de imposto que a Nova venda mostra ANTES de salvar.
 *
 * ⚠️ Era `valorTotal * 0.1538` inline na tela, para qualquer empresa. Para quem
 * DECLAROU o regime o número segue exatamente o mesmo (15,38%, a aproximação de
 * sempre — trocá-la por regime mudaria o número de empresa declarada, e isso é
 * outra decisão). Para quem NÃO declarou, devolve `null`: sem regime não há
 * imposto a estimar, e a tela manda declarar em vez de afirmar um valor.
 */
export const ALIQUOTA_ESTIMADA_VENDA = 0.1538;

export function impostoEstimadoDaVenda(
  valorTotal: number,
  regime: "nao_declarado" | "mei" | "simples" | "presumido" | "real",
): number | null {
  if (regime === "nao_declarado") return null;
  return valorTotal * ALIQUOTA_ESTIMADA_VENDA;
}

/**
 * O que falta para poder gerar as contas a pagar.
 *
 * O botão só libera com a configuração completa — gerar uma conta a pagar sem
 * fornecedor produziria um título órfão, que ninguém sabe a quem pagar.
 *
 * ⚠️ **A CATEGORIA DEIXOU DE SER PENDÊNCIA.** A lista de categorias da
 * configuração vem do plano de contas LOCAL, que nasce VAZIO desde que as 32
 * categorias de fábrica saíram — então, numa empresa nova, a pendência
 * "categoria pendente em PIS, COFINS…" nunca se resolvia e o botão ficava
 * travado para sempre, sem nada na tela dizendo que o caminho era montar um
 * plano de contas inteiro antes. Sem categoria escolhida, o título sai com o
 * NOME do imposto ("PIS", "ISS", "IRPJ"), e é esse nome que o DRE classifica
 * (dedução sobre a receita · imposto sobre o lucro) — a guarda `impostos:` do
 * engine-audit confere a linha. A categoria escolhida continua vencendo.
 */
export function pendenciasConfig(c: ConfigImpostos, impostosComValor: Imposto[]): string[] {
  const faltas: string[] = [];
  if (!c.contaId) faltas.push("conta bancária padrão de compras pendente");
  const esferas = new Set(impostosComValor.map((i) => ESFERA[i]));
  esferas.forEach((e) => {
    if (!c.fornecedores[e]) faltas.push(`fornecedor ${ROTULO_ESFERA[e].split(" · ")[0].toLowerCase()} pendente`);
  });
  return faltas;
}

/**
 * A descrição do título do imposto — é também a CHAVE de idempotência em
 * produção (um título por imposto por competência). Mudar o texto muda a
 * chave: por isso ele mora aqui, num lugar só.
 */
export const descricaoDoImposto = (rotulo: string, mesCompetencia: string): string =>
  `${rotulo} · competência ${mesCompetencia}`;

/**
 * Separa as contas de imposto que AINDA não têm título vivo na competência
 * das que já têm. É a idempotência do botão "Criar contas a pagar" em
 * produção: clicar duas vezes (ou dois colegas, um em cada máquina) não pode
 * dobrar o imposto do mês no fluxo de caixa. `descricoesVivas` são as
 * descrições dos títulos de saída não cancelados que já existem.
 */
export function contasSemTitulo<T extends { rotulo: string }>(
  contas: T[], mesCompetencia: string, descricoesVivas: Iterable<string>,
): { novas: T[]; jaExistiam: string[] } {
  const vivas = new Set(descricoesVivas);
  const tem = (c: T) => vivas.has(descricaoDoImposto(c.rotulo, mesCompetencia));
  return { novas: contas.filter((c) => !tem(c)), jaExistiam: contas.filter(tem).map((c) => c.rotulo) };
}

export interface LinhaImposto {
  vendaId: string;
  numero: string;
  cliente: string;
  competencia: string;
  base: number;
  valores: Record<Imposto, number>;
  total: number;
}

export interface ProvisaoImpostos {
  linhas: LinhaImposto[];
  /** Soma por imposto no período — cada uma vira UMA conta a pagar. */
  porImposto: Record<Imposto, number>;
  faturamento: number;
  total: number;
}

/**
 * Calcula o imposto de cada venda pela alíquota do regime.
 *
 * A base é o valor TOTAL da venda (faturamento), não o líquido: imposto sobre
 * venda incide sobre o que foi faturado, e não sobre o que sobrou depois das
 * taxas da plataforma. Vendas canceladas, reembolsadas e com chargeback ficam
 * de fora — não houve faturamento a tributar.
 */
export function provisionarImpostos(vendas: Venda[], c: ConfigImpostos): ProvisaoImpostos {
  const tributaveis = vendas.filter(temFaturamento);

  const porImposto = Object.fromEntries(IMPOSTOS.map((i) => [i, 0])) as Record<Imposto, number>;
  const linhas = tributaveis.map((v) => {
    const base = v.valorTotal;
    const valores = Object.fromEntries(IMPOSTOS.map((i) => {
      const val = round2((base * (c.aliquotas[i] ?? 0)) / 100);
      porImposto[i] = round2(porImposto[i] + val);
      return [i, val];
    })) as Record<Imposto, number>;
    return {
      vendaId: v.id, numero: v.numero, cliente: v.clienteNome, competencia: v.competencia,
      base, valores, total: round2(Object.values(valores).reduce((s, x) => s + x, 0)),
    };
  });

  return {
    linhas,
    porImposto,
    faturamento: round2(tributaveis.reduce((s, v) => s + v.valorTotal, 0)),
    total: round2(Object.values(porImposto).reduce((s, x) => s + x, 0)),
  };
}

export interface ContaImposto {
  imposto: Imposto;
  rotulo: string;
  valor: number;
  vencimento: string;
  fornecedorId: string;
  categoria: string;
}

/** Último dia do mês seguinte ao de competência — quase todo tributo vence lá. */
function vencimentoDoImposto(mesCompetencia: string, dia: number): string {
  const [a, m] = mesCompetencia.split("-").map(Number);
  const alvo = new Date(a, m, 1); // mês seguinte
  const ultimo = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  const d = dia === 0 ? ultimo : Math.min(dia, ultimo);
  return `${alvo.getFullYear()}-${String(alvo.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * UMA conta a pagar por imposto — não uma por venda.
 *
 * O contribuinte recolhe o total do mês numa guia só; gerar um título por venda
 * criaria centenas de contas que nunca serão pagas separadamente e sujariam o
 * fluxo de caixa.
 */
export function contasAPagarDosImpostos(
  p: ProvisaoImpostos,
  c: ConfigImpostos,
  mesCompetencia: string,
): ContaImposto[] {
  return IMPOSTOS
    .filter((i) => p.porImposto[i] > 0)
    .map((i) => ({
      imposto: i,
      rotulo: ROTULO_IMPOSTO[i],
      valor: p.porImposto[i],
      vencimento: vencimentoDoImposto(mesCompetencia, c.diasVencimento[i] ?? 0),
      fornecedorId: c.fornecedores[ESFERA[i]] ?? "",
      categoria: c.categorias[i] ?? "",
    }));
}

/** Os três fornecedores que o atalho "Propor fornecedores" cria. */
export const FORNECEDORES_PROPOSTOS: { esfera: Esfera; nome: string }[] = [
  { esfera: "municipal", nome: "Prefeitura Municipal" },
  { esfera: "estadual", nome: "Fazenda Estadual" },
  { esfera: "federal", nome: "Ministério da Fazenda" },
];

/* =========================== links de pagamento =========================== */

export interface LinkPagamento {
  id: string;
  titulo: string;
  valor: number;
  /** Vazio = link aberto, o pagador escolhe o valor. */
  clienteId: string;
  descricao: string;
  vencimento: string | null;
  ativo: boolean;
  criadoEm: string;
  aberturas: number;
}

export function validarLink(l: Partial<LinkPagamento>): Record<string, string> {
  const e: Record<string, string> = {};
  if (!l.titulo?.trim()) e.titulo = "Informe o título do link.";
  if (l.valor != null && l.valor < 0) e.valor = "O valor não pode ser negativo.";
  return e;
}

/**
 * O que o link ENTREGA hoje: o PIX copia-e-cola (BR Code estático) da empresa,
 * com o valor do link e o id dele como identificador da transação.
 *
 * ⚠️ NÃO há página pública de pagamento. A versão anterior devolvia
 * `<origem>/pagar/<id>`, rota que nunca existiu (404) — e o link mora em
 * `org_state`, que um pagador anônimo não lê. Um BR Code estático vale por si,
 * sem página e sem provedor: é o que funciona sem decisão nova. Página pública
 * ou PIX dinâmico (cobrança com vencimento) é decisão do dono, pendente.
 *
 * Sem dados do recebedor (chave = CNPJ cadastrado) devolve `null`: inventar
 * uma chave produziria um QR que paga a ninguém.
 */
export function pixDoLink(
  l: Pick<LinkPagamento, "id" | "valor">,
  recebedor: { chave: string; nome: string; cidade: string } | null,
): string | null {
  if (!recebedor) return null;
  return gerarPixCopiaECola({
    chave: recebedor.chave, nome: recebedor.nome, cidade: recebedor.cidade,
    valor: l.valor > 0 ? l.valor : undefined,
    txid: l.id.replace(/[^A-Za-z0-9]/g, "").slice(0, 25),
  });
}
