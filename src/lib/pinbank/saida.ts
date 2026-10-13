import net from "node:net";
import tls from "node:tls";
import https from "node:https";
import type { IncomingHttpHeaders } from "node:http";

/**
 * A SAÍDA FIXA PARA A PINBANK — a ÚNICA porta por onde o servidor fala com ela.
 * SERVER-ONLY (node:net/tls/https: nunca em edge nem no middleware).
 *
 * A Pinbank libera em produção os IPs de onde a chamamos. As funções da Vercel
 * não têm IP fixo, então toda chamada passa por UM dos dois servidores
 * próprios na AWS (Lightsail, São Paulo), cada um com um IP fixo e um Squid
 * que só abre túnel CONNECT para *.pinbank.com.br:443
 * (`infra/saida-pinbank/instalar.sh`; detalhe em docs/rodada-10/saida-fixa.md).
 *
 *   PINBANK_SAIDA_1=http://usuario:senha@IP1:31280   (o valor que
 *   PINBANK_SAIDA_2=http://usuario:senha@IP2:31280    `sudo quattro-saida-url`
 *                                                     mostra em cada servidor)
 *   PINBANK_SAIDA_CA=<PEM>  só se um proxy for https:// (TLS até o proxy)
 *
 * `requisicaoPinbank` (a API, com credencial) EXIGE os servidores: sem nenhuma
 * `PINBANK_SAIDA_<n>` ela recusa, e com elas NUNCA sai direto — se os dois
 * falharem, a chamada falha (sair por um IP que a Pinbank não liberou só
 * trocaria o erro de lugar). `buscarPinbank` (GET simples) sai direto quando
 * não há servidor configurado (local, preview, antes de ligar) e DIZ isso
 * (`via: "direto"`); com servidor configurado, só volta ao direto para o que
 * está em `PUBLICOS` (a chave pública do webhook) e só se pedir `publico`.
 *
 * ⚠️ A REGRA DE TROCA DE SERVIDOR, que é a decisão inteira deste arquivo:
 *   FASE 1 — abrir o túnel: TCP até o proxy → CONNECT → 200 → TLS com a
 *            Pinbank. Nada do pedido HTTP saiu ainda. Falha aqui (proxy fora,
 *            travado, 407, 403, certificado) ⇒ tenta o OUTRO servidor.
 *   FASE 2 — o pedido HTTP vai pelo túnel. Daqui em diante NUNCA se repete:
 *            o pedido pode ter chegado à Pinbank, e repetir um POST de
 *            dinheiro pelo outro servidor pode duplicá-lo. Erro aqui sobe como
 *            `ErroSaida` com fase "apos_envio".
 *   Resposta 4xx/5xx da Pinbank NÃO é falha de saída: volta como resposta.
 *
 * ⚠️ Por que não o `undici` (ProxyAgent): medido, as três falhas que pedem
 * decisões OPOSTAS chegam com a mesma cara (`TypeError: fetch failed`) — proxy
 * fora, 407 do proxy e conexão caída DEPOIS de o pedido sair. Decidir a troca
 * por texto de erro é casar substring, e foi isso que já custou caro aqui. E o
 * `ProxyAgent` de outra versão quebra o `fetch` embutido do Node (Node 22 +
 * undici 8: "invalid onRequestStart method"). Aqui a fase 1 termina num ponto
 * exato do código, sem dependência nova.
 *
 * ⚠️ A senha do proxy nunca aparece em mensagem de erro, rótulo ou log: o
 * rótulo de um servidor é só "IP:porta".
 */

/** A chave pública do webhook (Ed25519). Pública, mas sai pela mesma porta. */
export const URL_CHAVE_PUBLICA = "https://pinbank.com.br/webhook/signing-key";
/**
 * O que é PÚBLICO de verdade (sem credencial, GET, só leitura): o único caso em
 * que, com os dois servidores fora, vale buscar direto. Sem isso, servidor fora
 * por mais tempo que a fila de reenvio da Pinbank = webhook em 503 até ela
 * desistir = venda perdida. Direto, a chave continua conferida pelo TLS (o
 * certificado de pinbank.com.br) — o IP de saída só importa para o que a
 * Pinbank tranca por IP, e uma chave pública não é isso.
 */
