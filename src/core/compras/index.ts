/**
 * COMPRAS — o pedido de compra como fato que precisa de APROVAÇÃO.
 *
 * A diferença entre esta tela e "contas a pagar" é uma só, e é ela que dá
 * caráter ao módulo: uma compra nasce como PEDIDO, não como despesa. Ela só
 * vira título no fluxo de caixa quando alguém com alçada aprova.
 *
 * ⚠️ É por isso que `movimentosDaCompra` recusa tudo que não está aprovado.
 * Se um pedido aguardando aprovação já entrasse no fluxo, o dono planejaria o
 * mês contando com uma saída que talvez nunca aconteça — e um pedido REPROVADO
 * ficaria para sempre pesando num caixa que ele nunca tocou.
 *
 * Puro, tipado, demo-safe. Versão compras/1.0.0.
 */

import type { BoletoLido } from "./boleto";
import type { ChaveNFe } from "./nfe";

export * from "./boleto";
export * from "./nfe";

export const COMPRAS_VERSION = "compras/1.0.0";

const round2 = (n: number) => Math.round(n * 100) / 100;
const semAcento = (s: string) =>
  (s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/* ================================ o modelo ================================ */

export type StatusCompra = "aguardando" | "aprovada" | "reprovada" | "cancelada";

export const STATUS_COMPRA: { id: StatusCompra; label: string }[] = [
  { id: "aguardando", label: "Aguardando aprovação" },
  { id: "aprovada", label: "Aprovada" },
  { id: "reprovada", label: "Reprovada" },
  { id: "cancelada", label: "Cancelada" },
];

export type TipoPagamentoCompra = "a_vista" | "parcelado";

export const TIPOS_PAGAMENTO: { id: TipoPagamentoCompra; label: string }[] = [
  { id: "a_vista", label: "À vista" },
  { id: "parcelado", label: "Parcelado" },
];

export type EspecieDoc = "nfe" | "nfse";

export const ESPECIES: { id: EspecieDoc; label: string }[] = [
  { id: "nfe", label: "NF-e (produtos)" },
  { id: "nfse", label: "NFS-e (serviços)" },
];

/** Uma linha de rateio: a entidade e o quanto dela cabe nesta compra. */
export interface RateioCompra {
  id: string;
  nome: string;
  percentual: number;
}

export interface AnexoCompra {
  nome: string;
  tamanho: number;
}

export interface Compra {
  id: string;
  numero: string;
  fornecedorId: string;
  fornecedor: string;
  contaId: string;
  /** O NOME da categoria (o texto do título e da lista). */
  categoria: string;
  /**
   * A chave da categoria no banco (`categories.id`, UUID). Opcional porque as
   * compras gravadas antes de 30/09/2026 só têm o nome.
   */
  categoriaId?: string | null;
  tipoPagamento: TipoPagamentoCompra;
  /** Quantas parcelas — 1 quando à vista. */
  parcelas: number;
  /** Vencimento da primeira parcela (data de caixa). */
  vencimento: string;
  /** Competência (data do resultado — é ela que decide o mês no DRE). */
  competencia: string;
  valor: number;
  documentoFiscal: string;
  especie: EspecieDoc | null;
  pago: boolean;
  dataPagamento: string | null;
  projetos: RateioCompra[];
  centros: RateioCompra[];
  anexos: AnexoCompra[];
  descricao: string;
  infoPagamento: string;
  observacoes: string;
  status: StatusCompra;
  criadoPor: string;
  criadoEm: string;
  /**
   * ⚠️ A RECUSA DO BANCO, quando os títulos não entraram.
   *
   * Uma compra paga nasce aprovada — e aprovada significa "está no caixa". Se
   * o banco recusar os títulos (mês fechado, sem permissão, conta inválida),
   * ela volta para "aguardando" carregando a MENSAGEM REAL, e a lista a mostra
   * ao lado do botão que tenta de novo. Sem este campo a compra ficaria
   * "aprovada" sem um centavo no contas a pagar, e nada na tela diria isso.
   */
  erroTitulos?: string | null;
}

/* ------------------------------ anexos: limite ------------------------------ */

/** 1 MB — o limite desta tela. Anexo de compra é documento, não acervo. */
export const LIMITE_ANEXO = 1 * 1024 * 1024;

export const FORMATOS_ANEXO = [
  ".pdf", ".xml", ".png", ".jpg", ".jpeg", ".webp",
  ".xlsx", ".csv", ".ofx", ".docx", ".txt",
];

export function anexoAceito(nome: string, tamanho: number): string | null {
  const ext = `.${(nome.split(".").pop() ?? "").toLowerCase()}`;
  if (!FORMATOS_ANEXO.includes(ext)) return `Formato ${ext} não aceito.`;
  if (tamanho > LIMITE_ANEXO) return "Arquivo acima de 1 MB.";
  return null;
}

/* ================================ validação ================================ */

/**
 * O rateio compara CENTÉSIMOS inteiros, não float.
 *
 * `33,33 × 3` soma `99.99000000000001`, e um `Math.abs(soma - 100) <= 0.01`
 * devolve `0.010000000000005` — rejeitando a divisão em três, que é a mais
 * comum que existe.
 */
export function rateioFecha(linhas: RateioCompra[]): boolean {
  if (linhas.length === 0) return true;
  const soma = linhas.reduce((s, l) => s + (Number(l.percentual) || 0), 0);
  return Math.abs(Math.round(soma * 100) - 10_000) <= 1;
}

export function validarCompra(c: Partial<Compra>): Record<string, string> {
  const e: Record<string, string> = {};
  if (!c.fornecedorId) e.fornecedorId = "Selecione o fornecedor.";
  if (!c.contaId) e.contaId = "Selecione a conta bancária.";
  if (!c.categoria) e.categoria = "Selecione a categoria.";
  if (!c.tipoPagamento) e.tipoPagamento = "Informe o tipo de pagamento.";
  if (!c.vencimento) e.vencimento = "Informe a data de vencimento.";
  if (!c.competencia) e.competencia = "Informe a data de competência.";
  if (!c.valor || c.valor <= 0) e.valor = "Informe o valor da compra.";
  // Parcelado sem quantidade não gera nada: o sistema não teria como saber
  // quantos títulos criar, e o pedido nasceria sem caixa nenhum atrás.
  if (c.tipoPagamento === "parcelado" && (!c.parcelas || c.parcelas < 2)) {
    e.parcelas = "Parcelado exige ao menos 2 parcelas.";
  }
  if (c.pago && !c.dataPagamento) e.dataPagamento = "Informe a data do pagamento.";
  if (c.projetos && !rateioFecha(c.projetos)) e.projetos = "O rateio por projeto precisa somar 100%.";
  if (c.centros && !rateioFecha(c.centros)) e.centros = "O rateio por centro de custo precisa somar 100%.";
  return e;
}

/* ================================ parcelas ================================ */

export interface ParcelaCompra {
  numero: number;
  vencimento: string;
  valor: number;
}

/** Soma meses preservando o fim do mês: 31/01 + 1 mês = 28/02, não 03/03. */
export function somarMeses(dataISO: string, meses: number): string {
  const [a, m, d] = dataISO.split("-").map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo));
  return alvo.toISOString().slice(0, 10);
}

