/**
 * A COBRANÇA DO ITAÚ — a guarda (`npm run itau-cobranca`).
 *
 * Três partes:
 *   1. As regras puras (`core/cobranca-banco/itau.ts`) sobre respostas no
 *      formato da API de boleto com Pix do Itaú: emissão, consulta, aviso.
 *   2. O cliente (`lib/cobranca-banco/itau-api.ts`) dirigido por um
 *      transporte de mentira: token guardado, 401 repetido UMA vez, queda
 *      ANTES do envio vira `falhou` e DEPOIS vira `incerta`, pedido com
 *      problema nem sai, mTLS obrigatório em produção.
 *   3. DEFEITOS PLANTADOS em cópias do core: cada um tem de derrubar o caso
 *      que o nomeia. Guarda que nunca reprovou é decoração.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

type ModItau = typeof import("../src/core/cobranca-banco/itau.ts");
const ARQ = path.resolve("src/core/cobranca-banco/itau.ts");
const M = (await import("@/core/cobranca-banco/itau")) as ModItau;

let falhas = 0;
let total = 0;
function ok(nome: string, cond: boolean, detalhe = "") {
  total++;
  if (!cond) {
    falhas++;
    console.log(`  ✗ ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  }
}

const CONTA = { agencia: "1500", conta: "5678", dac: "9", carteira: "109", chavePix: "11222333000181" };
const NN = "00001234";
const ID = "150000056789" + "109" + NN;
const LINHA = "3".repeat(47);
const BARRAS = "4".repeat(44);
const DEVEDOR = {
  nome: "Mercearia Boa Vista Ltda", documento: "11.222.333/0001-81", email: null, telefone: null,
  cep: "01310-100", logradouro: "Avenida Paulista", numero: "1000", complemento: null,
  bairro: "Bela Vista", cidade: "São Paulo", uf: "sp",
};
const PEDIDO = { tipo: "boleto_pix" as const, seuNumero: "a1b2c3d4e5f6a7b", valor: 150.456, vencimento: "2026-11-10", descricao: "Mensalidade de novembro", devedor: DEVEDOR };
const titulo = (situacao: string, extra: Record<string, unknown> = {}) => ({
  dado_boleto: {
    dados_individuais_boleto: [{ numero_nosso_numero: NN, situacao_geral_boleto: situacao, numero_linha_digitavel: LINHA, codigo_barras: BARRAS }],
    ...extra,
  },
  dados_qrcode: { emv: "000201pix", txid: "TX1" },
});

type Caso = [nome: string, prova: (m: ModItau) => boolean];
const CASOS: Caso[] = [
  ["valor: 17 dígitos em CENTAVOS", (m) => m.valorItau(150.456) === "00000000000015046" && m.valorItau(0.01) === "00000000000000001"],
  ["valor: zero e negativo lançam", (m) => { try { m.valorItau(0); return false; } catch { try { m.valorItau(-1); return false; } catch { return true; } } }],
  ["beneficiário: agência 4 + conta 7 + DAC", (m) => m.idBeneficiarioItau(CONTA) === "150000056789"],
  ["conta: sem chave Pix ou carteira errada não emite", (m) =>
    m.problemasDaContaItau(CONTA).length === 0
    && m.problemasDaContaItau({ ...CONTA, chavePix: "" }).length === 1
    && m.problemasDaContaItau({ ...CONTA, carteira: "1" }).length === 1],
  ["pedido: bolecode com o nosso número, valor em centavos e pagador PJ", (m) => {
    const p = m.pedidoCobrancaItau(PEDIDO, CONTA, NN, "2026-10-30") as any;
    const ind = p.dado_boleto.dados_individuais_boleto[0];
    return p.etapa_processo_boleto === "efetivacao" && p.dado_boleto.descricao_instrumento_cobranca === "boleto_pix"
      && p.beneficiario.id_beneficiario === "150000056789" && p.dado_boleto.codigo_carteira === "109"
      && p.dado_boleto.valor_total_titulo === "00000000000015046" && ind.valor_titulo === "00000000000015046"
      && ind.numero_nosso_numero === NN && ind.texto_seu_numero === PEDIDO.seuNumero && ind.data_vencimento === "2026-11-10"
      && ind.data_limite_pagamento === "2027-01-09" && p.dado_boleto.data_emissao === "2026-10-30"
      && p.dado_boleto.pagador.pessoa.tipo_pessoa.codigo_tipo_pessoa === "J"
      && p.dado_boleto.pagador.pessoa.tipo_pessoa.numero_cadastro_nacional_pessoa_juridica === "11222333000181"
      && p.dado_boleto.pagador.endereco.numero_CEP === "01310100" && p.dado_boleto.pagador.endereco.sigla_UF === "SP"
      && p.dados_qrcode.chave === CONTA.chavePix;
  }],
  ["pedido: CPF vira pessoa FÍSICA", (m) =>
    (m.pedidoCobrancaItau({ ...PEDIDO, devedor: { ...DEVEDOR, documento: "529.982.247-25" } }, CONTA, NN, "2026-10-30") as any)
      .dado_boleto.pagador.pessoa.tipo_pessoa.codigo_tipo_pessoa === "F"],
  ["pedido: nosso número fora de 8 dígitos lança", (m) => { try { m.pedidoCobrancaItau(PEDIDO, CONTA, "a1b2c3d4", "2026-10-30"); return false; } catch { return true; } }],
  ["emissão: 200 com a linha e o NOSSO número é EMITIDA", (m) => {
    const r = m.lerCriacaoItau(200, { data: titulo("em aberto") }, CONTA, NN);
    return r.situacao === "emitida" && r.idProvedor === ID && r.linhaDigitavel === LINHA && r.codigoBarras === BARRAS && r.pixCopiaECola === "000201pix";
  }],
  ["emissão: 200 sem nada para pagar é INCERTA, nunca processando", (m) => {
    const r = m.lerCriacaoItau(200, { data: { dado_boleto: { dados_individuais_boleto: [{ numero_nosso_numero: NN }] } } }, CONTA, NN);
    return r.situacao === "incerta";
  }],
  ["emissão: 200 com OUTRO nosso número é INCERTA", (m) =>
    m.lerCriacaoItau(200, { data: { ...titulo("em aberto"), dado_boleto: { dados_individuais_boleto: [{ numero_nosso_numero: "00009999", numero_linha_digitavel: LINHA }] } } }, CONTA, NN).situacao === "incerta"],
  ["emissão: 400 é recusa clara, com o campo nomeado", (m) => {
    const r = m.lerCriacaoItau(400, { mensagem: "Dados inválidos", campos: [{ campo: "numero_CEP", mensagem: "CEP inválido" }] }, CONTA, NN);
    return r.situacao === "falhou" && r.motivo.includes("numero_CEP: CEP inválido");
  }],
  ["emissão: 500 é INCERTA (pode ter registrado)", (m) => m.lerCriacaoItau(500, null, CONTA, NN).situacao === "incerta"],
  ["emissão: 429 e 408 são INCERTA", (m) => m.lerCriacaoItau(429, {}, CONTA, NN).situacao === "incerta" && m.lerCriacaoItau(408, {}, CONTA, NN).situacao === "incerta"],
  ["consulta: em aberto é EMITIDA", (m) => m.lerConsultaItau({ data: [titulo("Em Aberto")] }, CONTA, NN).situacao === "emitida"],
  ["consulta: paga lê o valor em centavos", (m) => {
    const r = m.lerConsultaItau({ data: [titulo("Paga", { pagamentos_cobranca: [{ valor_pago_total_cobranca: "00000000000015046", data_inclusao_pagamento: "2026-11-09" }] })] }, CONTA, NN);
    return r.situacao === "paga" && r.valorRecebido === 150.46 && r.dataHora === "2026-11-09" && r.origem === "desconhecida";
  }],
  ["consulta: baixada é CANCELADA", (m) => m.lerConsultaItau({ data: [titulo("Baixada")] }, CONTA, NN).situacao === "cancelada"],
  ["consulta: situação desconhecida é INCERTA", (m) => m.lerConsultaItau({ data: [titulo("Protestado")] }, CONTA, NN).situacao === "incerta"],
  ["consulta: dois títulos com o mesmo número é INCERTA", (m) => m.lerConsultaItau({ data: [titulo("Paga"), titulo("Paga")] }, CONTA, NN).situacao === "incerta"],
  ["consulta: título de outro número não conta", (m) => m.lerConsultaItau({ data: [{ ...titulo("Paga"), dado_boleto: { dados_individuais_boleto: [{ numero_nosso_numero: "00009999", situacao_geral_boleto: "Paga" }] } }] }, CONTA, NN).situacao === "incerta"],
  ["consulta: caminho com beneficiário, carteira e nosso número", (m) =>
    m.caminhoConsultaItau(CONTA, NN) === "/boletoscash/v2/boletos?id_beneficiario=150000056789&codigo_carteira=109&nosso_numero=00001234"
    && m.caminhoPermitidoItau(m.caminhoConsultaItau(CONTA, NN))],
  ["aviso: só os nossos números, sem repetir, ignorando a situação", (m) => {
    const r = m.lerAvisoItau([{ numero_nosso_numero: NN, situacao: "PAGO" }, { numero_nosso_numero: NN }, { numero_nosso_numero: "abc" }]);
    return r.length === 1 && r[0] === NN;
  }],
  ["caminhos: cobrança sim, Pix de saída e pagamento não", (m) =>
    m.caminhoPermitidoItau("/pix_recebimentos_conciliacoes/v2/boletos_pix") && m.caminhoPermitidoItau("/api/oauth/token")
    && !m.caminhoPermitidoItau("/pix/v2/pagamentos") && !m.caminhoPermitidoItau("/sispag/v1/pagamentos")
    && !m.caminhoPermitidoItau("/boletoscash/v2/boletos")],
  ["token: lê o access_token e lança sem ele", (m) => {
    const t = m.lerTokenItau({ access_token: "x", expires_in: 300 });
    try { m.lerTokenItau({}); return false; } catch { return t.token === "x" && t.expiraEmSegundos === 300; }
  }],
];

for (const [nome, prova] of CASOS) {
  let r = false;
  try { r = prova(M); } catch (e) { ok(nome, false, String(e)); continue; }
  ok(nome, r);
}

/* ── 2. O cliente, por um transporte de mentira ── */
const API = await import("@/lib/cobranca-banco/itau-api");
const { ErroPortaItau, requisicaoItau } = await import("@/lib/cobranca-banco/itau-saida");
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
const CFG = { ambiente: "sandbox" as const, clientId: "cid", clientSecret: "segredo-xyz", mtls: { certificado: "CERT", chave: "KEY" }, conta: CONTA };
const TOKEN = "/api/oauth/token";
const EMITIR = "/pix_recebimentos_conciliacoes/v2/boletos_pix";
const tokenOk = { status: 200, corpo: { access_token: "tok-1", expires_in: 3600 } };
const criado = { status: 200, corpo: { data: titulo("em aberto") } };
const HOJE = "2026-10-30";
const chamadasA = (t: { chamadas: any[] }, c: string) => t.chamadas.filter((x) => x.caminho === c);