export const PUBLICOS: readonly string[] = [URL_CHAVE_PUBLICA];
/** O eco de IP da AWS: é por ele que se prova POR ONDE a chamada saiu. */
export const URL_ECO_DE_IP = "https://checkip.amazonaws.com/";

/**
 * A BASE da API da Pinbank (token + métodos `…Encrypted`), por ambiente. Mora
 * aqui porque o endereço da Pinbank só mora na porta; quem escolhe o ambiente é
 * `PINBANK_API_AMBIENTE` (`lib/pinbank/api.ts`), nunca uma URL livre em variável.
 * ⚠️ A de PRODUÇÃO segue a doc ("Base de produção") — a Pinbank ainda não
 * confirmou a URL do token em produção; o teste começa em `dev`.
 */
export const BASES_API_PINBANK = {
  dev: "https://dev.pinbank.com.br/services",
  producao: "https://pinbank.com.br/services",
} as const;

export const VARIAVEIS_SAIDA = ["PINBANK_SAIDA_1", "PINBANK_SAIDA_2"] as const;

export type ProxySaida = {
  /** "IP:porta" — o que pode aparecer em log. Nunca contém a senha. */
  rotulo: string;
  /** A variável de onde veio (PINBANK_SAIDA_1/2). */
  variavel: string;
  host: string;
  porta: number;
  /** true quando a URL é https:// (TLS entre a função e o proxy). */
  tls: boolean;
  /** Valor do cabeçalho Proxy-Authorization. SEGREDO: não logar. */
  autorizacao: string;
};

export type Tentativa = { proxy: string; fase: "conexao"; motivo: string; ms: number };

export class ErroSaida extends Error {
  readonly fase: "configuracao" | "conexao" | "apos_envio";
  readonly tentativas: Tentativa[];
  readonly via?: string;
  constructor(fase: ErroSaida["fase"], mensagem: string, tentativas: Tentativa[] = [], via?: string) {
    super(mensagem);
    this.name = "ErroSaida";
    this.fase = fase;
    this.tentativas = tentativas;
    this.via = via;
  }
}

export type PedidoPinbank = {
  url: string;
  metodo?: string;
  cabecalhos?: Record<string, string>;
  corpo?: string | Buffer;
  /** Por servidor: TCP + CONNECT + TLS com o destino. Padrão 4 s. */
  timeoutConexaoMs?: number;
  /** Do início ao último byte da resposta, somando as tentativas. Padrão 25 s. */
  timeoutTotalMs?: number;
  /**
   * O pedido só SAI se sobrar ao menos isto do prazo total. Padrão 1 s. Sem a
   * reserva, um túnel que abre no último instante manda o pedido com 1 ms de
   * prazo: ele estoura DEPOIS de enviado, e o que era "não saiu, repita" vira
   * "pode ter chegado" — a pior resposta para um pedido de dinheiro.
   */
  minEnvioMs?: number;
  /** Teto do corpo da resposta. Padrão 5 MB. */
  maxBytesResposta?: number;
  signal?: AbortSignal;
  /** Padrão: lerProxies() (as variáveis PINBANK_SAIDA_<n>). */
  proxies?: ProxySaida[];
  /** CA do DESTINO. Só para teste: em produção valem as CAs do próprio Node. */
  caDestino?: string | Buffer;
  /** CA dos proxies https://. Padrão: PINBANK_SAIDA_CA. */
  caProxy?: string | Buffer;
};

export type RespostaPinbank = {
  status: number;
  cabecalhos: IncomingHttpHeaders;
  corpo: Buffer;
  /** O servidor que levou o pedido ("IP:porta"). */
  via: string;
  /** As falhas de FASE 1 que vieram antes do servidor que funcionou. */
  tentativas: Tentativa[];
};

/**
 * O mesmo recorte da lista do Squid. Conferir aqui também impede que um erro
 * de código (ou uma URL vinda de variável de ambiente) mande cabeçalho de
 * autenticação da Pinbank para outro lugar.
 */
