import { createPublicKey, verify, type KeyObject } from "node:crypto";

/**
 * A ASSINATURA Ed25519 do webhook da Pinbank — SERVER-ONLY.
 *
 * Toda entrega vem com `Webhook-Timestamp`, `Webhook-Signature` (`v1a,<base64>`)
 * e `Webhook-Key-Id` (o `kid`). O conteúdo assinado é `{timestamp}.{corpo}` com
 * o corpo BRUTO — reserializar o JSON muda a ordem e os espaços e invalida a
 * verificação, então a rota lê `req.text()` e só depois faz o parse.
 *
 * ⚠️ **A CHAVE É ESCOLHIDA PELO `kid`, nunca "a ativa".** Durante uma rotação, a
 * fila de retentativas da Pinbank ainda traz entregas assinadas pela chave
 * anterior; verificar só contra a ativa recusaria venda legítima — e a recusa é
 * 401, que a Pinbank NÃO reenvia.
 *
 * ⚠️ **±5 minutos** de frescura: fora da janela é reenvio capturado (replay), e a
 * assinatura válida não basta.
 */

export const JANELA_SEGUNDOS = 300;
export const URL_CHAVE_PADRAO = "https://pinbank.com.br/webhook/signing-key";

export interface ChaveJwk { kty?: string; crv?: string; kid?: string; x?: string }

export type Verificacao =
  | { ok: true; kid: string }
  | { ok: false; motivo: string; kidDesconhecido?: boolean };

/** As chaves públicas por `kid`, a partir da resposta do endpoint ou de um JWKS cru. */
export function chavesDoJwks(resposta: unknown): Map<string, KeyObject> {
  const r = (resposta ?? {}) as { jwks?: { keys?: ChaveJwk[] }; keys?: ChaveJwk[]; jwk?: ChaveJwk };
  const lista = [...(r.jwks?.keys ?? r.keys ?? []), ...(r.jwk ? [r.jwk] : [])];
  const mapa = new Map<string, KeyObject>();
  for (const k of lista) {
    if (k?.kty !== "OKP" || k.crv !== "Ed25519" || !k.kid || !k.x || mapa.has(k.kid)) continue;
    try {
      mapa.set(k.kid, createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: k.x }, format: "jwk" }));
    } catch {
      // Uma chave malformada não derruba as outras: ela só não verifica nada.
    }
  }
  return mapa;
}

export function verificarAssinatura(p: {
  corpo: string;
  timestamp: string | null;
  assinatura: string | null;
  kid: string | null;
  agoraSegundos: number;
  chaves: Map<string, KeyObject>;
}): Verificacao {
  if (!p.timestamp || !/^\d{9,11}$/.test(p.timestamp)) return { ok: false, motivo: "Webhook-Timestamp ausente ou inválido." };
  if (Math.abs(p.agoraSegundos - Number(p.timestamp)) > JANELA_SEGUNDOS) {
    return { ok: false, motivo: "Webhook-Timestamp fora da janela de 5 minutos (reenvio capturado?)." };
  }
  const partes = (p.assinatura ?? "").split(",");
  if (partes.length !== 2 || partes[0] !== "v1a" || !partes[1]) {
    return { ok: false, motivo: "Webhook-Signature sem o formato v1a,<base64>." };
  }
  if (!p.kid) return { ok: false, motivo: "Webhook-Key-Id ausente." };
  const chave = p.chaves.get(p.kid);
  if (!chave) return { ok: false, motivo: `Chave ${p.kid} desconhecida.`, kidDesconhecido: true };
  let assinatura: Buffer;
  try {
    assinatura = Buffer.from(partes[1], "base64");
  } catch {
    return { ok: false, motivo: "Assinatura não é base64." };
  }
  const conteudo = Buffer.from(`${p.timestamp}.${p.corpo}`, "utf8");
  let valida = false;
  try {
    valida = verify(null, conteudo, chave, assinatura);
  } catch {
    valida = false;
  }
  return valida ? { ok: true, kid: p.kid } : { ok: false, motivo: "Assinatura Ed25519 não confere." };
}

/* ─────────────────────────── o cache das chaves ─────────────────────────── */

let cache: { chaves: Map<string, KeyObject>; em: number } | null = null;
let ultimaBusca = 0;
const VALIDADE_MS = 60 * 60 * 1000;
const INTERVALO_MINIMO_MS = 5 * 60 * 1000;

/**
 * As chaves públicas. `PINBANK_WEBHOOK_JWKS` (a resposta do endpoint, ou um
 * JWKS) tem precedência — é o que a documentação recomenda ("salve a resposta
 * na sua aplicação") e o que deixa a verificação de pé se o endpoint cair.
 * Sem ele, busca no endpoint público e guarda por uma hora; um `kid`
 * desconhecido força UMA nova busca (rotação de chave), no máximo a cada 5 min
 * — senão uma enxurrada de assinaturas falsas viraria uma enxurrada de buscas.
 */
export async function chavesPinbank(forcar = false): Promise<Map<string, KeyObject>> {
  const fixa = process.env.PINBANK_WEBHOOK_JWKS;
  if (fixa) {
    try {
      return chavesDoJwks(JSON.parse(fixa));
    } catch {
      return new Map();
    }
  }
  const agora = Date.now();
  if (cache && !forcar && agora - cache.em < VALIDADE_MS) return cache.chaves;
  if (cache && forcar && agora - ultimaBusca < INTERVALO_MINIMO_MS) return cache.chaves;
  ultimaBusca = agora;
  const url = process.env.PINBANK_SIGNING_KEY_URL || URL_CHAVE_PADRAO;
  const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`signing-key respondeu ${r.status}`);
  const chaves = chavesDoJwks(await r.json());
  if (chaves.size === 0) throw new Error("signing-key sem chave Ed25519 utilizável");
  cache = { chaves, em: agora };
  return chaves;
}
