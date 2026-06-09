/**
 * Integration Gateway — normaliza qualquer fonte financeira para
 * `FinancialTransaction` e gera o fingerprint financeiro.
 * Cada fonte chega diferente; aqui tudo vira o denominador comum.
 */
import type { FonteFinanceira, FinancialTransaction, ComprovanteExtraido } from "./types";
import { uid } from "./types";

/**
 * Fingerprint financeiro (cyrb53, síncrono). Não é SHA-256 criptográfico,
 * mas é estável e serve para dedup / matching / rastreabilidade.
 * Trocável por crypto.subtle (SHA-256) onde o async for aceitável.
 */
export function fingerprint(parts: (string | number | undefined)[]): string {
  const str = parts.map((p) => String(p ?? "")).join("|");
  let h1 = 0xdeadbeef ^ str.length;
  let h2 = 0x41c6ce57 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const n = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return n.toString(16).padStart(14, "0");
}

const toISO = (d: string | Date) =>
  (typeof d === "string" ? new Date(d) : d).toISOString().slice(0, 10);

/** Normaliza um payload bruto de uma fonte para FinancialTransaction. */
export function normalizar(
  origem: FonteFinanceira,
  raw: Record<string, unknown>,
): FinancialTransaction {
  const g = (...keys: string[]) => {
    for (const k of keys) if (raw[k] != null) return raw[k];
    return undefined;
  };

  // valor pode vir negativo (OFX) ou como total (NF) etc.
  const rawValor = Number(g("valor", "amount", "total", "value") ?? 0);
  const valor = Math.abs(rawValor);
  const tipo: "entrada" | "saida" =
    (g("tipo") as string) === "entrada" || (g("tipo") as string) === "saida"
      ? (g("tipo") as "entrada" | "saida")
      : rawValor < 0
        ? "saida"
        : "entrada";
  const data = toISO((g("data", "date", "dataHora", "dt") as string) ?? new Date());
  const contraparte = limparContraparte(
    String(g("contraparte", "descricao", "memo", "fornecedor", "destinatario", "name") ?? ""),
  );
  const documento = g("documento", "doc", "autenticacao", "nsu", "nf") as string | undefined;
  const categoria = g("categoria", "category") as string | undefined;

  return {
    id: uid("tx"),
    valor,
    data,
    contraparte: contraparte || undefined,
    documento,
    tipo,
    categoria,
    origem,
    hashFinanceiro: fingerprint([valor, data, contraparte, documento]),
    metadata: raw,
  };
}

/** Remove ruído comum dos descritivos bancários para comparar contraparte. */
export function limparContraparte(s: string): string {
  return s
    .toUpperCase()
    .replace(/\b(PIX|TED|DOC|TRANSF(ERENCIA)?|PAGAMENTO|PGTO|RECEB(IMENTO)?|LTDA|ME|EPP|SA|S\/A)\b/g, "")
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * OCR de comprovante — stub determinístico. Recebe um payload já estruturado
 * (como um serviço de OCR devolveria) e o tipa. Plugar a um OCR real
 * (Textract/Vision/Claude vision) mantém a mesma saída.
 */
export function extrairComprovante(raw: Record<string, unknown>): ComprovanteExtraido {
  return {
    banco: String(raw.banco ?? raw.bank ?? "—"),
    valor: Math.abs(Number(raw.valor ?? raw.amount ?? 0)),
    dataHora: String(raw.dataHora ?? raw.data ?? new Date().toISOString()),
    destinatario: String(raw.destinatario ?? raw.contraparte ?? "—"),
    autenticacao: raw.autenticacao ? String(raw.autenticacao) : undefined,
  };
}