export function destinoPermitido(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  return h === "pinbank.com.br" || h.endsWith(".pinbank.com.br") || h === "checkip.amazonaws.com";
}

type Ambiente = Record<string, string | undefined>;

/**
 * Lê PINBANK_SAIDA_1 e PINBANK_SAIDA_2, nessa ordem. Nenhuma preenchida = lista
 * vazia (saída direta). Preenchida e inválida = ERRO nomeado, nunca ignorada:
 * um servidor descartado em silêncio deixaria a saída com um só, sem aviso.
 */
export function lerProxies(env: Ambiente = process.env): ProxySaida[] {
  const vistos = new Set<string>();
  const lista: ProxySaida[] = [];
  for (const variavel of VARIAVEIS_SAIDA) {
    const item = (env[variavel] ?? "").trim();
    if (!item) continue;
    let u: URL;
    try {
      u = new URL(item);
    } catch {
      throw new ErroSaida("configuracao", `${variavel}: não é uma URL.`); // sem ecoar o valor: ele tem a senha
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") throw new ErroSaida("configuracao", `${variavel}: use http:// ou https://.`);
    if (!u.username || !u.password) throw new ErroSaida("configuracao", `${variavel}: falta usuário ou senha.`);
    if (!u.port) throw new ErroSaida("configuracao", `${variavel}: informe a porta (ex.: :31280).`);
    if (u.pathname !== "/" || u.search || u.hash) throw new ErroSaida("configuracao", `${variavel}: a URL do proxy não leva caminho.`);
    const host = u.hostname.replace(/^\[|\]$/g, "");
    const porta = Number(u.port);
    const rotulo = `${host}:${porta}`;
    if (vistos.has(rotulo)) throw new ErroSaida("configuracao", `${variavel}: ${rotulo} repetido.`);
    vistos.add(rotulo);
    const cred = `${decodeURIComponent(u.username)}:${decodeURIComponent(u.password)}`;
    lista.push({ rotulo, variavel, host, porta, tls: u.protocol === "https:", autorizacao: `Basic ${Buffer.from(cred).toString("base64")}` });
  }
  return lista;
}

// Servidor que falhou há pouco vai para o FIM da fila nesta instância da
// função: sem isso, com o servidor 1 fora do ar, TODA chamada pagaria o timeout
// dele antes de chegar ao 2. A ordem só muda a tentativa; a regra é a mesma.
const QUARENTENA_MS = 30_000;
const falhouEm = new Map<string, number>();
function ordenar(proxies: ProxySaida[], agora: number): ProxySaida[] {
  const recente = (p: ProxySaida) => agora - (falhouEm.get(p.rotulo) ?? -Infinity) < QUARENTENA_MS;
  return [...proxies.filter((p) => !recente(p)), ...proxies.filter(recente)];
}
/** Só para teste: esquece as falhas registradas. */
export function esquecerFalhas(): void {
  falhouEm.clear();
}

function motivoDe(e: unknown): string {
  const err = e as NodeJS.ErrnoException;
  return [err?.code, err?.message].filter(Boolean).join(" ") || String(e);
}

/**
 * FASE 1: devolve um TLSSocket JÁ autenticado com o destino, por dentro do
 * túnel CONNECT do proxy. Nenhum byte do pedido HTTP foi enviado.
 */
function abrirTunel(
  proxy: ProxySaida,
  destino: string,
  portaDestino: number,
  o: { timeoutMs: number; caDestino?: string | Buffer; caProxy?: string | Buffer; signal?: AbortSignal },
): Promise<tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    let fim = false;
    let tlsDestino: tls.TLSSocket | undefined;
    const sock: net.Socket = proxy.tls
      ? tls.connect({ host: proxy.host, port: proxy.porta, ca: o.caProxy, servername: net.isIP(proxy.host) ? undefined : proxy.host })
      : net.connect({ host: proxy.host, port: proxy.porta });

    const falhar = (motivo: string) => {
      if (fim) return;
      fim = true;
      clearTimeout(timer);
      o.signal?.removeEventListener("abort", aoAbortar);
      tlsDestino?.destroy();
      sock.destroy();
      reject(new Error(motivo));
    };
    const aoAbortar = () => falhar("cancelado (AbortSignal)");
    const timer = setTimeout(() => falhar(`tempo esgotado (${o.timeoutMs} ms) abrindo o túnel`), o.timeoutMs);
    o.signal?.addEventListener("abort", aoAbortar, { once: true });
    sock.on("error", (e) => falhar(`conexão com o proxy: ${motivoDe(e)}`));
    sock.on("close", () => falhar("o proxy fechou a conexão antes de o túnel abrir"));

    sock.once(proxy.tls ? "secureConnect" : "connect", () => {
      sock.write(
        `CONNECT ${destino}:${portaDestino} HTTP/1.1\r\n` +
          `Host: ${destino}:${portaDestino}\r\n` +
          `Proxy-Authorization: ${proxy.autorizacao}\r\n\r\n`,
      );
    });

    let buf = Buffer.alloc(0);
    const aoDados = (pedaco: Buffer) => {
      buf = Buffer.concat([buf, pedaco]);
      const fimCab = buf.indexOf("\r\n\r\n");
      if (fimCab === -1) {
        if (buf.length > 16_384) falhar("resposta do proxy grande demais");
        return;
      }
      sock.removeListener("data", aoDados);
      sock.pause();
      const linha = buf.subarray(0, buf.indexOf("\r\n")).toString("latin1");
      const m = /^HTTP\/1\.[01] (\d{3})/.exec(linha);
      if (!m) return falhar(`resposta inválida do proxy: ${JSON.stringify(linha.slice(0, 80))}`);
      if (m[1] !== "200") return falhar(`o proxy recusou o túnel: ${linha.trim()}`);
      const resto = buf.subarray(fimCab + 4);
      if (resto.length) sock.unshift(resto);

      // TLS com o DESTINO por dentro do túnel. A verificação do certificado é
      // a padrão do Node (nome + cadeia): o proxy não vê nem altera o conteúdo.
      sock.removeAllListeners("close");
      tlsDestino = tls.connect({ socket: sock, servername: destino, ca: o.caDestino, ALPNProtocols: ["http/1.1"] });
      tlsDestino.once("secureConnect", () => {
        if (fim) return;
        fim = true;
        clearTimeout(timer);
        o.signal?.removeEventListener("abort", aoAbortar);
        sock.removeAllListeners("error");
        sock.on("error", () => {}); // o erro chega pelo tlsDestino na fase 2
        resolve(tlsDestino as tls.TLSSocket);
      });
      tlsDestino.on("error", (e) => falhar(`TLS com ${destino}: ${motivoDe(e)}`));
    };
    sock.on("data", aoDados);
  });
}

