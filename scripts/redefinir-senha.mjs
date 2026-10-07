/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A JORNADA DO "ESQUECI A SENHA" — de ponta a ponta, com e-mail de verdade
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   npm run senha
 *
 * Exige o Supabase LOCAL com o servidor de e-mail (Mailpit) e o app servido em
 * modo REAL (não demonstração) apontando para ele, em http://127.0.0.1:3000 —
 * o endereço padrão que o Auth local aceita como destino do link:
 *
 *   supabase start -x studio,realtime,storage-api,imgproxy,edge-runtime,logflare,vector,supavisor,postgres-meta
 *   (as variáveis SUPABASE_API_URL, SUPABASE_SERVICE_ROLE_KEY e MAILPIT_URL
 *    saem de `supabase status -o env`; o build leva NEXT_PUBLIC_SUPABASE_URL e
 *    NEXT_PUBLIC_SUPABASE_ANON_KEY do mesmo lugar)
 *   npm run build && npx next start -p 3000
 *
 * ⚠️ **Fora do `npm test` e do CI, e o motivo é medido.** O CI sobe o Supabase
 * SEM o servidor de e-mail, e o defeito que esta jornada existe para pegar só
 * aparece com o e-mail de verdade: a tela de pedido diz "enviamos" com ou sem
 * envio (é a regra contra descobrir quais e-mails têm conta). Conferir a tela
 * seria conferir uma frase fixa; esta jornada abre o e-mail e segue o link.
 *
 * ⚠️ **Falta variável = falha, não pulo.** Guarda que "pula sem credencial" é
 * guarda que não roda.
 */
import { chromium } from "playwright";

const ALVO = process.env.ALVO ?? "http://127.0.0.1:3000";
const API = process.env.SUPABASE_API_URL;
const SERVICO = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MAIL = process.env.MAILPIT_URL;

for (const [nome, v] of [["SUPABASE_API_URL", API], ["SUPABASE_SERVICE_ROLE_KEY", SERVICO], ["MAILPIT_URL", MAIL]]) {
  if (!v) { console.error(`✗ falta ${nome} — esta jornada mede o Supabase local com e-mail; sem ele não mede nada.`); process.exit(1); }
}

let falhas = 0;
const ok = (cond, nome, detalhe = "") => {
  if (!cond) falhas++;
  console.log(`${cond ? "✓" : "✗"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
};

const SENHA_ANTIGA = "Antiga#2026";
const SENHA_NOVA = "Nova#2026x";
const sufixo = Date.now().toString(36);

/** Cria uma conta confirmada pela API de administração do Auth local. */
async function criarConta(email) {
  const r = await fetch(`${API}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: SERVICO, authorization: `Bearer ${SERVICO}`, "content-type": "application/json" },
    body: JSON.stringify({ email, password: SENHA_ANTIGA, email_confirm: true, user_metadata: { company: "Teste da senha" } }),
  });
  if (!r.ok) throw new Error(`criar conta ${email}: HTTP ${r.status} ${await r.text()}`);
}

/** O link de redefinição mais recente que chegou para o endereço. */
async function linkDoEmail(email, depoisDe = 0) {
  for (let i = 0; i < 40; i++) {
    const r = await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
    const lista = (await r.json()).messages ?? [];
    const novas = lista.filter((m) => Date.parse(m.Created) > depoisDe).sort((a, b) => Date.parse(b.Created) - Date.parse(a.Created));
    if (novas.length) {
      const msg = await (await fetch(`${MAIL}/api/v1/message/${novas[0].ID}`)).json();
      const corpo = `${msg.HTML ?? ""}\n${msg.Text ?? ""}`.replace(/&amp;/g, "&");
      const link = corpo.match(/https?:\/\/[^\s"'<>]+\/auth\/v1\/verify\?[^\s"'<>]+/)?.[0];
      if (link) return link;
    }
    await new Promise((res) => setTimeout(res, 500));
  }
  return null;
}

const navegador = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }).catch(() => chromium.launch());
const errosDePagina = [];
async function novoNavegador() {
  const ctx = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errosDePagina.push(e.message));
  return { ctx, page };
}
const caminho = (page) => new URL(page.url()).pathname;
const aviso = async (page) => (await page.locator('[role="alert"], [role="status"]').allInnerTexts()).join(" | ");

