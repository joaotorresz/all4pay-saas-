/**
 * PIX "copia e cola" (BR Code / EMV) — geração REAL do payload com a chave do
 * recebedor, valor, txid e CRC16-CCITT. Um BR Code estático é válido por si, sem
 * PSP: por isso o PIX é emissão de verdade (≠ boleto/NFS-e, que dependem de
 * provedor). A chave/nome/cidade vêm do perfil da empresa (a4p_company):
 * chave = CNPJ (tipo de chave PIX válido), nome = fantasia/razão social.
 */
import { loadCompany, type StoredCompany } from "@/lib/company";
import { identidadeDoCadastro } from "@/core/administracao";

export { gerarPixCopiaECola, type PixParams } from "@/core/pix";

export interface DadosPix { chave: string; nome: string; cidade: string }

/**
 * Dados do recebedor a partir do cadastro (chave PIX = CNPJ ou CPF).
 *
 * ⚠️ Lia só `db.cnpj`: o cadastro de pessoa física guarda o documento em `cpf`,
 * e a pessoa física ficava SEM PIX ("sem chave") com o CPF preenchido. O
 * documento sai da leitura canônica do cadastro (`identidadeDoCadastro`), a
 * mesma das telas de Administração e do arquivo do contador.
 */
export function dadosPixDoCadastro(c: StoredCompany | null): DadosPix | null {
  const db = (c?.db ?? {}) as Record<string, unknown>;
  const id = identidadeDoCadastro(db);
  const chave = id.documento.replace(/\D/g, "");
  if (chave.length < 11) return null; // sem CNPJ/CPF não há chave
  const cidade = typeof db.cidade === "string" && db.cidade.trim() ? db.cidade : "BRASIL";
  return {
    chave,
    nome: id.nomeFantasia || id.razaoSocial || c?.pessoal?.nome || "Recebedor",
    cidade,
  };
}

/** Dados do recebedor do cadastro da empresa aberta. */
export function dadosPixEmpresa(): DadosPix | null {
  return dadosPixDoCadastro(loadCompany());
}
