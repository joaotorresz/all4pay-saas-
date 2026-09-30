/**
 * Roda todas as jornadas de `scripts/e2e/*.mjs` (menos o kit e este arquivo)
 * e sai com 1 se qualquer verificação reprovar. `npm run e2e -- venda` roda só
 * as jornadas cujo nome contém "venda".
 */
import { readdirSync } from "node:fs";
import { abrirNavegador } from "./kit.mjs";

const filtro = process.argv[2] ?? "";
const arquivos = readdirSync(new URL(".", import.meta.url))
  .filter((f) => f.endsWith(".mjs") && !["kit.mjs", "rodar.mjs"].includes(f) && !f.startsWith("_") && f.includes(filtro))
  .sort();
const navegador = await abrirNavegador();
let falhas = 0;
for (const f of arquivos) {
  const mod = await import(new URL(f, import.meta.url));
  try {
    falhas += await mod.default(navegador);
  } catch (e) {
    falhas++;
    console.log(`✗ [${f}] a jornada QUEBROU antes de terminar — ${e instanceof Error ? e.message.split("\n")[0] : e}`);
  }
}
await navegador.close();
console.log(`\n${falhas === 0 ? "✓ TODAS" : `✗ ${falhas} FALHA(S)`} — ${arquivos.length} jornada(s)`);
process.exit(falhas === 0 ? 0 : 1);