/** FASE 2: o pedido HTTP pelo túnel já aberto. Erro aqui NUNCA é repetido. */
function enviar(
  sock: tls.TLSSocket,
  u: URL,
  p: PedidoPinbank,
  prazo: number,
): Promise<{ status: number; cabecalhos: IncomingHttpHeaders; corpo: Buffer }> {
  return new Promise((resolve, reject) => {
    const max = p.maxBytesResposta ?? 5 * 1024 * 1024;
    const cab: Record<string, string> = { ...(p.cabecalhos ?? {}) };
    if (p.corpo !== undefined && !Object.keys(cab).some((k) => k.toLowerCase() === "content-length")) {
      cab["content-length"] = String(Buffer.byteLength(p.corpo));
    }
    let terminou = false;
    const req = https.request({
      host: u.hostname,
      port: Number(u.port || 443),
      path: u.pathname + u.search,
      method: p.metodo ?? "GET",
      headers: cab,
      // Sem agente o Node não sabe a porta padrão e escreveria "Host: x:443".
      defaultPort: 443,
      // Sem agente: a conexão é o túnel desta chamada e morre com ela.
      createConnection: () => sock,
    });
    const restante = Math.max(1, prazo - Date.now());
    const timer = setTimeout(() => req.destroy(new Error(`tempo total esgotado (${p.timeoutTotalMs ?? 25_000} ms)`)), restante);
    const aoAbortar = () => req.destroy(new Error("cancelado (AbortSignal)"));
    p.signal?.addEventListener("abort", aoAbortar, { once: true });
    const acabar = () => {
      terminou = true;
      clearTimeout(timer);
      p.signal?.removeEventListener("abort", aoAbortar);
    };
    req.on("error", (e) => {
      if (terminou) return;
      acabar();
      reject(e);
    });
    req.on("response", (res) => {
      const partes: Buffer[] = [];
      let total = 0;
      res.on("data", (c: Buffer) => {
        total += c.length;
        if (total > max) {
          req.destroy(new Error(`resposta maior que ${max} bytes`));
          return;
        }
        partes.push(c);
      });
      res.on("end", () => {
        if (terminou) return;
        acabar();
        resolve({ status: res.statusCode ?? 0, cabecalhos: res.headers, corpo: Buffer.concat(partes) });
      });
      res.on("error", (e) => {
        if (terminou) return;
        acabar();
        reject(e);
      });
    });
    req.end(p.corpo);
  });
}

