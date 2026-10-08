import { BASES_API_PINBANK, ErroSaida, requisicaoPinbank, type ProxySaida, type RespostaPinbank } from "@/lib/pinbank/saida";
import { cifrarPinbank, decifrarPinbank } from "@/lib/pinbank/cifra";
import {
  lerRespostaExtratoPos,
  pedidoExtratoPos,
  problemasDoFiltroExtratoPos,
  resumirExtratoPos,
  type FiltroExtratoPos,
  type RespostaExtratoPos,
  type ResumoExtratoPos,
} from "@/core/pinbank/extrato-pos";

/**
 * O CLIENTE DA API DA PINBANK (token OAuth2 + métodos `…Encrypted`). SERVER-ONLY.
 *
 * Toda chamada sai pela porta única (`requisicaoPinbank`, pelos 2 IPs fixos);
 * nada aqui abre socket nem chama `fetch`.
 *
 *   PINBANK_API_AMBIENTE = dev | producao   (escolhe a base; nunca uma URL livre)
 *   PINBANK_API_USUARIO  = o UserName da credencial ("API Key" no e-mail)
 *   PINBANK_API_CHAVE    = o KeyValue ("Senha") — SEGREDO: senha do token E chave da cifra
 *   PINBANK_API_ORIGEM   = o RequestOrigin da credencial
 *   PINBANK_CODIGO_CANAL = o código do canal (ex.: 1919)
 *
 * ⚠️ **SÓ LEITURA.** A credencial emitida pela Pinbank também PAGA conta e
 * tributo, faz Pix e TED e transfere entre contas. Este cliente só sabe chamar
 * o que está em `METODOS_LEITURA` — acrescentar um método que move dinheiro é
 * decisão do dono, com fluxo de aprovação, nunca uma linha a mais aqui (há
 * guarda com teto ZERO).
 *
 * ⚠️ **O token vencido antes da hora é renovado UMA vez.** A Pinbank avisa que o
 * prazo do token "pode mudar sem aviso". Um 401 com o token do cache pede um
 * token novo e repete o pedido UMA vez — seguro porque é LEITURA (repetir um
 * extrato não move nada) e porque o primeiro pedido terminou com resposta, não
 * no meio do caminho (`requisicaoPinbank` continua sem repetir pedido que saiu).
 * Com o token recém-gerado, 401 é recusa da credencial, e sobe como erro.
 */

export const VARIAVEIS_API_PINBANK = [
  "PINBANK_API_AMBIENTE",
  "PINBANK_API_USUARIO",
  "PINBANK_API_CHAVE",
  "PINBANK_API_ORIGEM",
  "PINBANK_CODIGO_CANAL",
] as const;

/** O que este cliente pode chamar: SÓ LEITURA. Nome do método → caminho, sem o "Encrypted". */
export const METODOS_LEITURA = {
  ExtratoPos: "ContaDigital/ExtratoPos",
} as const;
export type MetodoLeitura = keyof typeof METODOS_LEITURA;

export type AmbienteApi = keyof typeof BASES_API_PINBANK;

export interface CredencialPinbank {
  ambiente: AmbienteApi;
  /** Base sem barra no fim (ex.: https://dev.pinbank.com.br/services). */
  base: string;
  usuario: string;
  /** KeyValue. SEGREDO: não logar, não devolver. */
  chave: string;
  origem: string;
  canal: number;
}

export type EtapaApi = "configuracao" | "pedido" | "token" | "metodo" | "resposta";

export class ErroApiPinbank extends Error {
  readonly etapa: EtapaApi;
  readonly status?: number;
  constructor(etapa: EtapaApi, mensagem: string, status?: number) {
    super(mensagem);
    this.name = "ErroApiPinbank";
    this.etapa = etapa;
    this.status = status;
  }
}

type Ambiente = Record<string, string | undefined>;

