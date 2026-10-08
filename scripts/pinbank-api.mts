/**
 * O CLIENTE DA API DA PINBANK — a guarda de COMPORTAMENTO (`npm run pinbank-api`).
 *
 * Dirige `src/lib/pinbank/api.ts` (token OAuth2 + método `ExtratoPosEncrypted`)
 * contra uma "Pinbank" HTTPS local, por um proxy CONNECT de mentira com senha —
 * o mesmo caminho da produção (a porta `requisicaoPinbank`), sem rede e sem a
 * credencial de verdade. A "Pinbank" daqui abre o pedido com uma implementação
 * PRÓPRIA da cifra (node:crypto direto), confere os cabeçalhos e o `Data`, e
 * responde cifrado nos formatos que a doc permite ler.
 *
 * A cifra também é conferida contra vetores do `openssl enc` (literais, gerados
 * fora deste código): duas implementações independentes, para a guarda não
 * concordar consigo mesma.
 *
 * ⚠️ TODA guarda só conta depois de reprovar: no fim, DEFEITOS PLANTADOS em
 * cópias de `api.ts`, `cifra.ts` e `core/pinbank/extrato-pos.ts`, e cada um
 * tem de derrubar o caso que o nomeia.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import https from "node:https";
import { createCipheriv, createDecipheriv } from "node:crypto";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

type ModApi = typeof import("../src/lib/pinbank/api.ts");
type ModCifra = typeof import("../src/lib/pinbank/cifra.ts");
type ModCore = typeof import("../src/core/pinbank/extrato-pos.ts");
const ARQ_API = path.resolve("src/lib/pinbank/api.ts");
const ARQ_CIFRA = path.resolve("src/lib/pinbank/cifra.ts");
const ARQ_CORE = path.resolve("src/core/pinbank/extrato-pos.ts");

const HOST = "teste.pinbank.com.br";
const SENHA_PROXY = "senhaProxy0123456789abcdef0123456789ab";
const USUARIO = "usuario-teste";
const CHAVE = "chaveDeTeste0123"; // 16 bytes — o tamanho do KeyValue real
const ORIGEM = "origem-teste";
const CANAL = 1919;

/* Vetores do `openssl enc -aes-128-cbc -K <hex de chaveDeTeste0123> -iv 0…0 -base64 -A`. */
const ANCORAS: Array<[string, string]> = [
  ['{"CodigoCanal":47,"CodigoCliente":3510}', "xnxaic3mRXGRUAsNRHKOwjMkct9YRHVPszdXREBiHF6i4qzIYqRAypHBOu2Zedxw"],
  ["Manutenção — ação", "xWrobJ5YN2UqJru5aTcOY7JQZet9LilQaMWolm0XEGM="],
  ["", "/X4qxxWA7w+EbiNaGcsW4A=="],
];

/* A cifra da "Pinbank": node:crypto direto, sem passar pelo código auditado. */
const IV = Buffer.alloc(16, 0);
const cifrar = (t: string, k = CHAVE) => {
  const c = createCipheriv("aes-128-cbc", Buffer.from(k, "utf8"), IV);
  return Buffer.concat([c.update(t, "utf8"), c.final()]).toString("base64");
};
const decifrar = (b: string, k = CHAVE) => {
  const d = createDecipheriv("aes-128-cbc", Buffer.from(k, "utf8"), IV);
  return Buffer.concat([d.update(Buffer.from(b, "base64")), d.final()]).toString("utf8");
};

/* ─────────────────────────── a CA e a "Pinbank" de teste ─────────────────────────── */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pinbank-api-"));
const ossl = (...a: string[]) => execFileSync("openssl", a, { cwd: tmp, stdio: "ignore" });
ossl("req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:P-256", "-nodes", "-days", "2",
  "-subj", "/CN=CA de teste da API Pinbank", "-keyout", "ca.key", "-out", "ca.pem",
  "-addext", "basicConstraints=critical,CA:TRUE", "-addext", "keyUsage=critical,keyCertSign");
ossl("req", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:P-256", "-nodes", "-subj", `/CN=${HOST}`,
  "-keyout", "destino.key", "-out", "destino.csr");
fs.writeFileSync(path.join(tmp, "ext.cnf"), `subjectAltName=DNS:${HOST}\nextendedKeyUsage=serverAuth\n`);
ossl("x509", "-req", "-in", "destino.csr", "-CA", "ca.pem", "-CAkey", "ca.key", "-CAcreateserial", "-days", "2",
  "-extfile", "ext.cnf", "-out", "destino.pem");
const CA = fs.readFileSync(path.join(tmp, "ca.pem"));

