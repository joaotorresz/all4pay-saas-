/**
 * O COFRE DOS DOCUMENTOS DO CADASTRO — as regras puras (`cadastro-documentos/1.0.0`).
 *
 * O arquivo sobe do navegador direto ao Storage (bucket privado
 * `cadastro-documentos`) e o banco o registra por `cadastro_documento_registrar`.
 * As duas pontas conferem o MESMO caminho: `<empresa>/<tipo>-<uuid>.<ext>`.
 * Se este formato mudar sem a migration, o banco recusa todo documento — e a
 * guarda do `engine-audit` prova que os dois lados concordam.
 */
export const VERSAO_DOCUMENTOS = "cadastro-documentos/1.0.0";
export const BUCKET_DOCUMENTOS = "cadastro-documentos";
export const TETO_BYTES_DOCUMENTO = 10 * 1024 * 1024;

export type TipoDocumento = "selfie" | "rg" | "cnh" | "contrato" | "comprovante";

const EXTENSOES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};

/** A extensão pelo FORMATO; formato fora da lista não sobe (o bucket o recusaria). */
export function extensaoDoDocumento(mime: string): string | null {
  return EXTENSOES[mime.toLowerCase()] ?? null;
}

/** O caminho no bucket, ou `null` quando o arquivo não pode subir. */
export function caminhoDoDocumento(org: string, tipo: TipoDocumento, id: string, mime: string, tamanho: number): string | null {
  const ext = extensaoDoDocumento(mime);
  if (!ext || !(tamanho > 0) || tamanho > TETO_BYTES_DOCUMENTO) return null;
  if (!/^[0-9a-f-]{36}$/.test(org) || !/^[0-9a-f-]{36}$/.test(id)) return null;
  return `${org}/${tipo}-${id}.${ext}`;
}

/** A MESMA regra de `cadastro_documento_registrar`, para a guarda comparar. */
export function caminhoAceitoPeloBanco(org: string, tipo: TipoDocumento, caminho: string): boolean {
  return new RegExp(`^${org}/${tipo}-[0-9a-f-]{36}\\.(jpg|png|webp|heic|pdf)$`).test(caminho);
}
