/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ESTOQUE › ENTRADA PELA NF-e DE COMPRA (etapa 2, 05/11/2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Lê o XML da NF-e (modelo 55) que o fornecedor mandou e transforma cada item
 * numa ENTRADA de estoque, depois da conferência da pessoa.
 *
 * ⚠️ **A nota é a fonte; a entrada é o movimento.** Cada item vira uma linha
 * em `estoque_movimentos` com a chave da nota e o número do item. O banco
 * recusa a mesma chave + item duas vezes (índice único): importar o mesmo XML
 * de novo não dobra o estoque.
 *
 * ⚠️ **O custo é o de aquisição**, o que a empresa do Simples de fato paga:
 * (valor dos produtos − desconto + frete + seguro + outras despesas + IPI +
 * ICMS-ST) ÷ quantidade. Quem é do Simples não aproveita crédito de ICMS, então
 * o imposto pago na compra entra no custo. Crédito de imposto (regime normal)
 * é assunto da etapa 5, com o motor fiscal.
 *
 * ⚠️ **Unidade do fornecedor × unidade do estoque.** O fornecedor vende em
 * caixa (CX) e a loja conta em unidade (UN). O fator converte: 2 CX × 12 =
 * 24 UN, e o custo da unidade é o custo da caixa ÷ 12.
 *
 * Puro: sem DOM (o teste roda em Node), sem banco, sem relógio. O XML é lido
 * por etiqueta, porque o leiaute da NF-e é fixo e os campos que usamos são
 * folhas de texto, sem atributos (exceto o `Id` de `infNFe`).
 */
import { lerChaveNFe } from "@/core/compras/nfe";
import type { NovoMovimento } from "./index";

export interface ItemNFe {
  /** nItem, de 1 em diante. É o que distingue as linhas da mesma nota. */
  item: number;
  /** cProd: o código DO FORNECEDOR. */
  codigo: string;
  ean: string | null;
  descricao: string;
  ncm: string | null;
  unidade: string;
  quantidade: number;
  valorUnitario: number;
  valorProdutos: number;
  /** Custo de aquisição por unidade do fornecedor (ver o cabeçalho). */
  custoUnitario: number;
}

export interface NotaCompra {
  chave: string;
  numero: string;
  serie: string;
  /** YYYY-MM-DD, o dia da emissão no fuso da nota. */
  emissao: string;
  fornecedor: { cnpj: string; nome: string };
  /** Quem a nota diz que comprou: a tela mostra, para a pessoa conferir. */
  destinatario: { documento: string | null; nome: string };
  valorTotal: number;
  itens: ItemNFe[];
}

export type LeituraNFe = { ok: true; nota: NotaCompra } | { ok: false; motivo: string };

/* ─────────────────────────────── leitura ─────────────────────────────── */

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const texto = (s: string) => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const cod = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(cod) ? String.fromCodePoint(cod) : m;
    }
    return ENTIDADES[e.toLowerCase()] ?? m;
  })
  .trim();

/** O conteúdo da primeira etiqueta `nome` dentro de `xml` (com ou sem prefixo de namespace). */
function tag(xml: string, nome: string): string | null {
  const m = new RegExp(`<(?:\\w+:)?${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${nome}>`).exec(xml);
  return m ? m[1] : null;
}
const folha = (xml: string, nome: string): string | null => {
  const t = tag(xml, nome);
  return t === null ? null : texto(t);
};
const numero = (xml: string, nome: string): number => {
  const t = folha(xml, nome);
  const v = t === null || t === "" ? 0 : Number(t);
  return Number.isFinite(v) ? v : NaN;
};
const r2 = (v: number) => Math.round(v * 100) / 100;
const r4 = (v: number) => Math.round(v * 10000) / 10000;

