/**
 * A COBRANÇA DO BANCO INTER — a guarda (`npm run inter-cobranca`).
 *
 * Três partes:
 *   1. As regras puras (`core/cobranca-banco/inter.ts`) sobre respostas no
 *      formato da API v3 do Inter: criação, consulta, busca, aviso do webhook.
 *   2. O cliente (`lib/cobranca-banco/inter-api.ts`) dirigido por um
 *      transporte de mentira: token guardado, 401 repetido UMA vez, falha
 *      ANTES do envio vira `falhou` e DEPOIS vira `incerta`, pedido com
 *      problema nem sai.
 *   3. DEFEITOS PLANTADOS em cópias do core: cada um tem de derrubar o caso
 *      que o nomeia. Guarda que nunca reprovou é decoração.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

type ModInter = typeof import("../src/core/cobranca-banco/inter.ts");
const ARQ_INTER = path.resolve("src/core/cobranca-banco/inter.ts");

const M = (await import("@/core/cobranca-banco/inter")) as ModInter;
const N = await import("@/core/cobranca-banco");
const API = await import("@/lib/cobranca-banco/inter-api");

let falhas = 0;
let total = 0;
function ok(nome: string, cond: boolean, detalhe = "") {
  total++;
  if (!cond) {
    falhas++;
    console.log(`  ✗ ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  }
}

const UUID1 = "3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const UUID2 = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const LINHA = "07790001161234567890112345678901294560000025000".slice(0, 47);
const BARRAS = "0".repeat(44);

const DEVEDOR = {
  nome: "Mercearia Boa Vista Ltda",
  documento: "11.222.333/0001-81",
  email: "financeiro@boavista.com.br",
  telefone: "(11) 98765-4321",
  cep: "01310-100",
  logradouro: "Avenida Paulista",
  numero: "1000",
  complemento: "Sala 12",
  bairro: "Bela Vista",
  cidade: "São Paulo",
  uf: "sp",
};
const PEDIDO = {
  tipo: "boleto_pix" as const,
  seuNumero: "a1b2c3d4e5f6a7b",
  valor: 150.456,
  vencimento: "2026-11-10",
  descricao: "Mensalidade de novembro",
  devedor: DEVEDOR,
};

/* ── 1. As regras puras — escritas como CASOS sobre um módulo, para o mesmo
 *      caso rodar no core real (tem de passar) e nos mutantes (tem de cair). ── */
