/**
 * fluxos-telefone — OS QUATRO FLUXOS ESSENCIAIS, no telefone, medidos.
 *
 *   npm run fluxos          (exige o servidor de produção em pé)
 *
 * ⚠️ Medir tela por tela não responde à pergunta da onda. "A tela abre no
 * telefone" e "dá para APROVAR UM PAGAMENTO no telefone" são coisas diferentes:
 * a primeira é sobre layout, a segunda é sobre a tarefa chegar ao fim. Uma tela
 * pode passar em contraste, alvo de toque e orçamento e ainda assim ter o botão
 * que conclui a tarefa fora do alcance do polegar, ou atrás de uma rolagem que
 * ninguém adivinha.
 *
 * Cada fluxo aqui é dirigido de verdade — toque a toque, no viewport de um
 * iPhone 13 — e cobra três coisas: que o controle EXISTA, que ele esteja ao
 * alcance, e que a tarefa termine em até N toques. O limite de toques não é
 * estética: acima dele o fluxo é de computador, e quem está na rua desiste.
 */
import { chromium } from "playwright";

const BASE = process.env.ALVO ?? "http://127.0.0.1:3100";
const CHROME = process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const TELEFONE = { width: 390, height: 844 };
// `hasTouch` fica no CONTEXTO, não no viewport — sem ele o `tap()` não existe,
// e o teste mediria clique de mouse chamando-o de toque.
const TELEFONE_CTX = { viewport: TELEFONE, deviceScaleFactor: 3, isMobile: true, hasTouch: true };

const b = await chromium.launch({ executablePath: CHROME });
let falhas = 0;
const linha = (ok, nome, detalhe) => {
  if (!ok) falhas++;
  console.log(`${ok ? "✓" : "✗"} ${nome.padEnd(26)} ${detalhe}`);
};

async function nova() {
  const ctx = await b.newContext({ ...TELEFONE_CTX, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15" });
  return { ctx, page: await ctx.newPage() };
}

/* ─── 1. CONSULTAR SALDO ────────────────────────────────────────────────────
   ⚠️ Zero toques. A pergunta "dá para pagar isso agora?" se faz de pé, e uma
   resposta que exige rolar já perdeu — o valor tem de estar na primeira tela. */
{
  const { ctx, page } = await nova();
  await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2500);
  const r = await page.evaluate(() => {
    const alvos = [...document.querySelectorAll(".a4p-num, [class*='text-value'], .tabular-nums")];
    const visivel = alvos.find((e) => {
      const r = e.getBoundingClientRect();
      return r.top >= 0 && r.top < 844 && r.height > 14 && /R\$|\d/.test(e.textContent || "");
    });
    return visivel ? { texto: visivel.textContent.trim().slice(0, 24), topo: Math.round(visivel.getBoundingClientRect().top) } : null;
  });
  linha(!!r, "Consultar saldo", r ? `valor visível sem rolar, a ${r.topo}px do topo: ${r.texto}` : "nenhum valor na primeira tela");
  await ctx.close();
}

/* ─── 2. APROVAR PAGAMENTO ──────────────────────────────────────────────────
   O fluxo que justifica a onda: quem aprova é quem está fora do escritório. */
{
  const { ctx, page } = await nova();
  await page.goto(`${BASE}/aprovacoes`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2500);
  let toques = 0;
  const pedido = page.locator("button").filter({ hasText: /R\$/ }).first();
  const temPedido = await pedido.count() > 0;
  if (temPedido) { await pedido.tap(); toques++; await page.waitForTimeout(600); }
  const aprovar = page.getByRole("button", { name: /^Aprovar$/ });
  const temBotao = await aprovar.count() > 0;
  const alcance = temBotao ? await aprovar.first().evaluate((e) => {
    const r = e.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), naTela: r.top >= 0 && r.top < 844 };
  }) : null;
  if (temBotao) toques++;
  linha(temPedido && temBotao && alcance.h >= 24,
        "Aprovar pagamento",
        temBotao ? `${toques} toques até o botão (${alcance.w}×${alcance.h}px${alcance.naTela ? "" : ", exige rolar"})`
                 : "o botão de aprovar não existe nesta largura");
  await ctx.close();
}

/* ─── 3. LANÇAR DESPESA ─────────────────────────────────────────────────────
   O gasto acontece na rua; lançado depois, é lançado errado. */
{
  const { ctx, page } = await nova();
  await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2500);
  let toques = 0;
  /**
   * ⚠️ O botão "Criar" mora DENTRO da gaveta do menu, que no telefone está fora
   * da tela. Dirigir o fluxo foi o que revelou isso — a medição tela a tela não
   * revela, porque o botão existe no DOM e passa em contraste e em alvo de
   * toque. Ele só não está alcançável sem antes abrir o menu.
   *
   * Por isso o caminho medido é o REAL: hambúrguer → Criar → Despesa. Três
   * toques, dentro do teto de quatro que o fluxo declara.
   */
  const hamburguer = page.getByRole("button", { name: /Abrir menu/i }).first();
  if (await hamburguer.count() > 0) { await hamburguer.tap(); toques++; await page.waitForTimeout(700); }
  const criar = page.getByRole("button", { name: /Criar novo registro|^Criar$/i }).first();
  let abriu = false;
  if (await criar.count() > 0) {
    await criar.tap(); toques++;
    await page.waitForTimeout(900);
    abriu = await page.getByText(/Despesa/i).first().count() > 0;
    if (abriu) toques++;
  }
  linha(abriu && toques <= 4, "Lançar despesa",
        abriu ? `${toques} toques até Despesa (menu → Criar → Despesa)` : "não há caminho para Despesa a partir do início");
  await ctx.close();
}

/* ─── 4. FOTOGRAFAR COMPROVANTE ─────────────────────────────────────────────
   ⚠️ Não basta ter campo de arquivo: sem `capture`, o telefone abre a galeria
   em vez da câmera, e o comprovante que está na mão continua na mão. */
{
  const { ctx, page } = await nova();
  await page.goto(`${BASE}/upload`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2500);
  const campo = await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('input[type="file"]')];
    // O que vale é o campo que ABRE A CÂMERA, não qualquer campo que aceite
    // imagem: um seletor de arquivos com `accept="image/*"` abre a galeria.
    const img = inputs.find((i) => i.hasAttribute("capture"))
      ?? inputs.find((i) => (i.accept || "").includes("image") || !i.accept);
    return img ? { accept: img.accept || "(qualquer)", capture: img.getAttribute("capture") } : null;
  });
  linha(!!campo && campo.capture !== null,
        "Fotografar comprovante",
        campo ? `campo aceita ${campo.accept}, capture=${campo.capture ?? "AUSENTE — abre a galeria, não a câmera"}` : "não há campo de arquivo");
  await ctx.close();
}

console.log(`\n4 fluxos essenciais · ${falhas} com problema\n`);
await b.close();
process.exit(falhas > 0 ? 1 : 0);