/** Todos os blocos `<det nItem="…">` da nota, com o número do item. */
function blocosDet(xml: string): { item: number; corpo: string }[] {
  const out: { item: number; corpo: string }[] = [];
  const re = /<(?:\w+:)?det\s[^>]*nItem\s*=\s*["'](\d+)["'][^>]*>([\s\S]*?)<\/(?:\w+:)?det>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push({ item: Number(m[1]), corpo: m[2] });
  return out;
}

/** O IPI e o ICMS-ST do item entram no custo (ver o cabeçalho). */
function impostosNoCusto(det: string): number {
  const imposto = tag(det, "imposto") ?? "";
  const ipi = tag(imposto, "IPI");
  const vIPI = ipi ? numero(tag(ipi, "IPITrib") ?? "", "vIPI") : 0;
  const icms = tag(imposto, "ICMS") ?? "";
  const vST = numero(icms, "vICMSST");
  return (Number.isFinite(vIPI) ? vIPI : 0) + (Number.isFinite(vST) ? vST : 0);
}

const EAN_VAZIO = /^(SEM GTIN|0*)$/i;

export function lerNFe(xml: string): LeituraNFe {
  const bruto = (xml ?? "").trim();
  if (!bruto.startsWith("<")) return { ok: false, motivo: "O arquivo não é um XML. Escolha o arquivo .xml da nota, não o PDF do DANFE." };
  const inf = /<(?:\w+:)?infNFe\s[^>]*Id\s*=\s*["']NFe(\d{44})["'][^>]*>([\s\S]*?)<\/(?:\w+:)?infNFe>/.exec(bruto);
  if (!inf) {
    if (/<(?:\w+:)?(CompNfse|Nfse|InfNfse)\b/i.test(bruto)) return { ok: false, motivo: "Esta é uma nota de serviço (NFS-e): ela não traz produto para o estoque." };
    if (/<(?:\w+:)?(procEventoNFe|evento)\b/.test(bruto)) return { ok: false, motivo: "Este XML é um evento da nota (cancelamento ou carta de correção), não a nota." };
    return { ok: false, motivo: "Não encontrei uma NF-e neste XML." };
  }
  const chave = inf[1];
  const corpo = inf[2];
  const leitura = lerChaveNFe(chave);
  if (!leitura?.valido) return { ok: false, motivo: "A chave de acesso da nota não confere (dígito verificador)." };

  const ide = tag(corpo, "ide") ?? "";
  const mod = folha(ide, "mod");
  if (mod !== "55") {
    return { ok: false, motivo: mod === "65" ? "Esta é uma NFC-e (cupom de venda ao consumidor), não uma nota de compra." : "Só a NF-e de produto (modelo 55) dá entrada no estoque." };
  }

  const emit = tag(corpo, "emit") ?? "";
  const dest = tag(corpo, "dest") ?? "";
  const dh = folha(ide, "dhEmi") ?? folha(ide, "dEmi") ?? "";
  const emissao = /^\d{4}-\d{2}-\d{2}/.exec(dh)?.[0] ?? "";
  if (!emissao) return { ok: false, motivo: "A nota não tem data de emissão." };

  const itens: ItemNFe[] = [];
  for (const { item, corpo: det } of blocosDet(corpo)) {
    const prod = tag(det, "prod") ?? "";
    const quantidade = numero(prod, "qCom");
    const valorProdutos = numero(prod, "vProd");
    if (!(quantidade > 0) || !Number.isFinite(valorProdutos)) {
      return { ok: false, motivo: `O item ${item} da nota não tem quantidade ou valor legível.` };
    }
    const acrescimos = numero(prod, "vFrete") + numero(prod, "vSeg") + numero(prod, "vOutro") - numero(prod, "vDesc");
    const custoTotal = valorProdutos + (Number.isFinite(acrescimos) ? acrescimos : 0) + impostosNoCusto(det);
    const ean = folha(prod, "cEAN") ?? "";
    itens.push({
      item,
      codigo: folha(prod, "cProd") ?? "",
      ean: ean && !EAN_VAZIO.test(ean) ? ean : null,
      descricao: folha(prod, "xProd") ?? "",
      ncm: folha(prod, "NCM") || null,
      unidade: (folha(prod, "uCom") ?? "").toUpperCase(),
      quantidade,
      valorUnitario: numero(prod, "vUnCom"),
      valorProdutos: r2(valorProdutos),
      custoUnitario: r4(Math.max(0, custoTotal) / quantidade),
    });
  }
  if (!itens.length) return { ok: false, motivo: "A nota não tem itens." };

  const total = tag(corpo, "ICMSTot") ?? "";
  return {
    ok: true,
    nota: {
      chave,
      numero: String(Number(folha(ide, "nNF") ?? leitura.numero)),
      serie: String(Number(folha(ide, "serie") ?? leitura.serie)),
      emissao,
      fornecedor: { cnpj: folha(emit, "CNPJ") ?? folha(emit, "CPF") ?? leitura.cnpj, nome: folha(emit, "xNome") ?? "" },
      destinatario: { documento: folha(dest, "CNPJ") ?? folha(dest, "CPF"), nome: folha(dest, "xNome") ?? "" },
      valorTotal: r2(numero(total, "vNF")),
      itens: itens.sort((a, b) => a.item - b.item),
    },
  };
}

/* ─────────────────────────────── conferência ─────────────────────────────── */

const soDigitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

/** O vínculo lembrado: este código, deste fornecedor, é este produto. */
export interface VinculoFornecedor {
  fornecedorCnpj: string;
  codigo: string;
  produtoId: string;
  /** O fator que a pessoa usou (a caixa de 12 continua sendo de 12). */
  fator: number;
}

export interface ProdutoParaVinculo {
  produtoId: string;
  sku: string | null;
}

export type ComoAchou = "vinculo" | "sku" | "ean";

/**
 * O produto sugerido para o item, nesta ordem: o vínculo que a pessoa já
 * confirmou numa nota anterior deste fornecedor; o SKU igual ao código do
 * fornecedor; o SKU igual ao código de barras. Sem nada disso, a pessoa
 * escolhe (nunca por nome parecido: "Caneta azul" e "Caneta azul 0,7" são
 * produtos diferentes, e errar o produto erra o estoque dos dois).
 */
export function sugerirProduto(
  item: ItemNFe, fornecedorCnpj: string, vinculos: readonly VinculoFornecedor[], produtos: readonly ProdutoParaVinculo[],
): { produtoId: string; como: ComoAchou; fator: number } | null {
  const cnpj = soDigitos(fornecedorCnpj);
  const existe = new Set(produtos.map((p) => p.produtoId));
  const v = vinculos.find((x) => soDigitos(x.fornecedorCnpj) === cnpj && x.codigo === item.codigo && existe.has(x.produtoId));
  if (v) return { produtoId: v.produtoId, como: "vinculo", fator: v.fator > 0 ? v.fator : 1 };
  const norm = (s: string | null) => (s ?? "").trim().toUpperCase();
  const porSku = item.codigo ? produtos.find((p) => norm(p.sku) === norm(item.codigo)) : undefined;
  if (porSku) return { produtoId: porSku.produtoId, como: "sku", fator: 1 };
  const porEan = item.ean ? produtos.find((p) => norm(p.sku) === norm(item.ean)) : undefined;
  if (porEan) return { produtoId: porEan.produtoId, como: "ean", fator: 1 };
  return null;
}

/** O que a pessoa decidiu para cada item na conferência. */
export interface EscolhaItem {
  item: number;
  /** Vazio = este item não entra no estoque (ex.: material de uso, frete). */
  produtoId: string | null;
  /** Quantas unidades do estoque cabem numa unidade do fornecedor. */
  fator: number;
}

export interface MovimentoDaNota extends NovoMovimento {
  nfeChave: string;
  nfeItem: number;
  fornecedorCnpj: string;
}

export type ErroEntrada = "nenhum_item" | "fator" | "item_desconhecido";

export function errosDaEntrada(nota: NotaCompra, escolhas: readonly EscolhaItem[]): ErroEntrada[] {
  const erros = new Set<ErroEntrada>();
  const itens = new Set(nota.itens.map((i) => i.item));
  const usadas = escolhas.filter((e) => e.produtoId);
  if (!usadas.length) erros.add("nenhum_item");
  for (const e of usadas) {
    if (!itens.has(e.item)) erros.add("item_desconhecido");
    if (!(Number.isFinite(e.fator) && e.fator > 0)) erros.add("fator");
  }
  return Array.from(erros);
}

/**
 * Os movimentos que a confirmação grava: um por item escolhido, na unidade do
 * estoque (quantidade × fator; custo ÷ fator), com a chave e o item da nota.
 */
export function movimentosDaNota(nota: NotaCompra, escolhas: readonly EscolhaItem[]): MovimentoDaNota[] {
  const porItem = new Map(nota.itens.map((i) => [i.item, i]));
  const quem = nota.fornecedor.nome ? ` · ${nota.fornecedor.nome}` : "";
  return escolhas.flatMap((e) => {
    const it = porItem.get(e.item);
    if (!it || !e.produtoId || !(e.fator > 0)) return [];
    return [{
      produtoId: e.produtoId,
      tipo: "entrada" as const,
      quantidade: Math.round(it.quantidade * e.fator * 1000) / 1000,
      custoUnitario: r4(it.custoUnitario / e.fator),
      data: nota.emissao,
      motivo: `Compra · NF-e ${nota.numero}${quem}`.slice(0, 200),
      nfeChave: nota.chave,
      nfeItem: it.item,
      fornecedorCnpj: soDigitos(nota.fornecedor.cnpj),
    }];
  });
}

/** Os vínculos que a confirmação lembra para a próxima nota deste fornecedor. */
export function vinculosDaEntrada(nota: NotaCompra, escolhas: readonly EscolhaItem[]): VinculoFornecedor[] {
  const porItem = new Map(nota.itens.map((i) => [i.item, i]));
  const vistos = new Map<string, VinculoFornecedor>();
  for (const e of escolhas) {
    const it = porItem.get(e.item);
    if (!it || !e.produtoId || !it.codigo || !(e.fator > 0)) continue;
    vistos.set(it.codigo, { fornecedorCnpj: soDigitos(nota.fornecedor.cnpj), codigo: it.codigo, produtoId: e.produtoId, fator: e.fator });
  }
  return Array.from(vistos.values());
}
