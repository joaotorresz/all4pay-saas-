import {
  caminhoBuscaPorSeuNumero,
  codigoDaBuscaInter,
  corpoCancelamentoInter,
  corpoTokenInter,
  lerConsultaInter,
  lerCriacaoInter,
  lerTokenInter,
  motivoDaRecusaInter,
  pedidoCobrancaInter,
  type AmbienteInter,
} from "@/core/cobranca-banco/inter";
import { problemasDoPedido, type PedidoCobrancaBanco, type ResultadoCobrancaBanco } from "@/core/cobranca-banco";
import { ErroPortaInter, requisicaoInter, type CredencialMtls, type RespostaInter } from "@/lib/cobranca-banco/inter-saida";

/**
 * O CLIENTE DA API DE COBRANÇA DO INTER. SERVER-ONLY.
 *
 * Por ora a credencial vem das variáveis (uma conta só, a do PILOTO):
 *
 *   INTER_AMBIENTE        = sandbox | producao   (escolhe a base; nunca uma URL livre)
 *   INTER_CLIENT_ID       = o Client ID da integração (Internet Banking › APIs)
 *   INTER_CLIENT_SECRET   = o Client Secret — SEGREDO
 *   INTER_CERTIFICADO     = o .crt da integração (PEM, ou o PEM em base64)
 *   INTER_CHAVE_PRIVADA   = o .key da integração — SEGREDO
 *   INTER_CONTA_CORRENTE  = opcional: o número da conta, quando a credencial vê mais de uma
 *
 * A etapa seguinte (`docs/rodada-11/cobranca-bancos.md`) guarda isso por
 * EMPRESA, cifrado, e o cliente passa a receber a credencial em vez de ler
 * a variável. As funções já recebem a `ConfigInter` por parâmetro para isso.
 *
 * Toda chamada sai pela porta única (`requisicaoInter`). O `transporte` é
 * trocável só para a guarda (`npm run inter-cobranca`).
 */

export interface ConfigInter {
  ambiente: AmbienteInter;
  clientId: string;
  clientSecret: string;
  mtls: CredencialMtls;
  contaCorrente: string | null;
}

export type TransporteInter = typeof requisicaoInter;

/** O PEM como a Vercel o guarda: inteiro, com `\n` escapado, ou em base64. */
export function lerPem(v: string | undefined, tipo: "CERTIFICATE" | "PRIVATE KEY"): string | null {
  if (!v || !v.trim()) return null;
  let s = v.trim();
  if (!s.includes("-----BEGIN")) s = Buffer.from(s, "base64").toString("utf8").trim();
  s = s.replace(/\\n/g, "\n");
  const ok = tipo === "CERTIFICATE" ? /-----BEGIN CERTIFICATE-----/.test(s) : /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/.test(s);
  return ok ? s : null;
}

/**
 * A configuração das variáveis, ou a lista do que FALTA (pelo NOME da
 * variável, nunca pelo valor).
 */
export function configInterDoAmbiente(env: Record<string, string | undefined> = process.env): { config: ConfigInter } | { faltam: string[] } {
  const faltam: string[] = [];
  const amb = (env.INTER_AMBIENTE ?? "").trim();
  if (amb !== "sandbox" && amb !== "producao") faltam.push("INTER_AMBIENTE (sandbox ou producao)");
  const clientId = (env.INTER_CLIENT_ID ?? "").trim();
  if (!clientId) faltam.push("INTER_CLIENT_ID");
  const clientSecret = (env.INTER_CLIENT_SECRET ?? "").trim();
  if (!clientSecret) faltam.push("INTER_CLIENT_SECRET");
  const certificado = lerPem(env.INTER_CERTIFICADO, "CERTIFICATE");
  if (!certificado) faltam.push("INTER_CERTIFICADO (PEM do .crt)");
  const chave = lerPem(env.INTER_CHAVE_PRIVADA, "PRIVATE KEY");
  if (!chave) faltam.push("INTER_CHAVE_PRIVADA (PEM do .key)");
  if (faltam.length) return { faltam };
  const conta = (env.INTER_CONTA_CORRENTE ?? "").replace(/\D/g, "");
  return {
    config: {
      ambiente: amb as AmbienteInter,
      clientId,
      clientSecret,
      mtls: { certificado: certificado!, chave: chave! },
      contaCorrente: conta || null,
    },
  };
}

/** Token por credencial, renovado 60 s antes de vencer. */
const tokens = new Map<string, { token: string; ate: number }>();

export function esquecerTokensInter() {
  tokens.clear();
}