/**
 * As parcelas que a compra gera.
 *
 * ⚠️ O resto vai na ÚLTIMA parcela. 100 ÷ 3 = 33,33 e três parcelas de 33,33
 * somam 99,99: a compra nasceria com um centavo a menos do que foi comprado, e
 * a conciliação nunca fecharia.
 */
export function parcelasDaCompra(c: Compra): ParcelaCompra[] {
  const n = c.tipoPagamento === "parcelado" ? Math.max(2, Math.floor(c.parcelas || 2)) : 1;
  const cheia = Math.floor((c.valor * 100) / n) / 100;
  return Array.from({ length: n }, (_, k) => ({
    numero: k + 1,
    vencimento: somarMeses(c.vencimento, k),
    valor: k === n - 1 ? round2(c.valor - cheia * (n - 1)) : cheia,
  }));
}

/* ============================ compra → movimento ============================ */

/**
 * A CHAVE que liga o título ao pedido: `compra:<id da compra>:<parcela>`.
 *
 * ⚠️ É ela que permite, em produção, REPROVAR ou CANCELAR sem deixar título
 * órfão. O banco dá ao lançamento um id próprio (uuid) que a compra não
 * conhece; sem uma chave escrita no próprio título, "retirar as parcelas desta
 * compra" viraria uma busca por descrição e valor — e busca por texto alcança,
 * amanhã, o lançamento legítimo de outra pessoa.
 */
