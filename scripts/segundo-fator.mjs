/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O SEGUNDO FATOR — de ponta a ponta, com códigos de verdade
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   npm run segundo-fator            a jornada no NAVEGADOR (precisa do app servido)
 *   npm run segundo-fator -- --api   só contra o Auth e o banco (roda no CI)
 *
 * Exige o Supabase LOCAL com o aplicativo autenticador ligado
 * (`supabase/config.toml`, seção `[auth.mfa.totp]` — o padrão do Supabase
 * local é DESLIGADO). As variáveis SUPABASE_API_URL, SUPABASE_ANON_KEY,
 * SUPABASE_SERVICE_ROLE_KEY e SUPABASE_DB_URL saem de `supabase status -o env`
 * (lidas sozinhas quando faltam). A jornada no navegador pede o build em modo
 * REAL apontando para ele, em ALVO (padrão http://127.0.0.1:3000):
 *
 *   npm run build && npx next start -p 3000
 *
 * ⚠️ **O código vem de um gerador escrito AQUI** (RFC 6238, HMAC-SHA1 sobre a
 * chave base32), que se confere contra as âncoras LITERAIS da própria RFC na
 * largada: se ele errar, a prova para dizendo isso — "código certo recusado"
 * nunca pode reprovar pelo motivo errado.
 *
 * ⚠️ **Falta variável = falha, não pulo.** Guarda que pula sem credencial é
 * guarda que não roda.
 *
 * ⚠️ **A jornada fica fora do `npm test`** pelo mesmo motivo da do "esqueci a
 * senha": o CI não serve build real. A metade de API roda no CI (job
 * `isolamento`), e é ela que prova que o `config.toml` commitado LIGA o
 * aplicativo autenticador e que o banco recusa o administrador sem o código.
 */
import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";

const SO_API = process.argv.includes("--api");
const ALVO = process.env.ALVO ?? "http://127.0.0.1:3000";

