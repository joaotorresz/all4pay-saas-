/**
 * A COBRANÇA DO ITAÚ — a guarda (`npm run itau-cobranca`).
 *
 * Duas partes:
 *   1. As regras puras (`core/cobranca-banco/itau.ts`) sobre respostas no
 *      formato da API de boleto com Pix do Itaú: emissão, consulta, aviso.
 *   2. DEFEITOS PLANTADOS em cópias do core: cada um tem de derrubar o caso
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
