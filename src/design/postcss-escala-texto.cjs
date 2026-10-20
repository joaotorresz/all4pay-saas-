/**
 * Escala de texto — o tamanho de TODO texto do sistema num número só.
 *
 * O sistema escreve tamanho de texto em px em três lugares (tokens do
 * Tailwind, `globals.css` e ~600 classes `text-[Npx]` nas telas). Em vez de
 * reescrever cada um, este plugin multiplica, no CSS GERADO, toda declaração
 * de `font-size`, `line-height` e `letter-spacing` em px pelo fator de
 * `escala-texto.ts`. Espaçamento, raio e largura NÃO mudam: só o texto.
 *
 * ⚠️ A entrelinha em px escala junto, senão um corpo de 19,2px ficaria
 * espremido nos 22px de entrelinha que foram desenhados para 16px.
 * ⚠️ `font-size` que vem de variável (token em px) é multiplicado inteiro.
 * ⚠️ em, rem, % e valores sem unidade já são relativos ao tamanho do texto e
 * ficam como estão — escalá-los aplicaria o fator duas vezes.
 */
const { readFileSync } = require("node:fs");
const path = require("node:path");

const PROPS = new Set(["font-size", "line-height", "letter-spacing"]);

function fatorDaEscala() {
  // A fonte do fator é `escala-texto.ts` (o mesmo que o JS lê por `tx`).
  const ts = readFileSync(path.join(__dirname, "escala-texto.ts"), "utf8");
  const m = ts.match(/ESCALA_TEXTO: number = ([0-9.]+);/);
  if (!m) throw new Error("escala-texto.ts: não achei ESCALA_TEXTO");
  return Number(m[1]);
}

/** Multiplica cada `Npx` do valor; o resto (calc, var, em) fica intacto. */
function escalarValor(valor, fator) {
  return valor.replace(/(-?\d*\.?\d+)px\b/g, (_, n) => {
    const v = Math.round(Number(n) * fator * 100) / 100;
    return `${v}px`;
  });
}

const plugin = (opts = {}) => {
  const fator = opts.fator ?? fatorDaEscala();
  return {
    postcssPlugin: "escala-texto",
    Declaration(decl) {
      if (fator === 1 || !PROPS.has(decl.prop) || decl.__escalado) return;
      decl.value = escalarValor(decl.value, fator);
      // Tamanho que vem de variável (`var(--erp-dica-valor)`, um token em px)
      // não tem px escrito na declaração: multiplica a expressão inteira.
      if (decl.prop === "font-size" && /var\(/.test(decl.value) && !/px\b/.test(decl.value)) {
        decl.value = `calc(${decl.value} * ${fator})`;
      }
      decl.__escalado = true;
    },
  };
};
plugin.postcss = true;
module.exports = plugin;
module.exports.escalarValor = escalarValor;
module.exports.fatorDaEscala = fatorDaEscala;
