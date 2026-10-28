/**
 * O CLIENTE DA FOCUS NFe (provedor de NFS-e). SERVER-ONLY — importado só pelas
 * rotas `/api/nfse/*`.
 *
 *   FOCUS_NFE_AMBIENTE          = homologacao | producao   (padrão: homologacao)
 *   FOCUS_NFE_TOKEN_HOMOLOGACAO = o token de homologação da conta da Quattro
 *   FOCUS_NFE_TOKEN_PRODUCAO    = o token de produção da conta da Quattro
 *   FOCUS_NFE_EMITENTES         = JSON { "<org_id>": { cnpj, inscricaoMunicipal,
 *                                 codigoMunicipio, optanteSimples, regimeEspecial?,
 *                                 itemListaServico?, codigoTributarioMunicipio?,
 *                                 aliquota?, padrao?: "nacional",
 *                                 codigoTributacaoNacional?, codigoNbs?, serieDps? } }
 *
 * ⚠️ O ambiente escolhe a BASE e o TOKEN juntos, nunca uma URL livre: com o
 * token de produção apontado para a homologação (ou o contrário) a Focus
 * recusa, mas com uma URL configurável alguém poderia mandar o token a outro
 * endereço. ⚠️ Padrão homologação: esquecer a variável nunca emite nota de
 * verdade.
 *
 * ⚠️ O token nunca sai daqui: nem na resposta da rota, nem no log.
 */
import { BASE_FOCUS, caminhoDaRef, lerEmitentes, type AmbienteFocus, type EmitenteFocus, type PedidoFocus, type PedidoNacional } from "@/core/nfse/focus";

export function ambienteFocus(): AmbienteFocus {
  return process.env.FOCUS_NFE_AMBIENTE?.trim() === "producao" ? "producao" : "homologacao";
}

function token(amb: AmbienteFocus): string | null {
  const t = (amb === "producao" ? process.env.FOCUS_NFE_TOKEN_PRODUCAO : process.env.FOCUS_NFE_TOKEN_HOMOLOGACAO)?.trim();
  return t ? t : null;
}

/** A emissão real está ligada: há token para o ambiente escolhido. */
export const focusConfigurada = (): boolean => !!token(ambienteFocus());

/** O emitente que a PLATAFORMA vinculou à organização (nunca o que a empresa digita). */
export function emitenteDaOrg(orgId: string): EmitenteFocus | null {
  const { emitentes, problemas } = lerEmitentes(process.env.FOCUS_NFE_EMITENTES);
  if (problemas.length) console.warn("[focusnfe] configuração dos emitentes:", problemas.join(" | "));
  return emitentes[orgId] ?? null;
}

export interface RespostaFocus { http: number; corpo: unknown }

async function chamar(metodo: "GET" | "POST" | "DELETE", caminho: string, corpo?: unknown): Promise<RespostaFocus> {
  const amb = ambienteFocus();
  const t = token(amb);
  if (!t) return { http: 503, corpo: { mensagem: "Emissão de notas não configurada." } };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const r = await fetch(`${BASE_FOCUS[amb]}${caminho}`, {
      method: metodo,
      headers: {
        Authorization: `Basic ${Buffer.from(`${t}:`).toString("base64")}`,
        ...(corpo !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
      cache: "no-store",
      signal: ctrl.signal,
    });
    const texto = await r.text();
    let json: unknown = null;
    try { json = texto ? JSON.parse(texto) : null; } catch { json = { mensagem: texto.slice(0, 300) }; }
    return { http: r.status, corpo: json };
  } catch (e) {
    // ⚠️ Falha de rede no ENVIO é ambígua: o pedido pode ter chegado. A rota
    // trata como "processando" e a consulta pela mesma referência resolve —
    // reenviar com outra referência poderia emitir a nota duas vezes.
    return { http: 0, corpo: { mensagem: e instanceof Error ? e.message : "falha de rede" } };
  } finally {
    clearTimeout(timer);
  }
}

export const baseFocus = (): string => BASE_FOCUS[ambienteFocus()];

// O endereço (prefeitura × nacional) sai da REFERÊNCIA, nunca de um parâmetro
// solto: consulta e cancelamento vão sempre aonde a nota foi emitida.
export const emitirNaFocus = (ref: string, pedido: PedidoFocus | PedidoNacional) =>
  chamar("POST", `${caminhoDaRef(ref)}?ref=${encodeURIComponent(ref)}`, pedido);

export const consultarNaFocus = (ref: string) =>
  chamar("GET", `${caminhoDaRef(ref)}/${encodeURIComponent(ref)}`);

export const cancelarNaFocus = (ref: string, justificativa: string) =>
  chamar("DELETE", `${caminhoDaRef(ref)}/${encodeURIComponent(ref)}`, { justificativa });