export const referenciaDaParcela = (compraId: string, numero: number): string =>
  `compra:${compraId}:${numero}`;

export interface MovimentoDaCompra {
  id: string;
  /** `compra:<id>:<parcela>` — gravada em `movements.reference_code`. */
  referencia: string;
  accountId: string;
  amount: number;
  dueDate: string;
  /** Competência — o mês em que a despesa aparece no DRE. */
  competencia: string;
  paidDate: string | null;
  status: "pago" | "pendente";
  category: string;
  categoryId: string | null;
  /** O centro e o projeto PRINCIPAIS (maior fatia do rateio). */
  centroId: string | null;
  projetoId: string | null;
  description: string;
  partyId: string;
}

/**
 * Os títulos que a compra coloca no caixa — SÓ se aprovada.
 *
 * Aguardando, reprovada e cancelada devolvem lista vazia. É a regra central do
 * módulo: o pedido de compra não é despesa até alguém dizer que é.
 */
/** A linha de maior fatia (a primeira, no empate) — mesma regra do lançamento. */
const principal = (l: RateioCompra[]): string | null => {
  const p = l.filter((x) => x.id);
  if (p.length === 0) return null;
  return p.reduce((m, x) => (Number(x.percentual) > Number(m.percentual) ? x : m)).id;
};

export function movimentosDaCompra(c: Compra): MovimentoDaCompra[] {
  if (c.status !== "aprovada") return [];
  const parcelas = parcelasDaCompra(c);
  return parcelas.map((p) => ({
    id: `compra-${c.id}-${p.numero}`,
    referencia: referenciaDaParcela(c.id, p.numero),
    accountId: c.contaId,
    amount: p.valor,
    dueDate: p.vencimento,
    // A competência não se parcela: a despesa é do mês em que o bem/serviço
    // entrou, mesmo que o pagamento se espalhe por seis meses.
    competencia: c.competencia,
    // Só a primeira parcela pode nascer paga — "marcar como pago" descreve o
    // ato de quitar a compra, e ninguém quita à vista uma parcela futura.
    paidDate: c.pago && p.numero === 1 ? (c.dataPagamento ?? p.vencimento) : null,
    status: c.pago && p.numero === 1 ? "pago" : "pendente",
    category: c.categoria,
    categoryId: c.categoriaId ?? null,
    centroId: principal(c.centros),
    projetoId: principal(c.projetos),
    description: parcelas.length > 1
      ? `${c.descricao || `Compra ${c.numero}`} (${p.numero}/${parcelas.length})`
      : c.descricao || `Compra ${c.numero}`,
    partyId: c.fornecedorId,
  }));
}

/* ------------------------- o título, como o banco o grava ------------------------- */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A linha que vai para `movements` em produção — a MESMA forma do escritor único. */
export interface LinhaTituloCompra {
  account_id: string;
  type: "saida";
  situacao: "previsto" | "baixado";
  amount: number;
  due_date: string;
  competence_date: string;
  paid_date: string | null;
  reconciled: false;
  category: string;
  description: string;
  party_id: string | null;
  reference_code: string;
  origem: "manual";
  especie: "titulo";
}

/**
 * ⚠️ **AS MESMAS TRÊS CHAVES do escritor único (`criarTitulos`)**: `origem`
 * (sem ela o banco recusa com A4P05, a fechadura da ONDA 5), `especie` e a
 * `situacao` que decide o `status` gerado. A diferença é UMA coluna a mais —
 * `reference_code` —, que o escritor único ainda não aceita e sem a qual
 * reprovar deixaria órfão o título que o banco batizou com um uuid.
 *
 * A competência sai da COMPRA, não da parcela: comprar em março para pagar em
 * 6x é despesa de março inteira.
 */
export function linhaDoTituloDaCompra(m: MovimentoDaCompra): LinhaTituloCompra {
  return {
    account_id: m.accountId,
    type: "saida",
    situacao: m.status === "pago" ? "baixado" : "previsto",
    amount: m.amount,
    due_date: m.dueDate,
    competence_date: m.competencia,
    paid_date: m.paidDate,
    reconciled: false,
    category: m.category,
    description: m.description,
    // Em demonstração o fornecedor tem id curto ("p1"); o banco só aceita uuid.
    party_id: UUID.test(m.partyId) ? m.partyId : null,
    reference_code: m.referencia,
    origem: "manual",
    especie: "titulo",
  };
}