async function token(cfg: ConfigInter, transporte: TransporteInter, novo = false): Promise<string> {
  const chave = `${cfg.ambiente}:${cfg.clientId}`;
  const guardado = tokens.get(chave);
  if (!novo && guardado && guardado.ate > Date.now()) return guardado.token;
  // ⚠️ Qualquer falha do TOKEN é "antes do envio" para a cobrança: o pedido
  // de dinheiro ainda não saiu, então tentar de novo não duplica nada.
  let t: { token: string; expiraEmSegundos: number };
  try {
    const r = await transporte({
      ambiente: cfg.ambiente,
      metodo: "POST",
      caminho: "/oauth/v2/token",
      mtls: cfg.mtls,
      cabecalhos: { "content-type": "application/x-www-form-urlencoded" },
      corpo: corpoTokenInter(cfg.clientId, cfg.clientSecret),
    });
    if (r.status !== 200) throw new Error(`O Inter recusou a credencial (${r.status}). Confira o Client ID, o Secret e o certificado.`);
    t = lerTokenInter(r.corpo);
  } catch (e) {
    throw new ErroPortaInter(e instanceof Error ? e.message : "Falha ao gerar o token do Inter.", "antes_do_envio");
  }
  tokens.set(chave, { token: t.token, ate: Date.now() + Math.max(0, t.expiraEmSegundos - 60) * 1000 });
  return t.token;
}

/**
 * Uma chamada com o token. ⚠️ 401 com o token do cache pede um token novo e
 * repete UMA vez: o 401 é RESPOSTA, então o pedido não criou nada.
 */
async function chamar(
  cfg: ConfigInter,
  transporte: TransporteInter,
  metodo: "GET" | "POST",
  caminho: string,
  corpo?: unknown,
): Promise<RespostaInter> {
  const vai = async (novo: boolean) =>
    transporte({
      ambiente: cfg.ambiente,
      metodo,
      caminho,
      mtls: cfg.mtls,
      cabecalhos: {
        authorization: `Bearer ${await token(cfg, transporte, novo)}`,
        ...(corpo != null ? { "content-type": "application/json" } : {}),
        ...(cfg.contaCorrente ? { "x-conta-corrente": cfg.contaCorrente } : {}),
      },
      ...(corpo != null ? { corpo: JSON.stringify(corpo) } : {}),
    });
  const r = await vai(false);
  return r.status === 401 ? vai(true) : r;
}

/** Só prova que a credencial gera token (o teste do administrador). */
export async function testarCredencialInter(cfg: ConfigInter, transporte: TransporteInter = requisicaoInter): Promise<{ ok: true } | { ok: false; motivo: string }> {
  try {
    await token(cfg, transporte, true);
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : "Falha ao gerar o token." };
  }
}

/**
 * Emite o boleto com Pix. Não repete: o resultado diz o que se pode fazer
 * em seguida (ver o topo de `core/cobranca-banco`).
 */
export async function emitirCobrancaInter(
  cfg: ConfigInter,
  pedido: PedidoCobrancaBanco,
  transporte: TransporteInter = requisicaoInter,
): Promise<ResultadoCobrancaBanco> {
  const problemas = problemasDoPedido(pedido);
  if (problemas.length) return { situacao: "falhou", motivo: problemas.join(" ") };
  try {
    const r = await chamar(cfg, transporte, "POST", "/cobranca/v3/cobrancas", pedidoCobrancaInter(pedido));
    return lerCriacaoInter(r.status, r.corpo);
  } catch (e) {
    if (e instanceof ErroPortaInter && e.fase === "antes_do_envio") return { situacao: "falhou", motivo: e.message };
    // Saiu e não voltou: pode ter criado.
    return { situacao: "incerta", motivo: e instanceof Error ? e.message : "O Inter não respondeu." };
  }
}

/** A situação de verdade, pelo código (inclusive depois do aviso do webhook). */
export async function consultarCobrancaInter(cfg: ConfigInter, codigo: string, transporte: TransporteInter = requisicaoInter): Promise<ResultadoCobrancaBanco> {
  const caminho = `/cobranca/v3/cobrancas/${codigo.toLowerCase()}`;
  try {
    const r = await chamar(cfg, transporte, "GET", caminho);
    if (r.status === 404) return { situacao: "incerta", motivo: "O Inter não achou esta cobrança." };
    if (r.status !== 200) return { situacao: "incerta", motivo: motivoDaRecusaInter(r.status, r.corpo) };
    return lerConsultaInter(r.corpo);
  } catch (e) {
    return { situacao: "incerta", motivo: e instanceof Error ? e.message : "O Inter não respondeu." };
  }
}

/** Resolve a `incerta`: procura pelo NOSSO número. `null` = não achou (ou achou mais de uma). */
export async function acharCobrancaInter(
  cfg: ConfigInter,
  seuNumero: string,
  vencimento: string,
  transporte: TransporteInter = requisicaoInter,
): Promise<string | null> {
  const r = await chamar(cfg, transporte, "GET", caminhoBuscaPorSeuNumero(seuNumero, vencimento));
  if (r.status !== 200) throw new Error(motivoDaRecusaInter(r.status, r.corpo));
  return codigoDaBuscaInter(r.corpo, seuNumero);
}

/** Cancela (título alterado ou excluído depois de cobrado). */
export async function cancelarCobrancaInter(
  cfg: ConfigInter,
  codigo: string,
  motivo: string,
  transporte: TransporteInter = requisicaoInter,
): Promise<{ ok: true } | { ok: false; motivo: string }> {
  const r = await chamar(cfg, transporte, "POST", `/cobranca/v3/cobrancas/${codigo.toLowerCase()}/cancelar`, corpoCancelamentoInter(motivo));
  return r.status >= 200 && r.status < 300 ? { ok: true } : { ok: false, motivo: motivoDaRecusaInter(r.status, r.corpo) };
}
