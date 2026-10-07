import { createPublicKey, verify, type KeyObject } from "node:crypto";
import { buscarPinbank, URL_CHAVE_PUBLICA } from "@/lib/pinbank/saida";

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

/**
 * Não deu para obter as chaves AGORA — o webhook responde 503 (a Pinbank
 * reenvia), nunca 401 (que ela NÃO reenvia e perderia a venda).
 */
export class ChaveIndisponivel extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = "ChaveIndisponivel";
  }
}

let cache: { chaves: Map<string, KeyObject>; em: number } | null = null;
let ultimaTentativa = 0;
const VALIDADE_MS = 60 * 60 * 1000;
/** Busca falhou e o cache venceu: o vencido ainda serve até aqui (stale-if-error). */
const VALIDADE_NA_FALHA_MS = 24 * 60 * 60 * 1000;
const INTERVALO_MINIMO_MS = 5 * 60 * 1000;

/** Só para teste: volta ao estado de uma instância recém-criada. */
export function esquecerChaves(): void {
  cache = null;
  ultimaTentativa = 0;
}

/**
 * As chaves FIXAS em `PINBANK_WEBHOOK_JWKS` (a resposta do endpoint, ou um
 * JWKS), quando a variável existe.
 *
 * ⚠️ **Variável preenchida e ilegível é ERRO, não "nenhuma chave".** Antes ela
 * virava um mapa vazio e TODA entrega respondia 401 — que a Pinbank não
 * reenvia: as vendas se perdiam em silêncio por causa de um JSON colado
 * errado. Agora é `ChaveIndisponivel` (503): a Pinbank segura e reenvia
 * enquanto alguém conserta a variável.
 */
function chavesFixas(): Map<string, KeyObject> | null {
  const fixa = process.env.PINBANK_WEBHOOK_JWKS;
  if (!fixa) return null;
  let lido: unknown;
  try {
    lido = JSON.parse(fixa);
  } catch {
    throw new ChaveIndisponivel("PINBANK_WEBHOOK_JWKS não é JSON válido.");
  }
  const chaves = chavesDoJwks(lido);
  if (chaves.size === 0) throw new ChaveIndisponivel("PINBANK_WEBHOOK_JWKS sem nenhuma chave Ed25519 utilizável.");
  return chaves;
}

/** Só para teste: finge uma busca BEM-SUCEDIDA feita em `emMs`. */
export function lembrarChaves(chaves: Map<string, KeyObject>, emMs: number): void {
  cache = { chaves, em: emMs };
  ultimaTentativa = emMs;
}

function juntar(a: Map<string, KeyObject>, b: Map<string, KeyObject>): Map<string, KeyObject> {
  const juntas = new Map(a);
  b.forEach((chave, kid) => juntas.set(kid, chave));
  return juntas;
}

async function buscarChaves(): Promise<Map<string, KeyObject>> {
  const url = process.env.PINBANK_SIGNING_KEY_URL || URL_CHAVE_PUBLICA;
  let buscadas: Map<string, KeyObject>;
  try {
    // `publico`: com os dois servidores fora, a chave PÚBLICA ainda pode vir
    // direto (conferida pelo TLS) — ver PUBLICOS em saida.ts.
    const r = await buscarPinbank(url, { timeoutMs: 8000, publico: url === URL_CHAVE_PUBLICA });
    if (r.status !== 200) throw new Error(`signing-key respondeu ${r.status} (via ${r.via})`);
    buscadas = chavesDoJwks(JSON.parse(r.corpo));
  } catch (e) {
    throw new ChaveIndisponivel(`não foi possível buscar a chave pública: ${(e as Error).message}`);
  }
  if (buscadas.size === 0) throw new ChaveIndisponivel("signing-key sem chave Ed25519 utilizável");
  return buscadas;
}

/**
 * As chaves públicas. `PINBANK_WEBHOOK_JWKS` tem precedência — é o que a
 * documentação recomenda ("salve a resposta na sua aplicação") e o que deixa a
 * verificação de pé sem rede. Sem ela, busca no endpoint público PELA SAÍDA
 * FIXA (`buscarPinbank`) e guarda por uma hora. As chaves buscadas SOMAM-SE às
 * fixas: depois de uma rotação, a chave nova vale para as entregas seguintes
 * sem uma busca por entrega.
 *
 * ⚠️ **Busca que falha com cache VENCIDO usa o vencido (até 24 h)** — uma chave
 * Ed25519 não "estraga" em uma hora; a hora é só a cadência de aprender chave
 * nova. Sem isso, os servidores da saída fora por uma tarde = TODA entrega em
 * 503, inclusive as assinadas pela chave que já conhecíamos. E, enquanto a
 * falha for recente (5 min), nem tenta de novo: cada entrega pagaria o tempo
 * de esgotar a busca antes de usar a mesma chave.
 *
 * `forcar` é a ROTAÇÃO: um `kid` desconhecido pede uma busca nova — inclusive
 * com a JWKS fixa, que não conhece a chave que acabou de nascer. No máximo uma
 * a cada 5 min (senão uma enxurrada de `kid` falso vira uma enxurrada de
 * buscas); dentro do intervalo, ou se a busca falhar, é `ChaveIndisponivel` →
 * **503, e a Pinbank reenvia**. O 401 só acontece logo depois de uma busca
 * BEM-SUCEDIDA nesta mesma chamada que não trouxe o `kid` — é o único caso
 * conclusivo. (Comparar com a hora da assinatura dependeria do relógio da
 * Pinbank, que a janela de ±5 min já admite que difere do nosso.)
 */
export async function chavesPinbank(forcar = false): Promise<Map<string, KeyObject>> {
  const fixas = chavesFixas();
  const com = (m: Map<string, KeyObject>) => (fixas ? juntar(fixas, m) : m);
  const agora = Date.now();
  const fresco = !!cache && agora - cache.em < VALIDADE_MS;
  const servivel = !!cache && agora - cache.em < VALIDADE_NA_FALHA_MS;
  const tentouHaPouco = agora - ultimaTentativa < INTERVALO_MINIMO_MS;

  if (forcar) {
    if (tentouHaPouco) {
      throw new ChaveIndisponivel("chave desconhecida e a busca que a esclareceria não pode ser feita agora; reenvie.");
    }
  } else {
    if (fresco && cache) return com(cache.chaves);
    if (fixas) return servivel && cache ? juntar(fixas, cache.chaves) : fixas;
    if (servivel && cache && tentouHaPouco) return cache.chaves;
  }

  ultimaTentativa = agora;
  try {
    const buscadas = await buscarChaves();
    cache = { chaves: buscadas, em: agora };
    return com(buscadas);
  } catch (e) {
    if (!forcar && servivel && cache) {
      console.warn("[falha·pinbank] pinbank.chave_publica: usando a chave já conhecida (vencida há menos de 24 h):", (e as Error).message);
      return cache.chaves;
    }
    throw e;
  }
}
