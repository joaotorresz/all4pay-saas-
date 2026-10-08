import { createCipheriv, createDecipheriv } from "node:crypto";

/**
 * A CRIPTOGRAFIA dos métodos `…Encrypted` da Pinbank. SERVER-ONLY.
 *
 * A doc ("4 - Consumindo uma API"): AES 128-CBC, chave = os bytes do `KeyValue`
 * da credencial, IV = `new byte[16]` (dezesseis zeros). O corpo vai como
 * `{"Data":{"Json":"<base64>"}}` e a resposta volta cifrada do mesmo jeito.
 * Preenchimento PKCS#7 (o padrão do .NET e do Node) e base64 — a doc não os
 * nomeia; o exemplo da doc é base64, e o teste em dev confirma o resto.
 *
 * ⚠️ IV FIXO EM ZERO É FRACO, e é o contrato da Pinbank, não escolha nossa:
 * dois pedidos iguais saem iguais. O que protege o canal é o TLS por baixo; a
 * cifra é a camada a mais que ela exige. Trocar o IV "para melhorar" quebraria
 * a conversa — a Pinbank não teria como abrir o pedido.
 *
 * ⚠️ O `KeyValue` é ao mesmo tempo a SENHA do token e a CHAVE desta cifra: quem
 * o tem autentica e decifra. Nenhuma mensagem de erro daqui o cita — só o
 * TAMANHO, que é o que se precisa para consertar.
 */

const IV_ZERO = Buffer.alloc(16, 0);

/** .NET escolhe AES-128/192/256 pelo tamanho da chave; a Pinbank diz 128 (16 bytes). */
function algoritmo(chave: Buffer): "aes-128-cbc" | "aes-192-cbc" | "aes-256-cbc" {
  if (chave.length === 16) return "aes-128-cbc";
  if (chave.length === 24) return "aes-192-cbc";
  if (chave.length === 32) return "aes-256-cbc";
  throw new Error(`A chave da credencial Pinbank tem ${chave.length} bytes; a criptografia AES pede 16.`);
}

const bytesDaChave = (keyValue: string) => Buffer.from(keyValue, "utf8");

export function cifrarPinbank(texto: string, keyValue: string): string {
  const chave = bytesDaChave(keyValue);
  const c = createCipheriv(algoritmo(chave), chave, IV_ZERO);
  return Buffer.concat([c.update(texto, "utf8"), c.final()]).toString("base64");
}

export function decifrarPinbank(base64: string, keyValue: string): string {
  const chave = bytesDaChave(keyValue);
  const dados = Buffer.from(base64, "base64");
  if (dados.length === 0 || dados.length % 16 !== 0) {
    throw new Error("A resposta cifrada da Pinbank não é um bloco AES válido (tamanho).");
  }
  const d = createDecipheriv(algoritmo(chave), chave, IV_ZERO);
  try {
    return Buffer.concat([d.update(dados), d.final()]).toString("utf8");
  } catch {
    // Preenchimento errado = chave errada (ou resposta adulterada). A mensagem
    // do OpenSSL ("bad decrypt") não diz isso a quem lê.
    throw new Error("Não foi possível abrir a resposta da Pinbank: a chave da credencial não confere.");
  }
}