/** Lê a credencial das variáveis. O erro nomeia as VARIÁVEIS, nunca os valores. */
export function lerCredencialPinbank(env: Ambiente = process.env): CredencialPinbank {
  const faltam = VARIAVEIS_API_PINBANK.filter((n) => !env[n]?.trim());
  if (faltam.length) {
    throw new ErroApiPinbank("configuracao", `Faltam na Vercel (Production): ${faltam.join(", ")}.`);
  }
  const ambiente = env.PINBANK_API_AMBIENTE!.trim();
  if (ambiente !== "dev" && ambiente !== "producao") {
    throw new ErroApiPinbank("configuracao", "PINBANK_API_AMBIENTE deve ser dev ou producao.");
  }
  const canal = Number(env.PINBANK_CODIGO_CANAL!.trim());
  if (!Number.isInteger(canal) || canal <= 0) {
    throw new ErroApiPinbank("configuracao", "PINBANK_CODIGO_CANAL deve ser um número inteiro (ex.: 1919).");
  }
  return {
    ambiente,
    base: BASES_API_PINBANK[ambiente],
    usuario: env.PINBANK_API_USUARIO!.trim(),
    chave: env.PINBANK_API_CHAVE!.trim(),
    origem: env.PINBANK_API_ORIGEM!.trim(),
    canal,
  };
}

export interface OpcoesApi {
  /** Padrão: lerCredencialPinbank(). */
  credencial?: CredencialPinbank;
  /** Padrão: as PINBANK_SAIDA_<n> (a porta decide). */
  proxies?: ProxySaida[];
  /** Só para teste: a CA da "Pinbank" local. */
  caDestino?: string | Buffer;
  /** Relógio (ms), para o prazo do token. Padrão: Date.now. */
  agora?: () => number;
}

/* ─────────────────────────────── o token ─────────────────────────────── */

type TokenGuardado = { cabecalho: string; expiraEm: number };
const tokens = new Map<string, TokenGuardado>();
/** Esquece os tokens guardados (teste; ou depois de trocar a credencial). */
export function esquecerTokensPinbank(): void {
  tokens.clear();
}

/** Tira o segredo de qualquer texto que vá para mensagem (defesa: a Pinbank poderia ecoá-lo). */
function semSegredo(t: string, cred: CredencialPinbank): string {
  return cred.chave ? t.split(cred.chave).join("•••") : t;
}

const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** O motivo que a Pinbank deu, em até 300 caracteres — sem o segredo. */
function motivoDaPinbank(r: RespostaPinbank, cred: CredencialPinbank): string {
  const bruto = r.corpo.toString("utf8");
  let msg = "";
  try {
    const j = JSON.parse(bruto) as unknown;
    if (obj(j)) {
      const val = obj(j.ValidationData) ? j.ValidationData : {};
      const cand = [j.error_description, j.error, j.Message, j.message, val.Message].find((v) => typeof v === "string" && v.trim());
      msg = typeof cand === "string" ? cand.trim() : "";
    }
  } catch {
    msg = bruto.trim().startsWith("<") ? "" : bruto.trim();
  }
  return semSegredo(`HTTP ${r.status}${msg ? `: ${msg.slice(0, 300)}` : ""}`, cred);
}

