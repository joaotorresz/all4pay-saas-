/**
 * ts-alias-loader — hook de resolução ESM que resolve o alias "@/..." → src/ e
 * completa extensões (.ts/.tsx/index) para módulos importados sem extensão.
 * Usado com `node --experimental-strip-types --loader ./scripts/ts-alias-loader.mjs`
 * para testar/rodar os motores puros (src/core/*) fora do Next. Portátil:
 * resolve src/ a partir da localização deste arquivo.
 */
import { pathToFileURL, fileURLToPath } from "node:url";
import { existsSync, statSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";

const SRC = resolvePath(dirname(fileURLToPath(import.meta.url)), "..", "src") + "/";
const isFile = (p) => { try { return statSync(p).isFile(); } catch { return false; } };
function withExt(p) {
  if (isFile(p)) return p;
  for (const e of [".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.tsx"]) if (isFile(p + e)) return p + e;
  return p + ".ts";
}
export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    return { url: pathToFileURL(withExt(SRC + specifier.slice(2))).href, shortCircuit: true };
  }
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && !/\.(ts|tsx|js|mjs|json)$/.test(specifier)) {
    try { return { url: pathToFileURL(withExt(fileURLToPath(new URL(specifier, context.parentURL)))).href, shortCircuit: true }; }
    catch { /* fall through */ }
  }
  return next(specifier, context);
}
