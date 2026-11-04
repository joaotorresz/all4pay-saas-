/**
 * css-equivalencia — UMA FOLHA MENOR QUE NÃO MUDA NADA NA TELA (03/11/2026).
 *
 *   node scripts/css-equivalencia.mjs gravar  saida.jsonl   (servidor em pé)
 *   node scripts/css-equivalencia.mjs comparar antes.jsonl depois.jsonl [antes-de-novo.jsonl]
 *
 * O terceiro arquivo é uma segunda gravação da folha ANTIGA: o que difere
 * entre as duas é ruído (relógio, texto que gira) e fica fora da comparação.
 *
 * Enxugar o `globals.css` é mudança visual sem querer ser: cortar uma regra que
 * "parecia vencida" e descobrir depois que ela era a única que dava o raio a um
 * cartão. A prova aqui não é o olho num print: é o ESTILO COMPUTADO de cada
 * elemento de cada tela do inventário, no computador e no telefone, nos temas
 * claro e escuro e na impressão, gravado antes e depois do corte. Se um único
 * valor muda, o comparador nomeia a tela, o elemento e a propriedade.
 *
 * Fora do `npm test` pelo mesmo motivo do `npm run mobile`: precisa do app
 * servido (build de demonstração) e de um navegador. O que ele NÃO cobre:
 * estados de hover/foco e o que só abre com clique (modal, popover).
 */
import { chromium } from "playwright";
import fs from "node:fs";

const [modo, a, b, ruido] = process.argv.slice(2);

if (modo === "comparar") {
  const ler = (arq) => {
    const linhas = fs.readFileSync(arq, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    const estilos = linhas.find((l) => l.estilos).estilos;
    const telas = {};
    for (const l of linhas) if (l.chave) telas[l.chave] = l.els.map(([p, i]) => ({ p, s: estilos[i] }));
    return telas;
  };
  const A = ler(a), B = ler(b);
  // Ruído: o que já muda entre duas gravações da MESMA folha (relógio, texto
  // que gira, opacidade no meio de uma animação) não conta como diferença.
  const instavel = new Set();
  if (ruido) {
    const R = ler(ruido);
    for (const chave of Object.keys(A)) {
      const x = A[chave], y = R[chave];
      if (!y || x.length !== y.length) { instavel.add(chave); continue; }
      for (let i = 0; i < x.length; i++) if (x[i].s !== y[i].s) instavel.add(chave + " " + x[i].p);
    }
  }
  let difs = 0, telas = 0, elementos = 0;
  for (const chave of Object.keys(A)) {
    const x = A[chave], y = B[chave];
    if (instavel.has(chave)) continue;
    if (!y) { console.log(`! ${chave}: faltou depois`); difs++; continue; }
    telas++;
    if (x.length !== y.length) { console.log(`✗ ${chave}: ${x.length} elementos antes, ${y.length} depois`); difs++; continue; }
    for (let i = 0; i < x.length; i++) {
      elementos++;
      if (x[i].s === y[i].s || instavel.has(chave + " " + x[i].p)) continue;
      const pa = JSON.parse(x[i].s), pb = JSON.parse(y[i].s);
      const props = Object.keys(pa).filter((k) => pa[k] !== pb[k]);
      if (difs < 40) console.log(`✗ ${chave} ${x[i].p}: ${props.map((k) => `${k} ${pa[k]} → ${pb[k]}`).join("; ").slice(0, 300)}`);
      difs++;
    }
  }
  console.log(`${telas} capturas, ${elementos} elementos, ${difs} diferença(s)`);
  process.exit(difs ? 1 : 0);
}

const BASE = process.env.ALVO ?? "http://127.0.0.1:3100";
const CHROME = process.env.CHROME ?? "/opt/pw-browsers/chromium";
const inventario = fs.readFileSync(new URL("../src/core/rotas/inventario.ts", import.meta.url), "utf8");
const ROTAS = [...new Set([...inventario.matchAll(/rota: "([^"]+)"/g)].map((m) => m[1]))]
  .filter((r) => !r.includes("["));
const ROTAS_EXTRA = ["/login", "/criar-conta", "/admin/design-system", "/admin/interruptores"];

const navegador = await chromium.launch({ executablePath: CHROME });
// Gravação em linhas (uma por tela) e com os estilos INTERNADOS: o mesmo estilo
// computado se repete milhares de vezes, e um JSON único passava do teto de
// tamanho de string do Node.
fs.writeFileSync(a, "");
const estilos = [], indice = new Map();

const CENARIOS = [
  { nome: "pc", viewport: { width: 1440, height: 900 }, rotas: [...ROTAS, ...ROTAS_EXTRA] },
  { nome: "tel", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, rotas: ROTAS },
  { nome: "impressao", viewport: { width: 1440, height: 900 }, midia: "print", rotas: ["/", "/dashboard/reports/dre", "/fluxo-caixa", "/dashboard/financial/statement"] },
];

for (const c of CENARIOS) {
  const ctx = await navegador.newContext({ viewport: c.viewport, isMobile: c.isMobile, hasTouch: c.hasTouch, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  if (c.midia) await page.emulateMedia({ media: c.midia });
  for (const rota of c.rotas) {
    try {
      await page.goto(BASE + rota, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(800);
    } catch (e) {
      console.log(`! ${c.nome} ${rota} não abriu`);
      continue;
    }
    const lista = await page.evaluate(() => {
      const fora = new Set(["transition", "transition-property", "transition-duration", "animation", "animation-name", "caret-color"]);
      const out = [];
      const caminho = (el) => { const p = []; for (let q = el; q && q !== document.documentElement; q = q.parentElement) p.unshift(q.tagName.toLowerCase() + ":" + [...(q.parentElement?.children ?? [])].indexOf(q)); return p.join(">"); };
      for (const el of document.querySelectorAll("body, body *")) {
        if (el.closest("script, style, noscript")) continue;
        const cs = getComputedStyle(el);
        const o = {};
        for (let i = 0; i < cs.length; i++) { const k = cs[i]; if (!fora.has(k) && !k.startsWith("--")) o[k] = cs.getPropertyValue(k); }
        for (const pseudo of ["::before", "::after", "::placeholder"]) {
          const ps = getComputedStyle(el, pseudo);
          if (ps.content && ps.content !== "none" && ps.content !== "normal") o[pseudo] = [ps.content, ps.color, ps.backgroundColor, ps.fontFamily, ps.fontSize, ps.width, ps.height, ps.borderRadius].join("|");
        }
        out.push({ p: caminho(el), s: JSON.stringify(o) });
      }
      return out;
    });
    const els = lista.map(({ p, s }) => { let i = indice.get(s); if (i === undefined) { i = estilos.length; estilos.push(s); indice.set(s, i); } return [p, i]; });
    fs.appendFileSync(a, JSON.stringify({ chave: `${c.nome} ${rota}`, els }) + "\n");
  }
  await ctx.close();
  console.log(`${c.nome}: ${c.rotas.length} telas`);
}
await navegador.close();
fs.appendFileSync(a, JSON.stringify({ estilos }) + "\n");
console.log(`gravado em ${a}`);
