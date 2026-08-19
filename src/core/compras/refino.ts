/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O DOCUMENTO REFINADO — o que é CALCULADO vence o que foi ADIVINHADO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **O fio que estava solto (medido).** O OCR já capturava a linha digitável
 * do boleto (`extrairCampos` → `linhaDigitavel`) e a entregava à tela como uma
 * STRING. Ao lado, `lerBoleto` sabia extrair dela o valor, o vencimento e o
 * banco — com todos os dígitos verificadores conferidos — e não era chamado de
 * lugar nenhum do fluxo de upload. O mesmo com `lerChaveNFe` e o CNPJ do
 * emitente. Dois parsers exatos parados enquanto o produto adivinhava por regex.
 *
 * ⚠️ **E a confiança era UMA só para o documento inteiro** (`DocFields.confianca`).
 * Isso é a média de coisas que não se misturam: o valor lido do código de
 * barras é CERTO (é aritmética com DV), e o nome do beneficiário lido por OCR é
 * um palpite. Uma confiança única obriga a tela a tratar os dois igual — ou
 * desconfia do que é certo, ou confia no que é palpite.
 *
 * Puro e tipado: quem lê arquivo é `lib/ocr-*`; aqui só se decide.
 */
import { lerBoleto } from "./boleto";
import { lerChaveNFe } from "./nfe";
import { cnpjValido } from "@/core/cnae";

/** De onde o campo veio — e é isso que justifica a confiança dele. */
export type Procedencia = "codigo_de_barras" | "chave_de_acesso" | "ocr" | "ausente";

export type CampoRefinado<T> = {
  valor: T | null;
  /** 1 = calculado com dígito verificador. < 1 = leitura ótica. */
  confianca: number;
  procedencia: Procedencia;
};

export type Divergencia = {
  campo: string;
  ocr: string;
  documento: string;
  /** A frase que a tela mostra. O documento vence, e diz por quê. */
  explicacao: string;
};

export type DocumentoRefinado = {
  valor: CampoRefinado<number>;
  vencimento: CampoRefinado<string>;
  cnpj: CampoRefinado<string>;
  banco: CampoRefinado<string>;
  divergencias: Divergencia[];
  /**
   * ⚠️ A confiança do CONJUNTO é a do campo MAIS FRACO entre os que importam,
   * não a média. Uma média deixa um campo ruim escondido atrás de três bons —
   * e é o campo ruim que vira lançamento errado.
   */
  confiancaGeral: number;
  /** Documentos exatos reconhecidos, para a tela dizer o que leu. */
  reconhecido: { boleto: boolean; nfe: boolean };
};

const soDigitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
const ausente = <T,>(): CampoRefinado<T> => ({ valor: null, confianca: 0, procedencia: "ausente" });
const doOcr = <T,>(v: T | null, c: number): CampoRefinado<T> =>
  v === null || v === undefined ? ausente<T>() : { valor: v, confianca: c, procedencia: "ocr" };

/** Entrada mínima — o que o OCR devolve. Não depende de `DocFields` de propósito. */
export type EntradaRefino = {
  valor?: number | null;
  vencimento?: string | null;
  cnpj?: string | null;
  linhaDigitavel?: string | null;
  chaveNFe?: string | null;
  confianca?: number;
};

