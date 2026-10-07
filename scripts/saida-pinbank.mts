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
 * ⚠️ TODA guarda só conta depois de reprovar: no fim, DEFEITOS PLANTADOS
 * (cópias alteradas do arquivo) — repetir depois do envio, sair direto quando
 * os servidores caem, ecoar a senha, esquecer a lista de destinos, aceitar
 * certificado de qualquer um, esquecer o prazo total, enviar sem prazo, e a
 * reserva direta escapar do que é público — e cada um tem de derrubar o caso
 * que o nomeia.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import https from "node:https";
import tls from "node:tls";
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
const assinar = (nome: string, san: string) => {
  ossl("req", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:P-256", "-nodes", "-subj", `/CN=${nome}`,
    "-keyout", `${nome}.key`, "-out", `${nome}.csr`);
  fs.writeFileSync(path.join(tmp, `${nome}.cnf`), `subjectAltName=${san}\nextendedKeyUsage=serverAuth\n`);
  ossl("x509", "-req", "-in", `${nome}.csr`, "-CA", "ca.pem", "-CAkey", "ca.key", "-CAcreateserial", "-days", "2",
    "-extfile", `${nome}.cnf`, "-out", `${nome}.pem`);
  return { key: fs.readFileSync(path.join(tmp, `${nome}.key`)), cert: fs.readFileSync(path.join(tmp, `${nome}.pem`)) };
};
// O impostor: certificado VÁLIDO da mesma CA, mas para OUTRO nome.
const IMPOSTOR = assinar("impostor", "DNS:impostor.example");
// O proxy por TLS: certificado para o IP (é por IP que a variável o aponta).
const PROXY_TLS = assinar("proxy-tls", "IP:127.0.0.1");
// Uma CA que NÃO assinou nada disso.
ossl("req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:P-256", "-nodes", "-days", "2",
  "-subj", "/CN=Outra CA", "-keyout", "ca2.key", "-out", "ca2.pem",
  "-addext", "basicConstraints=critical,CA:TRUE", "-addext", "keyUsage=critical,keyCertSign");
const CA2 = fs.readFileSync(path.join(tmp, "ca2.pem"));

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
      } else if (caminho === "/trava") {
        // o pedido CHEGOU e a resposta nunca vem
      } else if (caminho === "/lento") {
        setTimeout(() => res.writeHead(200).end("lento"), 1200);
      } else {
        res.writeHead(404).end();
      }
    });
  },
);
await new Promise<void>((r) => destino.listen(0, "127.0.0.1", r));
const PORTA_DESTINO = (destino.address() as net.AddressInfo).port;
const URL_DESTINO = (p: string) => `https://${HOST}:${PORTA_DESTINO}${p}`;
let recebidosImpostor = 0;
const impostor = https.createServer(IMPOSTOR, (_req, res) => {
  recebidosImpostor++;
  res.writeHead(200).end("impostor");
});
await new Promise<void>((r) => impostor.listen(0, "127.0.0.1", r));
const PORTA_IMPOSTOR = (impostor.address() as net.AddressInfo).port;

