/**
 * A CHAVE DE ACESSO SE EXPLICA SOZINHA.
 *
 * A captura de XML na SEFAZ exige certificado digital A1/A3. A chave de acesso,
 * não: os 44 dígitos impressos no DANFE dizem o estado do emitente, o mês de
 * emissão, o CNPJ de quem emitiu, o modelo (NF-e, NFC-e, CT-e), a série e o
 * número — e o último dígito prova que os outros 43 estão certos.
 *
 * É o que permite lançar uma nota recebida antes de existir integração: o
 * fornecedor manda a chave, o sistema lê o CNPJ e o resto vem do cadastro
 * (e do CNAE, que já classifica a despesa).
 *
 * Puro, sem dependência.
 */

const so = (s: string) => (s ?? "").replace(/\D/g, "");

export interface ChaveNFe {
  chave: string;
  /** Sigla da UF do emitente (SP, MG…) — null quando o código não existe. */
  uf: string | null;
  codigoUF: string;
  /** Competência da emissão, aaaa-mm. */
  emissao: string;
  cnpj: string;
  /** 55 NF-e · 65 NFC-e · 57 CT-e · 58 MDF-e · 67 CT-e OS. */
  modelo: string;
  modeloLabel: string;
  serie: string;
  numero: string;
  dv: number;
  valido: boolean;
}

const UFS: Record<string, string> = {
  "11": "RO", "12": "AC", "13": "AM", "14": "RR", "15": "PA", "16": "AP",
  "17": "TO", "21": "MA", "22": "PI", "23": "CE", "24": "RN", "25": "PB",
  "26": "PE", "27": "AL", "28": "SE", "29": "BA", "31": "MG", "32": "ES",
  "33": "RJ", "35": "SP", "41": "PR", "42": "SC", "43": "RS", "50": "MS",
  "51": "MT", "52": "GO", "53": "DF",
};

const MODELOS: Record<string, string> = {
  "55": "NF-e", "65": "NFC-e", "57": "CT-e", "58": "MDF-e", "67": "CT-e OS",
};

/**
 * DV da chave: módulo 11 com pesos 2..9 da direita para a esquerda sobre os 43
 * primeiros dígitos. Resto 0 ou 1 devolve 0 — a regra do manual, e a razão de
 * o dígito nunca ser 10.
 */
export function dvDaChave(base43: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = base43.length - 1; i >= 0; i--) {
    soma += Number(base43[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const dv = 11 - (soma % 11);
  return dv >= 10 ? 0 : dv;
}

export function lerChaveNFe(entrada: string): ChaveNFe | null {
  const c = so(entrada);
  if (c.length !== 44) return null;

  const codigoUF = c.slice(0, 2);
  const ano = Number(c.slice(2, 4));
  const mes = c.slice(4, 6);
  const modelo = c.slice(20, 22);

  return {
    chave: c,
    uf: UFS[codigoUF] ?? null,
    codigoUF,
    // O ano vem com dois dígitos. A NF-e começou em 2006, então "06" é 2006 e
    // não 1906 — somar 2000 sempre é correto dentro da vida do documento.
    emissao: `${2000 + ano}-${mes}`,
    cnpj: c.slice(6, 20),
    modelo,
    modeloLabel: MODELOS[modelo] ?? `Modelo ${modelo}`,
    serie: String(Number(c.slice(22, 25))),
    numero: String(Number(c.slice(25, 34))),
    dv: Number(c[43]),
    valido: dvDaChave(c.slice(0, 43)) === Number(c[43]),
  };
}

/** 0000.0000.0000.0000… — como o DANFE imprime, em blocos de quatro. */
export function formatarChave(chave: string): string {
  const c = so(chave);
  return c.length === 44 ? (c.match(/.{1,4}/g) ?? []).join(" ") : chave;
}