export function refinarDocumento(e: EntradaRefino, hojeISO?: string): DocumentoRefinado {
  const confOcr = typeof e.confianca === "number" ? e.confianca : 0.7;

  let valor = doOcr<number>(e.valor ?? null, confOcr);
  let vencimento = doOcr<string>(e.vencimento ?? null, confOcr);
  let cnpj = doOcr<string>(e.cnpj ? soDigitos(e.cnpj) : null, confOcr);
  let banco = ausente<string>();
  const divergencias: Divergencia[] = [];

  // ── BOLETO ────────────────────────────────────────────────────────────────
  const boleto = e.linhaDigitavel ? lerBoleto(e.linhaDigitavel, hojeISO) : null;
  // ⚠️ **DV que não confere NÃO é usado.** Um dígito lido errado pelo OCR
  // produz uma linha digitável PLAUSÍVEL, e dela sai um valor plausível e
  // errado. Sem esta condição, o refino trocaria um palpite honesto por um
  // número falso com confiança 1 — o pior resultado possível.
  const boletoUtil = boleto && boleto.valido;
  if (boletoUtil && boleto) {
    if (boleto.valor > 0) {
      if (valor.valor !== null && Math.abs(valor.valor - boleto.valor) > 0.005) {
        divergencias.push({
          campo: "valor",
          ocr: String(valor.valor),
          documento: String(boleto.valor),
          explicacao: "O valor veio do código de barras, que confere os dígitos verificadores. A leitura ótica discordava.",
        });
      }
      valor = { valor: boleto.valor, confianca: 1, procedencia: "codigo_de_barras" };
    }
    if (boleto.vencimento) {
      if (vencimento.valor && vencimento.valor !== boleto.vencimento) {
        divergencias.push({
          campo: "vencimento",
          ocr: vencimento.valor,
          documento: boleto.vencimento,
          explicacao: "O vencimento veio do fator do código de barras, não do texto impresso.",
        });
      }
      vencimento = { valor: boleto.vencimento, confianca: 1, procedencia: "codigo_de_barras" };
    }
    if (boleto.banco) banco = { valor: boleto.bancoNome ?? boleto.banco, confianca: 1, procedencia: "codigo_de_barras" };
  }

  // ── NF-e ──────────────────────────────────────────────────────────────────
  const chave = e.chaveNFe ? lerChaveNFe(e.chaveNFe) : null;
  if (chave && chave.valido) {
    const doDoc = soDigitos(chave.cnpj);
    // ⚠️ O CNPJ da chave também passa pelo DÍGITO VERIFICADOR antes de virar
    // vínculo: a chave pode estar bem formada e carregar um CNPJ que não
    // existe, e ligar a contraparte errada é pior que não ligar nenhuma.
    if (doDoc.length === 14 && cnpjValido(doDoc)) {
      if (cnpj.valor && cnpj.valor !== doDoc) {
        divergencias.push({
          campo: "cnpj",
          ocr: cnpj.valor,
          documento: doDoc,
          explicacao: "O CNPJ veio da chave de acesso da nota, que tem dígito verificador.",
        });
      }
      cnpj = { valor: doDoc, confianca: 1, procedencia: "chave_de_acesso" };
    }
  }

  // ⚠️ CNPJ de OCR que NÃO passa no dígito verificador perde a confiança em vez
  // de ser descartado: ele ainda ajuda quem confere na tela, mas não pode
  // amarrar contraparte sozinho.
  if (cnpj.procedencia === "ocr" && cnpj.valor && !cnpjValido(cnpj.valor)) {
    cnpj = { valor: cnpj.valor, confianca: 0, procedencia: "ocr" };
  }

  const relevantes = [valor, vencimento].filter((c) => c.valor !== null);
  const confiancaGeral = relevantes.length === 0 ? 0 : Math.min(...relevantes.map((c) => c.confianca));

  return {
    valor, vencimento, cnpj, banco, divergencias, confiancaGeral,
    reconhecido: { boleto: !!boletoUtil, nfe: !!(chave && chave.valido) },
  };
}

/**
 * O CNPJ pode amarrar contraparte?
 *
 * ⚠️ Só com dígito verificador conferido. Um CNPJ lido errado casa com o
 * cadastro de OUTRA empresa, e o lançamento nasce no fornecedor errado — um
 * defeito que ninguém percebe até o fechamento.
 */
export function podeVincularContraparte(d: DocumentoRefinado): boolean {
  return !!d.cnpj.valor && d.cnpj.confianca > 0 && cnpjValido(d.cnpj.valor);
}
