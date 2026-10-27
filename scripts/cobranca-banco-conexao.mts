/**
 * "CONECTAR MEU BANCO" — a guarda (`npm run cobranca-banco-conexao`).
 *
 * Três partes:
 *   1. O cofre (`lib/cobranca-banco/cofre.ts`): ida e volta, e as recusas —
 *      outra conexão, texto adulterado, outra chave-mestra, chave ausente.
 *   2. As regras puras (`core/cobranca-banco/conexao.ts`): a reserva que não
 *      fecha LANÇA (o nosso número tem de ser o do id), a credencial guardada,
 *      o formulário que nunca repete o valor digitado.
 *   3. O texto das rotas: nenhum log carrega segredo, e o portão de
 *      administrar vem ANTES do teste no banco.
 * E DEFEITOS PLANTADOS em cópias do cofre e do core: cada um tem de derrubar
 * o caso que o nomeia. Guarda que nunca reprovou é decoração.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";

type ModCofre = typeof import("../src/lib/cobranca-banco/cofre.ts");
type ModConexao = typeof import("../src/core/cobranca-banco/conexao.ts");

const ARQ_COFRE = path.resolve("src/lib/cobranca-banco/cofre.ts");
const ARQ_CONEXAO = path.resolve("src/core/cobranca-banco/conexao.ts");

let falhas = 0;
let total = 0;
let calado = false;
function ok(nome: string, cond: boolean, detalhe = "") {
  total++;
  if (!cond) {
    falhas++;
    if (!calado) console.error(`  ✗ ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  }
}

const ENV = { COBRANCA_CHAVE_MESTRA: randomBytes(32).toString("base64") };
const OUTRA = { COBRANCA_CHAVE_MESTRA: randomBytes(32).toString("base64") };
const ID_A = "11111111-2222-4333-8444-555555555555";
const ID_B = "99999999-2222-4333-8444-555555555555";
const SEGREDO = {
  clientSecret: "segredo-de-teste-123",
  certificado: "-----BEGIN CERTIFICATE-----\nAAA\n-----END CERTIFICATE-----",
  chave: "-----BEGIN PRIVATE KEY-----\nBBB\n-----END PRIVATE KEY-----",
};

const lanca = (f: () => unknown) => {
  try {
    f();
    return false;
  } catch {
    return true;
  }
};

/** Os casos do cofre. Devolve os nomes que reprovaram (para os plantados). */
function casosCofre(C: ModCofre): string[] {
  const antes = falhas;
  const nomes: string[] = [];
  const caso = (nome: string, cond: boolean) => {
    ok(nome, cond);
    if (!cond) nomes.push(nome);
  };
  const t = C.cifrarSegredo(SEGREDO, ID_A, ENV);
  caso("cofre: o formato é v1.<iv>.<tag>.<cifra>", /^v1\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/.test(t));
  caso("cofre: o texto cifrado não contém o segredo", !t.includes(SEGREDO.clientSecret) && !t.includes("BEGIN"));
  caso("cofre: duas cifras do mesmo segredo diferem (iv novo)", C.cifrarSegredo(SEGREDO, ID_A, ENV) !== t);
  let volta: unknown = null;
  try {
    volta = C.decifrarSegredo(t, ID_A, ENV);
  } catch {
    volta = null;
  }
  caso("cofre: ida e volta devolve o mesmo segredo", JSON.stringify(volta) === JSON.stringify(SEGREDO));
  caso("cofre: o texto de uma conexão NÃO abre em outra", lanca(() => C.decifrarSegredo(t, ID_B, ENV)));
  caso("cofre: outra chave-mestra não abre", lanca(() => C.decifrarSegredo(t, ID_A, OUTRA)));
  const partes = t.split(".");
  const cifra = Buffer.from(partes[3], "base64");
  cifra[0] ^= 1;
  const adulterado = [partes[0], partes[1], partes[2], cifra.toString("base64")].join(".");
  caso("cofre: texto adulterado não abre", lanca(() => C.decifrarSegredo(adulterado, ID_A, ENV)));
  caso("cofre: sem chave-mestra não cifra", lanca(() => C.cifrarSegredo(SEGREDO, ID_A, {})));
  caso("cofre: chave-mestra curta não cifra", lanca(() => C.cifrarSegredo(SEGREDO, ID_A, { COBRANCA_CHAVE_MESTRA: randomBytes(16).toString("base64") })));
  caso("cofre: cofreDisponivel diz não sem a chave", C.cofreDisponivel({}) === false && C.cofreDisponivel(ENV) === true);
  let msg = "";
  try {
    C.decifrarSegredo(t, ID_B, ENV);
  } catch (e) {
    msg = e instanceof Error ? e.message : "";
  }
  caso("cofre: o erro não traz pedaço de chave nem de segredo", !msg.includes(ENV.COBRANCA_CHAVE_MESTRA.slice(0, 8)) && !msg.includes("segredo-de-teste"));
  void antes;
  return nomes;
}

