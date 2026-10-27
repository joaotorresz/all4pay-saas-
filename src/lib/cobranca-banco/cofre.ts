import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * O COFRE DA CREDENCIAL BANCÁRIA. SERVER-ONLY.
 *
 * AES-256-GCM com a chave-mestra em `COBRANCA_CHAVE_MESTRA` (32 bytes em
 * base64; gerar com `openssl rand -base64 32`). O texto guardado é
 * `v1.<iv>.<tag>.<cifra>`, cada parte em base64 — o formato que a migration
 * `20261028120000` aceita na coluna, e nenhum outro.
 *
 * ⚠️ **O dado adicional é o ID DA CONEXÃO.** O texto cifrado de uma empresa
 * copiado para a linha de outra não abre: a etiqueta do GCM não confere.
 *
 * ⚠️ **Sem a chave-mestra, nada se cifra nem se decifra** — e o erro diz o
 * NOME da variável, nunca um pedaço de chave. Trocar a chave-mestra deixa as
 * conexões antigas ilegíveis: elas precisam ser conectadas de novo (o `v1`
 * existe para uma rotação futura conviver com a antiga).
 */

export interface SegredoBancario {
  clientSecret: string;
  certificado: string;
  chave: string;
}

export class ErroCofre extends Error {}

function chaveMestra(env: Record<string, string | undefined>): Buffer {
  const bruta = (env.COBRANCA_CHAVE_MESTRA ?? "").trim();
  const k = bruta ? Buffer.from(bruta, "base64") : Buffer.alloc(0);
  if (k.length !== 32) throw new ErroCofre("COBRANCA_CHAVE_MESTRA ausente ou sem 32 bytes em base64.");
  return k;
}

export function cofreDisponivel(env: Record<string, string | undefined> = process.env): boolean {
  try {
    chaveMestra(env);
    return true;
  } catch {
    return false;
  }
}

export function cifrarSegredo(s: SegredoBancario, conexaoId: string, env: Record<string, string | undefined> = process.env): string {
  const k = chaveMestra(env);
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", k, iv);
  c.setAAD(Buffer.from(conexaoId, "utf8"));
  const cifra = Buffer.concat([c.update(JSON.stringify(s), "utf8"), c.final()]);
  return `v1.${iv.toString("base64")}.${c.getAuthTag().toString("base64")}.${cifra.toString("base64")}`;
}

export function decifrarSegredo(texto: string, conexaoId: string, env: Record<string, string | undefined> = process.env): SegredoBancario {
  const k = chaveMestra(env);
  const partes = texto.split(".");
  if (partes.length !== 4 || partes[0] !== "v1") throw new ErroCofre("Segredo em formato desconhecido.");
  const [, iv, tag, cifra] = partes.map((p) => Buffer.from(p, "base64"));
  let claro: string;
  try {
    const d = createDecipheriv("aes-256-gcm", k, iv);
    d.setAAD(Buffer.from(conexaoId, "utf8"));
    d.setAuthTag(tag);
    claro = Buffer.concat([d.update(cifra), d.final()]).toString("utf8");
  } catch {
    // Etiqueta que não confere: outra chave-mestra, outra conexão ou texto adulterado.
    throw new ErroCofre("O segredo guardado não abre com esta chave e esta conexão.");
  }
  const v = JSON.parse(claro) as Partial<SegredoBancario>;
  if (typeof v.clientSecret !== "string" || typeof v.certificado !== "string" || typeof v.chave !== "string") {
    throw new ErroCofre("Segredo guardado incompleto.");
  }
  return { clientSecret: v.clientSecret, certificado: v.certificado, chave: v.chave };
}
