#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SMOKE DAS ROTAS — a tela ABRE, e abre sem vazar implementação
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   npx next build && npx next start -p 3100   (com o ambiente de demonstração)
 *   ALVO=http://127.0.0.1:3100 node scripts/smoke-rotas.mjs
 *
 * ⚠️ **As outras guardas medem NÚMERO; esta mede se a tela existe.** Um motor
 * pode estar perfeito e a página quebrar no primeiro render — e nenhuma guarda
 * pura enxerga isso, porque nenhuma delas monta um componente. As três falhas
 * que ela pega são as que passam por todo o resto:
 *
 *   1. **erro de runtime** — `pageerror` ou `console.error` do React;
 *   2. **tela em branco** — a rota responde 200 e não renderiza nada, que é
 *      indistinguível de "carregando" para quem olha;
 *   3. **vazamento de implementação** — `undefined`, `NaN`, `[object Object]`
 *      ou nome de identificador na prosa que a pessoa lê.
 *
 * ⚠️ **O QUE ELA NÃO COBRE, dito:** a sessão é a do modo de DEMONSTRAÇÃO — sem
 * Supabase configurado o middleware deixa o app aberto (`if (!configured)`), e
 * é isso que torna a varredura possível sem credencial no CI. Então ela NÃO
 * exercita o caminho de RLS, nem erro de permissão, nem dado de cliente real.
 * Ela responde "a tela monta e fala português", não "a tela monta para o
 * usuário X".
 */
import { chromium } from "playwright";
import { readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.ALVO ?? "http://127.0.0.1:3100";
/*
 * ⚠️ Dois ambientes, dois navegadores: nesta máquina o Chromium vive em
 * `/opt/pw-browsers/chromium`; no runner do CI ele não existe e o Playwright
 * usa o navegador que o `npm ci` baixou. Um caminho fixo quebraria um dos dois.
 */
const CHROME = process.env.PLAYWRIGHT_CHROMIUM
  || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);

/** Descobre as rotas publicadas varrendo `src/app`, sem as dinâmicas. */
function rotas(dir = "src/app", prefixo = "") {
  const out = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) {
      // `[id]` precisa de um valor real; grupos `(x)` não entram na URL.
      if (nome.startsWith("[")) continue;
      const seg = nome.startsWith("(") ? prefixo : `${prefixo}/${nome}`;
      out.push(...rotas(caminho, seg));
    } else if (nome === "page.tsx") {
      out.push(prefixo === "" ? "/" : prefixo);
    }
  }
  return out;
}

/*
 * ⚠️ A prosa que denuncia implementação. `undefined`/`NaN` são os dois que mais
 * chegam à tela — um `?? undefined` que virou texto, uma divisão por zero
 * formatada. E "[object Object]" é o terceiro, sempre por interpolar um objeto
 * numa string. Nenhum deles derruba a página: eles simplesmente APARECEM.
 */
const VAZAMENTOS = [
  { padrao: /\bundefined\b/, nome: "undefined na tela" },
  { padrao: /\bNaN\b/, nome: "NaN na tela" },
  { padrao: /\[object Object\]/, nome: "[object Object] na tela" },
  { padrao: /\bReferenceError\b|\bTypeError\b/, nome: "nome de erro de runtime na tela" },
];

/** Erros de console que NÃO são defeito da tela. */
const RUIDO = [
  /Download the React DevTools/i,
  /Warning: .*(defaultProps|componentWillReceiveProps)/i,
  /favicon/i,
  /Failed to load resource.*40[34]/i,
  // Sem chaves de integração no CI, o que falha é a INTEGRAÇÃO, não a tela.
  /supabase|anthropic|pluggy|twilio|resend/i,
];

const lista = Array.from(new Set(rotas())).sort();
const b = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });

const falhas = [];
let visitadas = 0;

for (const rota of lista) {
  const page = await ctx.newPage();
  const erros = [];
  page.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (RUIDO.some((r) => r.test(t))) return;
    erros.push(`console.error: ${t.slice(0, 160)}`);
  });

  try {
    const resp = await page.goto(`${BASE}${rota}`, { waitUntil: "networkidle", timeout: 45_000 });
    await page.waitForTimeout(400);
    visitadas++;

    if (resp && resp.status() >= 500) {
      falhas.push(`${rota} — HTTP ${resp.status()}`);
    }

    const texto = (await page.locator("body").innerText().catch(() => "")).trim();
    /*
     * ⚠️ O corte de "em branco" é por TEXTO ÚTIL, não por altura do documento:
     * uma tela com só o menu e o cabeçalho tem altura de sobra e conteúdo
     * nenhum — que é exatamente a aparência de uma página que quebrou no
     * conteúdo e não no chrome.
     */
    const semChrome = texto.split("\n").filter((l) => l.trim().length > 2).length;
    if (semChrome < 5) {
      falhas.push(`${rota} — tela praticamente em branco (${semChrome} linhas de texto)`);
    }

    for (const v of VAZAMENTOS) {
      if (v.padrao.test(texto)) {
        const trecho = texto.split("\n").find((l) => v.padrao.test(l)) ?? "";
        falhas.push(`${rota} — ${v.nome}: "${trecho.trim().slice(0, 80)}"`);
      }
    }

    if (erros.length) falhas.push(`${rota} — ${erros[0]}`);
  } catch (e) {
    falhas.push(`${rota} — não abriu: ${String(e).slice(0, 120)}`);
  }
  await page.close();
}

await b.close();

/*
 * ⚠️ **A guarda tem de provar que VISITOU.** Zero falhas sobre zero rotas é o
 * verde sobre o vazio: se a varredura parar de achar `page.tsx`, ela passaria
 * anunciando que está tudo bem.
 */
if (visitadas < 20) {
  console.log(`✗ a varredura visitou apenas ${visitadas} rota(s) — verde sobre o vazio`);
  process.exit(1);
}

console.log(`smoke: ${visitadas} rota(s) visitada(s) · ${falhas.length} com problema`);
if (falhas.length) {
  for (const f of falhas) console.log(`   ✗ ${f}`);
  console.log("\n✗ SMOKE REPROVOU");
  process.exit(1);
}
console.log("✓ TODAS — nenhuma tela quebrada, em branco ou vazando implementação");
