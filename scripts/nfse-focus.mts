/**
 * A EMISSÃO REAL DA NFS-e PELA FOCUS NFe — a guarda (`npm run nfse-focus`).
 *
 * Duas metades:
 *  1. o motor puro (`src/core/nfse/focus.ts`): o pedido que vai à prefeitura,
 *     a leitura da consulta, o emitente que a plataforma declarou, a
 *     referência por tentativa e a justificativa do cancelamento;
 *  2. a COMPOSIÇÃO das rotas `/api/nfse/*`, fixada no texto delas: o emitente
 *     sai do vínculo da plataforma, a nota é marcada antes de sair, o desfecho
 *     é gravado com condição, e a prefeitura cancela antes do sistema.
 *
 * ⚠️ TODA guarda só conta depois de reprovar: no fim, DEFEITOS PLANTADOS
 * (cópias alteradas dos arquivos), e cada um tem de derrubar o caso que o
 * nomeia — não basta "algo falhou".
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

type Motor = typeof import("../src/core/nfse/focus.ts");
const ARQ_MOTOR = path.resolve("src/core/nfse/focus.ts");
const ROTAS = {
  transmitir: path.resolve("src/app/api/nfse/transmitir/route.ts"),
  consultar: path.resolve("src/app/api/nfse/consultar/route.ts"),
  cancelar: path.resolve("src/app/api/nfse/cancelar/route.ts"),
  cliente: path.resolve("src/lib/focusnfe.ts"),
  nfse: path.resolve("src/lib/nfse.ts"),
};

const EMITENTE = JSON.stringify({
  "org-a": { cnpj: "54.579.688/0001-35", inscricaoMunicipal: "1234567", codigoMunicipio: "3550308", optanteSimples: false, itemListaServico: "02800" },
  "org-com-aliquota": { cnpj: "54579688000135", inscricaoMunicipal: "1", codigoMunicipio: "3550308", optanteSimples: true, aliquota: "2,9" },
  "org-aliquota-absurda": { cnpj: "54579688000135", inscricaoMunicipal: "1", codigoMunicipio: "3550308", aliquota: 15 },
  "org-sem-im": { cnpj: "54579688000135", codigoMunicipio: "3550308" },
  "org-cnpj-curto": { cnpj: "5457968800013", inscricaoMunicipal: "1", codigoMunicipio: "3550308" },
});
const NOTA = { id: "11111111-1111-1111-1111-111111111111", descricao: "Consultoria financeira de outubro", codigoServico: "17.01 — Assessoria / consultoria", valor: 1500.555, issRetido: false };
const TOMADOR = { nome: "Cliente Alfa Ltda", documento: "12.345.678/0001-95", email: "fin@alfa.com.br", telefone: "(11) 98888-7777", cep: "01310-100", rua: "Av. Paulista", numero: "1000", uf: "sp" };

type Caso = [nome: string, passou: boolean];

function casosDoMotor(m: Motor): Caso[] {
  const { emitentes, problemas } = m.lerEmitentes(EMITENTE);
  const e = emitentes["org-a"];
  const ped = e ? m.montarPedido(NOTA, TOMADOR, e, "2026-10-26T10:00:00-03:00") : null;
  const ok = ped && ped.ok ? ped.pedido : null;
  const ea = emitentes["org-com-aliquota"];
  const comAliq = ea ? m.montarPedido({ ...NOTA, codigoServico: "1.07" }, TOMADOR, ea, "x") : null;
  const semDoc = e ? m.montarPedido(NOTA, { ...TOMADOR, documento: "123" }, e, "x") : null;
  const pf = e ? m.montarPedido(NOTA, { ...TOMADOR, documento: "529.982.247-25" }, e, "x") : null;
  const base = "https://homologacao.focusnfe.com.br";
  const aut = m.interpretarConsulta({ status: "autorizado", numero: 87, codigo_verificacao: "AB12", url_danfse: "https://x/pdf", caminho_xml_nota_fiscal: "/arquivos/n.xml" }, base);
  const err = m.interpretarConsulta({ status: "erro_autorizacao", erros: [{ codigo: "E1", mensagem: "Inscrição municipal inválida", correcao: "Confira o CCM" }] }, base);
  return [
    ["emitente: o completo entra, com o CNPJ só em dígitos", e?.cnpj === "54579688000135"],
    ["emitente: sem inscrição municipal NÃO entra", !emitentes["org-sem-im"] && problemas.some((p) => p.includes("org-sem-im"))],
    ["emitente: CNPJ com 13 dígitos NÃO entra", !emitentes["org-cnpj-curto"]],
    ["emitente: configuração ilegível não lança e não habilita ninguém", Object.keys(m.lerEmitentes("{x").emitentes).length === 0],
    ["pedido: o prestador é o do vínculo da plataforma", ok?.prestador.cnpj === "54579688000135" && ok?.prestador.inscricao_municipal === "1234567" && ok?.prestador.codigo_municipio === "3550308"],
    ["pedido: tomador PJ vai por CNPJ, em dígitos", ok?.tomador.cnpj === "12345678000195" && !("cpf" in (ok?.tomador ?? {}))],
    ["pedido: tomador PF vai por CPF", !!pf && pf.ok && pf.pedido.tomador.cpf === "52998224725"],
    ["pedido: sem CPF/CNPJ válido é recusado ANTES de sair", !!semDoc && !semDoc.ok],
    ["pedido: valor em centavos (1500,555 → 1500,56)", ok?.servico.valor_servicos === 1500.56],
    ["pedido: SEM alíquota da tela nem valor do ISS", !!ok && !("aliquota" in ok.servico) && !("valor_iss" in ok.servico)],
    ["pedido: a alíquota declarada pela plataforma vai no pedido (2,9 → 2.9)", !!comAliq && comAliq.ok && comAliq.pedido.servico.aliquota === 2.9],
    ["emitente: alíquota acima de 5% é ignorada e avisada", emitentes["org-aliquota-absurda"]?.aliquota === undefined && problemas.some((p) => p.includes("org-aliquota-absurda"))],
    ["pedido: o código do serviço da plataforma vence o da nota", ok?.servico.item_lista_servico === "02800"],
    ["pedido: endereço com UF em caixa alta e CEP em dígitos", (ok?.tomador.endereco as Record<string, string> | undefined)?.uf === "SP" && (ok?.tomador.endereco as Record<string, string> | undefined)?.cep === "01310100"],
    ["item da lista: 1.07 → 0107 e 17.01 → 1701", m.itemDaLista("1.07 — Suporte") === "0107" && m.itemDaLista("17.01 — x") === "1701"],
    ["referência: a tentativa seguinte nunca repete a anterior", m.proximaTentativa(null) === 1 && m.proximaTentativa(m.refDaTentativa("n", 1)) === 2 && m.refDaTentativa("n", 2) !== m.refDaTentativa("n", 1)],
    ["consulta: autorizado vira autorizada com número, PDF e XML absoluto", aut.estado === "autorizada" && aut.numero === "87" && aut.urlPdf === "https://x/pdf" && aut.urlXml === `${base}/arquivos/n.xml`],
    ["consulta: erro de autorização vira recusada com a mensagem e a correção", err.estado === "rejeitada" && !!err.motivo?.includes("Inscrição municipal inválida") && !!err.motivo?.includes("Confira o CCM")],
    ["consulta: status desconhecido é PROCESSANDO, nunca autorizada", m.interpretarConsulta({ status: "qualquer" }, base).estado === "processando" && m.interpretarConsulta(null, base).estado === "processando"],
    ["consulta: cancelado vira cancelada", m.interpretarConsulta({ status: "cancelado" }, base).estado === "cancelada"],
    ["recusa: 401 não mostra o recado cru da credencial", m.motivoDaRecusa({ mensagem: "HTTP Basic: Access denied." }, 401).includes("suporte")],
    ["cancelamento: menos de 15 letras é recusado; 15 passa", !!m.justificativaValida("curto demais") && m.justificativaValida("Serviço cancelado.") === null],
  ];
}

type Texto = Record<keyof typeof ROTAS, string>;
const lerTextos = (): Texto => Object.fromEntries(Object.entries(ROTAS).map(([k, f]) => [k, fs.readFileSync(f, "utf8")])) as Texto;
const antes = (t: string, a: string, b: string) => t.includes(a) && t.includes(b) && t.indexOf(a) < t.indexOf(b);

function casosDasRotas(t: Texto): Caso[] {
  return [
    ["rota: o emitente sai do vínculo da plataforma (org da nota), nunca do pedido", t.transmitir.includes("emitenteDaOrg(nota.org_id)") && !/emitenteDaOrg\([^)]*(req|corpo|pedido)/.test(t.transmitir)],
    ["rota: a nota é marcada processando, com condição, ANTES de ir à Focus", antes(t.transmitir, '.eq("status", nota.status)', "emitirNaFocus(")],
    ["rota: permissão conferida na empresa DA NOTA antes da Focus", antes(t.transmitir, "podeLancar(s, nota.org_id)", "emitirNaFocus(") && antes(t.cancelar, "podeLancar(s, nota.org_id)", "cancelarNaFocus(")],
    ["rota: o desfecho só é gravado sobre nota ainda processando", t.consultar.includes('.eq("status", "processando")')],
    ["rota: falha de rede no envio NÃO vira recusa (o pedido pode ter chegado)", /r\.http === 0[^\n]*processando|processando[^\n]*r\.http === 0/.test(t.transmitir) || antes(t.transmitir, "r.http === 0", 'estado: "processando"')],
    ["cliente: o ambiente padrão é homologação", /=== "producao" \? "producao" : "homologacao"/.test(t.cliente)],
    ["cliente: o token não vai para resposta nem log", !/console\.[a-z]+\([^)]*\bt\b\)/.test(t.cliente) && !/corpo:\s*\{[^}]*token/.test(t.cliente)],
    ["tela: a prefeitura cancela ANTES de a receita sair", antes(t.nfse, '"/api/nfse/cancelar"', "excluirLogicoEmLote")],
    ["tela: em produção a transmissão vai à rota, sem número inventado", t.nfse.includes("if (!isDemo) return transmitirReal(id);") && antes(t.nfse, "if (!isDemo) return transmitirReal(id);", "String(100000 +")],
    ["tela: só quem venceu a gravação lança a receita", /!r\.mudou\) return nf;[\s\S]*refletirNaDRE/.test(t.nfse)],
  ];
}

function relatar(casos: Caso[]): number {
  let falhas = 0;
  for (const [nome, passou] of casos) { if (!passou) falhas++; console.log(`${passou ? "✓" : "✗"} ${nome}`); }
  return falhas;
}

const motor = (await import(pathToFileURL(ARQ_MOTOR).href)) as Motor;
let falhas = relatar(casosDoMotor(motor));
const textos = lerTextos();
falhas += relatar(casosDasRotas(textos));

/* ─────────────────────────── os defeitos plantados ─────────────────────────── */
const fonte = fs.readFileSync(ARQ_MOTOR, "utf8");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nfse-focus-"));
let n = 0;
async function plantarMotor(nome: string, de: string, para: string, casoEsperado: string) {
  if (!fonte.includes(de)) { console.log(`✗ DEFEITO "${nome}": o trecho a alterar sumiu do motor`); falhas++; return; }
  const arq = path.join(tmp, `motor-${n++}.ts`);
  fs.writeFileSync(arq, fonte.replace(de, para));
  const m = (await import(pathToFileURL(arq).href)) as Motor;
  const caiu = casosDoMotor(m).filter(([, p]) => !p).map(([c]) => c);
  const ok = caiu.includes(casoEsperado);
  if (!ok) falhas++;
  console.log(`${ok ? "✓" : "✗"} defeito plantado "${nome}" derruba "${casoEsperado}"${ok ? "" : ` (caíram: ${caiu.join(" | ") || "nenhum"})`}`);
}
function plantarRota(nome: string, arquivo: keyof Texto, de: string, para: string, casoEsperado: string) {
  if (!textos[arquivo].includes(de)) { console.log(`✗ DEFEITO "${nome}": o trecho a alterar sumiu de ${arquivo}`); falhas++; return; }
  const caiu = casosDasRotas({ ...textos, [arquivo]: textos[arquivo].replace(de, para) }).filter(([, p]) => !p).map(([c]) => c);
  const ok = caiu.includes(casoEsperado);
  if (!ok) falhas++;
  console.log(`${ok ? "✓" : "✗"} defeito plantado "${nome}" derruba "${casoEsperado}"${ok ? "" : ` (caíram: ${caiu.join(" | ") || "nenhum"})`}`);
}