{
  API.esquecerTokensItau();
  const t = transporte((o) => (o.caminho === TOKEN ? tokenOk : criado));
  const r1 = await API.emitirCobrancaItau(CFG, PEDIDO, NN, HOJE, t.fn);
  const r2 = await API.emitirCobrancaItau(CFG, PEDIDO, NN, HOJE, t.fn);
  ok("cliente: emite e devolve emitida com a linha e o Pix", r1.situacao === "emitida" && r2.situacao === "emitida" && (r1 as any).idProvedor === ID, JSON.stringify(r1));
  ok("cliente: o token é pedido UMA vez para duas cobranças, no servidor de token", chamadasA(t, TOKEN).length === 1 && chamadasA(t, TOKEN)[0].servidor === "token");
  const cob = chamadasA(t, EMITIR)[0];
  ok("cliente: a cobrança vai na API com Bearer, apikey, correlationID e mTLS", cob?.servidor === "api" && cob?.metodo === "POST"
    && cob?.cabecalhos.authorization === "Bearer tok-1" && cob?.cabecalhos["x-itau-apikey"] === "cid"
    && /^[0-9a-f-]{36}$/.test(cob?.cabecalhos["x-itau-correlationID"] ?? "") && cob?.mtls?.certificado === "CERT");
  ok("cliente: o corpo enviado é o pedido do core, com o nosso número", JSON.parse(cob.corpo).dado_boleto.dados_individuais_boleto[0].numero_nosso_numero === NN);
  ok("cliente: o segredo só vai no corpo do token, nunca na cobrança", !JSON.stringify(t.chamadas.filter((c) => c.caminho !== TOKEN)).includes("segredo-xyz"));
}
{
  API.esquecerTokensItau();
  const t = transporte(() => criado);
  const r1 = await API.emitirCobrancaItau(CFG, { ...PEDIDO, valor: 1 }, NN, HOJE, t.fn);
  const r2 = await API.emitirCobrancaItau(CFG, PEDIDO, "1234", HOJE, t.fn);
  const r3 = await API.emitirCobrancaItau({ ...CFG, conta: { ...CONTA, chavePix: "" } }, PEDIDO, NN, HOJE, t.fn);
  ok("cliente: pedido, nosso número ou conta com problema é falhou e NADA sai", [r1, r2, r3].every((r) => r.situacao === "falhou") && t.chamadas.length === 0);
}
{
  API.esquecerTokensItau();
  const t = transporte((o) => (o.caminho === TOKEN ? { status: 401, corpo: {} } : criado));
  const r = await API.emitirCobrancaItau(CFG, PEDIDO, NN, HOJE, t.fn);
  ok("cliente: credencial recusada é FALHOU (a cobrança nem saiu)", r.situacao === "falhou" && chamadasA(t, EMITIR).length === 0, JSON.stringify(r));
}
{
  API.esquecerTokensItau();
  let n = 0;
  const t = transporte((o) => (o.caminho === TOKEN ? tokenOk : n++ === 0 ? { status: 401, corpo: {} } : criado));
  const r = await API.emitirCobrancaItau(CFG, PEDIDO, NN, HOJE, t.fn);
  ok("cliente: 401 na cobrança renova o token e repete UMA vez", r.situacao === "emitida" && chamadasA(t, TOKEN).length === 2 && chamadasA(t, EMITIR).length === 2);
}
{
  API.esquecerTokensItau();
  const t = transporte((o) => (o.caminho === TOKEN ? tokenOk : new ErroPortaItau("caiu", "apos_envio")));
  const r = await API.emitirCobrancaItau(CFG, PEDIDO, NN, HOJE, t.fn);
  ok("cliente: queda DEPOIS do envio é INCERTA e não repete", r.situacao === "incerta" && chamadasA(t, EMITIR).length === 1);
}
{
  API.esquecerTokensItau();
  const t = transporte((o) => (o.caminho === TOKEN ? tokenOk : new ErroPortaItau("sem conexão", "antes_do_envio")));
  const r = await API.emitirCobrancaItau(CFG, PEDIDO, NN, HOJE, t.fn);
  ok("cliente: falha ANTES do envio é falhou", r.situacao === "falhou");
}
{
  API.esquecerTokensItau();
  const t = transporte((o) => (o.caminho === TOKEN ? tokenOk : { status: 404, corpo: {} }));
  const r = await API.consultarCobrancaItau(CFG, NN, t.fn);
  const c = t.chamadas.find((x) => x.caminho !== TOKEN);
  ok("cliente: consulta 404 é incerta, nunca cancelada, e vai por GET ao caminho do core",
    r.situacao === "incerta" && c?.metodo === "GET" && c?.caminho === M.caminhoConsultaItau(CONTA, NN));
}
{
  API.esquecerTokensItau();
  const t = transporte((o) => (o.caminho === TOKEN ? tokenOk : { status: 200, corpo: {} }));
  const r = await API.baixarCobrancaItau(CFG, NN, t.fn);
  const c = t.chamadas.find((x) => /baixa$/.test(x.caminho));
  ok("cliente: a baixa vai por PATCH ao título inteiro (beneficiário + carteira + nosso número)", r.ok && c?.metodo === "PATCH" && c?.caminho === `/boletoscash/v2/boletos/${ID}/baixa`);
}
{
  const r = API.configItauDoAmbiente({ ITAU_AMBIENTE: "producao", ITAU_CLIENT_ID: "cid", ITAU_CLIENT_SECRET: "nao-pode-aparecer" });
  ok("config: em produção faltam certificado, chave e conta, ditos pelo NOME, nunca pelo valor",
    "faltam" in r && r.faltam.some((f) => f.startsWith("ITAU_CERTIFICADO")) && r.faltam.some((f) => f.startsWith("ITAU_CHAVE_PRIVADA"))
    && r.faltam.some((f) => /agência/.test(f)) && !JSON.stringify(r).includes("nao-pode-aparecer"));
  const sb = API.configItauDoAmbiente({ ITAU_AMBIENTE: "sandbox", ITAU_CLIENT_ID: "cid", ITAU_CLIENT_SECRET: "s", ITAU_AGENCIA: "1500", ITAU_CONTA: "56789", ITAU_DAC: "9", ITAU_CARTEIRA: "109", ITAU_CHAVE_PIX: "x@y.com" });
  ok("config: o sandbox anda sem certificado", "config" in sb && sb.config.mtls === null);
}
{
  let erro: any = null;
  try { await requisicaoItau({ ambiente: "producao", servidor: "api", metodo: "POST", caminho: EMITIR, mtls: null }); } catch (e) { erro = e; }
  ok("porta: produção sem certificado é recusada ANTES de sair", erro instanceof ErroPortaItau && erro.fase === "antes_do_envio");
  erro = null;
  try { await requisicaoItau({ ambiente: "sandbox", servidor: "api", metodo: "POST", caminho: "/pix/v2/pagamentos", mtls: null }); } catch (e) { erro = e; }
  ok("porta: caminho fora da lista (Pix de saída) é recusado ANTES de sair", erro instanceof ErroPortaItau && erro.fase === "antes_do_envio");
}