const ID_COB = "abcdef01-2345-4678-9abc-def012345678";
const SEU = "abcdef012345467";
const RESERVA_NOVA = {
  existente: false, id: ID_COB, conexaoId: ID_A, provedor: "inter", ambiente: "sandbox", tipo: "boleto_pix",
  seuNumero: SEU, valor: 150.5, vencimento: "2026-11-10", descricao: "Mensalidade",
  devedor: { nome: "Cliente", documento: "12345678909" },
};

function casosConexao(X: ModConexao): string[] {
  const nomes: string[] = [];
  const caso = (nome: string, cond: boolean) => {
    ok(nome, cond);
    if (!cond) nomes.push(nome);
  };
  let r: ReturnType<ModConexao["lerReservaBanco"]> | null = null;
  try {
    r = X.lerReservaBanco(RESERVA_NOVA);
  } catch {
    r = null;
  }
  caso("reserva: a nova vira pedido com o nosso número do id", !!r && r.forma === "nova" && r.pedido.seuNumero === SEU && r.pedido.valor === 150.5);
  caso("reserva: nosso número que não é o do id LANÇA", lanca(() => X.lerReservaBanco({ ...RESERVA_NOVA, seuNumero: "000000000000000" })));
  caso("reserva: valor zero LANÇA", lanca(() => X.lerReservaBanco({ ...RESERVA_NOVA, valor: 0 })));
  caso("reserva: sem conexão LANÇA", lanca(() => X.lerReservaBanco({ ...RESERVA_NOVA, conexaoId: "x" })));
  caso("reserva: existente não pede nada", (() => {
    try {
      return X.lerReservaBanco({ id: ID_COB, existente: true }).forma === "existente";
    } catch {
      return false;
    }
  })());
  caso("reserva: processando sem o id do banco LANÇA",
    lanca(() => X.lerReservaBanco({ id: ID_COB, pendente: true, situacao: "processando", conexaoId: ID_A, seuNumero: SEU, vencimento: "2026-11-10" })));
  caso("reserva: incerta sem id vira pendente (procura pelo nosso número)", (() => {
    try {
      const p = X.lerReservaBanco({ id: ID_COB, pendente: true, situacao: "incerta", conexaoId: ID_A, seuNumero: SEU, vencimento: "2026-11-10" });
      return p.forma === "pendente" && p.idProvedor === null;
    } catch {
      return false;
    }
  })());
  caso("credencial: sem o texto cifrado LANÇA",
    lanca(() => X.lerCredencialGuardada({ id: ID_A, orgId: ID_B, provedor: "inter", ambiente: "sandbox", clientId: "c", cifrado: "aberto" })));
  caso("credencial: ambiente desconhecido LANÇA",
    lanca(() => X.lerCredencialGuardada({ id: ID_A, orgId: ID_B, provedor: "inter", ambiente: "prod", clientId: "c", cifrado: "v1.a.b.c" })));
  const form = { ambiente: "producao", clientId: "id", clientSecret: "zzSEGREDOzz", certificado: SEGREDO.certificado, chave: SEGREDO.chave, contaCorrente: "" };
  caso("formulário: o certo passa", X.problemasDaConexao(form).length === 0);
  const ruim = X.problemasDaConexao({ ...form, ambiente: "x", certificado: "zzSEGREDOzz", chave: "zzSEGREDOzz", contaCorrente: "abc" });
  caso("formulário: o errado aponta ambiente, certificado, chave e conta", ruim.length === 4);
  caso("formulário: nenhuma frase repete o valor digitado", !ruim.some((p) => p.includes("zzSEGREDOzz")));
  caso("interruptor: nasce desligado", !X.cobrancaBancoLigada({}) && X.cobrancaBancoLigada({ COBRANCA_BANCO: "ligado" }));
  caso("certificado: dias para vencer", X.diasParaVencer("2026-11-26", "2026-10-27") === 30 && X.diasParaVencer(null, "2026-10-27") === null);
  return nomes;
}

const Cofre = (await import("@/lib/cobranca-banco/cofre")) as ModCofre;
const Conexao = (await import("@/core/cobranca-banco/conexao")) as ModConexao;
casosCofre(Cofre);
casosConexao(Conexao);