/** A linha como a Pinbank manda — COM os dados pessoais que não podem passar. */
const PESSOAIS = {
  CpfCnpj: "12345678000199",
  CpfCnpjComprador: "98765432100",
  NomeRazaoSocialComprador: "Maria Compradora da Silva",
  NumeroCartao: "550209******4321",
  Submerchant: { Nome: "Sub Loja Ltda", CpfCnpj: "11222333000144" },
  CpfAgComercial: "55566677788",
  NomeAgComercial: "Agente Comercial Fulano",
  DadosExtra: "observação livre do lojista",
  SerialNumber: "SN-998877",
};
const VALORES_PESSOAIS = ["12345678000199", "98765432100", "Maria Compradora", "550209******4321", "Sub Loja", "11222333000144", "55566677788", "Agente Comercial", "observação livre", "SN-998877"];
const linha = (parcela: number) => ({
  IdTerminal: "PB-T-0042",
  CodigoCliente: 3510,
  Terminal: "Maquininha 42",
  Bandeira: "MASTERCARD",
  TipoCompra: "Crédito parcelado",
  NumeroParcela: parcela,
  NumeroTotalParcelas: 3,
  DataTransacao: "2026-10-05T14:22:10",
  DataFuturaPagamento: ["2026-11-04T00:00:00", "2026-12-04T00:00:00", "2027-01-04T00:00:00"][parcela - 1],
  DataCancelamento: "0001-01-01T00:00:00",
  CodAutorizAdquirente: "A1B2C3",
  NsuOperacao: 123456789,
  NsuOperacaoLoja: "L-77",
  ValorBruto: 100,
  ValorBrutoParcela: 33.33,
  ValorLiquidoRepasse: 32.17,
  ValorSplit: 0,
  IdStatus: "1",
  DescricaoStatus: "Aprovada",
  IdStatusPagamento: "2",
  DescricaoStatusPagamento: "Pendente",
  ValorTaxaAdm: 1.16,
  ValorTaxaMes: 0,
  CampoNovoQueAPinbankAcrescentou: "CPF 444.555.666-77",
  ...PESSOAIS,
});

type FormatoSrv = "envelope-cifrado" | "data-cifrado" | "aberto-erro" | "chave-errada" | "ecoa-senha" | "ecoa-senha-longa" | "erro-500" | "sem-lista" | "gigante";
const srv = {
  formato: "envelope-cifrado" as FormatoSrv,
  tokensValidos: new Set<string>(),
  emitidos: 0,
  hitsToken: 0,
  hitsMetodo: 0,
  ultimoPedido: null as null | Record<string, unknown>,
  ultimoCaminho: "",
  cabecalhos: [] as Record<string, string | string[] | undefined>[],
  corposMetodo: [] as string[],
};
const resetSrv = (formato: FormatoSrv = "envelope-cifrado") => {
  srv.formato = formato;
  srv.tokensValidos.clear();
  srv.emitidos = 0;
  srv.hitsToken = 0;
  srv.hitsMetodo = 0;
  srv.ultimoPedido = null;
  srv.ultimoCaminho = "";
  srv.cabecalhos = [];
  srv.corposMetodo = [];
};

const pinbank = https.createServer(
  { key: fs.readFileSync(path.join(tmp, "destino.key")), cert: fs.readFileSync(path.join(tmp, "destino.pem")) },
  (req, res) => {
    const caminho = new URL(req.url ?? "/", "https://x").pathname;
    let corpo = "";
    req.on("data", (c) => (corpo += c));
    req.on("end", () => {
      const json = (status: number, o: unknown) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(o));
      };
      srv.cabecalhos.push(req.headers);
      if (caminho === "/services/api/token") {
        srv.hitsToken++;
        const f = new URLSearchParams(corpo);
        if (req.headers["content-type"] !== "application/x-www-form-urlencoded") return json(415, { error: "unsupported" });
        if (f.get("username") !== USUARIO || f.get("password") !== CHAVE || f.get("grant_type") !== "password") {
          // Um eco que cruza o corte de 300 caracteres: o COMEÇO da senha cairia dentro.
          const eco = srv.formato === "ecoa-senha" ? ` (senha recebida: ${f.get("password")})`
            : srv.formato === "ecoa-senha-longa" ? ` ${"x".repeat(243)} senha: ${f.get("password")}` : "";
          return json(400, { error: "invalid_grant", error_description: `O usuário ou a senha estão incorretos.${eco}` });
        }
        const tok = `tok-${++srv.emitidos}`;
        srv.tokensValidos.add(tok);
        return json(200, { access_token: tok, token_type: "bearer", expires_in: 1800 });
      }
      if (caminho === "/services/api/ContaDigital/ExtratoPosEncrypted") {
        srv.hitsMetodo++;
        srv.ultimoCaminho = caminho;
        srv.corposMetodo.push(corpo);
        const auth = String(req.headers.authorization ?? "");
        const tok = auth.replace(/^bearer /, "");
        if (!auth.startsWith("bearer ") || !srv.tokensValidos.has(tok) || req.headers.username !== USUARIO
          || req.headers.requestorigin !== ORIGEM || req.headers["content-type"] !== "application/json") {
          return json(401, { Message: "Authorization has been denied for this request." });
        }
        let dados: Record<string, unknown>;
        try {
          dados = JSON.parse(decifrar(JSON.parse(corpo).Data.Json)) as Record<string, unknown>;
        } catch {
          return json(400, { Message: "Json inválido." });
        }
        srv.ultimoPedido = dados;
        const linhas = [linha(1), linha(2), linha(3)];
        if (srv.formato === "erro-500") return json(500, { Message: "Falha interna." });
        if (srv.formato === "sem-lista") return json(200, { Data: null, ResultCode: 2, Message: "Cliente sem permissão no canal." });
        if (srv.formato === "gigante") return json(200, { Data: { Json: cifrar(JSON.stringify({ Data: linhas, ResultCode: 0, Message: "x".repeat(1_500_000) })) } });
        if (srv.formato === "aberto-erro") {
          return json(200, { Data: null, ResultCode: 1, Message: "Erro de validação.", ValidationData: { ResultCode: 1, Message: "Erro", Errors: [{ FieldName: "DataInicial", ErrorMessage: "Data inicial inválida." }] } });
        }
        if (srv.formato === "data-cifrado") return json(200, { Data: { Json: cifrar(JSON.stringify(linhas)) }, ResultCode: 0, Message: "OK" });
        if (srv.formato === "chave-errada") return json(200, { Data: { Json: cifrar(JSON.stringify({ Data: linhas }), "outraChave012345") } });
        return json(200, { Data: { Json: cifrar(JSON.stringify({ Data: linhas, ResultCode: 0, Message: "Sucesso" })) } });
      }
      json(404, { Message: "Não encontrado." });
    });
  },
);
await new Promise<void>((r) => pinbank.listen(0, "127.0.0.1", r));
const PORTA = (pinbank.address() as net.AddressInfo).port;
const BASE = `https://${HOST}:${PORTA}/services`;