{
  // O caminho do token: `jwt` só no sandbox; produção é sempre o STS.
  API.esquecerTokensItau();
  const t = transporte((o) => (o.caminho === "/api/oauth/jwt" ? tokenOk : { status: 404, corpo: null }));
  const r = await API.testarCredencialItau({ ...CFG, caminhoToken: "jwt" }, t.fn);
  ok("token: ?token=jwt no sandbox usa /api/oauth/jwt", r.ok === true && t.chamadas[0]?.caminho === "/api/oauth/jwt", JSON.stringify(r));
  API.esquecerTokensItau();
  const tp = transporte(() => tokenOk);
  await API.testarCredencialItau({ ...CFG, ambiente: "producao", caminhoToken: "jwt" }, tp.fn);
  ok("token: em produção o jwt é ignorado (sempre /api/oauth/token)", tp.chamadas[0]?.caminho === TOKEN);
  // A recusa diz o que o Itaú disse — JSON ou página — e nunca o segredo.
  API.esquecerTokensItau();
  const tj = transporte(() => ({ status: 403, corpo: { error: "invalid_client", error_description: "Client not authorized" } }));
  const rj = await API.testarCredencialItau(CFG, tj.fn);
  ok("token: a recusa leva o error_description do Itaú", !rj.ok && rj.motivo.includes("(403): Client not authorized") && !rj.motivo.includes("segredo-xyz"), JSON.stringify(rj));
  API.esquecerTokensItau();
  const th = transporte(() => ({ status: 403, corpo: null, bruto: "<html><body><h1>Access   Denied</h1></body></html>" }));
  const rh = await API.testarCredencialItau(CFG, th.fn);
  ok("token: recusa em página (não JSON) leva o texto da página", !rh.ok && rh.motivo.includes("Access Denied"), JSON.stringify(rh));
}