/* ── as variáveis, de `supabase status` quando faltam ─────────────────────── */
let statusLocal = null;
const doStatus = (chave) => {
  if (statusLocal === null) {
    try {
      const saida = execFileSync("supabase", ["status", "-o", "env"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      statusLocal = Object.fromEntries(saida.split("\n").map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map((m) => [m[1], m[2]]));
    } catch { statusLocal = {}; }
  }
  return statusLocal[chave];
};
const API = process.env.SUPABASE_API_URL ?? doStatus("API_URL");
const ANON = process.env.SUPABASE_ANON_KEY ?? doStatus("ANON_KEY");
const SERVICO = process.env.SUPABASE_SERVICE_ROLE_KEY ?? doStatus("SERVICE_ROLE_KEY");
const DB = process.env.SUPABASE_DB_URL ?? doStatus("DB_URL");
for (const [nome, v] of [["SUPABASE_API_URL", API], ["SUPABASE_ANON_KEY", ANON], ["SUPABASE_SERVICE_ROLE_KEY", SERVICO], ["SUPABASE_DB_URL", DB]]) {
  if (!v) { console.error(`✗ falta ${nome} — esta prova mede o Supabase local; sem ele não mede nada.`); process.exit(1); }
}

let falhas = 0;
const ok = (cond, nome, detalhe = "") => {
  if (!cond) falhas++;
  console.log(`${cond ? "✓" : "✗"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
};
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const sql = (texto) => execFileSync("psql", [DB, "-v", "ON_ERROR_STOP=1", "-Atc", texto], { encoding: "utf8" }).trim();

/* ── o gerador de código, conferido contra a RFC 6238 ─────────────────────── */
function base32(s) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, val = 0; const out = [];
  for (const c of s.toUpperCase().replace(/=+$/g, "").replace(/\s+/g, "")) {
    const i = A.indexOf(c); if (i < 0) throw new Error(`base32 inválido: ${c}`);
    val = (val << 5) | i; bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}
function totp(chave, tMs = Date.now(), digitos = 6) {
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(Math.floor(tMs / 1000 / 30)));
  const h = createHmac("sha1", chave).update(msg).digest();
  const o = h[h.length - 1] & 0x0f;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 10 ** digitos).padStart(digitos, "0");
}
// RFC 6238, apêndice B (SHA1, chave ASCII "12345678901234567890", 8 dígitos).
const ANCORAS = [[59, "94287082"], [1111111109, "07081804"], [1111111111, "14050471"], [1234567890, "89005924"], [2000000000, "69279037"], [20000000000, "65353130"]];
const rfc = Buffer.from("12345678901234567890");
const geradorCerto = ANCORAS.every(([t, c]) => totp(rfc, t * 1000, 8) === c);
ok(geradorCerto, "o gerador de código da prova bate as âncoras da RFC 6238");
if (!geradorCerto) { console.error("✗ o gerador da PROVA está errado — nada abaixo mediria o sistema."); process.exit(1); }

/** O código da janela atual — esperando a próxima se faltam menos de 3 s (ela viraria no meio do envio). */
async function codigoAgora(chave) {
  const resto = 30_000 - (Date.now() % 30_000);
  if (resto < 3_000) await esperar(resto + 200);
  return totp(chave);
}
/** Um código da PRÓXIMA janela — para não reusar o código que acabou de passar. */
async function codigoNovo(chave, usado) {
  let c = await codigoAgora(chave);
  while (c === usado) { await esperar(30_000 - (Date.now() % 30_000) + 300); c = totp(chave); }
  return c;
}
const errado = (c) => String((Number(c) + 500_000) % 1_000_000).padStart(6, "0");

/* ── o Auth e o banco por HTTP — sem dependência (o job do CI não instala o projeto) ── */
const SENHA = "Senha#2026fa";
const sufixo = Date.now().toString(36);
async function auth(caminho, { metodo = "POST", token, corpo, servico = false } = {}) {
  const r = await fetch(`${API}/auth/v1${caminho}`, {
    method: metodo,
    headers: { apikey: servico ? SERVICO : ANON, authorization: `Bearer ${servico ? SERVICO : token ?? ANON}`, "content-type": "application/json" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const texto = await r.text();
  let json = null; try { json = texto ? JSON.parse(texto) : null; } catch { /* corpo vazio */ }
  return { status: r.status, json, erro: r.ok ? null : (json?.error_code ?? json?.code ?? `HTTP ${r.status}`) };
}
async function rpc(nome, token, args = {}) {
  const r = await fetch(`${API}/rest/v1/rpc/${nome}`, {
    method: "POST",
    headers: { apikey: ANON, authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(args),
  });
  return r.ok ? r.json() : null;
}
const nivel = (token) => JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).aal;
const entrarComSenha = async (email) => (await auth("/token?grant_type=password", { corpo: { email, password: SENHA } })).json?.access_token ?? "";
const cadastrar = (token, nome) => auth("/factors", { token, corpo: { factor_type: "totp", issuer: "Quattro", friendly_name: nome } });
async function conferir(token, fatorId, code) {
  const c = await auth(`/factors/${fatorId}/challenge`, { token, corpo: {} });
  if (c.erro) return c;
  return auth(`/factors/${fatorId}/verify`, { token, corpo: { challenge_id: c.json.id, code } });
}

async function criarConta(email) {
  const r = await auth("/admin/users", { servico: true, corpo: { email, password: SENHA, email_confirm: true, user_metadata: { company: "Teste do segundo fator" } } });
  if (r.erro) throw new Error(`criar conta ${email}: ${r.erro}`);
  return r.json.id;
}
const apagarConta = (id) => auth(`/admin/users/${id}`, { metodo: "DELETE", servico: true });
const fatoresDe = async (id) => {
  const r = await auth(`/admin/users/${id}/factors`, { metodo: "GET", servico: true });
  return Array.isArray(r.json) ? r.json : (r.json?.factors ?? []);
};
function tornarAdministrador(id, email) {
  sql(`insert into public.platform_admin_permitidos (email, motivo) values ('${email}', 'prova do segundo fator (npm run segundo-fator)') on conflict (email) do nothing;
       insert into public.platform_admins (user_id, motivo, exige_mfa, mfa_prazo) values ('${id}', 'prova do segundo fator', true, current_date + 30)
       on conflict (user_id) do update set exige_mfa = true, mfa_prazo = current_date + 30;`);
}
function limpar(id, email) {
  try { sql(`delete from public.platform_admins where user_id = '${id}'; delete from public.platform_admin_permitidos where email = '${email}';`); } catch { /* resíduo de teste local */ }
}

/* ═══════════════════════════════ METADE DE API ═══════════════════════════ */
async function provaDeApi() {
  console.log(`\nSEGUNDO FATOR — contra o Auth e o banco (${API})\n`);
  const email = `fator.api.${sufixo}@teste.local`;
  const id = await criarConta(email);
  try {
    const t0 = await entrarComSenha(email);
    const en = await cadastrar(t0, "Aplicativo autenticador");
    ok(!en.erro, "o Auth local CADASTRA o aplicativo (o config.toml liga o TOTP)",
       en.erro ? `${en.erro} — confira [auth.mfa.totp] em supabase/config.toml` : "");
    if (en.erro) return;
    const fator = en.json.id;
    const uri = new URL(en.json.totp.uri);
    ok(uri.searchParams.get("issuer") === "Quattro" && uri.searchParams.get("secret") === en.json.totp.secret
       && uri.searchParams.get("algorithm") === "SHA1" && uri.searchParams.get("digits") === "6" && uri.searchParams.get("period") === "30",
       "o endereço do aplicativo traz a marca, a chave e o formato que o gerador da prova usa");
    const chave = base32(en.json.totp.secret);

    const dupla = await cadastrar(t0, "Aplicativo autenticador");
    ok(dupla.erro === "mfa_factor_name_conflict",
       "um cadastro abandonado com o MESMO nome trava o próximo — por isso a porta apaga os abandonados antes", dupla.erro ?? "aceitou");

    const certo = await codigoAgora(chave);
    const recusa = await conferir(t0, fator, errado(certo));
    ok(recusa.erro === "mfa_verification_failed", "código errado é recusado com o motivo próprio", recusa.erro ?? "aceitou");
    ok((await fatoresDe(id)).every((f) => f.status !== "verified"), "o aplicativo continua NÃO verificado depois do código errado");

    const v = await conferir(t0, fator, certo);
    const t2 = v.json?.access_token ?? "";
    ok(!v.erro && nivel(t2) === "aal2", "código certo sobe a sessão para aal2", v.erro ?? "");
    ok((await fatoresDe(id)).filter((f) => f.status === "verified").length === 1, "a conta fica com 1 aplicativo verificado");

    tornarAdministrador(id, email);
    ok((await rpc("is_platform_admin", t2)) === true, "o administrador com o código (aal2) passa no portão do banco");
    const t1 = await entrarComSenha(email);
    ok(nivel(t1) === "aal1", "entrar só com a senha dá sessão aal1", nivel(t1));
    ok((await rpc("is_platform_admin", t1)) === false, "o banco RECUSA o administrador que entrou só com a senha");
    const ver = (await rpc("admin_veredito", t1))?.[0];
    ok(/segundo fator cadastrado e nao utilizado nesta sessao/.test(ver?.motivo ?? ""), "e diz o motivo certo (o código não foi digitado nesta sessão)", ver?.motivo ?? "");
    const troca = await auth("/user", { metodo: "PUT", token: t1, corpo: { password: "Outra#2026fa" } });
    ok(troca.erro === "insufficient_aal", "trocar a senha sem o código é recusado (o 'esqueci a senha' passa pelo código antes)", troca.erro ?? "aceitou");
    const rem1 = await auth(`/factors/${fator}`, { metodo: "DELETE", token: t1 });
    ok(rem1.erro === "insufficient_aal", "remover o aplicativo só com a senha é recusado", rem1.erro ?? "aceitou");

    const v2 = await conferir(t1, fator, await codigoNovo(chave, certo));
    const t3 = v2.json?.access_token ?? "";
    ok(!v2.erro && (await rpc("is_platform_admin", t3)) === true, "depois do código, a sessão passa no portão do banco", v2.erro ?? "");
    const rem2 = await auth(`/factors/${fator}`, { metodo: "DELETE", token: t3 });
    ok(!rem2.erro && (await fatoresDe(id)).length === 0, "com o código, remover o aplicativo funciona", rem2.erro ?? "");
  } finally {
    limpar(id, email);
    await apagarConta(id);
  }
}

/* ═══════════════════════════════ A JORNADA ═══════════════════════════════ */
async function jornada() {
  const { chromium } = await import("playwright");
  console.log(`\nSEGUNDO FATOR — a jornada no navegador contra ${ALVO}\n`);
  const navegador = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }).catch(() => chromium.launch());
  const errosDePagina = [];
  const novo = async () => {
    const ctx = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errosDePagina.push(e.message));
    return { ctx, page };
  };
  const caminho = (page) => new URL(page.url()).pathname;
  const aviso = async (page) => (await page.locator('[role="alert"], [role="status"]').allInnerTexts()).join(" | ");
  const entrar = async (page, email) => {
    await page.goto(`${ALVO}/login`, { waitUntil: "networkidle" });
    await page.getByLabel("E-mail", { exact: true }).fill(email);
    await page.getByLabel("Senha", { exact: true }).fill(SENHA);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 10000 }).catch(() => {});
    await page.waitForLoadState("networkidle").catch(() => {});
  };
  const ir = async (page, rota) => { await page.goto(`${ALVO}${rota}`, { waitUntil: "networkidle" }); return caminho(page); };
  const digitar = async (page, codigo) => {
    await page.getByLabel("Código de 6 dígitos", { exact: true }).fill(codigo);
    await page.getByRole("button", { name: /^Confirmar( código)?$/ }).click();
  };

  const email = `fator.ui.${sufixo}@teste.local`;
  const id = await criarConta(email);
  try {
    /* 1. Sem aplicativo, a entrada é como sempre. */
    const a = await novo();
    await entrar(a.page, email);
    ok(caminho(a.page) === "/", "sem aplicativo, a senha entra direto", caminho(a.page));
    ok((await ir(a.page, "/segundo-fator")) === "/", "sem aplicativo, o passo do código devolve ao início (nunca pede um código que não existe)", caminho(a.page));

    /* Uma sessão de OUTRO aparelho, aberta ANTES do cadastro. */
    const outro = await novo();
    await entrar(outro.page, email);

    /* 2. O cadastro. */
    await ir(a.page, "/configuracoes/seguranca");
    await a.page.getByRole("button", { name: "Cadastrar aplicativo autenticador" }).click();
    const link = a.page.getByRole("link", { name: "Abrir no aplicativo autenticador" });
    await link.waitFor({ timeout: 10000 });
    const uri = new URL(await link.getAttribute("href"));
    const chaveTela = (await a.page.locator(".font-mono").first().innerText()).replace(/\s+/g, "");
    ok(chaveTela === uri.searchParams.get("secret") && uri.searchParams.get("issuer") === "Quattro",
       "a tela mostra a chave manual igual à do QR, e o aplicativo leva o nome da marca");
    ok(await a.page.locator('[role="img"][aria-label="Código QR para cadastrar o aplicativo autenticador"]').count() === 1,
       "o QR é desenhado pela casa, com o rótulo do cadastro (e não o do link de pagamento)");
    const chave = base32(chaveTela);

    // Abandona no meio (recarregar) e recomeça: o abandonado não pode travar.
    await a.page.reload({ waitUntil: "networkidle" });
    ok(/Não confirmado/.test(await a.page.locator("main").innerText()), "o cadastro abandonado aparece como 'Não confirmado'");
    await a.page.getByRole("button", { name: "Cadastrar aplicativo autenticador" }).click();
    const link2 = a.page.getByRole("link", { name: "Abrir no aplicativo autenticador" });
    await link2.waitFor({ timeout: 10000 });
    const chave2 = base32(new URL(await link2.getAttribute("href")).searchParams.get("secret"));
    ok((await fatoresDe(id)).filter((f) => f.status !== "verified").length === 1, "recomeçar apaga o abandonado (sobra só o cadastro em andamento)");

    const c1 = await codigoAgora(chave2);
    await digitar(a.page, errado(c1));
    await a.page.waitForTimeout(800);
    ok(/Código incorreto ou vencido/.test(await aviso(a.page)), "código errado: a frase diz o que fazer, em português", await aviso(a.page));
    ok((await fatoresDe(id)).every((f) => f.status !== "verified"), "e nada foi ativado");
    await digitar(a.page, c1);
    await a.page.getByText(/Aplicativo autenticador ativado/).waitFor({ timeout: 10000 }).catch(() => {});
    ok(/Aplicativo autenticador ativado/.test(await aviso(a.page)), "código certo: ativado, e a tela diz o que muda na próxima entrada");
    ok((await fatoresDe(id)).filter((f) => f.status === "verified").length === 1, "a conta fica com 1 aplicativo verificado");
    ok(chave.length > 0, "a primeira chave (abandonada) foi lida");

    /* 3. A sessão do outro aparelho NÃO entra só com a senha. */
    const rotaOutro = await ir(outro.page, "/");
    ok(rotaOutro === "/segundo-fator" || rotaOutro === "/login",
       "a sessão aberta ANTES do cadastro não chega ao sistema (vai ao código ou foi encerrada)", rotaOutro);

    /* 4. A entrada com o aplicativo. */
    const b = await novo();
    await entrar(b.page, email);
    ok(caminho(b.page) === "/segundo-fator", "com aplicativo, a senha leva ao passo do código", caminho(b.page));
    ok((await ir(b.page, "/")) === "/segundo-fator", "abrir o início direto continua no código (sem laço)", caminho(b.page));
    ok((await ir(b.page, "/admin")) === "/segundo-fator", "a área da plataforma também pede o código antes de qualquer outra resposta", caminho(b.page));
    const c2 = await codigoNovo(chave2, c1);
    await digitar(b.page, errado(c2));
    await b.page.waitForTimeout(800);
    ok(/Código incorreto ou vencido/.test(await aviso(b.page)) && caminho(b.page) === "/segundo-fator", "código errado na entrada é recusado e a pessoa continua no passo");
    await digitar(b.page, c2);
    await b.page.waitForURL((u) => u.pathname === "/", { timeout: 10000 }).catch(() => {});
    ok(caminho(b.page) === "/", "código certo entra no sistema", caminho(b.page));
    ok((await ir(b.page, "/segundo-fator")) === "/", "depois do código, o passo devolve ao início", caminho(b.page));

    /* 5. O administrador: o banco recusa sem o código e aceita com ele. */
    tornarAdministrador(id, email);
    const r200 = await b.page.goto(`${ALVO}/admin`, { waitUntil: "networkidle" });
    ok(r200?.status() === 200 && caminho(b.page) === "/admin", "o administrador com o código abre /admin", `${r200?.status()} ${caminho(b.page)}`);
    const c = await novo();
    await entrar(c.page, email);
    ok((await ir(c.page, "/admin")) === "/segundo-fator", "o administrador que entrou só com a senha é levado ao código, não à recusa", caminho(c.page));
    const aal = sql(`select count(*) from public.admin_acessos where admin_id = '${id}' and permitido`);
    ok(Number(aal) >= 1, "o acesso permitido ficou registrado na trilha do administrador", aal);

    /* 6. Remover: a confirmação não promete desfazer, e a entrada volta a um passo. */
    await ir(b.page, "/configuracoes/seguranca");
    await b.page.getByRole("button", { name: "Remover", exact: true }).click();
    ok(/não pode ser desfeita/.test(await b.page.getByRole("dialog").innerText()), "a confirmação diz que a remoção não volta");
    await b.page.getByRole("dialog").getByRole("button", { name: "Remover", exact: true }).click();
    await b.page.getByText(/removido/).waitFor({ timeout: 10000 }).catch(() => {});
    ok((await fatoresDe(id)).length === 0, "o aplicativo foi removido da conta");
    const d = await novo();
    await entrar(d.page, email);
    ok(caminho(d.page) === "/", "sem aplicativo de novo, a senha volta a entrar direto", caminho(d.page));

    ok(errosDePagina.length === 0, "nenhum erro de página na jornada", errosDePagina.slice(0, 3).join(" | "));
  } finally {
    limpar(id, email);
    await apagarConta(id);
    await navegador.close();
  }
}

try {
  await provaDeApi();
  if (!SO_API) await jornada();
} catch (e) {
  falhas++;
  console.error(`✗ a prova quebrou: ${e instanceof Error ? e.message : e}`);
}
console.log(`\n${falhas === 0 ? "✓ TODOS" : `✗ ${falhas} FALHA(S)`} — segundo fator`);
process.exit(falhas === 0 ? 0 : 1);
