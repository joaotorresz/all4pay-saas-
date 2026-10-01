/**
 * VARREDURA DE BOTÕES — cada tela canônica, cada botão visível, um clique.
 *
 *   npm run varredura-botoes      (exige o build de DEMONSTRAÇÃO servido; ALVO= muda o endereço)
 *
 * ⚠️ Por que existe, além do smoke de rotas e das jornadas: o smoke prova que a
 * tela ABRE; a jornada prova que UMA tarefa termina. Nenhum dos dois aperta o
 * botão que ninguém escreveu jornada para ele — e é nesse botão que mora o
 * `pageerror` que derruba a tela na frente do cliente. Aqui não se confere
 * resultado de negócio: confere-se que clicar não QUEBRA nada.
 *
 * O que ela NÃO clica, de propósito: ação destrutiva (excluir, remover, limpar,
 * sair, purgar, restaurar), que tem confirmação própria e jornada própria. O
 * que ela considera defeito: exceção não tratada na página (`pageerror`) e erro
 * de console da aplicação — não recurso que falhou a carregar.
 */
import { chromium, type Page } from "playwright";
import { existsSync } from "node:fs";
import { INVENTARIO } from "@/core/rotas/inventario";

const BASE = process.env.ALVO ?? "http://127.0.0.1:3121";
const CAMINHO_CHROME = process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const OPCOES = existsSync(CAMINHO_CHROME) ? { executablePath: CAMINHO_CHROME } : {};
const TETO_POR_TELA = Number(process.env.TETO ?? 25);
const FILTRO = process.argv.slice(2);

/** Não se aperta sem jornada própria: destrói, sai da sessão ou desfaz. */
const PERIGOSO = /excluir|remover|apagar|limpar|sair|purgar|expurgar|restaurar|desfazer|descartar|cancelar assinatura|reabrir|estornar|travar|revogar|logar como/i;

const rotas = INVENTARIO
  .filter((r) => r.status === "canonica" && !r.rota.includes(":"))
  .map((r) => r.rota)
  .filter((r) => FILTRO.length === 0 || FILTRO.some((f) => r.includes(f)));

async function rotulos(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const vis = (el: Element) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      const s = getComputedStyle(el as HTMLElement);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
    };
    return Array.from(document.querySelectorAll("main button"))
      .filter((b) => vis(b) && !(b as HTMLButtonElement).disabled)
      .map((b) => ((b.getAttribute("aria-label") || (b as HTMLElement).innerText || "").trim().replace(/\s+/g, " ").slice(0, 60)));
  });
}

const falhas: { rota: string; botao: string; erro: string }[] = [];
let cliques = 0;
const navegador = await chromium.launch(OPCOES);

for (const rota of rotas) {
  const ctx = await navegador.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const page = await ctx.newPage();
  let atual = "(abertura)";
  page.on("pageerror", (e) => falhas.push({ rota, botao: atual, erro: `pageerror: ${e.message.slice(0, 200)}` }));
  page.on("console", (m) => {
    // "Failed to fetch RSC payload" é o prefetch do Next cancelado porque o
    // clique NAVEGOU — artefato da varredura, não defeito (o próprio Next cai
    // para a navegação normal, como a mensagem diz).
    if (m.type() === "error" && !/Failed to load resource|favicon|net::ERR|Failed to fetch RSC payload/i.test(m.text())) {
      falhas.push({ rota, botao: atual, erro: `console: ${m.text().slice(0, 200)}` });
    }
  });
  page.on("dialog", (d) => d.dismiss().catch(() => {}));
  const abrir = async () => {
    await page.goto(BASE + rota, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(800);
  };
  await abrir();
  const vistos = new Set<string>();
  const lista = (await rotulos(page)).filter((t) => t && !PERIGOSO.test(t));
  for (const texto of lista) {
    if (vistos.has(texto) || vistos.size >= TETO_POR_TELA) continue;
    vistos.add(texto);
    atual = texto;
    const alvo = page.locator("main button:visible", { hasText: texto }).first();
    const alvoAria = page.locator(`main button[aria-label="${texto.replace(/"/g, '\\"')}"]:visible`).first();
    const b = (await alvoAria.count()) > 0 ? alvoAria : alvo;
    if ((await b.count()) === 0) continue;
    await b.click({ timeout: 3000 }).catch(() => {});
    cliques++;
    await page.waitForTimeout(350);
    await page.keyboard.press("Escape").catch(() => {});
    if (!page.url().startsWith(BASE + rota.split("?")[0])) await abrir();
  }
  await ctx.close();
  const minhas = falhas.filter((f) => f.rota === rota).length;
  console.log(`${minhas ? "✗" : "✓"} ${rota} — ${vistos.size} botões${minhas ? ` · ${minhas} erro(s)` : ""}`);
}
await navegador.close();

const unicas = new Map<string, { rota: string; botao: string; erro: string }>();
for (const f of falhas) unicas.set(`${f.rota}|${f.erro}`, f);
for (const f of unicas.values()) console.log(`  ✗ ${f.rota} · [${f.botao}] ${f.erro}`);
console.log(`\n${unicas.size === 0 ? "✓ TODAS" : `✗ ${unicas.size} erro(s)`} — ${rotas.length} telas · ${cliques} cliques`);
if (unicas.size > 0) process.exit(1);