// ---- 3. o texto das rotas ----
const rotaConexao = fs.readFileSync("src/app/api/cobranca-banco/conexao/route.ts", "utf8");
const rotaEmitir = fs.readFileSync("src/app/api/cobranca-banco/emitir/route.ts", "utf8");
const servidor = fs.readFileSync("src/lib/cobranca-banco/conexao-servidor.ts", "utf8");
const logs = [rotaConexao, rotaEmitir, servidor].flatMap((t) => t.match(/console\.\w+\([\s\S]*?\)\);?/g) ?? []);
ok("rotas: há log das chamadas (o rastro existe)", logs.length >= 3);
ok("rotas: nenhum log leva segredo, certificado, chave, cifra ou dado do pagador",
  logs.every((l) => !/clientSecret|\.certificado|\.chave|cifrado|devedor|\bcfg\b|pedido|\bs\.(clientSecret|certificado|chave)/.test(l)));
ok("conectar: pergunta 'administrar' ANTES de testar no banco",
  rotaConexao.indexOf('p_acao: "administrar"') > 0 && rotaConexao.indexOf('p_acao: "administrar"') < rotaConexao.indexOf("testarCredencialInter({"));
ok("conectar: o interruptor vem antes da sessão", rotaConexao.indexOf("cobrancaBancoLigada(process.env)", rotaConexao.indexOf("export async function POST")) < rotaConexao.indexOf("getUser", rotaConexao.indexOf("export async function POST")));
ok("conectar: nenhuma resposta devolve o segredo", !/resposta\([^)]*(clientSecret|cifrado)/.test(rotaConexao));
ok("emitir: a reserva é feita COMO A PESSOA (cliente da sessão)", /s\.rpc\("cobranca_banco_reservar"/.test(rotaEmitir));
ok("emitir: o registro é da chave de serviço", /admin\.rpc\("cobranca_banco_registrar"/.test(rotaEmitir));
ok("emitir: a pendente é CONFERIDA, nunca emitida de novo",
  /forma === "pendente"\)\s*\{\s*resultado = await conferir/.test(rotaEmitir));

// ---- DEFEITOS PLANTADOS ----
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cobranca-banco-"));
async function plantar<T>(arq: string, de: string | RegExp, para: string, nome: string): Promise<T> {
  const fonte = fs.readFileSync(arq, "utf8");
  const novo = fonte.replace(de, para);
  if (novo === fonte) throw new Error(`plantio "${nome}" não casou no arquivo`);
  const destino = path.join(tmp, `${nome.replace(/\W+/g, "-")}-${path.basename(arq)}`);
  fs.writeFileSync(destino, novo);
  return (await import(pathToFileURL(destino).href)) as T;
}

const antesPlantados = { falhas, total };
const plantados: { nome: string; espera: string; pegou: boolean }[] = [];
async function defeitoCofre(nome: string, de: string | RegExp, para: string, espera: string) {
  const M = await plantar<ModCofre>(ARQ_COFRE, de, para, nome);
  const f0 = falhas;
  const t0 = total;
  calado = true;
  const reprovou = casosCofre(M);
  calado = false;
  falhas = f0;
  total = t0;
  plantados.push({ nome, espera, pegou: reprovou.some((n) => n.includes(espera)) });
}
async function defeitoConexao(nome: string, de: string | RegExp, para: string, espera: string) {
  const M = await plantar<ModConexao>(ARQ_CONEXAO, de, para, nome);
  const f0 = falhas;
  const t0 = total;
  calado = true;
  const reprovou = casosConexao(M);
  calado = false;
  falhas = f0;
  total = t0;
  plantados.push({ nome, espera, pegou: reprovou.some((n) => n.includes(espera)) });
}

await defeitoCofre("sem dado adicional", /\s*[cd]\.setAAD\(Buffer\.from\(conexaoId, "utf8"\)\);\n/g, "\n", "NÃO abre em outra");
await defeitoCofre("iv fixo", "randomBytes(12)", "Buffer.alloc(12)", "iv novo");
await defeitoCofre("cofre sempre disponível", /chaveMestra\(env\);\n(\s*)return true;/, "return true;", "cofreDisponivel diz não");
await defeitoConexao("nosso número sem conferir", "|| seuNumero !== esperado", "", "não é o do id");
await defeitoConexao("processando sem id passa", 'if (situacao === "processando" && !idProvedor)', "if (false)", "processando sem o id");
await defeitoConexao("credencial aberta passa", 'v.cifrado.startsWith("v1.")', "true", "sem o texto cifrado");
await defeitoConexao("interruptor ligado por padrão", '=== "ligado"', '!== "desligado"', "nasce desligado");

for (const p of plantados) ok(`plantado: "${p.nome}" derruba "${p.espera}"`, p.pegou);
fs.rmSync(tmp, { recursive: true, force: true });
void antesPlantados;

if (falhas) {
  console.error(`cobranca-banco-conexao: ${falhas} de ${total} reprovaram`);
  process.exit(1);
}
console.log(`cobranca-banco-conexao: ${total} casos · ${plantados.length} defeitos plantados pegos · o cofre e a reserva conferem`);