/**
 * ⚠️ **PARCELA PAGA NÃO SAI DO CAIXA POR REPROVAÇÃO.** Cancelar ou excluir uma
 * compra retira as parcelas PREVISTAS; uma parcela já baixada é dinheiro que
 * saiu da conta, e apagá-la deixaria o saldo sem o lançamento que o explica.
 * O caminho é estornar o pagamento primeiro — a mesma regra da venda.
 *
 * Devolve a frase da recusa, ou `null` quando pode retirar.
 */
export function recusaDeRetirada(
  numero: string, titulos: readonly { pago: boolean }[], acao: "cancelar" | "excluir",
): string | null {
  const pagos = titulos.filter((t) => t.pago).length;
  if (pagos === 0) return null;
  return `A compra ${numero} tem ${pagos === 1 ? "uma parcela já paga" : `${pagos} parcelas já pagas`}. `
    + `Estorne o pagamento em Títulos a pagar antes de ${acao} — ${acao} agora apagaria dinheiro que já saiu da conta.`;
}

/**
 * A parcela já SAIU da conta? Pela `situacao` que o banco guarda.
 *
 * ⚠️ Só BAIXADO e CONCILIADO. "Confirmado" é o título aprovado na Central que
 * ainda não foi pago: contá-lo como pago recusava cancelar a compra dizendo
 * "parcela já paga" sobre dinheiro que nunca se moveu.
 */
export const situacaoPaga = (situacao: string | null | undefined): boolean =>
  situacao === "baixado" || situacao === "conciliado";

/**
 * O próximo número de compra do ano: o MAIOR + 1, nunca a contagem + 1.
 *
 * ⚠️ Com uma compra excluída no meio, contar repetiria o número da última —
 * duas compras "2026-C0003" na mesma lista (a mesma lição da venda).
 */
export function proximoNumeroDeCompra(numeros: readonly string[], ano: number): string {
  const doAno = numeros
    .filter((n) => n.startsWith(`${ano}-C`))
    .map((n) => Number(n.slice(`${ano}-C`.length)))
    .filter((n) => Number.isFinite(n));
  const maior = doAno.length ? Math.max(...doAno) : 0;
  return `${ano}-C${String(maior + 1).padStart(4, "0")}`;
}

/**
 * Uma compra marcada como paga já saiu da conta — ela não pode ficar
 * "aguardando aprovação".
 *
 * Sem isso as duas telas discordariam: o fluxo de caixa mostraria o dinheiro
 * fora (porque está pago) enquanto o card de aprovação ainda a contaria como
 * pendente. Aprovar o que já foi pago é reconhecer o fato, não relaxar o
 * controle — o registro de quem pagou sem passar pela alçada continua no
 * `criadoPor` e na trilha.
 */
export function statusInicial(pago: boolean): StatusCompra {
  return pago ? "aprovada" : "aguardando";
}

/* ================================ painéis ================================ */

export interface CardCompra {
  id: string;
  label: string;
  valor: number;
  quantidade: number;
  percentual: number;
}

/** Os 4 cards do print: aprovadas · aguardando · reprovadas ou canceladas · total. */
export function painelCompras(compras: Compra[]): CardCompra[] {
  const total = round2(compras.reduce((s, c) => s + c.valor, 0));
  const grupo = (id: string, label: string, casa: (c: Compra) => boolean): CardCompra => {
    const l = compras.filter(casa);
    const soma = round2(l.reduce((s, c) => s + c.valor, 0));
    return {
      id, label, valor: soma, quantidade: l.length,
      percentual: total > 0 ? Math.round((soma / total) * 1000) / 10 : 0,
    };
  };
  return [
    grupo("aprovada", "Aprovadas", (c) => c.status === "aprovada"),
    grupo("aguardando", "Aguardando aprovação", (c) => c.status === "aguardando"),
    grupo("reprovada", "Reprovadas ou canceladas", (c) => c.status === "reprovada" || c.status === "cancelada"),
    {
      id: "total", label: "Total", valor: total, quantidade: compras.length,
      percentual: total > 0 ? 100 : 0,
    },
  ];
}

