import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Valida o cabeçalho `X-Twilio-Signature` — SERVER-ONLY.
 *
 * O algoritmo da Twilio: HMAC-SHA1, com o Auth Token como chave, sobre a URL
 * pública completa seguida de cada parâmetro do POST em ordem alfabética de
 * chave, concatenado como `chave + valor`; o resultado em base64.
 *
 * ⚠️ A comparação é em tempo constante: comparar com `===` vaza, byte a byte,
 * quanto da assinatura estava certo.
 */
export function assinaturaTwilioValida(
  url: string,
  params: Record<string, string>,
  assinatura: string | null | undefined,
  authToken: string,
): boolean {
  if (!assinatura || !authToken) return false;
  const dados = Object.keys(params)
    .sort()
    .reduce((acc, k) => acc + k + params[k], url);
  const esperada = createHmac("sha1", authToken).update(Buffer.from(dados, "utf8")).digest("base64");
  const a = Buffer.from(esperada);
  const b = Buffer.from(assinatura);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
