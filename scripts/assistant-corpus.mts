/**
 * assistant-corpus — guarda de regressão do ROTEAMENTO da IA nativa.
 *
 * Dispara ~70 frases pt-BR (formais + coloquiais) em `responderLocal` sobre um
 * dataset determinístico e exige que cada uma caia no intent certo (a resposta
 * casa a regex esperada). Falha (exit 1) em qualquer misroute — inclui as
 * variações coloquiais que já quebraram antes ("qual meu caixa?", "tô lucrando?",
 * "quando meu dinheiro acaba?", "pra quem eu mais pago?"…).
 *
 *   npm run corpus
 *
 * O motor só tem `import type`, então roda com --experimental-strip-types sem
 * loader de alias.
 */
import { responderLocal } from "@/core/assistant/engine";
import { CORPUS, input, ctx } from "./fixtures/corpus-ia.mts";

let pass = 0;
const fails: string[] = [];
for (const [q, re] of CORPUS) {
  const r = responderLocal(q, input, ctx);
  if (r && re.test(r.resposta)) pass++;
  else { fails.push(`✗ "${q}"  → ${r ? r.resposta.slice(0, 90) : "NULL (sem intent → Claude)"}`); }
}
for (const f of fails) console.log(f);
console.log(`\n${fails.length === 0 ? "✓ TODAS" : `✗ ${fails.length} FALHA(S)`} — ${pass}/${CORPUS.length} frases rotearam ao intent esperado`);
if (fails.length > 0) process.exit(1);