/* ─────────────────────────── o proxy CONNECT de mentira ─────────────────────────── */
const proxy = net.createServer((cli) => {
  cli.on("error", () => {});
  let buf = "";
  const aoDados = (d: Buffer) => {
    buf += d.toString("latin1");
    if (!buf.includes("\r\n\r\n")) return;
    cli.removeListener("data", aoDados);
    const [linhaReq, ...cab] = buf.split("\r\n");
    const auth = cab.find((c) => /^proxy-authorization:/i.test(c))?.split(/:\s*/)[1] ?? "";
    if (auth !== `Basic ${Buffer.from(`quattro:${SENHA_PROXY}`).toString("base64")}`) return void cli.end("HTTP/1.1 407 Proxy Authentication Required\r\n\r\n");
    const m = /^CONNECT ([^:]+):(\d+) HTTP/.exec(linhaReq);
    if (!m || m[1] !== HOST) return void cli.end("HTTP/1.1 403 Forbidden\r\n\r\n");
    const alvo = net.connect({ host: "127.0.0.1", port: Number(m[2]) }, () => {
      cli.write("HTTP/1.1 200 Connection established\r\n\r\n");
      alvo.pipe(cli);
      cli.pipe(alvo);
    });
    alvo.on("error", () => cli.destroy());
    cli.on("close", () => alvo.destroy());
  };
  cli.on("data", aoDados);
});
await new Promise<void>((r) => proxy.listen(0, "127.0.0.1", r));
const PP = (proxy.address() as net.AddressInfo).port;

/* ─────────────────────────── os casos ─────────────────────────── */
type Mods = { api: ModApi; cifra: ModCifra; core: ModCore };