/* ================================= filtros ================================= */

export interface FiltroCompras {
  /** Janela de vencimento/pagamento — a pergunta "o que sai de caixa". */
  vencDe?: string | null;
  vencAte?: string | null;
  /** Janela de competência — a pergunta "de que mês é a despesa". */
  compDe?: string | null;
  compAte?: string | null;
  status?: StatusCompra | "todos";
  criadoPor?: string | "todos";
  busca?: string;
}

const dentro = (data: string, de?: string | null, ate?: string | null) =>
  (!de || data >= de) && (!ate || data <= ate);

export function filtrarCompras(compras: Compra[], f: FiltroCompras = {}): Compra[] {
  const q = semAcento(f.busca ?? "").trim();
  return compras.filter((c) => {
    // Quando a compra foi paga, quem manda na janela de caixa é a data do
    // pagamento — é ela que descreve quando o dinheiro efetivamente saiu.
    const dataCaixa = c.pago && c.dataPagamento ? c.dataPagamento : c.vencimento;
    if (!dentro(dataCaixa, f.vencDe, f.vencAte)) return false;
    if (!dentro(c.competencia, f.compDe, f.compAte)) return false;
    if (f.status && f.status !== "todos" && c.status !== f.status) return false;
    if (f.criadoPor && f.criadoPor !== "todos" && c.criadoPor !== f.criadoPor) return false;
    if (q && !semAcento(`${c.fornecedor} ${c.descricao} ${c.numero} ${c.documentoFiscal}`).includes(q)) return false;
    return true;
  });
}

/* ============================= boletos recebidos ============================= */

export type StatusBoleto = "a_vencer" | "vencido" | "pago";

export interface BoletoRecebido {
  id: string;
  /** De onde veio: DDA quando a integração capturou, manual quando foi digitado. */
  origem: "dda" | "manual" | "documento";
  beneficiario: string;
  pagador: string;
  leitura: BoletoLido;
  pago: boolean;
  dataPagamento: string | null;
  recebidoEm: string;
  /** Título já vinculado a uma conta a pagar, quando houver. */
  movimentoId: string | null;
}

export function statusBoleto(b: BoletoRecebido, hojeISO: string): StatusBoleto {
  if (b.pago) return "pago";
  const v = b.leitura.vencimento;
  // Sem vencimento (guia de arrecadação, fator 0000) não há como estar
  // vencido — fica "a vencer" até alguém pagar.
  return v && v < hojeISO ? "vencido" : "a_vencer";
}

export interface ResumoBoletos {
  quantidade: number;
  valorTotal: number;
  aVencer: number;
  vencidos: number;
  pagos: number;
}

export function resumoBoletos(lista: BoletoRecebido[], hojeISO: string): ResumoBoletos {
  const conta = (s: StatusBoleto) => lista.filter((b) => statusBoleto(b, hojeISO) === s).length;
  return {
    quantidade: lista.length,
    valorTotal: round2(lista.reduce((s, b) => s + b.leitura.valor, 0)),
    aVencer: conta("a_vencer"),
    vencidos: conta("vencido"),
    pagos: conta("pago"),
  };
}

export function filtrarBoletos(
  lista: BoletoRecebido[],
  busca: string,
  status: StatusBoleto | "todos",
  hojeISO: string,
): BoletoRecebido[] {
  const q = semAcento(busca).replace(/\s+/g, " ").trim();
  const soDigitos = q.replace(/\D/g, "");
  return lista.filter((b) => {
    if (status !== "todos" && statusBoleto(b, hojeISO) !== status) return false;
    if (!q) return true;
    // Busca por código de barras ignora pontuação: ninguém digita a linha com
    // os pontos e espaços do DANFE.
    if (soDigitos.length >= 6 && b.leitura.linhaDigitavel.includes(soDigitos)) return true;
    return semAcento(`${b.beneficiario} ${b.pagador}`).includes(q);
  });
}

/* =============================== NFs recebidas =============================== */

export type StatusNFRecebida = "recebida" | "processada" | "duplicada" | "erro" | "cancelada";