await plantarMotor("emitente sem inscrição municipal aceito", '...(im ? [] : ["inscrição municipal"]),', "", "emitente: sem inscrição municipal NÃO entra");
await plantarMotor("CNPJ de qualquer tamanho", "cnpj.length === 14 ? []", "cnpj.length >= 13 ? []", "emitente: CNPJ com 13 dígitos NÃO entra");
await plantarMotor("documento do tomador não conferido", 'if (doc.length !== 11 && doc.length !== 14) problemas.push', "if (false) problemas.push", "pedido: sem CPF/CNPJ válido é recusado ANTES de sair");
await plantarMotor("alíquota da tela no pedido", "iss_retido: nota.issRetido,", "iss_retido: nota.issRetido, aliquota: 5,", "pedido: SEM alíquota da tela nem valor do ISS");
await plantarMotor("alíquota da plataforma esquecida", "...(emitente.aliquota !== undefined ? { aliquota: emitente.aliquota } : {}),", "", "pedido: a alíquota declarada pela plataforma vai no pedido (2,9 → 2.9)");
await plantarMotor("alíquota sem teto", "n > 0 && n <= 5", "n > 0", "emitente: alíquota acima de 5% é ignorada e avisada");
await plantarMotor("código da nota vence o da plataforma", "emitente.itemListaServico ?? itemDaLista(nota.codigoServico)", "itemDaLista(nota.codigoServico)", "pedido: o código do serviço da plataforma vence o da nota");
await plantarMotor("status desconhecido autoriza", 'return { estado: "processando" };\n}', 'return { estado: "autorizada" };\n}', "consulta: status desconhecido é PROCESSANDO, nunca autorizada");
await plantarMotor("referência fixa por nota", "return m ? Number(m[1]) + 1 : 1;", "return 1;", "referência: a tentativa seguinte nunca repete a anterior");
await plantarMotor("XML relativo sem a base", "/^https?:\\/\\//.test(xml) ? xml : `${base}${xml.startsWith(\"/\") ? \"\" : \"/\"}${xml}`", "xml", "consulta: autorizado vira autorizada com número, PDF e XML absoluto");
await plantarMotor("justificativa curta aceita", "if (t.length < 15)", "if (t.length < 5)", "cancelamento: menos de 15 letras é recusado; 15 passa");