async function casos(m: Mods, rotulo: string): Promise<Map<string, boolean>> {
  const r = new Map<string, boolean>();
  const saidas: string[] = []; // tudo que o código devolveu ou lançou — para a varredura do segredo
  const caso = (nome: string, ok: boolean, detalhe = "") => {
    r.set(nome, ok);
    if (rotulo === "real") console.log(`${ok ? "PASSOU" : "FALHOU"}  ${nome}${!ok && detalhe ? ` — ${detalhe}` : ""}`);
  };
  const erro = async (f: () => Promise<unknown>) => {
    try {
      saidas.push(JSON.stringify(await f()));
      return null;
    } catch (e) {
      saidas.push(String((e as Error).message));
      return e as Error & { etapa?: string; status?: number };
    }
  };
  const proxies = [{ rotulo: `127.0.0.1:${PP}`, variavel: "PINBANK_SAIDA_1", host: "127.0.0.1", porta: PP, tls: false, autorizacao: `Basic ${Buffer.from(`quattro:${SENHA_PROXY}`).toString("base64")}` }];
  const cred = { ambiente: "dev" as const, base: BASE, usuario: USUARIO, chave: CHAVE, origem: ORIGEM, canal: CANAL };
  const o = { credencial: cred, proxies, caDestino: CA };
  const filtro = { codigoCliente: 3510, de: "2026-10-01", ate: "2026-10-08", status: "Todos" as const, meio: "Todos" as const };

  /* (c1) a cifra bate com o openssl, e volta */
  const vetores = ANCORAS.map(([t, b]) => { try { return m.cifra.cifrarPinbank(t, CHAVE) === b && m.cifra.decifrarPinbank(b, CHAVE) === t; } catch { return false; } });
  caso("(c1) a cifra bate com os vetores do openssl (AES-128-CBC, IV zero, PKCS#7, base64) e volta", vetores.every(Boolean), JSON.stringify(vetores));
  let eC: Error | null = null;
  try { m.cifra.cifrarPinbank("x", "curta-15-bytes!"); } catch (e) { eC = e as Error; }
  caso("(c2) chave de tamanho errado é recusada dizendo o TAMANHO, nunca a chave", !!eC && /15 bytes/.test(eC.message) && !eC.message.includes("curta-15"), eC?.message);
  let eD: Error | null = null;
  try { m.cifra.decifrarPinbank(cifrar("{}", "outraChave012345"), CHAVE); } catch (e) { eD = e as Error; }
  caso("(c3) resposta cifrada com outra chave é recusada em palavras ('a chave … não confere')", !!eD && /não confere/.test(eD.message), eD?.message);

  /* (a) o caminho inteiro */
  m.api.esquecerTokensPinbank();
  resetSrv();
  let res = await m.api.consultarExtratoPos(filtro, o);
  saidas.push(JSON.stringify(res));
  caso("(a1) consulta: 3 parcelas, formato cifrado, pela saída fixa",
    res.resumo.linhas === 3 && res.formato === "cifrado" && res.via === `127.0.0.1:${PP}`, JSON.stringify({ l: res.resumo.linhas, f: res.formato, v: res.via }));
  caso("(a2) valores em CENTAVOS exatos (33,33 → 3333; 32,17 × 3 = 9651; taxa 1,16 × 3 = 348)",
    res.resposta.linhas[0].brutoParcelaCentavos === 3333 && res.resumo.liquidoRepasseCentavos === 9651 && res.resumo.taxaAdmCentavos === 348,
    JSON.stringify(res.resumo));
  caso("(a3) a data do repasse e a taxa chegam em todas as parcelas; a data VAZIA do .NET (0001-01-01) vira ausente",
    res.resumo.comDataDoRepasse === 3 && res.resumo.comTaxa === 3 && res.resposta.linhas.every((l) => l.dataCancelamento === null)
    && res.resumo.primeiroRepasse === "2026-11-04" && res.resumo.ultimoRepasse === "2027-01-04",
    JSON.stringify(res.resumo));
  const ped = srv.ultimoPedido ?? {};
  caso("(a4) o pedido que a Pinbank ABRIU tem o canal da credencial, o cliente, o dia inteiro em Brasília e os filtros",
    ped.CodigoCanal === CANAL && ped.CodigoCliente === 3510 && ped.DataInicial === "2026-10-01T00:00:00-03:00"
    && ped.DataFinal === "2026-10-08T23:59:59-03:00" && ped.Status === "Todos" && ped.MeioCaptura === "Todos" && ped.QuantidadeLinhasRetorno === 0,
    JSON.stringify(ped));
  const cabMetodo = srv.cabecalhos[srv.cabecalhos.length - 1] ?? {};
  caso("(a5) cabeçalhos do método: Authorization = token_type + access_token; UserName; RequestOrigin; JSON",
    cabMetodo.authorization === "bearer tok-1" && cabMetodo.username === USUARIO && cabMetodo.requestorigin === ORIGEM
    && cabMetodo["content-type"] === "application/json" && srv.ultimoCaminho.endsWith("/ExtratoPosEncrypted"), JSON.stringify(cabMetodo));
  // Só o que veio da Pinbank: `via` e `etapas` são nossos (a porta do proxy local é aleatória).
  const { via: _via, etapas: _etapas, ...daPinbank } = res;
  void _via; void _etapas;
  const texto = JSON.stringify(daPinbank);
  const vazou = VALORES_PESSOAIS.filter((v) => texto.includes(v)).concat(texto.includes("444.555") ? ["campo novo"] : []);
  caso("(a6) NENHUM dado pessoal sai (CPF/CNPJ, comprador, cartão, sub-loja, agente, texto livre, serial — nem o campo NOVO)", vazou.length === 0, vazou.join(", "));
  caso("(a7) a chave só vai no corpo do TOKEN: nenhum cabeçalho e nenhum corpo de método a carrega (nem em base64)",
    srv.cabecalhos.every((h) => !JSON.stringify(h).includes(CHAVE) && !JSON.stringify(h).includes(Buffer.from(CHAVE).toString("base64")))
    && srv.corposMetodo.every((c) => !c.includes(CHAVE)), "");

  /* (d) o token é reaproveitado */
  res = await m.api.consultarExtratoPos(filtro, o);
  saidas.push(JSON.stringify(res));
  caso("(d) a segunda consulta reaproveita o token (1 token, 2 chamadas ao método)", srv.hitsToken === 1 && srv.hitsMetodo === 2, `token=${srv.hitsToken} metodo=${srv.hitsMetodo}`);

  /* (e) o token do cache morreu antes da hora → um novo, UMA vez */
  srv.tokensValidos.clear();
  res = await m.api.consultarExtratoPos(filtro, o);
  saidas.push(JSON.stringify(res));
  caso("(e) token do cache recusado (401) → token novo e o pedido repete UMA vez, e dá certo",
    res.resumo.linhas === 3 && srv.hitsToken === 2 && srv.hitsMetodo === 4, `token=${srv.hitsToken} metodo=${srv.hitsMetodo}`);

  /* (g) token RECÉM-gerado recusado → erro, sem laço */
  m.api.esquecerTokensPinbank();
  resetSrv();
  let e = await erro(() => m.api.consultarExtratoPos(filtro, { ...o, credencial: { ...cred, origem: "origem-errada" } }));
  caso("(g) com token recém-gerado, 401 no método é RECUSA: sobe como erro 'metodo' 401, sem repetir",
    !!e && e.etapa === "metodo" && e.status === 401 && srv.hitsMetodo === 1 && srv.hitsToken === 1, `${e?.message} token=${srv.hitsToken} metodo=${srv.hitsMetodo}`);

  /* (f) a credencial recusada no token — e a Pinbank ecoando a senha */
  m.api.esquecerTokensPinbank();
  resetSrv("ecoa-senha");
  e = await erro(() => m.api.consultarExtratoPos(filtro, { ...o, credencial: { ...cred, chave: "senhaErrada01234" } }));
  caso("(f1) senha errada → erro 'token' 400 com o motivo da Pinbank, e o método nem é chamado",
    !!e && e.etapa === "token" && e.status === 400 && /incorretos/.test(e.message) && srv.hitsMetodo === 0, e?.message);
  caso("(f2) mesmo com a Pinbank ECOANDO a senha, a mensagem não a traz", !!e && !e.message.includes("senhaErrada01234"), e?.message);

  /* (h) só o Data veio cifrado */
  m.api.esquecerTokensPinbank();
  resetSrv("data-cifrado");
  res = await m.api.consultarExtratoPos(filtro, o);
  saidas.push(JSON.stringify(res));
  caso("(h) resposta com só o Data cifrado (código e mensagem por fora) também é lida", res.resumo.linhas === 3 && res.resposta.codigo === 0 && res.resposta.mensagem === "OK", JSON.stringify(res.resposta).slice(0, 200));

  /* (i) erro de validação, aberto */
  resetSrv("aberto-erro");
  res = await m.api.consultarExtratoPos(filtro, o);
  saidas.push(JSON.stringify(res));
  caso("(i) erro de validação aberto: o campo e o motivo chegam, e nenhuma linha", res.formato === "aberto" && res.resposta.linhas.length === 0
    && res.resposta.erros[0]?.campo === "DataInicial" && res.resposta.codigo === 1, JSON.stringify(res.resposta));

  /* (j) cifrado com outra chave */
  resetSrv("chave-errada");
  e = await erro(() => m.api.consultarExtratoPos(filtro, o));
  caso("(j) resposta que não abre com a nossa chave → erro 'resposta' dizendo que a chave não confere", !!e && e.etapa === "resposta" && /não confere/.test(e.message), e?.message);

  /* (k) filtro ruim não sai */
  resetSrv();
  e = await erro(() => m.api.consultarExtratoPos({ ...filtro, de: "2026-10-09", ate: "2026-10-01" }, o));
  const e2 = await erro(() => m.api.consultarExtratoPos({ ...filtro, de: "2026-08-01", ate: "2026-10-01" }, o));
  caso("(k) intervalo invertido ou maior que 31 dias é recusado ('pedido') ANTES da rede",
    !!e && e.etapa === "pedido" && !!e2 && e2.etapa === "pedido" && srv.hitsToken === 0 && srv.hitsMetodo === 0, `${e?.message} | ${e2?.message}`);

  /* (m) método fora da lista de leitura */
  resetSrv();
  e = await erro(() => m.api.chamarLeituraPinbank("PagamentoConta" as never, { Valor: 1 }, o));
  caso("(m) método fora da lista de LEITURA (ex.: PagamentoConta) é recusado antes da rede", !!e && e.etapa === "pedido" && srv.hitsToken === 0 && srv.hitsMetodo === 0, e?.message);

  /* (p) o prazo do token, com relógio controlado (1800 s − 60 s de folga) */
  m.api.esquecerTokensPinbank();
  resetSrv();
  let relogio = 1e9;
  const oR = { ...o, agora: () => relogio };
  await m.api.consultarExtratoPos(filtro, oR);
  relogio += 1_739_000;
  await m.api.consultarExtratoPos(filtro, oR);
  const antesDoFim = srv.hitsToken;
  relogio += 2_000;
  await m.api.consultarExtratoPos(filtro, oR);
  caso("(p) o token vale até 60 s antes do fim do prazo (1739 s: o mesmo; 1741 s: um novo)", antesDoFim === 1 && srv.hitsToken === 2, `antes=${antesDoFim} depois=${srv.hitsToken}`);

  /* (q) o cache é POR CREDENCIAL (base + usuário) */
  m.api.esquecerTokensPinbank();
  resetSrv();
  await m.api.consultarExtratoPos(filtro, o);
  e = await erro(() => m.api.consultarExtratoPos(filtro, { ...o, credencial: { ...cred, usuario: "outro-usuario" } }));
  caso("(q) outra credencial na mesma base pede o SEU token; o token da primeira nunca chega ao método com ela",
    !!e && e.etapa === "token" && srv.hitsToken === 2 && srv.hitsMetodo === 1, `${e?.message} token=${srv.hitsToken} metodo=${srv.hitsMetodo}`);

  /* (r) erro do servidor com token do cache NÃO é motivo para outro token */
  m.api.esquecerTokensPinbank();
  resetSrv();
  await m.api.consultarExtratoPos(filtro, o);
  srv.formato = "erro-500";
  e = await erro(() => m.api.consultarExtratoPos(filtro, o));
  caso("(r) 500 no método (token do cache) sobe como erro 'metodo' 500, sem token novo e sem repetir",
    !!e && e.etapa === "metodo" && e.status === 500 && srv.hitsToken === 1 && srv.hitsMetodo === 2, `${e?.message} token=${srv.hitsToken} metodo=${srv.hitsMetodo}`);

  /* (s) recusa sem Errors e sem lista: "zero parcelas" não é "sem vendas" */
  resetSrv("sem-lista");
  res = await m.api.consultarExtratoPos(filtro, o);
  saidas.push(JSON.stringify(res));
  caso("(s) resposta sem a lista Data (recusa sem Errors) sai com listaRecebida = false, código e mensagem",
    res.resposta.listaRecebida === false && res.resposta.linhas.length === 0 && res.resposta.codigo === 2 && /permissão/.test(res.resposta.mensagem ?? ""), JSON.stringify(res.resposta));

  /* (t) extrato maior que o teto: a leitura diz o que fazer */
  m.api.esquecerTokensPinbank();
  resetSrv("gigante");
  e = await erro(() => m.api.consultarExtratoPos(filtro, { ...o, maxBytesResposta: 1024 * 1024 }));
  caso("(t) resposta acima do teto → erro 'resposta' que diz que é consulta e manda pedir intervalo menor, sem repetir",
    !!e && e.etapa === "resposta" && /intervalo menor/.test(e.message) && srv.hitsMetodo === 1, `${e?.message} metodo=${srv.hitsMetodo}`);

  /* (u) chave de tamanho errado: o TAMANHO chega a quem lê a rota */
  resetSrv();
  e = await erro(() => m.api.consultarExtratoPos(filtro, { ...o, credencial: { ...cred, chave: "y".repeat(20) } }));
  const d = m.api.descreverErroApi(e);
  caso("(u) chave de 20 bytes → 'configuracao' com o tamanho (pela rota, não 'falha inesperada'), antes da rede",
    d.etapa === "configuracao" && /20 bytes/.test(d.motivo) && !d.motivo.includes("y".repeat(20)) && srv.hitsToken === 0, JSON.stringify(d));

  /* (f3) eco da senha cruzando o corte de 300 caracteres */
  m.api.esquecerTokensPinbank();
  resetSrv("ecoa-senha-longa");
  e = await erro(() => m.api.consultarExtratoPos(filtro, { ...o, credencial: { ...cred, chave: "senhaErrada01234" } }));
  caso("(f3) eco da senha que cruza o corte de 300 caracteres não deixa passar nem o COMEÇO dela",
    !!e && e.etapa === "token" && !e.message.includes("senhaErr"), e?.message);

  /* (w) o mapa congelado: nem código do próprio processo o redireciona */
  m.api.esquecerTokensPinbank();
  resetSrv();
  try { (m.api.METODOS_LEITURA as Record<string, string>).ExtratoPos = "CashOut/AprovarTed"; } catch { /* congelado: o esperado */ }
  e = await erro(() => m.api.consultarExtratoPos(filtro, o));
  caso("(w) o mapa de métodos não muda em execução: apontar ExtratoPos para CashOut não pega",
    !e && srv.ultimoCaminho.endsWith("/ContaDigital/ExtratoPosEncrypted") && srv.hitsMetodo === 1, `${e?.message} caminho=${srv.ultimoCaminho}`);

  /* (o) sem a saída fixa, não sai */
  resetSrv();
  e = await erro(() => m.api.consultarExtratoPos(filtro, { ...o, proxies: [] }));
  caso("(o) sem servidor da saída fixa a chamada é RECUSADA (nunca sai direto)", !!e && srv.hitsToken === 0 && srv.hitsMetodo === 0, e?.message);

  /* (l) a credencial pelas variáveis */
  const nomes = ["PINBANK_API_AMBIENTE", "PINBANK_API_USUARIO", "PINBANK_API_CHAVE", "PINBANK_API_ORIGEM", "PINBANK_CODIGO_CANAL"];
  const tentar = (env: Record<string, string>) => { try { return m.api.lerCredencialPinbank(env); } catch (x) { saidas.push((x as Error).message); return x as Error; } };
  const curta = tentar({ PINBANK_API_AMBIENTE: "dev", PINBANK_API_USUARIO: USUARIO, PINBANK_API_CHAVE: "z".repeat(20), PINBANK_API_ORIGEM: ORIGEM, PINBANK_CODIGO_CANAL: "1919" });
  const vazio = tentar({});
  const envOk = { PINBANK_API_AMBIENTE: "dev", PINBANK_API_USUARIO: USUARIO, PINBANK_API_CHAVE: CHAVE, PINBANK_API_ORIGEM: ORIGEM, PINBANK_CODIGO_CANAL: "1919" };
  const lida = tentar(envOk);
  const amb = tentar({ ...envOk, PINBANK_API_AMBIENTE: "https://evil.example" });
  const can = tentar({ ...envOk, PINBANK_CODIGO_CANAL: "abc" });
  caso("(l1) sem variáveis: o erro nomeia as CINCO", vazio instanceof Error && nomes.every((n) => vazio.message.includes(n)), (vazio as Error)?.message);
  caso("(l2) com as variáveis: dev → a base de dev da porta, canal numérico",
    !(lida instanceof Error) && lida.base === "https://dev.pinbank.com.br/services" && lida.canal === 1919, JSON.stringify(lida instanceof Error ? lida.message : { ...lida, chave: "•" }));
  caso("(l4) PINBANK_API_CHAVE com tamanho errado é recusada na LEITURA da credencial, dizendo o tamanho",
    curta instanceof Error && /20 bytes/.test(curta.message) && !curta.message.includes("z".repeat(20)), (curta as Error)?.message);
  caso("(l3) ambiente que não é dev/producao (ex.: uma URL) é recusado; canal não numérico também",
    amb instanceof Error && can instanceof Error && !amb.message.includes("evil"), `${(amb as Error)?.message} | ${(can as Error)?.message}`);

  /* (n) o segredo nunca sai */
  const todas = saidas.join("\n");
  caso("(n) nenhuma saída nem erro, de nenhum caso, traz a chave (nem em base64) ou a senha do proxy",
    !todas.includes(CHAVE) && !todas.includes(Buffer.from(CHAVE).toString("base64")) && !todas.includes(SENHA_PROXY) && !todas.includes("senhaErrada01234"), "");

  return r;
}

