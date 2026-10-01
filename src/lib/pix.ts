/**
 * PIX "copia e cola" (BR Code / EMV) — geração REAL do payload com a chave do
 * recebedor, valor, txid e CRC16-CCITT. Um BR Code estático é válido por si, sem
 * PSP: por isso o PIX é emissão de verdade (≠ boleto/NFS-e, que dependem de
 * provedor). A chave/nome/cidade vêm do perfil da empresa (a4p_company):
 * chave = CNPJ (tipo de chave PIX válido), nome = fantasia/razão social.
 */
import { loadCompany } from "@/lib/company";

export { gerarPixCopiaECola, type PixParams } from "@/core/pix";

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
