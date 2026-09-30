/**
 * PIX "copia e cola" (BR Code / EMV) — o GERADOR, puro.
 *
 * Mora em `core/` (sem `window`, sem cadastro) porque dois caminhos o usam: a
 * tela (`lib/pix`, que lê o recebedor do perfil da empresa no navegador) e o
 * runner de automações no servidor (a régua de cobrança põe o copia e cola na
 * mensagem). Uma cópia em cada lado divergiria no primeiro ajuste do CRC — e
 * um BR Code com CRC errado é um código que nenhum banco lê.
 */
function tlv(id: string, value: string): string {
  return `${id}${value.length.toString().padStart(2, "0")}${value}`;
}

/** CRC16-CCITT (0x1021, init 0xFFFF) — exigido no campo 63 do BR Code. */
function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

const san = (s: string, max: number) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9 ]/g, "").trim().toUpperCase().slice(0, max);

export interface PixParams { chave: string; valor?: number; nome: string; cidade: string; txid?: string }

/** Monta o payload "copia e cola" (EMV) do PIX. */
export function gerarPixCopiaECola(p: PixParams): string {
  const nome = san(p.nome, 25) || "RECEBEDOR";
  const cidade = san(p.cidade, 15) || "BRASIL";
  const txid = san(p.txid ?? "***", 25) || "***";
  const mai = tlv("00", "br.gov.bcb.pix") + tlv("01", p.chave); // GUI + chave
  let payload =
    tlv("00", "01") +                                            // payload format
    tlv("26", mai) +                                             // merchant account info (PIX)
    tlv("52", "0000") +                                          // MCC
    tlv("53", "986") +                                           // moeda BRL
    (p.valor && p.valor > 0 ? tlv("54", p.valor.toFixed(2)) : "") +
    tlv("58", "BR") +
    tlv("59", nome) +
    tlv("60", cidade) +
    tlv("62", tlv("05", txid));                                  // additional data (txid)
  payload += "6304";                                             // CRC: id 63 + len 04
  return payload + crc16(payload);
}