/* ─────────────────────────── real + defeitos plantados ─────────────────────────── */
const imp = async <T,>(arq: string) => (await import(pathToFileURL(arq).href)) as T;
const reais: Mods = { api: await imp<ModApi>(ARQ_API), cifra: await imp<ModCifra>(ARQ_CIFRA), core: await imp<ModCore>(ARQ_CORE) };
const real = await casos(reais, "real");
let falhas = [...real.values()].filter((v) => !v).length;

/* O núcleo sozinho (a planta de `core` não passa por api.ts, que importa o original). */
const casosCore = (core: ModCore) => {
  const r = new Map<string, boolean>();
  const t = JSON.stringify(core.lerRespostaExtratoPos({ Data: [linha(1)] }));
  r.set("(núcleo) a leitura por lista de permitidos não deixa passar dado pessoal", VALORES_PESSOAIS.every((v) => !t.includes(v)) && !t.includes("444.555"));
  const iso = "2026-11-04T00:00:00.1234567-03:00";
  const lida = core.lerRespostaExtratoPos({ Data: [{ ...linha(1), DataFuturaPagamento: iso, DataTransacao: "2026-10-05T14:22:10Z" }] }).linhas[0];
  r.set("(núcleo) data ISO com fração de segundo e fuso chega INTEIRA; texto que não é data vira ausente",
    lida.dataFuturaPagamento === iso && lida.dataTransacao === "2026-10-05T14:22:10Z"
    && core.lerRespostaExtratoPos({ Data: [{ ...linha(1), DataFuturaPagamento: "2026-11-04 e lixo" }] }).linhas[0].dataFuturaPagamento === null);
  r.set("(núcleo) sem a lista Data, listaRecebida = false; com a lista vazia, true",
    core.lerRespostaExtratoPos({ Data: null, ResultCode: 2 }).listaRecebida === false && core.lerRespostaExtratoPos({ Data: [] }).listaRecebida === true);
  return r;
};
for (const [nome, okc] of casosCore(reais.core)) {
  console.log(`${okc ? "PASSOU" : "FALHOU"}  ${nome}`);
  if (!okc) falhas++;
}