plantarRota("emitente do pedido", "transmitir", "emitenteDaOrg(nota.org_id)", "emitenteDaOrg(String(req.headers.get(\"x-org\")))", "rota: o emitente sai do vínculo da plataforma (org da nota), nunca do pedido");
plantarRota("marca sem condição", "transmitir", '.eq("id", nota.id).eq("status", nota.status)', '.eq("id", nota.id)', "rota: a nota é marcada processando, com condição, ANTES de ir à Focus");
plantarRota("desfecho sem condição", "consultar", '.eq("id", nota.id).eq("status", "processando")', '.eq("id", nota.id)', "rota: o desfecho só é gravado sobre nota ainda processando");
plantarRota("produção por padrão", "cliente", '=== "producao" ? "producao" : "homologacao"', '=== "homologacao" ? "homologacao" : "producao"', "cliente: o ambiente padrão é homologação");
plantarRota("receita lançada por qualquer consulta", "nfse", "!r.mudou) return nf;", ") return nf;", "tela: só quem venceu a gravação lança a receita");
plantarRota("simulação em produção", "nfse", "if (!isDemo) return transmitirReal(id);", "", "tela: em produção a transmissão vai à rota, sem número inventado");

fs.rmSync(tmp, { recursive: true, force: true });
if (falhas) { console.error(`\n✗ nfse-focus: ${falhas} problema(s).`); process.exit(1); }
console.log("\n✓ nfse-focus: emissão real coerente, e cada defeito plantado reprovou.");
