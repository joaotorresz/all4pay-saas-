#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A4P-026 — QUANTOS DESTINOS A NAVEGAÇÃO ENTREGA, POR LARGURA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O achado original: a 375px a barra entregava **2 de 9** destinos — os outros
 * ficavam posicionados de x=267 a x=1061, fora da viewport, **sem área rolável
 * que os alcançasse**. Não era corte visual: era inacessibilidade.
 *
 * ⚠️ **"Alcançável" aqui NÃO é "visível".** Um item fora da viewport mas dentro
 * de um container que ROLA é alcançável — é assim que uma barra horizontal
 * funciona. O que reprova é o item que fica fora e não tem rolagem que chegue
 * nele. Por isso a medição compara a posição do item com o `scrollWidth` do
 * container rolável, e não com a largura da tela.
 *
 * Uso: ALVO=http://127.0.0.1:3100 node scripts/nav-larguras.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.ALVO ?? "http://127.0.0.1:3100";
const CHROME = process.env.PLAYWRIGHT_CHROMIUM ?? "/opt/pw-browsers/chromium";
const LARGURAS = [375, 768, 1024, 1280];
const ROTA = process.env.ROTA ?? "/";

const b = await chromium.launch({ executablePath: CHROME });
const linhas = [];
let falhas = 0;

for (const largura of LARGURAS) {
  const ctx = await b.newContext({ viewport: { width: largura, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${ROTA}`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1000);

  const m = await page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Seções do sistema"]');
    if (!nav) return null;
    const faixa = nav.querySelector('[data-rolavel="1"]') ?? nav;
    const itens = Array.from(faixa.querySelectorAll("a[href], button"));
    const cs = getComputedStyle(faixa);
    const rola = /auto|scroll/.test(cs.overflowX) && faixa.scrollWidth > faixa.clientWidth + 1;
    const fx = faixa.getBoundingClientRect();
    const alcancaveis = itens.filter((el) => {
      const r = el.getBoundingClientRect();
      // Dentro da janela agora?
      if (r.left >= fx.left - 1 && r.right <= fx.right + 1) return true;
      // Fora, mas o container rola até ele?
      if (!rola) return false;
      /*
       * ⚠️ A POSIÇÃO TEM DE SER MEDIDA NO SISTEMA DA FAIXA. A primeira versão
       * usou `el.offsetLeft`, que é relativo ao `offsetParent` — aqui o
       * `.a4p-canvas`, não a faixa — e comparou 1193 contra um `scrollWidth`
       * de 1169. Resultado: "8/9 alcançáveis" em TODAS as larguras, inclusive
       * 1280px, onde não há defeito nenhum. Dois sistemas de coordenadas
       * misturados produzem um achado que não existe.
       */
      const posNaFaixa = r.left - fx.left + faixa.scrollLeft;
      return posNaFaixa + r.width <= faixa.scrollWidth + 1;
    });
    return {
      total: itens.length,
      alcancaveis: alcancaveis.length,
      rola,
      scrollWidth: faixa.scrollWidth,
      clientWidth: faixa.clientWidth,
      overflowX: cs.overflowX,
      // Um menu "mais"/hambúrguer também resolve, e a medição reconhece.
      temGaveta: !!document.querySelector('[aria-label*="menu" i], [aria-label*="navegação" i]'),
    };
  });

  if (!m) {
    console.log(`✗ ${largura}px — a barra não foi encontrada (a rota exige sessão?)`);
    falhas++;
  } else {
    const ok = m.alcancaveis === m.total;
    if (!ok) falhas++;
    linhas.push(
      `${ok ? "✓" : "✗"} ${String(largura).padStart(4)}px — ${m.alcancaveis}/${m.total} destinos alcançáveis · `
      + `rola: ${m.rola ? "sim" : "NÃO"} (overflow-x: ${m.overflowX}, ${m.scrollWidth}px de conteúdo em ${m.clientWidth}px)`,
    );
  }
  await ctx.close();
}

await b.close();
console.log(linhas.join("\n"));
console.log(
  falhas === 0
    ? "\n✓ TODAS — todo destino é alcançável em todas as larguras medidas"
    : `\n✗ ${falhas} largura(s) com destino inalcançável`,
);
process.exit(falhas === 0 ? 0 : 1);