type Planta = { nome: string; arquivo: "api" | "cifra" | "core"; caso: string; de: string | RegExp; para: string; mais?: Array<[string, string]> };
const PLANTAS: Planta[] = [
  { nome: "repete o pedido também com token recém-gerado", arquivo: "api",
    caso: "(g) com token recém-gerado, 401 no método é RECUSA: sobe como erro 'metodo' 401, sem repetir",
    de: "if (r.status === 401 && !t.novo && tentativa === 0) {", para: "if (r.status === 401 && tentativa === 0) {" },
  { nome: "não reaproveita o token", arquivo: "api",
    caso: "(d) a segunda consulta reaproveita o token (1 token, 2 chamadas ao método)",
    de: "if (!forcar && guardado && guardado.expiraEm > agora())", para: "if (false)" },
  { nome: "manda a chave num cabeçalho", arquivo: "api",
    caso: "(a7) a chave só vai no corpo do TOKEN: nenhum cabeçalho e nenhum corpo de método a carrega (nem em base64)",
    de: "RequestOrigin: cred.origem,", para: "RequestOrigin: cred.origem,\n        KeyValue: cred.chave," },
  { nome: "a mensagem da Pinbank vai sem tirar o segredo", arquivo: "api",
    caso: "(f2) mesmo com a Pinbank ECOANDO a senha, a mensagem não a traz",
    de: "const limpo = semSegredo(msg, cred);", para: "const limpo = msg;" },
  { nome: "aceita um método que move dinheiro", arquivo: "api",
    caso: "(m) método fora da lista de LEITURA (ex.: PagamentoConta) é recusado antes da rede",
    de: 'ExtratoPos: "ContaDigital/ExtratoPos",', para: 'ExtratoPos: "ContaDigital/ExtratoPos",\n  PagamentoConta: "CashOut/PagamentoConta",',
    mais: [['"ContaDigital/ConsultarComprovante",', '"ContaDigital/ConsultarComprovante",\n  "CashOut/PagamentoConta",']] },
  { nome: "o mapa de métodos fica mutável em execução", arquivo: "api",
    caso: "(w) o mapa de métodos não muda em execução: apontar ExtratoPos para CashOut não pega",
    de: "export const METODOS_LEITURA = Object.freeze({", para: "export const METODOS_LEITURA = ({" },
  { nome: "o filtro não é conferido antes da rede", arquivo: "api",
    caso: "(k) intervalo invertido ou maior que 31 dias é recusado ('pedido') ANTES da rede",
    de: 'if (problemas.length) throw new ErroApiPinbank("pedido", problemas.join(" "));', para: "" },
  { nome: "o canal não vem da credencial", arquivo: "api",
    caso: "(a4) o pedido que a Pinbank ABRIU tem o canal da credencial, o cliente, o dia inteiro em Brasília e os filtros",
    de: "codigoCanal: filtro.codigoCanal ?? cred.canal", para: "codigoCanal: filtro.codigoCanal ?? 47" },
  { nome: "o ambiente vira URL livre", arquivo: "api",
    caso: "(l3) ambiente que não é dev/producao (ex.: uma URL) é recusado; canal não numérico também",
    de: 'if (ambiente !== "dev" && ambiente !== "producao") {', para: "if (false) {" },
  { nome: "IV aleatório (a Pinbank não abriria)", arquivo: "cifra",
    caso: "(c1) a cifra bate com os vetores do openssl (AES-128-CBC, IV zero, PKCS#7, base64) e volta",
    de: "const IV_ZERO = Buffer.alloc(16, 0);", para: "const IV_ZERO = Buffer.from(Array.from({ length: 16 }, (_, i) => i));" },
  { nome: "a chave vai na mensagem de tamanho errado", arquivo: "cifra",
    caso: "(c2) chave de tamanho errado é recusada dizendo o TAMANHO, nunca a chave",
    de: "throw new Error(`A chave da credencial Pinbank tem ${chave.length} bytes; a criptografia AES pede 16.`);",
    para: "throw new Error(`A chave da credencial Pinbank (${chave.toString()}) tem ${chave.length} bytes; a criptografia AES pede 16.`);" },
  { nome: "o prazo do token em segundos lido como milissegundos", arquivo: "api",
    caso: "(p) o token vale até 60 s antes do fim do prazo (1739 s: o mesmo; 1741 s: um novo)",
    de: "(segundos - folga) * 1000", para: "(segundos - folga)" },
  { nome: "o cache do token só pela base (sem o usuário)", arquivo: "api",
    caso: "(q) outra credencial na mesma base pede o SEU token; o token da primeira nunca chega ao método com ela",
    de: "const chave = `${cred.base}|${cred.usuario}`;", para: "const chave = `${cred.base}`;" },
  { nome: "qualquer erro do método pede token novo e repete", arquivo: "api",
    caso: "(r) 500 no método (token do cache) sobe como erro 'metodo' 500, sem token novo e sem repetir",
    de: "if (r.status === 401 && !t.novo && tentativa === 0) {", para: "if (r.status >= 400 && !t.novo && tentativa === 0) {" },
  { nome: "o estouro de tamanho sobe como falha de rede, sem dizer que é leitura", arquivo: "api",
    caso: "(t) resposta acima do teto → erro 'resposta' que diz que é consulta e manda pedir intervalo menor, sem repetir",
    de: 'if (e instanceof ErroSaida && e.fase === "apos_envio") {', para: "if (false) {" },
  { nome: "o erro da cifra sobe cru (a rota diria 'falha inesperada')", arquivo: "api",
    caso: "(u) chave de 20 bytes → 'configuracao' com o tamanho (pela rota, não 'falha inesperada'), antes da rede",
    de: 'throw new ErroApiPinbank("configuracao", semSegredo((e as Error).message, cred));', para: "throw e;" },
  { nome: "o segredo sai DEPOIS do corte em 300", arquivo: "api",
    caso: "(f3) eco da senha que cruza o corte de 300 caracteres não deixa passar nem o COMEÇO dela",
    de: "const limpo = semSegredo(msg, cred);\n  return `HTTP ${r.status}${limpo ? `: ${limpo.slice(0, 300)}` : \"\"}`;",
    para: "return semSegredo(`HTTP ${r.status}${msg ? `: ${msg.slice(0, 300)}` : \"\"}`, cred);" },
  { nome: "a chave de tamanho errado passa pela leitura da credencial", arquivo: "api",
    caso: "(l4) PINBANK_API_CHAVE com tamanho errado é recusada na LEITURA da credencial, dizendo o tamanho",
    de: "if (![16, 24, 32].includes(bytesDaChave)) {", para: "if (false) {" },
  { nome: "a data é cortada por tamanho (o fuso se perde)", arquivo: "core",
    caso: "(núcleo) data ISO com fração de segundo e fuso chega INTEIRA; texto que não é data vira ausente",
    de: "return ISO.test(s) ? s : null;", para: "return /^\\d{4}-\\d{2}-\\d{2}/.test(s) ? s.slice(0, 25) : null;" },
  { nome: "a lista ausente vira lista vazia", arquivo: "core",
    caso: "(núcleo) sem a lista Data, listaRecebida = false; com a lista vazia, true",
    de: "listaRecebida: Array.isArray(env.Data),", para: "listaRecebida: true," },
  { nome: "a leitura copia a linha inteira (lista de proibidos)", arquivo: "core",
    caso: "(núcleo) a leitura por lista de permitidos não deixa passar dado pessoal",
    de: "export function linhaDoExtratoPos(l: Record<string, unknown>): LinhaExtratoPos {\n  return {",
    para: "export function linhaDoExtratoPos(l: Record<string, unknown>): LinhaExtratoPos {\n  return {\n    ...(l as object),"
  },
];