/* ─────────────────────────── proxies CONNECT de mentira ─────────────────────────── */
// ok · 407 · travado (aceita o TCP e cala) · lento (o 200 do túnel demora
// 800 ms) · impostor (desvia o túnel para um servidor com certificado de outro nome)
type Modo = "ok" | "407" | "travado" | "lento" | "impostor";
function proxyFalso(senha: string, tlsOpts?: tls.TlsOptions) {
  const estado = { modo: "ok" as Modo, connects: 0 };
  const tratar = (cli: net.Socket) => {
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
      const porta = estado.modo === "impostor" ? PORTA_IMPOSTOR : Number(m[2]);
      const alvo = net.connect({ host: "127.0.0.1", port: porta }, () => {
        const abrir = () => {
          cli.write("HTTP/1.1 200 Connection established\r\n\r\n");
          alvo.pipe(cli);
          cli.pipe(alvo);
        };
        if (estado.modo === "lento") setTimeout(abrir, 800);
        else abrir();
      });
      alvo.on("error", () => cli.destroy());
      cli.on("close", () => alvo.destroy());
    };
    cli.on("data", aoDados);
  };
  const srv = tlsOpts ? tls.createServer(tlsOpts, tratar) : net.createServer(tratar);
  return { srv, estado };
}
const A = proxyFalso(SENHA_A);
const B = proxyFalso(SENHA_B);
const T = proxyFalso(SENHA_A, PROXY_TLS);
await new Promise<void>((r) => A.srv.listen(0, "127.0.0.1", r));
await new Promise<void>((r) => B.srv.listen(0, "127.0.0.1", r));
await new Promise<void>((r) => T.srv.listen(0, "127.0.0.1", r));
const PA = (A.srv.address() as net.AddressInfo).port;
const PB = (B.srv.address() as net.AddressInfo).port;
const PT = (T.srv.address() as net.AddressInfo).port;
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
  const { lerProxies, provarSaidas, esquecerFalhas, ErroSaida, URL_CHAVE_PUBLICA } = mod;
  const r: Map<string, boolean> = new Map();
  // TUDO o que a porta diz para fora — mensagem, tentativa, log — passa por
  // aqui, e o caso (v) exige que nada disso traga a senha.
  const textos: string[] = [];
  const anotar = <T,>(pr: Promise<T>): Promise<T> =>
    pr.then(
      (x) => (textos.push(JSON.stringify(x, (k, v) => (k === "corpo" ? undefined : v))), x),
      (e) => {
        textos.push(String(e?.message), JSON.stringify(e?.tentativas ?? []));
        throw e;
      },
    );
  const requisicaoPinbank: Modulo["requisicaoPinbank"] = (p) => anotar(mod.requisicaoPinbank(p));
  const buscarPinbank: Modulo["buscarPinbank"] = (u, o) => anotar(mod.buscarPinbank(u, o));
  const avisoOriginal = console.warn;
  console.warn = (...a: unknown[]) => void textos.push(a.map(String).join(" "));
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
    T.estado.modo = "ok";
    recebidosImpostor = 0;
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

  reset();
  const bAntes7 = B.estado.connects;
  const t7 = Date.now();
  e = await comTeto(6000, () => erro(() => requisicaoPinbank({ url: URL_DESTINO("/trava"), proxies: ps, caDestino: CA, timeoutTotalMs: 2500 })));
  caso("(i7) a Pinbank recebe e não responde → 'apos_envio' no prazo TOTAL, sem tentar o 2",
    e?.fase === "apos_envio" && Date.now() - t7 < 4500 && recebidos["/trava"] === 1 && B.estado.connects === bAntes7,
    `fase=${e?.fase} ms=${Date.now() - t7} recebidos=${recebidos["/trava"]}`);

  reset();
  A.estado.modo = "lento";
  e = await erro(() => requisicaoPinbank({ url: URL_DESTINO("/lento"), proxies: [ps[0]], caDestino: CA, timeoutTotalMs: 1500 }));
  caso("(i8) túnel que só abriria perto do fim do prazo → o pedido NÃO sai ('conexao'), em vez de sair e estourar depois",
    e?.fase === "conexao" && !recebidos["/lento"], `fase=${e?.fase} recebidos=${recebidos["/lento"]}`);

  // 3b. O TLS com a Pinbank é conferido de verdade (o proxy não vê nem troca o conteúdo)
  reset();
  A.estado.modo = "impostor";
  res = await requisicaoPinbank({ url: URL_DESTINO("/ok"), proxies: ps, caDestino: CA });
  caso("(t1) túnel desviado para certificado de OUTRO nome → fase 1, vai pelo 2, o impostor não recebe nada",
    res.via === ps[1].rotulo && /TLS/.test(res.tentativas[0]?.motivo ?? "") && recebidosImpostor === 0,
    `via=${res.via} impostor=${recebidosImpostor} ${res.tentativas[0]?.motivo ?? ""}`);
  reset();
  e = await erro(() => requisicaoPinbank({ url: URL_DESTINO("/ok"), proxies: ps }));
  caso("(t2) cadeia que o Node não reconhece → 'conexao' nos dois, nada chegou à Pinbank",
    e?.fase === "conexao" && e.tentativas.length === 2 && !recebidos["/ok"], `fase=${e?.fase}`);

  // 3c. TLS até o PROXY (https:// + a CA fixada)
  reset();
  const psTls = lerProxies({ PINBANK_SAIDA_1: `https://quattro:${SENHA_A}@127.0.0.1:${PT}` });
  res = await requisicaoPinbank({ url: URL_DESTINO("/ok"), proxies: psTls, caDestino: CA, caProxy: CA });
  caso("(x1) proxy https:// com a CA fixada → túnel por TLS até o proxy", res.status === 200 && res.via === psTls[0].rotulo && psTls[0].tls);
  res = await requisicaoPinbank({ url: URL_DESTINO("/ok"), proxies: [psTls[0], ps[1]], caDestino: CA, caProxy: CA2 });
  caso("(x2) proxy https:// cujo certificado a CA fixada não reconhece → fase 1, vai pelo outro",
    res.via === ps[1].rotulo && res.tentativas.length === 1);
  const tAntes = T.estado.connects;
  e = await erro(() => requisicaoPinbank({ url: URL_DESTINO("/ok"), proxies: psTls, caDestino: CA }));
  caso("(x3) proxy https:// sem PINBANK_SAIDA_CA → 'configuracao', nada é tentado", e?.fase === "configuracao" && T.estado.connects === tAntes && tAntes >= 1);

  // 3d. Os dois respondendo 407 — o caso que mais tenta ecoar o cabeçalho
  reset();
  A.estado.modo = "407";
  B.estado.modo = "407";
  e = await erro(() => requisicaoPinbank({ url: URL_DESTINO("/ok"), proxies: ps, caDestino: CA }));
  caso("(i9) os dois recusam a senha (407) → 'conexao', nada chegou à Pinbank", e?.fase === "conexao" && e.tentativas.length === 2 && !recebidos["/ok"]);

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
  // A reserva direta, SÓ para o que é público (a chave do webhook).
  reset();
  diretas = 0;
  const gp = await buscarPinbank(URL_CHAVE_PUBLICA, { env: envFora, fetchDireto, publico: true });
  caso("(g5) chave PÚBLICA com os dois servidores fora → reserva direta, e DIZ isso", gp.via === "direto-reserva" && diretas === 1, gp.via);
  const gc = await buscarPinbank(URL_CHAVE_PUBLICA, { env: { PINBANK_SAIDA_1: `lixo ${SENHA_A}` }, fetchDireto, publico: true });
  caso("(g6) chave PÚBLICA com a variável ilegível → reserva direta", gc.via === "direto-reserva" && diretas === 2, gc.via);
  e = await erro(() => buscarPinbank(URL_DESTINO("/ok"), { env: envFora, fetchDireto, publico: true }));
  caso("(g7) 'publico' numa URL fora de PUBLICOS → recusado antes da rede", e?.fase === "configuracao" && diretas === 2 && !recebidos["/ok"]);

  // 5. A prova dos IPs
  reset();
  const prova = await provarSaidas([ps[0], { ...ps[1], rotulo: "127.0.0.1:1", porta: 1 }], { urlEco: URL_DESTINO("/ip"), caDestino: CA, timeoutMs: 2000 });
  caso("(p) cada servidor é provado SOZINHO: o 1 mostra o IP, o 2 aparece fora (não encoberto)",
    prova[0]?.ip === "198.51.100.10" && !prova[1]?.ip && !!prova[1]?.erro && prova[1]?.variavel === "PINBANK_SAIDA_2", JSON.stringify(prova));
  for (const x of prova) textos.push(JSON.stringify(x));

  // 6. Nada do que a porta disse para fora traz a credencial
  console.warn = avisoOriginal;
  const b64 = (t: string) => Buffer.from(t).toString("base64");
  const segredos = [SENHA_A, SENHA_B, b64(`quattro:${SENHA_A}`), b64(`quattro:${SENHA_B}`), "Basic "];
  const vazou = textos.filter((t) => segredos.some((x) => t.includes(x)));
  caso("(v) nenhuma mensagem, tentativa, resultado ou log traz a senha, o base64 dela ou 'Basic '",
    textos.length >= 20 && vazou.length === 0, vazou[0]?.slice(0, 120) ?? `${textos.length} textos`);
  return r;
}

