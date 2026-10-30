import { randomUUID } from "node:crypto";
import {
  caminhoConsultaItau,
  corpoBaixaItau,
  corpoTokenItau,
  idProvedorItau,
  lerConsultaItau,
  lerCriacaoItau,
  lerTokenItau,
  motivoDaRecusaItau,
  nossoNumeroValido,
  pedidoCobrancaItau,
  problemasDaContaItau,
  type AmbienteItau,
  type ContaItau,
} from "@/core/cobranca-banco/itau";
import { problemasDoPedido, type PedidoCobrancaBanco, type ResultadoCobrancaBanco } from "@/core/cobranca-banco";
import { lerPem } from "@/lib/cobranca-banco/inter-api";
import type { CredencialMtls } from "@/lib/cobranca-banco/inter-saida";
import { ErroPortaItau, requisicaoItau, type RespostaItau } from "@/lib/cobranca-banco/itau-saida";

/**
 * O CLIENTE DA API DE COBRANÇA DO ITAÚ. SERVER-ONLY. Etapa 3 de
 * `docs/rodada-11/cobranca-itau.md`.
 *
 * Por ora a credencial vem das variáveis (o teste no sandbox e o piloto):
 *
 *   ITAU_AMBIENTE        = sandbox | producao   (escolhe a base; nunca uma URL livre)
 *   ITAU_CLIENT_ID       = o Client ID da integração
 *   ITAU_CLIENT_SECRET   = o Client Secret — SEGREDO
 *   ITAU_CERTIFICADO     = o .crt da integração (PEM ou PEM em base64; obrigatório em produção)
 *   ITAU_CHAVE_PRIVADA   = o .key da integração — SEGREDO (obrigatório em produção)
 *   ITAU_AGENCIA, ITAU_CONTA, ITAU_DAC, ITAU_CARTEIRA, ITAU_CHAVE_PIX = a conta que recebe
 *
 * A etapa 4 guarda isso por EMPRESA, cifrado, pela mesma conexão do Inter; as
 * funções já recebem a `ConfigItau` por parâmetro para isso.
 *
 * Toda chamada sai pela porta única (`requisicaoItau`). O `transporte` é
 * trocável só para a guarda (`npm run itau-cobranca`).
 */

export interface ConfigItau {
  ambiente: AmbienteItau;
  clientId: string;
  clientSecret: string;
  mtls: CredencialMtls | null;
  conta: ContaItau;
}

export type TransporteItau = typeof requisicaoItau;

/** A configuração das variáveis, ou a lista do que FALTA (pelo NOME, nunca pelo valor). */
export function configItauDoAmbiente(env: Record<string, string | undefined> = process.env): { config: ConfigItau } | { faltam: string[] } {
  const faltam: string[] = [];
  const amb = (env.ITAU_AMBIENTE ?? "").trim();
  if (amb !== "sandbox" && amb !== "producao") faltam.push("ITAU_AMBIENTE (sandbox ou producao)");
  const clientId = (env.ITAU_CLIENT_ID ?? "").trim();
  if (!clientId) faltam.push("ITAU_CLIENT_ID");
  const clientSecret = (env.ITAU_CLIENT_SECRET ?? "").trim();
  if (!clientSecret) faltam.push("ITAU_CLIENT_SECRET");
  const certificado = lerPem(env.ITAU_CERTIFICADO, "CERTIFICATE");
  const chave = lerPem(env.ITAU_CHAVE_PRIVADA, "PRIVATE KEY");
  if (amb === "producao") {
    if (!certificado) faltam.push("ITAU_CERTIFICADO (PEM do .crt)");
    if (!chave) faltam.push("ITAU_CHAVE_PRIVADA (PEM do .key)");
  } else if (!!certificado !== !!chave) {
    faltam.push(certificado ? "ITAU_CHAVE_PRIVADA (o certificado veio sem a chave)" : "ITAU_CERTIFICADO (a chave veio sem o certificado)");
  }
  const conta: ContaItau = {
    agencia: (env.ITAU_AGENCIA ?? "").trim(),
    conta: (env.ITAU_CONTA ?? "").trim(),
    dac: (env.ITAU_DAC ?? "").trim(),
    carteira: (env.ITAU_CARTEIRA ?? "").trim(),
    chavePix: (env.ITAU_CHAVE_PIX ?? "").trim(),
  };
  for (const p of problemasDaContaItau(conta)) faltam.push(p);
  if (faltam.length) return { faltam };
  return {
    config: {
      ambiente: amb as AmbienteItau,
      clientId,
      clientSecret,
      mtls: certificado && chave ? { certificado, chave } : null,
      conta,
    },
  };
}

/** Token por credencial, renovado 60 s antes de vencer. */
const tokens = new Map<string, { token: string; ate: number }>();

export function esquecerTokensItau() {
  tokens.clear();
}