const originais = { api: fs.readFileSync(ARQ_API, "utf8"), cifra: fs.readFileSync(ARQ_CIFRA, "utf8"), core: fs.readFileSync(ARQ_CORE, "utf8") };
for (const [i, p] of PLANTAS.entries()) {
  let alterado = originais[p.arquivo].replace(p.de, p.para);
  let envelheceu = alterado === originais[p.arquivo];
  for (const [de, para] of p.mais ?? []) {
    const antes = alterado;
    alterado = alterado.replace(de, para);
    if (alterado === antes) envelheceu = true;
  }
  if (envelheceu) {
    console.log(`FALHOU  (defeito plantado) "${p.nome}": a substituição não aconteceu — a planta envelheceu`);
    falhas++;
    continue;
  }
  const arq = path.join(tmp, `${p.arquivo}-plantado-${i}.ts`);
  fs.writeFileSync(arq, alterado);
  let pego: boolean;
  if (p.arquivo === "core") {
    pego = casosCore(await imp<ModCore>(arq)).get(p.caso) === false;
  } else {
    const mods: Mods = { ...reais, [p.arquivo]: await imp(arq) } as Mods;
    const r = await casos(mods, "planta");
    pego = r.get(p.caso) === false;
  }
  console.log(`${pego ? "PASSOU" : "FALHOU"}  (defeito plantado) "${p.nome}" derruba: ${p.caso}`);
  if (!pego) falhas++;
}

pinbank.close();
proxy.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${falhas === 0 ? "OK" : "FALHOU"}: API da Pinbank — ${real.size} casos, ${PLANTAS.length} defeitos plantados, ${falhas} falha(s).`);
process.exit(falhas > 0 ? 1 : 0);