async function obterToken(cred: CredencialPinbank, o: OpcoesApi, forcar: boolean): Promise<{ cabecalho: string; novo: boolean; ms: number }> {
  const agora = o.agora ?? Date.now;
  const chave = `${cred.base}|${cred.usuario}`;
  const guardado = tokens.get(chave);
  if (!forcar && guardado && guardado.expiraEm > agora()) return { cabecalho: guardado.cabecalho, novo: false, ms: 0 };

  const inicio = Date.now();
  const corpo = new URLSearchParams({ username: cred.usuario, password: cred.chave, grant_type: "password" }).toString();
  const r = await requisicaoPinbank({
    url: `${cred.base}/api/token`,
    metodo: "POST",
    corpo,
    cabecalhos: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    proxies: o.proxies,
    caDestino: o.caDestino,
    timeoutTotalMs: 10_000,
  });
  if (r.status !== 200) throw new ErroApiPinbank("token", `A Pinbank recusou o token (${motivoDaPinbank(r, cred)}).`, r.status);
  let j: unknown;
  try {
    j = JSON.parse(r.corpo.toString("utf8"));
  } catch {
    throw new ErroApiPinbank("token", "A resposta do token não é JSON.", r.status);
  }
  const acesso = obj(j) && typeof j.access_token === "string" ? j.access_token.trim() : "";
  if (!acesso) throw new ErroApiPinbank("token", "A resposta do token veio sem access_token.", r.status);
  const tipo = obj(j) && typeof j.token_type === "string" && j.token_type.trim() ? j.token_type.trim() : "bearer";
  const segundos = obj(j) && typeof j.expires_in === "number" && j.expires_in > 0 ? j.expires_in : 300;
  // Renova antes do fim: 10% do prazo, no máximo um minuto.
  const folga = Math.min(60, segundos * 0.1);
  const cabecalho = `${tipo} ${acesso}`;
  tokens.set(chave, { cabecalho, expiraEm: agora() + (segundos - folga) * 1000 });
  return { cabecalho, novo: true, ms: Date.now() - inicio };
}

/* ─────────────────────────── a chamada de leitura ─────────────────────────── */

export type FormatoResposta = "cifrado" | "aberto";

export interface LeituraPinbank {
  /** O envelope ABERTO (`{ Data, ResultCode, Message, ValidationData }`). */
  aberto: unknown;
  formato: FormatoResposta;
  /** Só os NOMES dos campos do envelope recebido (diagnóstico; nada de valor). */
  campos: string[];
  via: string;
  etapas: { etapa: "token" | "metodo"; ms: number; status?: number; novo?: boolean }[];
}

/** Abre o corpo: `{ Data: { Json: "<cifrado>" } }` vira o envelope aberto; o resto passa como veio. */
export function abrirCorpoPinbank(texto: string, keyValue: string): { aberto: unknown; formato: FormatoResposta; campos: string[] } {
  let externo: unknown;
  try {
    externo = JSON.parse(texto);
  } catch {
    throw new Error("A resposta da Pinbank não é JSON.");
  }
  const campos = obj(externo) ? Object.keys(externo).slice(0, 20) : [];
  const json = obj(externo) && obj(externo.Data) && typeof externo.Data.Json === "string" ? externo.Data.Json : null;
  if (!obj(externo) || json == null) return { aberto: externo, formato: "aberto", campos };
  let dentro: unknown;
  try {
    dentro = JSON.parse(decifrarPinbank(json, keyValue));
  } catch (e) {
    throw new Error((e as Error).message.startsWith("Não foi possível") || (e as Error).message.startsWith("A resposta")
      ? (e as Error).message
      : "A resposta da Pinbank abriu, mas não é JSON.");
  }
  // O que veio cifrado pode ser o envelope inteiro ou só o `Data`; o código e
  // a mensagem de fora completam o que faltar.
  const { Data: _cifrado, ...fora } = externo;
  void _cifrado;
  const aberto = obj(dentro) && ("Data" in dentro || "ResultCode" in dentro) ? { ...fora, ...dentro } : { ...fora, Data: dentro };
  return { aberto, formato: "cifrado", campos };
}

