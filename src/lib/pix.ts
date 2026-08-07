/**
 * PIX "copia e cola" (BR Code / EMV) — geração REAL do payload com a chave do
 * recebedor, valor, txid e CRC16-CCITT. Um BR Code estático é válido por si, sem
 * PSP: por isso o PIX é emissão de verdade (≠ boleto/NFS-e, que dependem de
 * provedor). A chave/nome/cidade vêm do perfil da empresa (a4p_company):
 * chave = CNPJ (tipo de chave PIX válido), nome = fantasia/razão social.
 */
import { loadCompany } from "@/lib/company";

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

export interface DadosPix { chave: string; nome: string; cidade: string }

/** Dados do recebedor a partir do perfil da empresa (chave PIX = CNPJ). */
export function dadosPixEmpresa(): DadosPix | null {
  const db = (loadCompany()?.db ?? {}) as Record<string, string>;
  const chave = String(db.cnpj ?? "").replace(/\D/g, "");
  if (chave.length < 11) return null; // sem CNPJ/CPF não há chave
  return {
    chave,
    nome: String(db.fantasia || db.razaoSocial || "Recebedor"),
    cidade: String(db.cidade || "BRASIL"),
  };
}
