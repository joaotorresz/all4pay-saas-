/**
 * EXTRATO LIDO PELA IA — a resposta do modelo vira o MESMO texto tabulado que
 * o resto da importação já lê (puro, sem I/O).
 *
 * O caminho: PDF escaneado (ou de layout que a reconstrução não entende) →
 * cada página vira imagem → `/api/inbox/extrato` pede ao Claude as linhas →
 * AQUI elas são conferidas e viram CSV → `analisarImportacao`, como um OFX.
 *
 * ⚠️ A resposta da IA é DADO DE FORA. Nada dela entra sem passar por aqui:
 * data que não é data, valor que não é número, linha de saldo, descrição
 * vazia — tudo cai, e é CONTADO, para a tela dizer quanto ficou de fora. Um
 * valor inventado vira lançamento no DRE; uma linha descartada calada vira um
 * mês que não fecha com o banco.
 *
 * ⚠️ Não há caminho próprio de classificação: a IA só TRANSCREVE (data,
 * descrição, valor, MCC). Quem categoriza continua sendo o FDIP, com memória,
 * CNPJ/CNAE, MCC e regras — senão a mesma compra teria uma categoria vinda do
 * PDF e outra vinda do OFX.
 */
import { csvDeLinhas } from "./index";

export const VERSAO_EXTRATO_IA = "extrato-ia/1.0.0";

/** Teto de páginas lidas por arquivo: cada página é uma chamada ao modelo. */
export const TETO_PAGINAS_IA = 30;

export type TipoPaginaIA = "extrato" | "fatura" | "documento";

export interface LinhaIA {
  data: string; // ISO
  descricao: string;
  /** Com sinal: negativo é saída (débito, compra no cartão). */
  valor: number;
  mcc: string | null;
}

export interface PaginaIA {
  tipo: TipoPaginaIA;
  linhas: LinhaIA[];
  /** Linhas que vieram e foram recusadas (formato inválido, saldo). */
  recusadas: number;
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
/** Linha de saldo não é lançamento — e o modelo às vezes a transcreve. */
const SALDO = /^\s*(saldo|sdo\.?|total\b|subtotal)/i;

function dataValida(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const m = ISO.exec(s.trim());
  if (!m) return null;
  const [, a, me, d] = m.map(Number) as unknown as [number, number, number, number];
  if (a < 2000 || a > 2100 || me < 1 || me > 12 || d < 1) return null;
  const ultimo = new Date(Date.UTC(a, me, 0)).getUTCDate();
  return d <= ultimo ? s.trim() : null;
}

function valorValido(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/\s/g, "")) : NaN;
  if (!Number.isFinite(n) || n === 0 || Math.abs(n) >= 1e9) return null;
  return Math.round(n * 100) / 100;
}

/**
 * Confere a resposta CRUA do modelo para uma página. Aceita a linha como
 * lista (`[data, descrição, valor, mcc]`, o formato pedido, que gasta menos
 * saída) ou como objeto (`{data, descricao, valor, mcc}`).
 */
export function normalizarPaginaIA(cru: unknown): PaginaIA {
  const o = (cru && typeof cru === "object" ? cru : {}) as Record<string, unknown>;
  const tipo: TipoPaginaIA = o.tipo === "extrato" || o.tipo === "fatura" ? o.tipo : "documento";
  const brutas = Array.isArray(o.linhas) ? o.linhas : [];
  const linhas: LinhaIA[] = [];
  let recusadas = 0;
  for (const b of brutas) {
    const [d, desc, v, mcc] = Array.isArray(b)
      ? b
      : b && typeof b === "object"
        ? [(b as Record<string, unknown>).data, (b as Record<string, unknown>).descricao, (b as Record<string, unknown>).valor, (b as Record<string, unknown>).mcc]
        : [];
    const data = dataValida(d);
    const valor = valorValido(v);
    const descricao = typeof desc === "string" ? desc.replace(/\s+/g, " ").trim().slice(0, 200) : "";
    if (!data || valor == null || !descricao || SALDO.test(descricao)) { recusadas++; continue; }
    const m = String(mcc ?? "").replace(/\D/g, "");
    linhas.push({ data, descricao, valor, mcc: m.length >= 3 && m.length <= 4 ? m.padStart(4, "0") : null });
  }
  return { tipo, linhas, recusadas };
}

/**
 * Junta as páginas num texto que `analisarImportacao` lê. O valor sai em
 * pt-BR com sinal ("-1234,56"), como num extrato de banco, e a coluna MCC só
 * existe quando alguma linha a tem.
 */
export function csvDasPaginas(paginas: PaginaIA[]): string {
  const linhas = paginas.flatMap((p) => p.linhas);
  if (!linhas.length) return "";
  const comMcc = linhas.some((l) => l.mcc);
  const fmt = (v: number) => v.toFixed(2).replace(".", ",");
  const cab = comMcc ? ["Data", "Descrição", "Valor", "MCC"] : ["Data", "Descrição", "Valor"];
  return csvDeLinhas([
    cab,
    ...linhas.map((l) => {
      const base = [l.data, l.descricao, fmt(l.valor)];
      return comMcc ? [...base, l.mcc ?? ""] : base;
    }),
  ]);
}