export async function chamarLeituraPinbank(metodo: MetodoLeitura, dados: Record<string, unknown>, o: OpcoesApi = {}): Promise<LeituraPinbank> {
  if (!Object.prototype.hasOwnProperty.call(METODOS_LEITURA, metodo)) {
    throw new ErroApiPinbank("pedido", `Método fora da lista de leitura: ${String(metodo)}.`);
  }
  const cred = o.credencial ?? lerCredencialPinbank();
  const url = `${cred.base}/api/${METODOS_LEITURA[metodo]}Encrypted`;
  const corpo = JSON.stringify({ Data: { Json: cifrarPinbank(JSON.stringify(dados), cred.chave) } });
  const etapas: LeituraPinbank["etapas"] = [];

  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const t = await obterToken(cred, o, tentativa > 0);
    etapas.push({ etapa: "token", ms: t.ms, novo: t.novo });
    const inicio = Date.now();
    const r = await requisicaoPinbank({
      url,
      metodo: "POST",
      corpo,
      cabecalhos: {
        "content-type": "application/json",
        accept: "application/json",
        Authorization: t.cabecalho,
        UserName: cred.usuario,
        RequestOrigin: cred.origem,
      },
      proxies: o.proxies,
      caDestino: o.caDestino,
      timeoutTotalMs: 25_000,
    });
    etapas.push({ etapa: "metodo", ms: Date.now() - inicio, status: r.status });
    // Token do cache recusado: pode ter vencido antes do prazo. Um novo, UMA vez.
    if (r.status === 401 && !t.novo && tentativa === 0) {
      tokens.delete(`${cred.base}|${cred.usuario}`);
      continue;
    }
    if (r.status !== 200) {
      throw new ErroApiPinbank("metodo", `${metodo}: a Pinbank respondeu ${motivoDaPinbank(r, cred)}.`, r.status);
    }
    try {
      const { aberto, formato, campos } = abrirCorpoPinbank(r.corpo.toString("utf8"), cred.chave);
      return { aberto, formato, campos, via: r.via, etapas };
    } catch (e) {
      throw new ErroApiPinbank("resposta", semSegredo((e as Error).message, cred), r.status);
    }
  }
  // Inalcançável: a segunda volta sempre retorna ou lança.
  throw new ErroApiPinbank("metodo", `${metodo}: a credencial foi recusada.`, 401);
}

/* ─────────────────────────────── o ExtratoPos ─────────────────────────────── */

export interface ExtratoPosConsultado {
  ambiente: AmbienteApi;
  resposta: RespostaExtratoPos;
  resumo: ResumoExtratoPos;
  formato: FormatoResposta;
  campos: string[];
  via: string;
  etapas: LeituraPinbank["etapas"];
}

/** O filtro sem o canal: o canal vem da credencial (`PINBANK_CODIGO_CANAL`). */
export type FiltroExtratoPosSemCanal = Omit<FiltroExtratoPos, "codigoCanal"> & { codigoCanal?: number };

export async function consultarExtratoPos(filtro: FiltroExtratoPosSemCanal, o: OpcoesApi = {}): Promise<ExtratoPosConsultado> {
  const cred = o.credencial ?? lerCredencialPinbank();
  const f: FiltroExtratoPos = { ...filtro, codigoCanal: filtro.codigoCanal ?? cred.canal };
  const problemas = problemasDoFiltroExtratoPos(f);
  if (problemas.length) throw new ErroApiPinbank("pedido", problemas.join(" "));
  const leitura = await chamarLeituraPinbank("ExtratoPos", pedidoExtratoPos(f), { ...o, credencial: cred });
  const resposta = lerRespostaExtratoPos(leitura.aberto);
  return {
    ambiente: cred.ambiente,
    resposta,
    resumo: resumirExtratoPos(resposta.linhas),
    formato: leitura.formato,
    campos: leitura.campos,
    via: leitura.via,
    etapas: leitura.etapas,
  };
}

/** Para a rota: o erro em palavras, com a fase de rede quando for da saída fixa. */
export function descreverErroApi(e: unknown): { etapa: string; motivo: string; status?: number } {
  if (e instanceof ErroApiPinbank) return { etapa: e.etapa, motivo: e.message, status: e.status };
  if (e instanceof ErroSaida) {
    // A mensagem da porta traz só "IP:porta" e o motivo — nunca a credencial.
    return { etapa: `saida_${e.fase}`, motivo: e.message };
  }
  return { etapa: "desconhecida", motivo: "Falha inesperada ao falar com a Pinbank." };
}