/** O caso que poderia ficar pendurado tem teto: estourou, devolve "TETO" (e o caso reprova). */
async function comTeto<T>(ms: number, f: () => Promise<T>): Promise<T | "TETO"> {
  let timer: NodeJS.Timeout | undefined;
  const teto = new Promise<"TETO">((r) => {
    timer = setTimeout(() => r("TETO"), ms);
    timer.unref();
  });
  try {
    return await Promise.race([f(), teto]);
  } finally {
    clearTimeout(timer);
  }
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
    nome: "aceita o certificado de qualquer um",
    caso: "(t1) túnel desviado para certificado de OUTRO nome → fase 1, vai pelo 2, o impostor não recebe nada",
    de: "servername: destino, ca: o.caDestino,",
    para: "servername: destino, ca: o.caDestino, rejectUnauthorized: false,",
  },
  {
    nome: "esquece o prazo total depois de enviar",
    caso: "(i7) a Pinbank recebe e não responde → 'apos_envio' no prazo TOTAL, sem tentar o 2",
    de: /(tempo total esgotado[^\n]*\)\)), restante\);/,
    para: "$1, restante * 1000);",
  },
  {
    nome: "manda o pedido sem reserva de prazo",
    caso: "(i8) túnel que só abriria perto do fim do prazo → o pedido NÃO sai ('conexao'), em vez de sair e estourar depois",
    de: "const minEnvio = p.minEnvioMs ?? 1_000;",
    para: "const minEnvio = p.minEnvioMs ?? 0;",
  },
  {
    nome: "põe o cabeçalho de autenticação na mensagem do 407",
    caso: "(v) nenhuma mensagem, tentativa, resultado ou log traz a senha, o base64 dela ou 'Basic '",
    de: "return falhar(`o proxy recusou o túnel: ${linha.trim()}`);",
    para: "return falhar(`o proxy recusou o túnel: ${linha.trim()} (${proxy.autorizacao})`);",
  },
  {
    nome: "a reserva direta vale sem pedir 'publico'",
    caso: "(g3) com os dois servidores fora → FALHA; nunca cai na saída direta",
    de: /if \(!o\.publico\) throw e;/g,
    para: "",
  },
  {
    nome: "qualquer URL vira pública",
    caso: "(g7) 'publico' numa URL fora de PUBLICOS → recusado antes da rede",
    de: "if (o.publico && !PUBLICOS.includes(url)) {",
    para: "if (false) {",
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
impostor.close();
A.srv.close();
B.srv.close();
T.srv.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${falhas === 0 ? "OK" : "FALHOU"}: saída fixa — ${real.size} casos, ${PLANTAS.length} defeitos plantados, ${falhas} falha(s).`);
process.exit(falhas > 0 ? 1 : 0);
