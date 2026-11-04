/**
 * O CADASTRO FISCAL PELA TELA E A EMPRESA NA FOCUS — a guarda (`npm run nfse-cadastro`).
 *
 *  1. `core/nfse/cadastro-fiscal`: o formulário vira o MESMO `config` que o
 *     envio lê, e campo fora de forma é recusa (nunca some calado);
 *  2. `core/nfse/empresa-focus`: prefeitura × nacional saem juntos e opostos
 *     (ligar os dois manda a nota da prefeitura para o ambiente nacional);
 *  3. as rotas: plataforma antes de tudo, interruptor antes da Focus,
 *     conferência antes da escrita, e o certificado nunca em log.
 *
 * ⚠️ Toda guarda só conta depois de reprovar: DEFEITOS PLANTADOS no fim, e
 * cada um tem de derrubar o caso que o nomeia. Âncoras literais, sem importar
 * a função auditada para calcular o esperado.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

type Cad = typeof import("../src/core/nfse/cadastro-fiscal.ts");
type Emp = typeof import("../src/core/nfse/empresa-focus.ts");
const ARQ_CAD = path.resolve("src/core/nfse/cadastro-fiscal.ts");
const ARQ_EMP = path.resolve("src/core/nfse/empresa-focus.ts");
const ARQS = {
  rotaEmitente: path.resolve("src/app/api/admin/nfse-emitentes/route.ts"),
  rotaEmpresa: path.resolve("src/app/api/admin/focus-empresa/route.ts"),
  cliente: path.resolve("src/lib/focusnfe.ts"),
};
type Textos = Record<keyof typeof ARQS, string>;
type Caso = [string, boolean];

// O cadastro real da ALL4 PAY em 03/11/2026 (âncora literal).
const REAL = { cnpj: "54579688000135", aliquota: 2, codigoNbs: "000000000", grupoIbsCbs: false, optanteSimples: false, codigoMunicipio: "3550308", itemListaServico: "150103", inscricaoMunicipal: "13017047", codigoIndicadorOperacao: "100301", codigoTributacaoMunicipalIss: "5820", classificacaoTributariaIbsCbs: "000001" };
const igual = (a: Record<string, unknown>, b: Record<string, unknown>) =>
  Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([k, v]) => b[k] === v);

function casosDoCadastro(m: Cad): Caso[] {
  const ida = m.configDoFormulario(m.formularioDaConfig(REAL));
  const base = m.formularioDaConfig(REAL);
  const nbsCurto = m.configDoFormulario({ ...base, codigoNbs: "12345678" });
  const semCnpj = m.configDoFormulario({ ...base, cnpj: "" });
  const comGrupo = m.configDoFormulario({ ...base, grupoIbsCbs: "sim" });
  const aliquota = m.configDoFormulario({ ...base, aliquota: "2,5" });
  const aliqAlta = m.configDoFormulario({ ...base, aliquota: "15" });
  const letras = m.configDoFormulario({ ...base, itemListaServico: "15a01" });
  return [
    ["cadastro: o cadastro real vai à tela e volta IGUAL (nenhum campo perdido)", ida.ok && igual(ida.config, REAL)],
    ["cadastro: NBS com 8 dígitos é RECUSADO com o nome do campo", !nbsCurto.ok && nbsCurto.problemas.some((p) => p.startsWith("NBS"))],
    ["cadastro: sem CNPJ é recusado", !semCnpj.ok && semCnpj.problemas.some((p) => p.startsWith("CNPJ"))],
    ["cadastro: grupo do IBS/CBS = sim tira a marca false (o grupo volta)", comGrupo.ok && !("grupoIbsCbs" in comGrupo.config)],
    ["cadastro: alíquota com vírgula vira número (2,5 → 2.5)", aliquota.ok && aliquota.config.aliquota === 2.5],
    ["cadastro: alíquota acima de 5% é RECUSADA, não ignorada", !aliqAlta.ok],
    ["cadastro: letra no código do serviço é recusada", !letras.ok],
  ];
}

const DADOS = {
  nome: "ALL4 PAY MEIOS DE PAGAMENTOS LTDA", cnpj: "54.579.688/0001-35", inscricaoMunicipal: "1301704-7", regimeTributario: "3",
  email: "fiscal@exemplo.com.br", logradouro: "Rua X", numero: "10", bairro: "Centro", municipio: "São Paulo", uf: "sp", cep: "01001-000",
  padrao: "municipal" as const, certificadoBase64: "A".repeat(200), senhaCertificado: "segredo-123",
};
function casosDaEmpresa(m: Emp): Caso[] {
  const mun = m.montarEmpresaFocus(DADOS);
  const nac = m.montarEmpresaFocus({ ...DADOS, padrao: "nacional" });
  const semCert = m.montarEmpresaFocus({ ...DADOS, certificadoBase64: "" });
  const resp = m.lerRespostaEmpresa(422, { mensagem: "Certificado vencido", senha_certificado: "segredo-123" });
  return [
    ["empresa: na prefeitura liga a NFS-e da prefeitura e DESLIGA a nacional", mun.ok && mun.corpo.habilita_nfse === true && mun.corpo.habilita_nfsen_producao === false],
    ["empresa: no emissor nacional, o contrário", nac.ok && nac.corpo.habilita_nfse === false && nac.corpo.habilita_nfsen_producao === true],
    ["empresa: CNPJ, IM e CEP só com dígitos, IM e CEP como número, UF maiúscula", mun.ok && mun.corpo.cnpj === "54579688000135" && mun.corpo.inscricao_municipal === 13017047 && mun.corpo.cep === 1001000 && mun.corpo.uf === "SP"],
    ["empresa: sem certificado é recusado ANTES de ir à Focus", !semCert.ok && semCert.problemas.some((p) => p.startsWith("Certificado"))],
    ["empresa: a resposta para a tela nunca ecoa a senha", !resp.ok && !resp.mensagem.includes("segredo-123") && resp.mensagem.includes("Certificado vencido")],
  ];
}

const pos = (t: string, s: string) => t.indexOf(s);
const antes = (t: string, a: string, b: string) => pos(t, a) >= 0 && pos(t, b) >= 0 && pos(t, a) < pos(t, b);
function casosDasRotas(t: Textos): Caso[] {
  const re = t.rotaEmitente, rf = t.rotaEmpresa;
  const outros = ["rotaEmitente", "rotaEmpresa"] as const;
  return [
    ["rota do cadastro: plataforma (admin_exigir_acesso) → conferência → só então a escrita",
      antes(re, "admin_exigir_acesso", "configDoFormulario(valores)") && antes(re, "configDoFormulario(valores)", ".upsert(")],
    ["rota do cadastro: grava quem mudou", /atualizado_por:\s*auth\.user/.test(re)],
    ["rota da Focus: plataforma → interruptor → conferência → só então a Focus",
      antes(rf, "admin_exigir_acesso", "cadastroEmpresasLigado()") && antes(rf, "cadastroEmpresasLigado()", "montarEmpresaFocus(") && antes(rf, "montarEmpresaFocus(", "cadastrarEmpresaNaFocus(")],
    ["rota da Focus: simular é o padrão (só cria com simular=false explícito)", /const simular = corpo\.simular !== false;/.test(rf)],
    ["rota da Focus: nada vai a log", !/console\./.test(rf)],
    ["interruptor: FOCUS_NFE_EMPRESAS é lido SÓ pelo cliente da Focus",
      /FOCUS_NFE_EMPRESAS === "ligado"/.test(t.cliente) && outros.every((k) => !/FOCUS_NFE_EMPRESAS/.test(t[k]))],
    ["cliente: o cadastro de empresas vai sempre à PRODUÇÃO (a Focus não tem empresas na homologação)", /chamar\("POST", `\/v2\/empresas\$\{simular \? "\?dry_run=1" : ""\}`, corpo, "producao"\)/.test(t.cliente)],
  ];
}

function relatar(casos: Caso[]): number {
  let f = 0;
  for (const [nome, ok] of casos) { if (!ok) f++; console.log(`${ok ? "✓" : "✗"} ${nome}`); }
  return f;
}

const cad = (await import(pathToFileURL(ARQ_CAD).href)) as Cad;
const emp = (await import(pathToFileURL(ARQ_EMP).href)) as Emp;
const textos = Object.fromEntries(Object.entries(ARQS).map(([k, p]) => [k, fs.readFileSync(p, "utf8")])) as Textos;
let falhas = relatar(casosDoCadastro(cad)) + relatar(casosDaEmpresa(emp)) + relatar(casosDasRotas(textos));

/* ─────────────────────────── os defeitos plantados ─────────────────────────── */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nfse-cadastro-"));
let n = 0;
function fecha(nome: string, caiu: string[], esperado: string) {
  const ok = caiu.includes(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "✓" : "✗"} defeito plantado "${nome}" derruba "${esperado}"${ok ? "" : ` (caíram: ${caiu.join(" | ") || "nenhum"})`}`);
}
async function plantar<T>(nome: string, arq: string, de: string, para: string, casos: (m: T) => Caso[], esperado: string) {
  const fonte = fs.readFileSync(arq, "utf8");
  if (!fonte.includes(de)) { console.log(`✗ DEFEITO "${nome}": o trecho a alterar sumiu`); falhas++; return; }
  const copia = path.join(tmp, `m-${n++}.ts`);
  fs.writeFileSync(copia, fonte.replace(de, para));
  const m = (await import(pathToFileURL(copia).href)) as T;
  fecha(nome, casos(m).filter(([, p]) => !p).map(([c]) => c), esperado);
}
function plantarRota(nome: string, k: keyof Textos, de: string, para: string, esperado: string) {
  if (!textos[k].includes(de)) { console.log(`✗ DEFEITO "${nome}": o trecho a alterar sumiu de ${k}`); falhas++; return; }
  fecha(nome, casosDasRotas({ ...textos, [k]: textos[k].replace(de, para) }).filter(([, p]) => !p).map(([c]) => c), esperado);
}

await plantar<Cad>("campo descartado gravado calado", ARQ_CAD, "if (ficou === undefined || comparavel(ficou) !== comparavel(config[c.chave])) problemas.push", "if (false) problemas.push", casosDoCadastro, "cadastro: NBS com 8 dígitos é RECUSADO com o nome do campo");
await plantar<Cad>("grupo do IBS/CBS esquecido no formulário", ARQ_CAD, 'if (bruto === "nao") config.grupoIbsCbs = false;', "", casosDoCadastro, "cadastro: o cadastro real vai à tela e volta IGUAL (nenhum campo perdido)");
await plantar<Cad>("alíquota com vírgula", ARQ_CAD, 'Number(bruto.replace(",", "."))', "Number(bruto)", casosDoCadastro, "cadastro: alíquota com vírgula vira número (2,5 → 2.5)");
await plantar<Emp>("prefeitura e nacional ligados juntos", ARQ_EMP, "habilita_nfsen_producao: nacional,", "habilita_nfsen_producao: true,", casosDaEmpresa, "empresa: na prefeitura liga a NFS-e da prefeitura e DESLIGA a nacional");
await plantar<Emp>("certificado não conferido", ARQ_EMP, 'problemas.push("Certificado A1: envie o arquivo .pfx ou .p12.")', "void 0", casosDaEmpresa, "empresa: sem certificado é recusado ANTES de ir à Focus");
await plantar<Emp>("eco da resposta crua", ARQ_EMP, 'return { ok: false, mensagem: [msg, ...erros].filter(Boolean).join(" · ") || `A Focus recusou (HTTP ${http}).` };', "return { ok: false, mensagem: JSON.stringify(corpo) };", casosDaEmpresa, "empresa: a resposta para a tela nunca ecoa a senha");
plantarRota("escrita antes da conferência", "rotaEmitente", "  const lido = configDoFormulario(valores);\n", "  await createAdmin()?.from(\"nfse_emitentes\").upsert({});\n  const lido = configDoFormulario(valores);\n", "rota do cadastro: plataforma (admin_exigir_acesso) → conferência → só então a escrita");
plantarRota("Focus sem interruptor", "rotaEmpresa", '  if (!cadastroEmpresasLigado()) return resposta(409, { ok: false, motivo: "O cadastro de empresas na Focus está desligado." });\n', "", "rota da Focus: plataforma → interruptor → conferência → só então a Focus");
plantarRota("cria por padrão", "rotaEmpresa", "const simular = corpo.simular !== false;", "const simular = corpo.simular === true;", "rota da Focus: simular é o padrão (só cria com simular=false explícito)");
plantarRota("certificado em log", "rotaEmpresa", "  const simular = corpo.simular !== false;\n", "  const simular = corpo.simular !== false;\n  console.log(montado.corpo);\n", "rota da Focus: nada vai a log");
plantarRota("rota lendo o interruptor direto", "rotaEmpresa", "export const runtime", 'const l = process.env.FOCUS_NFE_EMPRESAS;\nexport const runtime', "interruptor: FOCUS_NFE_EMPRESAS é lido SÓ pelo cliente da Focus");
plantarRota("empresa na homologação", "cliente", 'corpo, "producao");', "corpo);", "cliente: o cadastro de empresas vai sempre à PRODUÇÃO (a Focus não tem empresas na homologação)");

console.log(falhas ? `\n✗ nfse-cadastro: ${falhas} problema(s).` : "\n✓ nfse-cadastro: cadastro fiscal e empresa na Focus coerentes, e cada defeito plantado reprovou.");
process.exit(falhas ? 1 : 0);