/* ── 3. Defeitos plantados ── */

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "itau-mutante-"));
const fonte = fs.readFileSync(ARQ, "utf8");
const MUTANTES: [defeito: string, de: string | RegExp, para: string, derruba: string][] = [
  ["valor em reais, sem centavos", "const centavos = Math.round(reais * 100);", "const centavos = Math.round(reais);", "valor: 17 dígitos"],
  ["5xx tratado como recusa", 'return { situacao: "incerta", motivo: `O Itaú não confirmou', 'return { situacao: "falhou", motivo: `O Itaú não confirmou', "emissão: 500 é INCERTA"],
  ["2xx sem linha vira processando", 'return { situacao: "incerta", motivo: `O Itaú não confirmou', 'return { situacao: "processando", idProvedor: "x" } as any; return { situacao: "incerta", motivo: `O Itaú não confirmou', "emissão: 200 sem nada"],
  ["emissão não confere o nosso número", "if (q.nossoNumero === nossoNumero && (", "if ((", "emissão: 200 com OUTRO"],
  ["consulta aceita o primeiro de vários", "if (achados.length !== 1) {", "if (achados.length < 1) {", "consulta: dois títulos"],
  ["situação desconhecida vira paga", /default:\n\s*return \{ situacao: "incerta"/, 'default:\n      return { situacao: "paga", idProvedor: id, valorRecebido: 0, origem: "desconhecida", marcadaManualmente: false, dataHora: null } as any; return { situacao: "incerta"', "consulta: situação desconhecida"],
  ["aviso confia na situação do corpo", "if (nossoNumeroValido(n)) out.add(n);", "if (nossoNumeroValido(n)) out.add(x.situacao === \"PAGO\" ? `${n}:pago` : n);", "aviso: só os nossos números"],
  ["caminho de Pix de saída liberado", "/^\\/api\\/oauth\\/token$/,", "/^\\/api\\/oauth\\/token$/,\n  /^\\/pix\\/v2\\/pagamentos$/,", "caminhos: cobrança sim"],
  ["nosso número qualquer aceito", "return /^\\d{8}$/.test(n);", "return n.length === 8;", "pedido: nosso número fora"],
];
for (const [defeito, de, para, derruba] of MUTANTES) {
  const mut = fonte.replace(de as any, para);
  if (mut === fonte) {
    ok(`defeito plantado "${defeito}": o padrão ainda existe no core`, false, "o mutante não mudou nada — atualize a guarda");
    continue;
  }
  const arq = path.join(tmp, `m${MUTANTES.findIndex((x) => x[0] === defeito)}.ts`);
  fs.writeFileSync(arq, mut);
  const Mm = (await import(pathToFileURL(arq).href)) as ModItau;
  const caidos = CASOS.filter(([, prova]) => { try { return !prova(Mm); } catch { return true; } }).map(([n]) => n);
  ok(`defeito plantado "${defeito}" derruba "${derruba}"`, caidos.some((n) => n.startsWith(derruba)), caidos.join(" | ") || "nenhum caso caiu");
}
fs.rmSync(tmp, { recursive: true, force: true });

console.log(falhas ? `✗ itau-cobranca: ${falhas} de ${total} falharam` : `✓ itau-cobranca: ${total} verificações (${CASOS.length} casos, ${MUTANTES.length} defeitos plantados)`);
process.exit(falhas ? 1 : 0);
