/**
 * mobile-largura — NENHUMA TELA MAIS LARGA QUE O TELEFONE (28/10/2026).
 *
 *   npm run mobile-largura      (exige o servidor em pé: `npx next start -p 3100`,
 *                                build de demonstração; ALVO= muda o endereço)
 *
 * O João abriu o sistema no celular e "a página arrasta para um lado e para o
 * outro". Medido: 20 de 85 telas tinham alguma peça mais larga que 390px, e a
 * área de trabalho rolava na horizontal por causa dela. A área agora não rola
 * para o lado (AppShell), e isso ESCONDE o defeito em vez de resolvê-lo: o
 * que passa da borda fica cortado. Esta guarda mede o que a trava esconde —
 * `scrollWidth` maior que a largura da área é conteúdo cortado — e nomeia a
 * peça mais externa que passou da borda, fora de quem rola por conta própria
 * (tabela larga dentro do próprio cartão é legítima).
 *
 * Fora do `npm test` pelo mesmo motivo do `npm run mobile`: precisa do app
 * servido e de um navegador.
 */
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.ALVO ?? "http://127.0.0.1:3100";
const CHROME = process.env.CHROME ?? "/opt/pw-browsers/chromium";
const inventario = fs.readFileSync(new URL("../src/core/rotas/inventario.ts", import.meta.url), "utf8");
const ROTAS = [...new Set([...inventario.matchAll(/rota: "([^"]+)"/g)].map((m) => m[1]))]
  .filter((r) => !r.startsWith("/admin") && !r.includes("["));

const b = await chromium.launch({ executablePath: CHROME });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
let falhas = 0;

for (const rota of ROTAS) {
  try {
    await page.goto(BASE + rota, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(500);
  } catch (e) {
    console.log(`! ${rota} não abriu: ${String(e).slice(0, 80)}`);
    continue;
  }
  const r = await page.evaluate(() => {
    const vw = window.innerWidth;
    const doc = document.documentElement.scrollWidth;
    const area = document.querySelector("[data-area-rola]");
    const barra = document.querySelector(".a4p-topbar");
    const barraPassa = barra ? barra.scrollWidth > barra.clientWidth + 1 || barra.getBoundingClientRect().right > vw : false;
    if (!area) return { vw, doc, cortado: 0, barraPassa, culpado: null };
    const { left: esq, right: lim } = area.getBoundingClientRect();
    let culpado = null;
    for (const el of area.querySelectorAll("*")) {
      const rc = el.getBoundingClientRect();
      // ⚠️ A ESQUERDA também: num `justify-end` o que não cabe vaza para a
      // esquerda, e o `scrollWidth` não conta esse lado (DRE, medido).
      const vazaEsq = rc.width > 0 && rc.left < esq - 1;
      if (rc.width === 0 || (rc.right <= lim + 1 && !vazaEsq)) continue;
      let q = el.parentElement, rolaSozinho = false;
      while (q && q !== area) { if (getComputedStyle(q).overflowX !== "visible") { rolaSozinho = true; break; } q = q.parentElement; }
      if (rolaSozinho) continue;
      culpado = { classe: String(el.className?.baseVal ?? el.className ?? "").slice(0, 70), texto: (el.textContent || "").trim().slice(0, 40), passa: Math.round(vazaEsq ? esq - rc.left : rc.right - lim), lado: vazaEsq ? "à esquerda" : "à direita" };
      break;
    }
    return { vw, doc, cortado: area.scrollWidth - area.clientWidth, barraPassa, culpado };
  });
  const ruim = r.doc > r.vw + 1 || r.culpado || r.barraPassa;
  if (ruim) {
    falhas++;
    console.log(`✗ ${rota} — ${r.barraPassa ? "barra de cima passa da borda; " : ""}${r.culpado ? `"${r.culpado.texto}" passa ${r.culpado.passa}px ${r.culpado.lado} (${r.culpado.classe})` : `documento com ${r.doc}px`}`);
  }
}
await b.close();
console.log(falhas ? `\n✗ ${falhas} de ${ROTAS.length} tela(s) mais largas que o telefone` : `\n✓ ${ROTAS.length} telas cabem em 390px`);
process.exit(falhas ? 1 : 0);