type Caso = [nome: string, prova: (m: ModInter) => boolean];
const CASOS: Caso[] = [
  ["pedido: valor com 2 casas, pagador PJ, CEP e telefone em dígitos", (m) => {
    const p = m.pedidoCobrancaInter(PEDIDO) as any;
    return p.valorNominal === 150.46 && p.pagador.tipoPessoa === "JURIDICA" && p.pagador.cpfCnpj === "11222333000181"
      && p.pagador.cep === "01310100" && p.pagador.uf === "SP" && p.pagador.ddd === "11" && p.pagador.telefone === "987654321"
      && p.seuNumero === PEDIDO.seuNumero && p.dataVencimento === "2026-11-10" && p.mensagem?.linha1 === "Mensalidade de novembro";
  }],
  ["pedido: CPF vira pessoa FÍSICA", (m) =>
    (m.pedidoCobrancaInter({ ...PEDIDO, devedor: { ...DEVEDOR, documento: "529.982.247-25" } }) as any).pagador.tipoPessoa === "FISICA"],
  ["criação: 200 com o código é PROCESSANDO (a cobrança existe)", (m) => {
    const r = m.lerCriacaoInter(200, { codigoSolicitacao: UUID1.toUpperCase() });
    return r.situacao === "processando" && r.idProvedor === UUID1;
  }],
  ["criação: 400 é recusa clara, com o campo nomeado", (m) => {
    const r = m.lerCriacaoInter(400, { title: "Requisição inválida", violacoes: [{ propriedade: "pagador.cep", razao: "CEP inválido" }] });
    return r.situacao === "falhou" && /pagador\.cep: CEP inválido/.test(r.motivo);
  }],
  ["criação: 500 é INCERTA, nunca falhou (pode ter criado)", (m) => m.lerCriacaoInter(500, null).situacao === "incerta"],
  ["criação: 429 e 408 são INCERTA", (m) => m.lerCriacaoInter(429, null).situacao === "incerta" && m.lerCriacaoInter(408, null).situacao === "incerta"],
  ["criação: 200 sem o código é INCERTA", (m) => m.lerCriacaoInter(200, {}).situacao === "incerta"],
  ["consulta: A_RECEBER com linha e Pix é EMITIDA", (m) => {
    const r = m.lerConsultaInter({ cobranca: { codigoSolicitacao: UUID1, situacao: "A_RECEBER" }, boleto: { linhaDigitavel: LINHA, codigoBarras: BARRAS }, pix: { pixCopiaECola: "00020101021226…", txid: "abc" } });
    return r.situacao === "emitida" && r.linhaDigitavel === LINHA && r.codigoBarras === BARRAS && r.pixCopiaECola === "00020101021226…";
  }],
  ["consulta: A_RECEBER sem nada para pagar ainda é PROCESSANDO", (m) =>
    m.lerConsultaInter({ cobranca: { codigoSolicitacao: UUID1, situacao: "A_RECEBER" }, boleto: {}, pix: {} }).situacao === "processando"],
  ["consulta: EM_PROCESSAMENTO é processando", (m) => m.lerConsultaInter({ cobranca: { codigoSolicitacao: UUID1, situacao: "EM_PROCESSAMENTO" } }).situacao === "processando"],
  ["consulta: RECEBIDO é PAGA, com valor e origem", (m) => {
    const r = m.lerConsultaInter({ cobranca: { codigoSolicitacao: UUID1, situacao: "RECEBIDO", valorTotalRecebido: "150.46", origemRecebimento: "PIX" } });
    return r.situacao === "paga" && r.valorRecebido === 150.46 && r.origem === "pix" && !r.marcadaManualmente;
  }],
  ["consulta: MARCADO_RECEBIDO é paga MARCADA À MÃO (o dinheiro pode não ter passado)", (m) => {
    const r = m.lerConsultaInter({ cobranca: { codigoSolicitacao: UUID1, situacao: "MARCADO_RECEBIDO" } });
    return r.situacao === "paga" && r.marcadaManualmente;
  }],
  ["consulta: CANCELADO e EXPIRADO são cancelada; FALHA_EMISSAO é falhou", (m) =>
    m.lerConsultaInter({ cobranca: { codigoSolicitacao: UUID1, situacao: "CANCELADO" } }).situacao === "cancelada"
    && m.lerConsultaInter({ cobranca: { codigoSolicitacao: UUID1, situacao: "EXPIRADO" } }).situacao === "cancelada"
    && m.lerConsultaInter({ cobranca: { codigoSolicitacao: UUID1, situacao: "FALHA_EMISSAO" } }).situacao === "falhou"],
  ["consulta: situação desconhecida é INCERTA, nunca paga", (m) =>
    m.lerConsultaInter({ cobranca: { codigoSolicitacao: UUID1, situacao: "PAGO_TALVEZ" } }).situacao === "incerta"],
  ["consulta: sem o código é incerta", (m) => m.lerConsultaInter({ cobranca: { situacao: "RECEBIDO" } }).situacao === "incerta"],
  ["aviso do webhook: só os códigos, sem repetir, ignorando a situação", (m) => {
    const ids = m.lerAvisoInter([
      { codigoSolicitacao: UUID1, situacao: "RECEBIDO", valorTotalRecebido: 999999 },
      { codigoSolicitacao: UUID1.toUpperCase() },
      { codigoSolicitacao: "nao-e-uuid" },
      { codigoSolicitacao: UUID2 },
      "lixo",
    ]);
    return ids.length === 2 && ids[0] === UUID1 && ids[1] === UUID2 && ids.every((x) => typeof x === "string");
  }],
  ["aviso do webhook: teto de 100", (m) =>
    m.lerAvisoInter(Array.from({ length: 150 }, (_, i) => ({ codigoSolicitacao: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}` }))).length === 100],
  ["busca: acha a cobrança com o NOSSO número, e só se for uma", (m) =>
    m.codigoDaBuscaInter({ cobrancas: [{ cobranca: { seuNumero: "X1", codigoSolicitacao: UUID1 } }, { cobranca: { seuNumero: "X2", codigoSolicitacao: UUID2 } }] }, "X1") === UUID1
    && m.codigoDaBuscaInter({ cobrancas: [{ cobranca: { seuNumero: "X1", codigoSolicitacao: UUID1 } }, { cobranca: { seuNumero: "X1", codigoSolicitacao: UUID2 } }] }, "X1") === null
    && m.codigoDaBuscaInter({ cobrancas: [] }, "X1") === null],
  ["busca: o caminho filtra pelo nosso número e passa na lista de caminhos", (m) => {
    const c = m.caminhoBuscaPorSeuNumero("X1", "2026-11-10");
    return /seuNumero=X1/.test(c) && m.caminhoPermitidoInter(c);
  }],
  ["caminhos: cobrança sim; Pix de saída, pagamento e extrato não", (m) =>
    m.caminhoPermitidoInter("/oauth/v2/token") && m.caminhoPermitidoInter("/cobranca/v3/cobrancas")
    && m.caminhoPermitidoInter(`/cobranca/v3/cobrancas/${UUID1}`) && m.caminhoPermitidoInter(`/cobranca/v3/cobrancas/${UUID1}/cancelar`)
    && !m.caminhoPermitidoInter("/banking/v2/pix") && !m.caminhoPermitidoInter("/banking/v2/pagamento")
    && !m.caminhoPermitidoInter("/banking/v2/extrato") && !m.caminhoPermitidoInter("/cobranca/v3/cobrancas/../../banking/v2/pix")],
  ["token: só escopo de cobrança", (m) => {
    const c = new URLSearchParams(m.corpoTokenInter("id", "s"));
    return c.get("scope") === "boleto-cobranca.read boleto-cobranca.write" && c.get("grant_type") === "client_credentials";
  }],
];
for (const [nome, prova] of CASOS) {
  let passou = false;
  try { passou = prova(M); } catch (e) { passou = false; }
  ok(`core: ${nome}`, passou);
}

/* ── O contrato neutro ── */
ok("neutro: valor abaixo de R$ 2,50 é recusado", N.problemasDoPedido({ ...PEDIDO, valor: 2 }).length > 0);
ok("neutro: boleto sem endereço é recusado; Pix sem endereço passa", N.problemasDoPedido({ ...PEDIDO, devedor: { ...DEVEDOR, logradouro: null } }).length > 0
  && N.problemasDoPedido({ ...PEDIDO, tipo: "pix", devedor: { ...DEVEDOR, logradouro: null } }).length === 0);
ok("neutro: nosso número com símbolo é recusado", N.problemasDoPedido({ ...PEDIDO, seuNumero: "abc-123" }).length > 0);
ok("neutro: o pedido certo não tem problema", N.problemasDoPedido(PEDIDO).length === 0, N.problemasDoPedido(PEDIDO).join(" "));
ok("neutro: o nosso número da reserva é determinístico e tem 15 caracteres",
  N.seuNumeroDaReserva(UUID1) === N.seuNumeroDaReserva(UUID1) && N.seuNumeroDaReserva(UUID1).length === 15 && /^[0-9a-f]+$/.test(N.seuNumeroDaReserva(UUID1)));
ok("neutro: só falhou e cancelada deixam emitir de novo",
  N.podeEmitirDeNovo({ situacao: "falhou", motivo: "" }) && N.podeEmitirDeNovo({ situacao: "cancelada", idProvedor: UUID1, motivo: "" })
  && !N.podeEmitirDeNovo({ situacao: "incerta", motivo: "" }) && !N.podeEmitirDeNovo({ situacao: "processando", idProvedor: UUID1 }));

/* ── 2. O cliente, por um transporte de mentira ── */
const { ErroPortaInter } = await import("@/lib/cobranca-banco/inter-saida");
function transporte(roteiro: (o: any, n: number) => { status: number; corpo: unknown } | Error) {
  const chamadas: any[] = [];
  const fn = async (o: any) => {
    chamadas.push(o);
    const r = roteiro(o, chamadas.length);
    if (r instanceof Error) throw r;
    return r;
  };
  return { fn: fn as any, chamadas };
}
const CFG = {
  ambiente: "sandbox" as const,
  clientId: "cid",
  clientSecret: "segredo-xyz",
  mtls: { certificado: "CERT", chave: "KEY" },
  contaCorrente: "12345678",
};
const tokenOk = { status: 200, corpo: { access_token: "tok-1", expires_in: 3600 } };

{
  API.esquecerTokensInter();
  const t = transporte((o) => (o.caminho === "/oauth/v2/token" ? tokenOk : { status: 200, corpo: { codigoSolicitacao: UUID1 } }));
  const r1 = await API.emitirCobrancaInter(CFG, PEDIDO, t.fn);
  const r2 = await API.emitirCobrancaInter(CFG, { ...PEDIDO, seuNumero: "b" }, t.fn);
  ok("cliente: emite e devolve processando com o código", r1.situacao === "processando" && r2.situacao === "processando");
  ok("cliente: o token é pedido UMA vez para duas cobranças", t.chamadas.filter((c) => c.caminho === "/oauth/v2/token").length === 1);
  const cob = t.chamadas.find((c) => c.caminho === "/cobranca/v3/cobrancas");
  ok("cliente: a cobrança vai com o Bearer, a conta corrente e o mTLS", cob?.cabecalhos.authorization === "Bearer tok-1"
    && cob?.cabecalhos["x-conta-corrente"] === "12345678" && cob?.mtls.certificado === "CERT" && cob?.metodo === "POST");
  ok("cliente: o segredo só vai no corpo do token, nunca na cobrança", !JSON.stringify(t.chamadas.filter((c) => c.caminho !== "/oauth/v2/token")).includes("segredo-xyz"));
}
{
  API.esquecerTokensInter();
  const t = transporte((o) => (o.caminho === "/oauth/v2/token" ? tokenOk : { status: 200, corpo: {} }));
  const r = await API.emitirCobrancaInter(CFG, { ...PEDIDO, valor: 1 }, t.fn);
  ok("cliente: pedido com problema é falhou e NADA sai", r.situacao === "falhou" && t.chamadas.length === 0);
}
{
  API.esquecerTokensInter();
  const t = transporte((o) => (o.caminho === "/oauth/v2/token" ? { status: 401, corpo: {} } : { status: 200, corpo: { codigoSolicitacao: UUID1 } }));
  const r = await API.emitirCobrancaInter(CFG, PEDIDO, t.fn);
  ok("cliente: credencial recusada é FALHOU (a cobrança nem saiu), não incerta", r.situacao === "falhou", JSON.stringify(r));
}
{
  API.esquecerTokensInter();
  let n401 = 0;
  const t = transporte((o) => {
    if (o.caminho === "/oauth/v2/token") return tokenOk;
    if (n401++ === 0) return { status: 401, corpo: {} };
    return { status: 200, corpo: { codigoSolicitacao: UUID1 } };
  });
  const r = await API.emitirCobrancaInter(CFG, PEDIDO, t.fn);
  ok("cliente: 401 na cobrança renova o token e repete UMA vez", r.situacao === "processando"
    && t.chamadas.filter((c) => c.caminho === "/oauth/v2/token").length === 2 && t.chamadas.filter((c) => c.caminho === "/cobranca/v3/cobrancas").length === 2);
}
{
  API.esquecerTokensInter();
  const t = transporte((o) => (o.caminho === "/oauth/v2/token" ? tokenOk : new ErroPortaInter("caiu", "apos_envio")));
  const r = await API.emitirCobrancaInter(CFG, PEDIDO, t.fn);
  ok("cliente: queda DEPOIS do envio é INCERTA e não repete", r.situacao === "incerta" && t.chamadas.filter((c) => c.caminho === "/cobranca/v3/cobrancas").length === 1);
}
{
  API.esquecerTokensInter();
  const t = transporte((o) => (o.caminho === "/oauth/v2/token" ? tokenOk : new ErroPortaInter("sem conexão", "antes_do_envio")));
  const r = await API.emitirCobrancaInter(CFG, PEDIDO, t.fn);
  ok("cliente: falha ANTES do envio é falhou", r.situacao === "falhou");
}
{
  API.esquecerTokensInter();
  const t = transporte((o) => (o.caminho === "/oauth/v2/token" ? tokenOk : { status: 404, corpo: {} }));
  const r = await API.consultarCobrancaInter(CFG, UUID1, t.fn);
  ok("cliente: consulta 404 é incerta, nunca cancelada", r.situacao === "incerta");
}
{
  API.esquecerTokensInter();
  const t = transporte((o) => (o.caminho === "/oauth/v2/token" ? tokenOk : { status: 200, corpo: {} }));
  const r = await API.cancelarCobrancaInter(CFG, UUID1, "Título alterado", t.fn);
  const c = t.chamadas.find((x) => /cancelar$/.test(x.caminho));
  ok("cliente: cancelar manda o motivo para o caminho do código", r.ok && JSON.parse(c.corpo).motivoCancelamento === "Título alterado");
}
{
  const r = API.configInterDoAmbiente({ INTER_AMBIENTE: "producao", INTER_CLIENT_SECRET: "nao-pode-aparecer" });
  ok("config: o que falta é dito pelo NOME, nunca pelo valor", "faltam" in r && r.faltam.some((f) => f.startsWith("INTER_CLIENT_ID"))
    && !JSON.stringify(r).includes("nao-pode-aparecer"));
  const pem = "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----";
  const key = "-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----";
  const r2 = API.configInterDoAmbiente({
    INTER_AMBIENTE: "sandbox", INTER_CLIENT_ID: "a", INTER_CLIENT_SECRET: "b",
    INTER_CERTIFICADO: Buffer.from(pem).toString("base64"), INTER_CHAVE_PRIVADA: key.replace(/\n/g, "\\n"),
  });
  ok("config: aceita o PEM em base64 e com \\n escapado", "config" in r2 && r2.config.mtls.certificado === pem && r2.config.mtls.chave === key);
  ok("config: ambiente fora de sandbox|producao é recusado", "faltam" in API.configInterDoAmbiente({ INTER_AMBIENTE: "dev" }));
}

/* ── 3. Defeitos plantados: cada um tem de derrubar o caso que o nomeia ── */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "inter-mutante-"));
const fonte = fs.readFileSync(ARQ_INTER, "utf8");
const MUTANTES: [defeito: string, de: string | RegExp, para: string, derruba: string][] = [
  ["5xx tratado como recusa", 'return { situacao: "incerta", motivo: `O Inter não confirmou', 'return { situacao: "falhou", motivo: `O Inter não confirmou', "criação: 500 é INCERTA"],
  ["situação desconhecida vira paga", /default:\n\s*return \{ situacao: "incerta"/, 'default:\n      return { situacao: "paga", idProvedor: id, valorRecebido: 0, origem: "desconhecida", marcadaManualmente: false, dataHora: null } as any; return { situacao: "incerta"', "consulta: situação desconhecida"],
  ["MARCADO_RECEBIDO sem a marca", 'marcadaManualmente: situacao === "MARCADO_RECEBIDO"', "marcadaManualmente: false", "consulta: MARCADO_RECEBIDO"],
  ["webhook confia na situação do corpo", "if (UUID.test(id)) out.add(id);", "if (UUID.test(id)) out.add(x.situacao === \"RECEBIDO\" ? `${id}:pago` : id);", "aviso do webhook: só os códigos"],
  ["busca aceita a primeira de várias", "return achadas.length === 1 ?", "return achadas.length >= 1 ?", "busca: acha a cobrança"],
  ["caminho de Pix de saída liberado", "/^\\/oauth\\/v2\\/token$/,", "/^\\/oauth\\/v2\\/token$/,\n  /^\\/banking\\/v2\\/pix$/,", "caminhos: cobrança sim"],
  ["escopo de pagamento no token", 'export const ESCOPOS_INTER = "boleto-cobranca.read boleto-cobranca.write";', 'export const ESCOPOS_INTER = "boleto-cobranca.read boleto-cobranca.write pagamento-pix.write";', "token: só escopo de cobrança"],
  ["emitida sem nada para pagar", "if (!linhaOk && !copia) return { situacao: \"processando\", idProvedor: id };", "", "consulta: A_RECEBER sem nada"],
];
for (const [defeito, de, para, derruba] of MUTANTES) {
  const mut = fonte.replace(de as any, para);
  if (mut === fonte) {
    ok(`defeito plantado "${defeito}": o padrão ainda existe no core`, false, "o mutante não mudou nada — atualize a guarda");
    continue;
  }
  const arq = path.join(tmp, `m${MUTANTES.findIndex((x) => x[0] === defeito)}.ts`);
  fs.writeFileSync(arq, mut);
  const Mm = (await import(pathToFileURL(arq).href)) as ModInter;
  const caidos = CASOS.filter(([, prova]) => { try { return !prova(Mm); } catch { return true; } }).map(([n]) => n);
  ok(`defeito plantado "${defeito}" derruba "${derruba}"`, caidos.some((n) => n.startsWith(derruba)), caidos.join(" | ") || "nenhum caso caiu");
}
fs.rmSync(tmp, { recursive: true, force: true });

console.log(falhas ? `✗ inter-cobranca: ${falhas} de ${total} falharam` : `✓ inter-cobranca: ${total} verificações`);
process.exit(falhas ? 1 : 0);
