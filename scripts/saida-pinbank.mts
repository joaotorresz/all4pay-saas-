/**
 * A SAÍDA FIXA PARA A PINBANK — a guarda de COMPORTAMENTO (`npm run saida-pinbank`).
 *
 * O bloco `saida-fixa:` do engine-audit prova que só existe UMA porta; esta
 * prova que a porta faz o que promete, dirigindo `src/lib/pinbank/saida.ts`
 * contra dois proxies CONNECT de mentira (Node puro, com senha) e uma
 * "Pinbank" HTTPS local com certificado de uma CA de teste — sem Squid, sem
 * rede, para rodar no CI. (O Squid de verdade foi provado à parte, num Ubuntu
 * 24.04 do zero — docs/rodada-10/saida-fixa.md.)
 *
 * A regra que mais importa é a FRONTEIRA DE FASE: trocar de servidor só
 * enquanto o pedido não saiu. Repetir pelo outro servidor um pedido que já
 * chegou à Pinbank pode duplicar dinheiro.
 *
 * ⚠️ TODA guarda só conta depois de reprovar: no fim, quatro DEFEITOS PLANTADOS
 * (cópias alteradas do arquivo) — repetir depois do envio, sair direto quando
 * os servidores caem, ecoar a senha na mensagem e esquecer a lista de destinos
 * — e cada um tem de derrubar o caso que o nomeia.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import https from "node:https";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

type Modulo = typeof import("../src/lib/pinbank/saida.ts");
const ARQUIVO = path.resolve("src/lib/pinbank/saida.ts");
const HOST = "teste.pinbank.com.br";
const SENHA_A = "senhaA0123456789abcdef0123456789abcdef";
const SENHA_B = "senhaB0123456789abcdef0123456789abcdef";

/* ─────────────────────────── a CA e a "Pinbank" de teste ─────────────────────────── */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "saida-pinbank-"));
const ossl = (...a: string[]) => execFileSync("openssl", a, { cwd: tmp, stdio: "ignore" });
ossl("req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:P-256", "-nodes", "-days", "2",
  "-subj", "/CN=CA de teste da saida fixa", "-keyout", "ca.key", "-out", "ca.pem",
  "-addext", "basicConstraints=critical,CA:TRUE", "-addext", "keyUsage=critical,keyCertSign");
ossl("req", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:P-256", "-nodes", "-subj", `/CN=${HOST}`,
  "-keyout", "destino.key", "-out", "destino.csr");
fs.writeFileSync(path.join(tmp, "ext.cnf"), `subjectAltName=DNS:${HOST}\nextendedKeyUsage=serverAuth\n`);
ossl("x509", "-req", "-in", "destino.csr", "-CA", "ca.pem", "-CAkey", "ca.key", "-CAcreateserial", "-days", "2",
  "-extfile", "ext.cnf", "-out", "destino.pem");
const CA = fs.readFileSync(path.join(tmp, "ca.pem"));

const recebidos: Record<string, number> = {};
const destino = https.createServer(
  { key: fs.readFileSync(path.join(tmp, "destino.key")), cert: fs.readFileSync(path.join(tmp, "destino.pem")) },
  (req, res) => {
    const caminho = new URL(req.url ?? "/", "https://x").pathname;
    recebidos[caminho] = (recebidos[caminho] ?? 0) + 1;
    let corpo = "";
    req.on("data", (c) => (corpo += c));
    req.on("end", () => {
      if (caminho === "/ok") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ metodo: req.method, corpo, host: req.headers.host }));
      } else if (caminho === "/erro500") {
        res.writeHead(500).end("falha simulada");
      } else if (caminho === "/derruba") {
        req.socket.destroy(); // o pedido CHEGOU e a conexão cai antes da resposta
      } else if (caminho === "/ip") {
        res.writeHead(200).end("198.51.100.10\n");
      } else {
        res.writeHead(404).end();
      }
    });
  },
);
await new Promise<void>((r) => destino.listen(0, "127.0.0.1", r));
const PORTA_DESTINO = (destino.address() as net.AddressInfo).port;
const URL_DESTINO = (p: string) => `https://${HOST}:${PORTA_DESTINO}${p}`;

