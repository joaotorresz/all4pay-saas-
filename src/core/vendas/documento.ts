/**
 * A VENDA ⇄ O DOCUMENTO — a tradução entre a tela e `sales_docs`.
 *
 * ⚠️ Uma função pura por sentido, e as duas aqui, juntas. O documento é a
 * morada única da venda (migration 20260930150000); se a ida e a volta
 * morassem em arquivos diferentes, o primeiro campo novo entraria num lado só e
 * a venda passaria a perder dado ao ser salva e reaberta, calada.
 *
 * O que se filtra, ordena ou soma tem COLUNA; o resto vai em `detalhe`.
 */
import type { ItemVenda, StatusNF, StatusVenda, Venda } from "./index";
import type { SaleDocInput } from "@/lib/types";

/** A linha de `sales_docs` como ela volta do banco (com os itens e o cliente). */
export interface LinhaDocumento {
  id: string;
  numero: string | null;
  doc_date: string;
  competence_date: string | null;
  due_date: string | null;
  account_id: string | null;
  party_id: string | null;
  total: number | string | null;
  subtotal?: number | string | null;
  status: string | null;
  status_nf: string | null;
  numero_nf: string | null;
  notes: string | null;
  created_at?: string | null;
  detalhe: Partial<Venda> | null;
  parties?: { name?: string | null } | null;
  sale_items?: {
    product_id: string | null;
    service_id: string | null;
    description: string | null;
    qty: number | string | null;
    unit_price: number | string | null;
  }[] | null;
}