async function entrar(page, email, senha) {
  await page.goto(`${ALVO}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(senha);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 8000 }).catch(() => {});
}

async function pedirLink(page, email) {
  await page.goto(`${ALVO}/login`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Esqueci minha senha" }).click();
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  const antes = Date.now() - 1000;
  await page.getByRole("button", { name: "Enviar link de redefinição" }).click();
  await page.getByRole("status").waitFor({ timeout: 15000 });
  return antes;
}

async function abrirLink(page, link) {
  await page.goto(link, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
}

console.log(`\nESQUECI A SENHA — ponta a ponta contra ${ALVO}\n`);

const u1 = `senha.${sufixo}@teste.local`;
const u2 = `outro.${sufixo}@teste.local`;
await criarConta(u1);
await criarConta(u2);

/* 1. Uma sessão aberta ANTES — tem de cair quando a senha mudar. */
const outraSessao = await novoNavegador();
await entrar(outraSessao.page, u1, SENHA_ANTIGA);
const sessaoAbriu = caminho(outraSessao.page) === "/";
ok(sessaoAbriu, "a senha antiga entra antes da troca (sessão de outro aparelho)", caminho(outraSessao.page));

/* 2. O pedido, o e-mail e o link. */
const a = await novoNavegador();
const desde = await pedirLink(a.page, u1);
ok(/Se houver uma conta/.test(await aviso(a.page)), "o pedido mostra a frase neutra (não diz se a conta existe)");
const link1 = await linkDoEmail(u1, desde);
ok(!!link1, "o e-mail de redefinição CHEGOU, com o link");
ok(!!link1 && decodeURIComponent(link1).includes("/api/auth/recuperar"), "o link volta para a rota de retorno, não para /login", link1 ? new URL(link1).searchParams.get("redirect_to") ?? "" : "");

/* 3. O link abre a tela da senha nova. */
await abrirLink(a.page, link1);
ok(caminho(a.page) === "/redefinir-senha", "o link abre a tela de senha nova", caminho(a.page));

/* 4. As recusas antes e depois da rede. */
const nova = a.page.getByLabel("Nova senha", { exact: true });
const repetida = a.page.getByLabel("Repita a nova senha", { exact: true });
const salvar = a.page.getByRole("button", { name: "Salvar nova senha" });
await nova.fill("Abc12345"); await repetida.fill("Abc12346"); await salvar.click();
ok(/não são iguais/.test(await aviso(a.page)), "senhas diferentes são recusadas antes da rede");
await nova.fill("123"); await repetida.fill("123"); await salvar.click();
ok(/pelo menos 6/.test(await aviso(a.page)), "senha curta é recusada antes da rede");
await nova.fill(SENHA_ANTIGA); await repetida.fill(SENHA_ANTIGA); await salvar.click();
await a.page.waitForTimeout(2500);
ok(/igual à anterior/.test(await aviso(a.page)), "a senha igual à antiga é recusada PELO SERVIDOR, com frase em português", await aviso(a.page));

/* 5. A troca. */
await nova.fill(SENHA_NOVA); await repetida.fill(SENHA_NOVA); await salvar.click();
await a.page.waitForURL((u) => u.pathname === "/", { timeout: 15000 }).catch(() => {});
ok(caminho(a.page) === "/", "a senha nova é salva e a pessoa entra no sistema", caminho(a.page));

/* 6. A sessão do outro aparelho caiu. */
await outraSessao.page.goto(`${ALVO}/`, { waitUntil: "networkidle" });
// ⚠️ Sem a sessão anterior aberta, "caiu no login" não mede nada — ela nunca
// esteve aberta. A primeira versão desta jornada passou assim, vazia.
// ⚠️ E isto mede o RESULTADO, não a nossa chamada `signOut({ scope: "others" })`:
// medido, o Auth encerra as outras sessões sozinho quando a senha muda (com a
// chamada removida, esta linha continua verde). A presença da chamada é cobrada
// no engine-audit.
ok(sessaoAbriu && caminho(outraSessao.page) === "/login", "a sessão aberta ANTES da troca foi encerrada",
   sessaoAbriu ? caminho(outraSessao.page) : "NÃO MEDIDO: a sessão anterior nunca abriu");

/* 7. A senha antiga não entra mais; a nova entra. */
const b = await novoNavegador();
await entrar(b.page, u1, SENHA_ANTIGA);
ok(caminho(b.page) === "/login" && /inválidos/.test(await aviso(b.page)), "a senha ANTIGA não entra mais");
await entrar(b.page, u1, SENHA_NOVA);
ok(caminho(b.page) === "/", "a senha NOVA entra", caminho(b.page));

/* 8. O mesmo link, de novo, num navegador sem sessão. */
const c = await novoNavegador();
await abrirLink(c.page, link1);
const motivoReuso = new URL(c.page.url()).searchParams.get("recuperacao");
ok(caminho(c.page) === "/login" && /Peça um novo link/.test(await aviso(c.page)), "o link já usado volta ao login dizendo o que fazer", `motivo=${motivoReuso} · ${await aviso(c.page)}`);

/* 9. O link certo, aberto noutro navegador. */
const d = await novoNavegador();
const desde2 = await pedirLink(d.page, u2);
const link2 = await linkDoEmail(u2, desde2);
const e = await novoNavegador();
await abrirLink(e.page, link2);
ok(caminho(e.page) === "/login" && new URL(e.page.url()).searchParams.get("recuperacao") === "outro-navegador"
   && /navegador diferente/.test(await aviso(e.page)),
   "o link aberto noutro navegador explica o motivo certo", `${e.page.url()} · ${await aviso(e.page)}`);

/* 10. Um ?code= parado no login (link antigo) é encaminhado. */
const f = await novoNavegador();
await f.page.goto(`${ALVO}/login?code=codigo-qualquer`, { waitUntil: "networkidle" });
await f.page.waitForTimeout(1000);
ok(caminho(f.page) === "/login" && !!new URL(f.page.url()).searchParams.get("recuperacao"), "um ?code= parado no login é encaminhado e explicado", f.page.url());

/* 11. A tela da senha nova não abre sem a sessão de recuperação. */
const g = await novoNavegador();
await g.page.goto(`${ALVO}/redefinir-senha`, { waitUntil: "networkidle" });
ok(caminho(g.page) === "/login", "a tela de senha nova sem sessão manda ao login", caminho(g.page));

ok(errosDePagina.length === 0, "nenhum erro de página em nenhum navegador", errosDePagina.slice(0, 3).join(" | "));

await navegador.close();
console.log(`\n${falhas === 0 ? "✓ TODOS" : `✗ ${falhas} FALHA(S)`} — esqueci a senha, de ponta a ponta`);
process.exit(falhas === 0 ? 0 : 1);