/* ─────────────────────────── proxies CONNECT de mentira ─────────────────────────── */
type Modo = "ok" | "407" | "travado";
function proxyFalso(senha: string) {
  const estado = { modo: "ok" as Modo, connects: 0 };
  const srv = net.createServer((cli) => {
    cli.on("error", () => {});
    let buf = "";
    const aoDados = (d: Buffer) => {
      buf += d.toString("latin1");
      if (!buf.includes("\r\n\r\n")) return;
      cli.removeListener("data", aoDados);
      if (estado.modo === "travado") return; // aceita o TCP e nunca responde
      estado.connects++;
      const [linha, ...cab] = buf.split("\r\n");
      const auth = cab.find((c) => /^proxy-authorization:/i.test(c))?.split(/:\s*/)[1] ?? "";
      const esperado = `Basic ${Buffer.from(`quattro:${senha}`).toString("base64")}`;
      if (estado.modo === "407" || auth !== esperado) {
        cli.end("HTTP/1.1 407 Proxy Authentication Required\r\n\r\n");
        return;
      }
      const m = /^CONNECT ([^:]+):(\d+) HTTP/.exec(linha);
      if (!m || m[1] !== HOST) {
        cli.end("HTTP/1.1 403 Forbidden\r\n\r\n");
        return;
      }
      const alvo = net.connect({ host: "127.0.0.1", port: Number(m[2]) }, () => {
        cli.write("HTTP/1.1 200 Connection established\r\n\r\n");
        alvo.pipe(cli);
        cli.pipe(alvo);
      });
      alvo.on("error", () => cli.destroy());
    };
    cli.on("data", aoDados);
  });
  return { srv, estado };
}
const A = proxyFalso(SENHA_A);
const B = proxyFalso(SENHA_B);
await new Promise<void>((r) => A.srv.listen(0, "127.0.0.1", r));
await new Promise<void>((r) => B.srv.listen(0, "127.0.0.1", r));
const PA = (A.srv.address() as net.AddressInfo).port;
const PB = (B.srv.address() as net.AddressInfo).port;
// Uma porta FECHADA de verdade: abre, anota e fecha.
const fechado = net.createServer();
await new Promise<void>((r) => fechado.listen(0, "127.0.0.1", r));
const PFECHADA = (fechado.address() as net.AddressInfo).port;
await new Promise<void>((r) => fechado.close(() => r()));

const ENV = {
  PINBANK_SAIDA_1: `http://quattro:${SENHA_A}@127.0.0.1:${PA}`,
  PINBANK_SAIDA_2: `http://quattro:${SENHA_B}@127.0.0.1:${PB}`,
};