async function token(cfg: ConfigItau, transporte: TransporteItau, novo = false): Promise<string> {
  const chave = `${cfg.ambiente}:${cfg.clientId}`;
  const guardado = tokens.get(chave);
  if (!novo && guardado && guardado.ate > Date.now()) return guardado.token;
  // ⚠️ Falha do TOKEN é "antes do envio" para a cobrança: nada de dinheiro saiu.
  let t: { token: string; expiraEmSegundos: number };
  try {
    const r = await transporte({
      ambiente: cfg.ambiente,
      servidor: "token",
      metodo: "POST",
      caminho: "/api/oauth/token",
      mtls: cfg.mtls,
      cabecalhos: { "content-type": "application/x-www-form-urlencoded", "x-itau-correlationID": randomUUID() },
      corpo: corpoTokenItau(cfg.clientId, cfg.clientSecret),
    });
    if (r.status !== 200) throw new Error(`O Itaú recusou a credencial (${r.status}). Confira o Client ID, o Secret e o certificado.`);
    t = lerTokenItau(r.corpo);
  } catch (e) {
    throw new ErroPortaItau(e instanceof Error ? e.message : "Falha ao gerar o token do Itaú.", "antes_do_envio");
  }
  tokens.set(chave, { token: t.token, ate: Date.now() + Math.max(0, t.expiraEmSegundos - 60) * 1000 });
  return t.token;
}

/**
 * Uma chamada com o token. ⚠️ 401 com o token do cache pede um token novo e
 * repete UMA vez: o 401 é RESPOSTA, então o pedido não registrou nada.
 */
async function chamar(
  cfg: ConfigItau,
  transporte: TransporteItau,
  metodo: "GET" | "POST" | "PATCH",
  caminho: string,
  corpo?: unknown,
): Promise<RespostaItau> {
  const vai = async (novo: boolean) =>
    transporte({
      ambiente: cfg.ambiente,
      servidor: "api",
      metodo,
      caminho,
      mtls: cfg.mtls,
      cabecalhos: {
        authorization: `Bearer ${await token(cfg, transporte, novo)}`,
        "x-itau-apikey": cfg.clientId,
        "x-itau-correlationID": randomUUID(),
        "x-itau-flowID": "1",
        ...(corpo != null ? { "content-type": "application/json" } : {}),
      },
      ...(corpo != null ? { corpo: JSON.stringify(corpo) } : {}),
    });
  const r = await vai(false);
  return r.status === 401 ? vai(true) : r;
}

/** Só prova que a credencial gera token (o teste do administrador). */
export async function testarCredencialItau(cfg: ConfigItau, transporte: TransporteItau = requisicaoItau): Promise<{ ok: true } | { ok: false; motivo: string }> {
  try {
    await token(cfg, transporte, true);
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : "Falha ao gerar o token." };
  }
}

/**
 * Emite o boleto com Pix. Não repete. O `nossoNumero` vem de quem reserva
 * (etapa 4) — este cliente nunca inventa um.
 */
export async function emitirCobrancaItau(
  cfg: ConfigItau,
  pedido: PedidoCobrancaBanco,
  nossoNumero: string,
  hoje: string,
  transporte: TransporteItau = requisicaoItau,
): Promise<ResultadoCobrancaBanco> {
  const problemas = [...problemasDoPedido(pedido), ...problemasDaContaItau(cfg.conta)];
  if (!nossoNumeroValido(nossoNumero)) problemas.push("O nosso número do Itaú tem 8 dígitos.");
  if (problemas.length) return { situacao: "falhou", motivo: problemas.join(" ") };
  try {
    const r = await chamar(cfg, transporte, "POST", "/pix_recebimentos_conciliacoes/v2/boletos_pix", pedidoCobrancaItau(pedido, cfg.conta, nossoNumero, hoje));
    return lerCriacaoItau(r.status, r.corpo, cfg.conta, nossoNumero);
  } catch (e) {
    if (e instanceof ErroPortaItau && e.fase === "antes_do_envio") return { situacao: "falhou", motivo: e.message };
    // Saiu e não voltou: pode ter registrado.
    return { situacao: "incerta", motivo: e instanceof Error ? e.message : "O Itaú não respondeu." };
  }
}

/** A situação de verdade, pelo nosso número (resolve a `incerta` e confere o aviso). */
export async function consultarCobrancaItau(cfg: ConfigItau, nossoNumero: string, transporte: TransporteItau = requisicaoItau): Promise<ResultadoCobrancaBanco> {
  if (!nossoNumeroValido(nossoNumero)) return { situacao: "incerta", motivo: "Nosso número inválido." };
  try {
    const r = await chamar(cfg, transporte, "GET", caminhoConsultaItau(cfg.conta, nossoNumero));
    if (r.status === 404) return { situacao: "incerta", motivo: "O Itaú não achou este título." };
    if (r.status !== 200) return { situacao: "incerta", motivo: motivoDaRecusaItau(r.status, r.corpo) };
    return lerConsultaItau(r.corpo, cfg.conta, nossoNumero);
  } catch (e) {
    return { situacao: "incerta", motivo: e instanceof Error ? e.message : "O Itaú não respondeu." };
  }
}

/** Baixa (cancela) o título no Itaú — título alterado ou excluído depois de cobrado. */
export async function baixarCobrancaItau(
  cfg: ConfigItau,
  nossoNumero: string,
  transporte: TransporteItau = requisicaoItau,
): Promise<{ ok: true } | { ok: false; motivo: string }> {
  if (!nossoNumeroValido(nossoNumero)) return { ok: false, motivo: "Nosso número inválido." };
  const r = await chamar(cfg, transporte, "PATCH", `/boletoscash/v2/boletos/${idProvedorItau(cfg.conta, nossoNumero)}/baixa`, corpoBaixaItau());
  return r.status >= 200 && r.status < 300 ? { ok: true } : { ok: false, motivo: motivoDaRecusaItau(r.status, r.corpo) };
}