/** A linha que o escritor manda para `sales_docs`. */
export interface GravacaoDocumento {
  id: string;
  kind: "venda";
  item_kind: "produto";
  numero: string;
  party_id: string | null;
  doc_date: string;
  competence_date: string;
  due_date: string;
  account_id: string | null;
  subtotal: number;
  discount: number;
  total: number;
  status: StatusVenda;
  status_nf: StatusNF;
  numero_nf: string | null;
  notes: string | null;
  detalhe: Partial<Venda>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ehUUID = (s: string | null | undefined): s is string => !!s && UUID.test(s);

const num = (x: unknown): number => {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
};

/**
 * ⚠️ O status do lançamento rápido é outro vocabulário (`aberto`/`faturado`).
 * Traduzir para o da venda — e NUNCA deixar um texto desconhecido virar um
 * status que a tela não sabe pintar: cai em "iniciada", o estado que pede ação.
 */
const STATUS_DO_RAPIDO: Record<string, StatusVenda> = {
  aberto: "iniciada",
  faturado: "completa",
};
const STATUS_VALIDOS: readonly StatusVenda[] = [
  "iniciada", "boleto_gerado", "aguardando", "em_analise", "aprovada", "completa",
  "expirada", "atrasada", "cancelada", "reclamada", "reembolsada", "reembolso_manual", "chargeback",
];
const NF_VALIDOS: readonly StatusNF[] = ["a_emitir", "processando", "emitida", "cancelada", "negada"];

export function statusDaVenda(s: string | null): StatusVenda {
  if (!s) return "iniciada";
  if ((STATUS_VALIDOS as readonly string[]).includes(s)) return s as StatusVenda;
  return STATUS_DO_RAPIDO[s] ?? "iniciada";
}

const semTaxa = () => ({ valor: 0, fornecedorId: "" });

/** Documento do banco → a venda que a tela edita. */
export function vendaDoDocumento(d: LinhaDocumento): Venda {
  const det = (d.detalhe ?? {}) as Partial<Venda>;
  const total = num(d.total);
  const itensDoBanco: ItemVenda[] = (d.sale_items ?? []).map((i) => ({
    produtoId: i.product_id ?? i.service_id ?? "",
    nome: i.description ?? "",
    quantidade: num(i.qty),
    precoUnitario: num(i.unit_price),
  }));
  const competencia = d.competence_date ?? d.doc_date;
  return {
    // Primeiro o que só a tela guarda; por cima, as COLUNAS — elas vencem,
    // porque são o que o banco soma e o que outra tela pode ter mudado.
    ...semDetalhe(),
    ...det,
    id: d.id,
    numero: d.numero ?? det.numero ?? d.id.slice(0, 8),
    clienteId: d.party_id ?? "",
    clienteNome: d.parties?.name ?? det.clienteNome ?? "—",
    competencia,
    vencimento: d.due_date ?? competencia,
    itens: itensDoBanco.length ? itensDoBanco : (det.itens ?? []),
    valorTotal: det.valorTotal ?? total,
    valorTotalComJuros: total,
    contaId: d.account_id ?? "",
    status: statusDaVenda(d.status),
    statusNF: (NF_VALIDOS as readonly string[]).includes(d.status_nf ?? "")
      ? (d.status_nf as StatusNF) : "a_emitir",
    numeroNF: d.numero_nf ?? "",
    observacoes: d.notes ?? det.observacoes ?? "",
    criadoEm: (d.created_at ?? d.doc_date).slice(0, 10),
  };
}

function semDetalhe(): Omit<Venda, "id" | "numero" | "clienteId" | "clienteNome" | "competencia" | "vencimento" | "itens" | "valorTotal" | "valorTotalComJuros" | "contaId" | "status" | "statusNF" | "numeroNF" | "observacoes" | "criadoEm"> {
  return {
    taxaPlataforma: semTaxa(), taxaAntecipacao: semTaxa(), taxaStreaming: semTaxa(),
    comissaoCoprodutor: semTaxa(), comissaoAfiliado: semTaxa(),
    operacao: "venda", metodo: "pix", idExterno: "", categoria: "",
    tipoPagamento: "avista", plataforma: "", chaveTransacao: "",
    pago: false, valorPago: 0, dataPagamento: null,
    projetos: [], centros: [], descricao: "", textoDocumentoFiscal: "",
  };
}

/**
 * Venda da tela → a linha de `sales_docs`.
 *
 * ⚠️ `total` é o valor COM juros quando existe — é o que o cliente paga e o que
 * vira o título. O sem-juros fica em `detalhe.valorTotal`, que a tela mostra ao
 * lado. Gravar o sem-juros no `total` faria o documento e o título discordarem
 * pelo valor exato do juro.
 */
export function documentoDaVenda(v: Venda): GravacaoDocumento {
  const soma = v.itens.reduce((s, i) => s + num(i.quantidade) * num(i.precoUnitario), 0);
  const {
    id: _i, numero: _n, clienteId: _c, competencia: _cp, vencimento: _vc,
    contaId: _ct, status: _s, statusNF: _sn, numeroNF: _nn, observacoes: _o,
    ...detalhe
  } = v;
  return {
    id: v.id,
    kind: "venda",
    item_kind: "produto",
    numero: v.numero,
    party_id: ehUUID(v.clienteId) ? v.clienteId : null,
    doc_date: v.competencia,
    competence_date: v.competencia,
    due_date: v.vencimento,
    account_id: ehUUID(v.contaId) ? v.contaId : null,
    subtotal: Math.round(soma * 100) / 100,
    discount: 0,
    total: v.valorTotalComJuros || v.valorTotal,
    status: v.status,
    status_nf: v.statusNF,
    numero_nf: v.numeroNF || null,
    notes: v.observacoes || null,
    detalhe,
  };
}

/** Os itens como `sale_items` os guarda — produto só quando é um id real. */
export function itensDoDocumento(v: Venda): {
  doc_id: string; product_id: string | null; description: string;
  qty: number; unit_price: number; discount: number; total: number;
}[] {
  return v.itens
    .filter((i) => i.produtoId || i.nome)
    .map((i) => ({
      doc_id: v.id,
      product_id: ehUUID(i.produtoId) ? i.produtoId : null,
      description: i.nome,
      qty: num(i.quantidade),
      unit_price: num(i.precoUnitario),
      discount: 0,
      total: Math.round(num(i.quantidade) * num(i.precoUnitario) * 100) / 100,
    }));
}

/** O próximo número do ano, dado o que já existe — `2026-0007`. */
export function proximoNumeroDe(numeros: readonly string[], ano: number): string {
  const doAno = numeros
    .filter((n) => n.startsWith(`${ano}-`))
    .map((n) => Number(n.slice(5)))
    .filter((n) => Number.isFinite(n));
  // ⚠️ MÁXIMO + 1, não CONTAGEM + 1: com uma venda excluída no meio, contar
  // repete o número da última — e o índice único recusa a venda nova.
  const maior = doAno.length ? Math.max(...doAno) : 0;
  return `${ano}-${String(maior + 1).padStart(4, "0")}`;
}

/**
 * O lançamento rápido ("Novo depósito" → Venda) como venda da tela cheia —
 * para a demonstração, onde a casa da venda é o navegador.
 */
export function vendaDoLancamentoRapido(input: SaleDocInput, id: string, numero: string): Venda {
  const itens: ItemVenda[] = input.items.map((i) => ({
    produtoId: i.ref_id ?? "", nome: i.description ?? "",
    quantidade: num(i.qty), precoUnitario: num(i.unit_price),
  }));
  const bruto = input.items.reduce((s, i) => s + num(i.qty) * num(i.unit_price) - num(i.discount), 0);
  const total = Math.max(0, Math.round((bruto - num(input.discount)) * 100) / 100);
  const vencimento = input.due_date ?? input.doc_date;
  return {
    ...semDetalhe(),
    id, numero,
    clienteId: input.party_id ?? "", clienteNome: "",
    competencia: input.doc_date, vencimento,
    itens, valorTotal: total, valorTotalComJuros: total,
    contaId: input.account_id ?? "",
    status: input.settled ? "completa" : "iniciada",
    categoria: "Vendas",
    pago: input.settled, valorPago: input.settled ? total : 0,
    dataPagamento: input.settled ? input.doc_date : null,
    statusNF: "a_emitir", numeroNF: "",
    observacoes: input.notes ?? "",
    criadoEm: input.doc_date,
  };
}