function urlDestino(url: string): URL {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new ErroSaida("configuracao", "URL de destino inválida.");
  }
  if (u.protocol !== "https:") throw new ErroSaida("configuracao", "A Pinbank só é chamada por https://.");
  if (!destinoPermitido(u.hostname)) throw new ErroSaida("configuracao", `Destino fora da lista da saída fixa: ${u.hostname}.`);
  return u;
}

/**
 * Uma requisição HTTPS à Pinbank PELOS SERVIDORES DA SAÍDA FIXA.
 * Resolve com a resposta (qualquer status). Rejeita com `ErroSaida`:
 *   - "configuracao": variável/URL inválidas, ou nenhum servidor configurado
 *     (nada foi tentado);
 *   - "conexao": NENHUM servidor abriu o túnel (o pedido não saiu — seguro
 *     repetir depois);
 *   - "apos_envio": o túnel abriu e algo falhou depois (o pedido PODE ter chegado).
 */
export async function requisicaoPinbank(p: PedidoPinbank): Promise<RespostaPinbank> {
  const u = urlDestino(p.url);
  const proxies = p.proxies ?? lerProxies();
  if (proxies.length === 0) {
    throw new ErroSaida("configuracao", "Nenhuma PINBANK_SAIDA_<n> configurada: não há servidor de saída fixa.");
  }
  const caProxy = p.caProxy ?? (process.env.PINBANK_SAIDA_CA || undefined);
  if (proxies.some((x) => x.tls) && !caProxy) {
    throw new ErroSaida("configuracao", "Há proxy https:// mas PINBANK_SAIDA_CA está vazia: sem a CA fixada não há como conferir o proxy.");
  }

  const inicio = Date.now();
  const prazo = inicio + (p.timeoutTotalMs ?? 25_000);
  const minEnvio = p.minEnvioMs ?? 1_000;
  const tentativas: Tentativa[] = [];
  let sock: tls.TLSSocket | undefined;
  let via = "";

  for (const proxy of ordenar(proxies, inicio)) {
    // O túnel nunca come a reserva do envio.
    const janela = prazo - Date.now() - minEnvio;
    if (janela <= 0 || p.signal?.aborted) break;
    const t0 = Date.now();
    try {
      sock = await abrirTunel(proxy, u.hostname, Number(u.port || 443), {
        timeoutMs: Math.min(p.timeoutConexaoMs ?? 4_000, janela),
        caDestino: p.caDestino,
        caProxy,
        signal: p.signal,
      });
      via = proxy.rotulo;
      falhouEm.delete(proxy.rotulo);
      break;
    } catch (e) {
      falhouEm.set(proxy.rotulo, Date.now());
      tentativas.push({ proxy: proxy.rotulo, fase: "conexao", motivo: motivoDe(e), ms: Date.now() - t0 });
    }
  }
  if (!sock) {
    const resumo = tentativas.map((t) => `${t.proxy}: ${t.motivo}`).join(" | ") || "nenhuma tentativa coube no prazo";
    throw new ErroSaida("conexao", `Nenhum servidor de saída abriu o túnel para ${u.hostname}. ${resumo}`, tentativas);
  }
  if (prazo - Date.now() < minEnvio || p.signal?.aborted) {
    sock.destroy();
    throw new ErroSaida("conexao", `O túnel por ${via} abriu sem prazo para o envio: o pedido NÃO saiu (seguro repetir).`, tentativas, via);
  }

  try {
    const r = await enviar(sock, u, p, prazo);
    return { ...r, via, tentativas };
  } catch (e) {
    sock.destroy();
    throw new ErroSaida(
      "apos_envio",
      `O túnel por ${via} abriu, mas o pedido falhou depois de enviado (${motivoDe(e)}). Ele PODE ter chegado à Pinbank: não repita sem chave de idempotência.`,
      tentativas,
      via,
    );
  }
}

