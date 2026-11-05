/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ESTOQUE — a leitura do saldo e a regra do movimento (etapa 1, 04/11/2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **O saldo é uma conta do BANCO** (view `estoque_saldos`, migration
 * 20261104190000): inicial + entradas − saídas − vendido. Este módulo NÃO
 * refaz essa soma: ele recebe a linha pronta e decide o que a tela mostra
 * (situação, valor em estoque). Uma segunda soma aqui seria a segunda fonte do
 * mesmo número.
 *
 * ⚠️ **A venda não gera movimento.** A quantidade vendida mora em `sale_items`
 * e o banco lê de lá: editar, cancelar ou mandar a venda para a lixeira já
 * devolve o estoque sem estorno a lembrar.
 *
 * ⚠️ **Zero é um valor.** Sem custo nenhum (nem no cadastro, nem nas
 * entradas), o custo médio volta vazio e o valor em estoque é
 * `indisponivel` com o motivo, nunca R$ 0,00.
 *
 * Puro, tipado, demo-safe, sem I/O. Versão `estoque/1.0.0`.
 */
export const VERSAO_ESTOQUE = "estoque/1.0.0";

/** A linha de `estoque_saldos` como ela volta do banco (numeric vem texto). */
export interface LinhaSaldoBanco {
  product_id: string;
  name: string;
  sku: string | null;
  unidade: string | null;
  inicial: number | string;
  entradas: number | string;
  saidas: number | string;
  vendido: number | string;
  saldo: number | string;
  minimo: number | string | null;
  custo_medio: number | string | null;
}

export interface SaldoProduto {
  produtoId: string;
  nome: string;
  sku: string | null;
  unidade: string | null;
  inicial: number;
  entradas: number;
  saidas: number;
  vendido: number;
  saldo: number;
  minimo: number | null;
  custoMedio: number | null;
}

const n = (x: unknown): number => {
  const v = Number(x);
  return Number.isFinite(v) ? v : 0;
};
const ouNulo = (x: unknown): number | null => (x === null || x === undefined || x === "" ? null : n(x));

export function saldoDaLinha(l: LinhaSaldoBanco): SaldoProduto {
  return {
    produtoId: l.product_id,
    nome: l.name,
    sku: l.sku,
    unidade: l.unidade,
    inicial: n(l.inicial),
    entradas: n(l.entradas),
    saidas: n(l.saidas),
    vendido: n(l.vendido),
    saldo: n(l.saldo),
    minimo: ouNulo(l.minimo),
    custoMedio: ouNulo(l.custo_medio),
  };
}

/* ─────────────────────────────── situação ─────────────────────────────── */

export type SituacaoEstoque = "negativo" | "sem_estoque" | "abaixo_minimo" | "ok";

/**
 * ⚠️ Negativo existe: a venda não espera o estoque (quem vende sem ter
 * lançado a entrada vende do mesmo jeito). A tela mostra, em vez de esconder.
 * No mínimo exato ainda está ok; o aviso é ABAIXO dele.
 */
export function situacaoEstoque(s: Pick<SaldoProduto, "saldo" | "minimo">): SituacaoEstoque {
  if (s.saldo < 0) return "negativo";
  if (s.saldo === 0) return "sem_estoque";
  if (s.minimo !== null && s.saldo < s.minimo) return "abaixo_minimo";
  return "ok";
}

export const ROTULO_SITUACAO: Record<SituacaoEstoque, string> = {
  negativo: "Saldo negativo",
  sem_estoque: "Sem estoque",
  abaixo_minimo: "Abaixo do mínimo",
  ok: "Em estoque",
};

/** Precisa de ação (falta ou abaixo do mínimo). */
export const pedeReposicao = (s: SituacaoEstoque): boolean => s !== "ok";

/* ─────────────────────────────── valor ─────────────────────────────── */

export type ValorEstoque =
  | { tipo: "valor"; valor: number }
  | { tipo: "indisponivel"; codigo: "sem_custo" | "saldo_negativo"; motivo: string };

export function valorEmEstoque(s: Pick<SaldoProduto, "saldo" | "custoMedio">): ValorEstoque {
  if (s.custoMedio === null) {
    return { tipo: "indisponivel", codigo: "sem_custo", motivo: "Sem custo: informe o preço de custo no cadastro ou o custo na entrada." };
  }
  if (s.saldo < 0) {
    return { tipo: "indisponivel", codigo: "saldo_negativo", motivo: "Saldo negativo: lance a entrada que falta." };
  }
  return { tipo: "valor", valor: Math.round(s.saldo * s.custoMedio * 100) / 100 };
}

/* ─────────────────────────────── movimento ─────────────────────────────── */

export type TipoMovimento = "entrada" | "saida";

/** Os motivos oferecidos na tela. "Outro" pede o texto. */
export const MOTIVOS_ENTRADA = ["Compra", "Devolução de cliente", "Ajuste de inventário", "Outro"] as const;
export const MOTIVOS_SAIDA = ["Perda ou avaria", "Uso interno", "Devolução ao fornecedor", "Ajuste de inventário", "Outro"] as const;

export interface NovoMovimento {
  produtoId: string;
  tipo: TipoMovimento;
  quantidade: number;
  /** Só na entrada. */
  custoUnitario: number | null;
  data: string;
  motivo: string;
}

export type ErroMovimento = "produto" | "quantidade" | "custo" | "data" | "motivo";

/**
 * A mesma regra que o banco recusa (restrições de `estoque_movimentos`),
 * conferida antes para a tela apontar o campo. O banco continua sendo quem
 * decide: esta função só evita a ida e volta.
 */
export function errosDoMovimento(m: NovoMovimento): ErroMovimento[] {
  const erros: ErroMovimento[] = [];
  if (!m.produtoId) erros.push("produto");
  if (!(Number.isFinite(m.quantidade) && m.quantidade > 0)) erros.push("quantidade");
  if (m.custoUnitario !== null && (m.tipo === "saida" || !(Number.isFinite(m.custoUnitario) && m.custoUnitario >= 0))) erros.push("custo");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(m.data)) erros.push("data");
  if (!m.motivo.trim()) erros.push("motivo");
  return erros;
}

/** A linha que vai para `estoque_movimentos` (custo só na entrada). */
export function linhaDoMovimento(m: NovoMovimento) {
  return {
    product_id: m.produtoId,
    tipo: m.tipo,
    quantidade: m.quantidade,
    custo_unitario: m.tipo === "entrada" ? m.custoUnitario : null,
    data: m.data,
    motivo: m.motivo.trim(),
  };
}

/**
 * O que a pessoa digitou no campo de quantidade. Com vírgula, a vírgula é a
 * casa decimal e o ponto é milhar ("1.250,5"); sem vírgula, o ponto é decimal
 * ("1.5"), porque é assim que o teclado numérico do celular escreve.
 */
export function lerQuantidade(texto: string): number {
  const t = texto.trim().replace(/\s/g, "");
  if (!t) return NaN;
  const normal = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  return /^\d+(\.\d+)?$/.test(normal) ? Number(normal) : NaN;
}

/** Quantidade com até 3 casas, sem zeros à toa ("12", "1,5"). */
export function formatarQuantidade(q: number): string {
  return q.toLocaleString("pt-BR", { maximumFractionDigits: 3 }).replace("-", "−");
}