/* ─────────────────────────── os casos ─────────────────────────── */
async function casos(mod: Modulo, rotulo: string): Promise<Map<string, boolean>> {
  const { lerProxies, requisicaoPinbank, buscarPinbank, provarSaidas, esquecerFalhas, ErroSaida } = mod;
  const r: Map<string, boolean> = new Map();
  const caso = (nome: string, ok: boolean, detalhe = "") => {
    r.set(nome, ok);
    if (rotulo === "real") console.log(`${ok ? "PASSOU" : "FALHOU"}  ${nome}${detalhe ? `  ← ${detalhe}` : ""}`);
  };
  const erro = async (f: () => Promise<unknown>) => {
    try {
      await f();
      return null;
    } catch (e) {
      return e as InstanceType<typeof ErroSaida>;
    }
  };
  const reset = () => {
    esquecerFalhas();
    A.estado.modo = "ok";
    B.estado.modo = "ok";
    for (const k of Object.keys(recebidos)) delete recebidos[k];
  };

  // 1. As variáveis
  caso("variáveis: nenhuma PINBANK_SAIDA_<n> = lista vazia (saída direta)", lerProxies({}).length === 0);
  const ps = lerProxies(ENV);
  caso("variáveis: _1 e _2, nessa ordem", ps.length === 2 && ps[0].variavel === "PINBANK_SAIDA_1" && ps[1].variavel === "PINBANK_SAIDA_2");
  caso("variáveis: o rótulo é só IP:porta", ps.every((p) => !p.rotulo.includes(SENHA_A) && !p.rotulo.includes(SENHA_B) && /^127\.0\.0\.1:\d+$/.test(p.rotulo)));
  const ruins = [
    { PINBANK_SAIDA_1: `ftp://quattro:${SENHA_A}@127.0.0.1:1` },
    { PINBANK_SAIDA_1: `http://127.0.0.1:1` },
    { PINBANK_SAIDA_1: `http://quattro:${SENHA_A}@127.0.0.1` },
    { PINBANK_SAIDA_1: `isto não é ${SENHA_A} url` },
    { PINBANK_SAIDA_1: ENV.PINBANK_SAIDA_1, PINBANK_SAIDA_2: ENV.PINBANK_SAIDA_1 },
  ];
  const msgs = ruins.map((env) => {
    try {
      lerProxies(env);
      return null;
    } catch (e) {
      return e as InstanceType<typeof ErroSaida>;
    }
  });
  caso("variáveis: valor ruim é ERRO nomeado (configuracao), nunca ignorado", msgs.every((e) => e?.fase === "configuracao" && /PINBANK_SAIDA_[12]/.test(e.message)),
    msgs.map((e) => e?.message).join(" / "));
  caso("variáveis: a mensagem de erro NÃO ecoa a senha", msgs.every((e) => e && !e.message.includes(SENHA_A)));

  // 2. O caminho feliz e as trocas na FASE 1
  reset();
  let res = await requisicaoPinbank({ url: URL_DESTINO("/ok"), proxies: ps, caDestino: CA });
  caso("(h0) os dois no ar → vai pelo 1, sem tentativa", res.status === 200 && res.via === ps[0].rotulo && res.tentativas.length === 0, `${res.status} ${res.via}`);
  res = await requisicaoPinbank({ url: URL_DESTINO("/ok"), metodo: "POST", corpo: '{"valor":"1234.56"}', cabecalhos: { "content-type": "application/json" }, proxies: ps, caDestino: CA });
  const eco = JSON.parse(res.corpo.toString());
  caso("(h0b) POST com corpo íntegro pelo túnel e o Host certo", eco.metodo === "POST" && eco.corpo === '{"valor":"1234.56"}' && eco.host === `${HOST}:${PORTA_DESTINO}`, JSON.stringify(eco));

  reset();
  const fora = [{ ...ps[0], rotulo: `127.0.0.1:${PFECHADA}`, porta: PFECHADA }, ps[1]];
  res = await requisicaoPinbank({ url: URL_DESTINO("/ok"), proxies: fora, caDestino: CA });
  caso("(h) servidor 1 recusando conexão → vai pelo 2", res.status === 200 && res.via === ps[1].rotulo && res.tentativas.length === 1);
  res = await requisicaoPinbank({ url: URL_DESTINO("/ok"), proxies: fora, caDestino: CA });
  caso("(h2) logo depois, o 2 vem primeiro (o 1 em quarentena)", res.via === ps[1].rotulo && res.tentativas.length === 0);

  reset();
  A.estado.modo = "travado";
  const t0 = Date.now();
  res = await requisicaoPinbank({ url: URL_DESTINO("/ok"), proxies: ps, caDestino: CA, timeoutConexaoMs: 600 });
  caso("(h3) servidor 1 travado → tempo esgotado → vai pelo 2", res.via === ps[1].rotulo && Date.now() - t0 < 3000 && /tempo esgotado/.test(res.tentativas[0]?.motivo ?? ""));

  reset();
  A.estado.modo = "407";
  res = await requisicaoPinbank({ url: URL_DESTINO("/ok"), proxies: ps, caDestino: CA });
  caso("(h4) servidor 1 responde 407 → vai pelo 2", res.via === ps[1].rotulo && /407/.test(res.tentativas[0]?.motivo ?? ""));

  // 3. A FRONTEIRA: depois de o pedido sair, nunca repetir
  reset();
  const bAntes = B.estado.connects;
  res = await requisicaoPinbank({ url: URL_DESTINO("/erro500"), proxies: ps, caDestino: CA });
  caso("(i) a Pinbank responde 500 → volta o 500 e o 2 NÃO é tentado", res.status === 500 && res.via === ps[0].rotulo && B.estado.connects === bAntes);

  reset();
  let e = await erro(() => requisicaoPinbank({ url: URL_DESTINO("/derruba"), metodo: "POST", corpo: "x", proxies: ps, caDestino: CA }));
  caso("(i2) caiu DEPOIS de enviar → 'apos_envio' e a Pinbank recebeu UMA vez", e?.fase === "apos_envio" && recebidos["/derruba"] === 1,
    `fase=${e?.fase} recebidos=${recebidos["/derruba"]}`);

  reset();
  const dois = [{ ...ps[0], rotulo: `127.0.0.1:${PFECHADA}`, porta: PFECHADA }, { ...ps[1], rotulo: "127.0.0.1:1", porta: 1 }];
  e = await erro(() => requisicaoPinbank({ url: URL_DESTINO("/ok"), proxies: dois, caDestino: CA }));
  caso("(i3) os dois fora → 'conexao', nada chegou à Pinbank, sem senha na mensagem", e?.fase === "conexao" && !recebidos["/ok"] && !!e && !e.message.includes(SENHA_A) && !e.message.includes(SENHA_B));

  reset();
  const aAntes = A.estado.connects;
  e = await erro(() => requisicaoPinbank({ url: "https://example.com/", proxies: ps, caDestino: CA }));
  caso("(i5) destino fora da lista → 'configuracao' e nenhum servidor é contatado", e?.fase === "configuracao" && A.estado.connects === aAntes);
  e = await erro(() => requisicaoPinbank({ url: `http://${HOST}:${PORTA_DESTINO}/ok`, proxies: ps, caDestino: CA }));
  caso("(i6) http:// (sem TLS) → 'configuracao'", e?.fase === "configuracao");

  // 4. A porta única para um GET (a chave pública do webhook usa esta)
  reset();
  let diretas = 0;
  const fetchDireto = (async () => {
    diretas++;
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  const g = await buscarPinbank(URL_DESTINO("/ok"), { env: ENV, fetchDireto, caDestino: CA });
  caso("(g1) com PINBANK_SAIDA_<n> → sai por um servidor, nunca direto", g.via === ps[0].rotulo && diretas === 0);
  const gd = await buscarPinbank(URL_DESTINO("/ok"), { env: {}, fetchDireto });
  caso("(g2) sem PINBANK_SAIDA_<n> → direto, e DIZ que foi direto", gd.via === "direto" && diretas === 1);
  reset();
  diretas = 0;
  const envFora = {
    PINBANK_SAIDA_1: `http://quattro:${SENHA_A}@127.0.0.1:${PFECHADA}`,
    PINBANK_SAIDA_2: `http://quattro:${SENHA_B}@127.0.0.1:1`,
  };
  e = await erro(() => buscarPinbank(URL_DESTINO("/ok"), { env: envFora, fetchDireto, caDestino: CA }));
  caso("(g3) com os dois servidores fora → FALHA; nunca cai na saída direta", e?.fase === "conexao" && diretas === 0, `fase=${e?.fase} diretas=${diretas}`);
  e = await erro(() => buscarPinbank("https://example.com/", { env: {}, fetchDireto }));
  caso("(g4) URL fora da lista (até vinda de variável) → recusada antes da rede", e?.fase === "configuracao" && diretas === 0);

  // 5. A prova dos IPs
  reset();
  const prova = await provarSaidas([ps[0], { ...ps[1], rotulo: "127.0.0.1:1", porta: 1 }], { urlEco: URL_DESTINO("/ip"), caDestino: CA, timeoutMs: 2000 });
  caso("(p) cada servidor é provado SOZINHO: o 1 mostra o IP, o 2 aparece fora (não encoberto)",
    prova[0]?.ip === "198.51.100.10" && !prova[1]?.ip && !!prova[1]?.erro && prova[1]?.variavel === "PINBANK_SAIDA_2", JSON.stringify(prova));
  return r;
}

/* ─────────────────────────── real + defeitos plantados ─────────────────────────── */
const original = fs.readFileSync(ARQUIVO, "utf8");
const real = await casos((await import(pathToFileURL(ARQUIVO).href)) as Modulo, "real");
let falhas = [...real.values()].filter((v) => !v).length;

const PLANTAS: Array<{ nome: string; caso: string; de: string | RegExp; para: string }> = [
  {
    nome: "repete pelo outro servidor um pedido que já saiu",
    caso: "(i2) caiu DEPOIS de enviar → 'apos_envio' e a Pinbank recebeu UMA vez",
    de: "const r = await enviar(sock, u, p, prazo);",
    para: "const r = await enviar(sock, u, p, prazo).catch(() => requisicaoPinbank({ ...p, proxies: proxies.filter((x) => x.rotulo !== via) }));",
  },
  {
    nome: "sai direto quando os servidores caem",
    caso: "(g3) com os dois servidores fora → FALHA; nunca cai na saída direta",
    de: "const r = await requisicaoPinbank({ url, proxies, timeoutTotalMs: timeoutMs, caDestino: o.caDestino });",
    para: "const r = await requisicaoPinbank({ url, proxies, timeoutTotalMs: timeoutMs, caDestino: o.caDestino }).catch(async () => { const d = await (o.fetchDireto ?? fetch)(url); return { status: d.status, corpo: Buffer.from(await d.text()), via: \"direto\" }; });",
  },
  {
    nome: "ecoa o valor (com a senha) na mensagem",
    caso: "variáveis: a mensagem de erro NÃO ecoa a senha",
    de: "throw new ErroSaida(\"configuracao\", `${variavel}: não é uma URL.`);",
    para: "throw new ErroSaida(\"configuracao\", `${variavel}: não é uma URL: ${item}`);",
  },
  {
    nome: "esquece a lista de destinos",
    caso: "(i5) destino fora da lista → 'configuracao' e nenhum servidor é contatado",
    de: /if \(!destinoPermitido\(u\.hostname\)\) throw[^\n]*\n/,
    para: "",
  },
];
for (const planta of PLANTAS) {
  const alterado = original.replace(planta.de, planta.para);
  if (alterado === original) {
    console.log(`FALHOU  (defeito plantado) "${planta.nome}": a substituição não aconteceu — a planta envelheceu`);
    falhas++;
    continue;
  }
  const arq = path.join(tmp, `saida-plantada-${PLANTAS.indexOf(planta)}.ts`);
  fs.writeFileSync(arq, alterado);
  const r = await casos((await import(pathToFileURL(arq).href)) as Modulo, "planta");
  const pego = r.get(planta.caso) === false;
  console.log(`${pego ? "PASSOU" : "FALHOU"}  (defeito plantado) "${planta.nome}" derruba: ${planta.caso}`);
  if (!pego) falhas++;
}

destino.close();
A.srv.close();
B.srv.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${falhas === 0 ? "OK" : "FALHOU"}: saída fixa — ${real.size} casos, ${PLANTAS.length} defeitos plantados, ${falhas} falha(s).`);
process.exit(falhas > 0 ? 1 : 0);