/**
 * Um GET simples à Pinbank (ex.: a chave pública do webhook) pela porta única:
 * pelos servidores da saída fixa quando há `PINBANK_SAIDA_<n>`, direto quando
 * não há. `via` diz qual dos dois aconteceu.
 *
 * `publico: true` (só para URL em `PUBLICOS`): se os servidores falharem — ou a
 * variável estiver ilegível —, tenta DIRETO e devolve `via: "direto-reserva"`,
 * com o motivo no log. Para qualquer outra URL, `publico` é recusado: o que
 * leva credencial ou muda estado nunca sai por IP não liberado.
 */
export async function buscarPinbank(
  url: string,
  o: { timeoutMs?: number; env?: Ambiente; fetchDireto?: typeof fetch; caDestino?: string | Buffer; publico?: boolean } = {},
): Promise<{ status: number; corpo: string; via: string }> {
  urlDestino(url);
  if (o.publico && !PUBLICOS.includes(url)) {
    throw new ErroSaida("configuracao", "Só o que está em PUBLICOS pode voltar ao caminho direto.");
  }
  const timeoutMs = o.timeoutMs ?? 8_000;
  const direto = async (via: string) => {
    const r = await (o.fetchDireto ?? fetch)(url, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
    return { status: r.status, corpo: await r.text(), via };
  };
  let proxies: ProxySaida[];
  try {
    proxies = lerProxies(o.env);
  } catch (e) {
    if (!o.publico) throw e;
    console.warn("[falha·pinbank] saida_fixa.reserva_publica:", (e as Error).message);
    return direto("direto-reserva");
  }
  if (proxies.length === 0) return direto("direto");
  try {
    const r = await requisicaoPinbank({ url, proxies, timeoutTotalMs: timeoutMs, caDestino: o.caDestino });
    return { status: r.status, corpo: r.corpo.toString("utf8"), via: r.via };
  } catch (e) {
    if (!o.publico) throw e;
    // A mensagem traz só "IP:porta" e o motivo — nunca a credencial.
    console.warn("[falha·pinbank] saida_fixa.reserva_publica:", (e as Error).message);
    return direto("direto-reserva");
  }
}

/**
 * A PROVA dos IPs: pergunta ao eco de IP da AWS por CADA servidor, sem troca —
 * um servidor fora do ar aparece como fora, não é encoberto pelo outro.
 */
export async function provarSaidas(
  proxies: ProxySaida[] = lerProxies(),
  o: { timeoutMs?: number; urlEco?: string; caDestino?: string | Buffer } = {},
): Promise<Array<{ variavel: string; proxy: string; ip?: string; erro?: string }>> {
  return Promise.all(
    proxies.map(async (proxy) => {
      try {
        const r = await requisicaoPinbank({
          url: o.urlEco ?? URL_ECO_DE_IP,
          proxies: [proxy],
          timeoutTotalMs: o.timeoutMs ?? 8_000,
          caDestino: o.caDestino,
        });
        const ip = r.corpo.toString("utf8").trim();
        if (r.status !== 200 || net.isIP(ip) !== 4) return { variavel: proxy.variavel, proxy: proxy.rotulo, erro: `resposta inesperada (HTTP ${r.status})` };
        return { variavel: proxy.variavel, proxy: proxy.rotulo, ip };
      } catch (e) {
        return { variavel: proxy.variavel, proxy: proxy.rotulo, erro: (e as Error).message };
      }
    }),
  );
}
