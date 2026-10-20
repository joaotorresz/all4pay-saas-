/**
 * Guarda da escala de texto (20/10/2026: todo texto do sistema +20%).
 *
 * Prova que o fator mora num lugar só e que ele alcança as três portas por
 * onde um tamanho de texto entra: o CSS (PostCSS), o JS (`tx`) e a prévia do
 * editor do design system. Cada caso tem o defeito plantado ao lado.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import postcss from "postcss";

const require = createRequire(import.meta.url);
const plugin = require("../src/design/postcss-escala-texto.cjs");
let falhas = 0;
const ok = (nome, cond) => { console.log(`${cond ? "✓" : "✗"} ${nome}`); if (!cond) falhas++; };
const css = (entrada, opts) => postcss([plugin(opts)]).process(entrada, { from: undefined }).css;

const fator = plugin.fatorDaEscala();
ok(`o fator vale 1,2 (lido de escala-texto.ts): ${fator}`, fator === 1.2);

const saida = css(".a{font-size:13px;line-height:22px;letter-spacing:0.44px;padding:13px;width:13px}");
ok("font-size, line-height e letter-spacing em px são multiplicados", saida.includes("font-size:15.6px") && saida.includes("line-height:26.4px") && saida.includes("letter-spacing:0.53px"));
ok("espaçamento e largura NÃO mudam (só o texto cresce)", saida.includes("padding:13px") && saida.includes("width:13px"));

const rel = css(".a{font-size:0.55em;line-height:1.1;letter-spacing:-0.01em}");
ok("em e entrelinha sem unidade ficam como estão (escalar aplicaria o fator duas vezes)", rel.includes("font-size:0.55em") && rel.includes("line-height:1.1") && rel.includes("-0.01em"));

const v = css(".a{font-size:var(--erp-dica-valor)}");
ok("tamanho vindo de variável é multiplicado inteiro", v.includes("calc(var(--erp-dica-valor) * 1.2)"));

const duas = postcss([plugin(), plugin()]).process(".a{font-size:10px}", { from: undefined }).css;
ok("a mesma declaração nunca é escalada duas vezes", duas.includes("font-size:12px"));

ok("DEFEITO PLANTADO: com fator 1 nada muda (a guarda enxerga a diferença)", css(".a{font-size:13px}", { fator: 1 }).includes("font-size:13px"));

const cfg = readFileSync(new URL("../postcss.config.mjs", import.meta.url), "utf8");
const iTw = cfg.indexOf("tailwindcss"), iEsc = cfg.indexOf("postcss-escala-texto");
ok("o PostCSS do app roda a escala DEPOIS do Tailwind (é lá que moram as classes text-[Npx])", iTw >= 0 && iEsc > iTw);

const { tx, ESCALA_TEXTO } = await import("../src/design/escala-texto.ts");
ok("tx() usa o MESMO fator do CSS", ESCALA_TEXTO === fator && tx(11) === 13.2);

const { cssDaPreviaDeEscalas } = await import("../src/design/gerar.ts");
ok("a prévia do editor aceita o fator (não passa pelo PostCSS)", cssDaPreviaDeEscalas.length >= 2 || /escalaTexto/.test(cssDaPreviaDeEscalas.toString()));

// Teto ZERO: tamanho de texto numérico escrito em JS sem passar por tx().
const cru = [];
const varrer = (dir) => {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) varrer(p);
    else if (/\.tsx?$/.test(n)) {
      readFileSync(p, "utf8").split("\n").forEach((l, i) => {
        if (/fontSize(:|=\{) *\d/.test(l)) cru.push(`${p}:${i + 1}`);
      });
    }
  }
};
varrer(new URL("../src", import.meta.url).pathname);
ok(`nenhum fontSize numérico em JS fora de tx() (${cru.length})${cru.length ? "\n    " + cru.join("\n    ") : ""}`, cru.length === 0);

if (falhas) { console.error(`\n✗ escala de texto: ${falhas} falha(s)`); process.exit(1); }
console.log("\n✓ escala de texto: o fator é um só e alcança CSS, JS e a prévia");