export const STATUS_NF_RECEBIDA: { id: StatusNFRecebida; label: string }[] = [
  { id: "recebida", label: "Recebida" },
  { id: "processada", label: "Processada" },
  { id: "duplicada", label: "Duplicada" },
  { id: "erro", label: "Erro" },
  { id: "cancelada", label: "Cancelada" },
];

export type AvaliacaoNF = "pendente" | "aprovada" | "recusada";

export const AVALIACOES_NF: { id: AvaliacaoNF; label: string }[] = [
  { id: "pendente", label: "Pendente de validação" },
  { id: "aprovada", label: "Aprovada" },
  { id: "recusada", label: "Recusada" },
];

export const TIPOS_NF = ["NFS", "NFE", "NFCE", "NFSE", "CTE", "CTOS", "BPE"] as const;
export type TipoNF = (typeof TIPOS_NF)[number];

export interface NFRecebida {
  id: string;
  chave: ChaveNFe | null;
  /** Quando não há chave (NFS-e municipal), o número é o que identifica. */
  numero: string;
  tipo: TipoNF;
  fornecedorId: string | null;
  fornecedor: string;
  cnpj: string;
  emissao: string;
  valor: number;
  categoria: string;
  status: StatusNFRecebida;
  avaliacao: AvaliacaoNF;
  origem: "sefaz" | "manual";
}

export interface ResumoNFs {
  quantidade: number;
  valorTotal: number;
  pendentes: number;
}

export const resumoNFs = (lista: NFRecebida[]): ResumoNFs => ({
  quantidade: lista.length,
  valorTotal: round2(lista.reduce((s, n) => s + n.valor, 0)),
  pendentes: lista.filter((n) => n.avaliacao === "pendente").length,
});

export interface FiltroNFs {
  de?: string | null;
  ate?: string | null;
  /** Valor exato — o print pede "Ex: 1300 ou 1.300,00". */
  valor?: number | null;
  tipo?: TipoNF | "todos";
  status?: StatusNFRecebida | "todos";
  fornecedor?: string;
  categoria?: string | "todos";
  avaliacao?: AvaliacaoNF | "todos";
}

/**
 * Aceita "1300", "1.300,00" e "1300,00" — o operador copia o valor do DANFE,
 * que vem em pt-BR, e digita o número redondo quando lembra de cabeça.
 */
export function valorDigitado(txt: string): number | null {
  const t = (txt ?? "").trim();
  if (!t) return null;
  const n = Number(t.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * O documento que JÁ está na caixa de entrada — pelo que o identifica de
 * verdade: o código de barras no boleto, a chave de acesso na nota.
 *
 * ⚠️ Colar de novo um documento que já estava lá SUBSTITUÍA o registro: a nota
 * aprovada voltava para "pendente de avaliação", e o boleto já lançado perdia
 * o vínculo com o título ("Lançar em contas a pagar" reaparecia) e a marca de
 * pago. Quem cola duas vezes não está pedindo para desfazer o que fez — a tela
 * avisa e deixa o registro como estava.
 */
export function boletoJaCapturado(lista: readonly BoletoRecebido[], codigoBarras: string): BoletoRecebido | null {
  return lista.find((b) => b.leitura.codigoBarras === codigoBarras) ?? null;
}
export function notaJaCapturada(lista: readonly NFRecebida[], chave: string): NFRecebida | null {
  return lista.find((n) => n.chave?.chave === chave) ?? null;
}

export function filtrarNFs(lista: NFRecebida[], f: FiltroNFs = {}): NFRecebida[] {
  const forn = semAcento(f.fornecedor ?? "").trim();
  return lista.filter((n) => {
    if (!dentro(n.emissao, f.de, f.ate)) return false;
    // Comparação em centavos: 1300.0000000001 !== 1300 mordeu esse filtro antes.
    if (f.valor != null && Math.round(n.valor * 100) !== Math.round(f.valor * 100)) return false;
    if (f.tipo && f.tipo !== "todos" && n.tipo !== f.tipo) return false;
    if (f.status && f.status !== "todos" && n.status !== f.status) return false;
    if (f.categoria && f.categoria !== "todos" && n.categoria !== f.categoria) return false;
    if (f.avaliacao && f.avaliacao !== "todos" && n.avaliacao !== f.avaliacao) return false;
    if (forn && !semAcento(`${n.fornecedor} ${n.cnpj}`).includes(forn)) return false;
    return true;
  });
}
