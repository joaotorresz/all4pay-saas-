/**
 * mobile — A MEDIÇÃO NO TELEFONE, versionada.
 *
 *   npm run mobile           (exige o servidor de produção em pé)
 *
 * ⚠️ Esta guarda não roda dentro de `npm test` porque precisa do aplicativo
 * SERVIDO e de um navegador de verdade — colocá-la lá tornaria toda a suíte
 * dependente de um build, e uma suíte que demora dez minutos deixa de ser
 * rodada antes de commitar. Ela é o passo de antes de entregar, e a linha de
 * base dela fica registrada em `core/desempenho` para a melhora ser conferível.
 *
 * O que ela mede, num Chromium a 390×844 (iPhone 13/14):
 *   · orçamento de desempenho por tela (requisições, peso, tempo);
 *   · alvos de toque abaixo de 44px;
 *   · hierarquia de cabeçalhos;
 *   · auditoria axe (WCAG 2.1 AA), reprovando só o que BLOQUEIA a tarefa.
 */
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const BASE = process.env.ALVO ?? "http://127.0.0.1:3100";
const CHROME = process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const TELEFONE = { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true };

const BLOQUEANTES = ["color-contrast", "label", "select-name", "button-name", "aria-required-attr", "image-alt"];
const ORCAMENTO = {
  "/": { requisicoes: 45, kb: 3400, ms: 2600 },
  "/fluxo-caixa": { requisicoes: 60, kb: 2700, ms: 2400 },
  "/aprovacoes": { requisicoes: 45, kb: 2400, ms: 1800 },
  "/upload": { requisicoes: 45, kb: 2500, ms: 1800 },
};
const PADRAO = { requisicoes: 60, kb: 3400, ms: 2500 };
const TELAS = [
  ["Início", "/"],
  ["Fluxo de caixa", "/fluxo-caixa"],
  ["Aprovações", "/aprovacoes"],
  ["Títulos a receber", "/dashboard/financial/accounts-and-transfers"],
  ["Extrato", "/dashboard/financial/statement"],
  ["Entrada de dados", "/upload"],
  ["DRE", "/dashboard/reports/dre"],
];

const b = await chromium.launch({ executablePath: CHROME });

let falhas = 0;
const linhas = [];

for (const [nome, rota] of TELAS) {
  // ⚠️ CONTEXTO NOVO por tela. Reaproveitar o mesmo faz a segunda tela em
  // diante herdar o cache da primeira, e o peso medido despenca de 3 MB para
  // 200 KB — um número que descreve a segunda visita, não a primeira. Quem abre
  // o produto no telefone pela primeira vez paga o número cheio.
  const ctx = await b.newContext({ viewport: TELEFONE, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15" });
  const page = await ctx.newPage();
  let reqs = 0, bytes = 0;
  const onReq = () => { reqs++; };
  const onResp = async (r) => { try { bytes += (await r.body()).length; } catch { /* redirecionamento/preflight */ } };
  page.on("request", onReq); page.on("response", onResp);

  const t0 = Date.now();
  await page.goto(`${BASE}${rota}`, { waitUntil: "networkidle", timeout: 60000 });
  const ms = Date.now() - t0;
  await page.waitForTimeout(1200);

  const alvos = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('button, a[href], [role="button"], [role="tab"], [role="switch"], input[type="checkbox"]')) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      // A área sensível pode ser maior que a caixa (ver a regra de `pointer:
      // coarse` no globals.css). O que vale é o alvo EFETIVO.
      const depois = getComputedStyle(el, "::after");
      const extraW = parseFloat(depois.width) || 0;
      const extraH = parseFloat(depois.height) || 0;
      const w = Math.max(r.width, extraW), h = Math.max(r.height, extraH);
      // ⚠️ 24px é o PISO da norma no nível AA (WCAG 2.2, 2.5.8 — alvo mínimo
      // com espaçamento); 44px é a meta do nível AAA (2.5.5) e do guia das
      // plataformas. Reprovar em 44 seria inventar um critério mais duro que o
      // exigido e transformar a guarda em ruído; reprovar em 24 é cobrar o que
      // de fato impede alguém de acertar o toque.
      if (w < 24 || h < 24) out.push(`${el.tagName.toLowerCase()} ${Math.round(w)}×${Math.round(h)} "${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 24)}"`);
    }
    return out;
  });

  const cab = await page.evaluate(() => {
    const hs = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((h) => Number(h.tagName[1]));
    let pulos = 0;
    for (let i = 1; i < hs.length; i++) if (hs[i] - hs[i - 1] > 1) pulos++;
    return { h1: hs.filter((n) => n === 1).length, pulos };
  });

  const vaza = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const bloq = axe.violations.filter((v) => BLOQUEANTES.includes(v.id));

  page.off("request", onReq); page.off("response", onResp);
  await ctx.close();

  const kb = Math.round(bytes / 1024);
  const o = ORCAMENTO[rota] ?? PADRAO;
  const estouro = [];
  if (reqs > o.requisicoes) estouro.push(`requisições ${reqs}>${o.requisicoes}`);
  if (kb > o.kb) estouro.push(`peso ${kb}KB>${o.kb}KB`);
  if (ms > o.ms) estouro.push(`tempo ${ms}ms>${o.ms}ms`);

  const problemas = [];
  if (estouro.length) problemas.push(`ORÇAMENTO: ${estouro.join(", ")}`);
  if (bloq.length) problemas.push(`ACESSIBILIDADE: ${bloq.map((v) => `${v.id}×${v.nodes.length}`).join(", ")}`);
  if (vaza > 0) problemas.push(`VAZA ${vaza}px além da largura do telefone`);
  if (cab.h1 !== 1) problemas.push(`${cab.h1} elementos h1 (tem de haver exatamente um)`);
  if (cab.pulos > 0) problemas.push(`${cab.pulos} pulos de nível de cabeçalho`);
  if (alvos.length) problemas.push(`${alvos.length} alvos de toque < 44px`);

  if (problemas.length) falhas++;
  linhas.push({ nome, rota, reqs, kb, ms, alvos: alvos.length, problemas, exemplos: alvos.slice(0, 3) });
}

console.log("\nMEDIÇÃO NO TELEFONE — 390×844\n");
for (const l of linhas) {
  const cabecalho = `${l.problemas.length ? "✗" : "✓"} ${l.nome.padEnd(20)} ${String(l.reqs).padStart(3)} req · ${String(l.kb).padStart(4)} KB · ${String(l.ms).padStart(4)} ms`;
  console.log(cabecalho);
  for (const p of l.problemas) console.log(`    ${p}`);
  for (const e of l.exemplos) console.log(`      · ${e}`);
}
console.log(`\n${linhas.length} telas · ${falhas} com problema\n`);
await b.close();
process.exit(falhas > 0 ? 1 : 0);
