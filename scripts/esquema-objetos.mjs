#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A4P-076 — A GUARDA QUE COMPARA OBJETOS, NÃO NOMES DE MIGRATION
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `npm run esquema` confronta a LISTA DE MIGRATIONS aplicadas com os arquivos
 * do repositório. Isso pega migration aplicada sem arquivo — e deixa passar o
 * defeito que o nome não alcança: **um objeto criado à mão em produção**, que
 * migration nenhuma produz e cuja ausência ninguém percebe até tentar tocá-lo.
 *
 * Foi assim que `maq_cnpj_cache` viveu meses no banco sem estar no
 * repositório. O `npm run esquema` estava verde o tempo todo.
 *
 * **Como esta guarda funciona.** Ela compara dois inventários:
 *
 *   · o que as MIGRATIONS produzem — extraído do banco efêmero que o job
 *     `isolamento` sobe do zero;
 *   · o que PRODUÇÃO tem — o retrato em `supabase/objetos-producao.json`,
 *     gerado por `npm run objetos:sync` (precisa de `SUPABASE_DB_URL`).
 *
 * A diferença tem dois sentidos, e os dois importam:
 *
 *   · em produção e não nas migrations  → **ÓRFÃO**. É o A4P-076.
 *   · nas migrations e não em produção  → migration não aplicada.
 *   · nos dois com assinatura diferente → **DERIVA**: alguém alterou o objeto
 *     em produção sem passar por migration, ou a migration mudou e não foi
 *     aplicada. É o caso mais silencioso dos três.
 *
 * ⚠️ **O retrato de produção é um ARQUIVO, não uma consulta viva.** Se ele fosse
 * consultado na hora, a guarda se moveria junto com o que deveria medir — e um
 * órfão criado hoje entraria no "esperado" de amanhã sem ninguém decidir nada.
 * É a mesma razão pela qual `scratchpad/linha-base.mts` é um retrato.
 *
 * Uso:
 *   SUPABASE_DB_URL=… node scripts/esquema-objetos.mjs           # compara
 *   SUPABASE_DB_URL=… node scripts/esquema-objetos.mjs --sync    # refaz o retrato
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const RETRATO = "supabase/objetos-producao.json";
const SYNC = process.argv.includes("--sync");
const URL = process.env.SUPABASE_DB_URL;

if (!URL) {
  // ⚠️ Falha, não pula. Guarda que "pula quando não tem credencial" é guarda
  // que não roda — foi exatamente o defeito que a ONDA 2 encontrou no teste de
  // isolamento, verde por nunca ter sido executado.
  console.error("✗ SUPABASE_DB_URL ausente. Esta guarda mede o banco; sem ele ela não mede nada.");
  process.exit(1);
}

/** Lê o inventário do banco apontado por SUPABASE_DB_URL. */
function inventario() {
  const saida = execFileSync("psql", [URL, "-v", "ON_ERROR_STOP=1", "-f", "scripts/objetos.sql"], {
    encoding: "utf8", maxBuffer: 32 * 1024 * 1024,
  });
  const mapa = {};
  // ⚠️ Só linhas que SÃO objeto entram. O `psql -f` ecoa as confirmações dos
  // `\pset` ("Field separator is "|".") na saída, e elas contêm `|` — sem este
  // filtro viravam um objeto fantasma `Field separator is` acusado como
  // "ausente". Todo objeto começa por um dos quatro prefixos conhecidos.
  const PREFIXO = /^(tabela|funcao|policy|grant):/;
  for (const linha of saida.split("\n")) {
    const t = linha.trim();
    if (!PREFIXO.test(t) || !t.includes("|")) continue;
    const i = t.lastIndexOf("|");
    mapa[t.slice(0, i)] = t.slice(i + 1);
  }
  return mapa;
}

const agora = inventario();

if (SYNC) {
  writeFileSync(RETRATO, JSON.stringify({
    _comentario: [
      "RETRATO DOS OBJETOS DE PRODUÇÃO — A4P-076.",
      "Gerado por `npm run objetos:sync`. É um RETRATO, não uma consulta viva:",
      "consultado na hora, ele se moveria junto com o que deveria medir, e um",
      "órfão criado hoje entraria no esperado de amanhã sem ninguém decidir.",
      "Toda divergência não declarada em `orfaos_declarados` reprova.",
    ],
    gerado_em: new Date().toISOString().slice(0, 10),
    total: Object.keys(agora).length,
    orfaos_declarados: {},
    objetos: agora,
  }, null, 1) + "\n");
  console.log(`✓ retrato refeito: ${Object.keys(agora).length} objetos em ${RETRATO}`);
  process.exit(0);
}

if (!existsSync(RETRATO)) {
  console.error(`✗ ${RETRATO} não existe. Rode \`npm run objetos:sync\` com o SUPABASE_DB_URL de produção.`);
  process.exit(1);
}

const m = JSON.parse(readFileSync(RETRATO, "utf8"));
const producao = m.objetos ?? {};
/**
 * ⚠️ Órfão DECLARADO continua sendo órfão — ele só deixa de reprovar. Cada
 * entrada carrega o motivo e o dono, pela mesma regra do mapa de consolidação:
 * a dívida existe declarada, ou não existe.
 */
const declarados = m.orfaos_declarados ?? {};

const orfaos = [];   // em produção, não nas migrations
const ausentes = []; // nas migrations, não em produção
const deriva = [];   // nos dois, assinatura diferente

for (const [obj, sig] of Object.entries(producao)) {
  if (!(obj in agora)) { if (!(obj in declarados)) orfaos.push(obj); }
  else if (agora[obj] !== sig) { if (!(obj in declarados)) deriva.push(obj); }
}
for (const obj of Object.keys(agora)) {
  if (!(obj in producao) && !(obj in declarados)) ausentes.push(obj);
}

const conta = (t, lista) => {
  if (lista.length === 0) return 0;
  console.error(`\n✗ ${lista.length} ${t}:`);
  for (const o of lista.slice(0, 25)) console.error(`   · ${o}`);
  if (lista.length > 25) console.error(`   … e mais ${lista.length - 25}`);
  return lista.length;
};

console.log(`objetos: ${Object.keys(agora).length} nas migrations · `
  + `${Object.keys(producao).length} no retrato de produção (${m.gerado_em}) · `
  + `${Object.keys(declarados).length} órfão(s) declarado(s)`);

let falhas = 0;
falhas += conta("ÓRFÃO(S) — existem em produção e nenhuma migration os cria", orfaos);
falhas += conta("objeto(s) nas migrations e ausentes de produção", ausentes);
falhas += conta("objeto(s) com DERIVA — mesma identidade, definição diferente", deriva);

if (falhas > 0) {
  console.error("\nCada um vira arquivo de migration, ou vira órfão DECLARADO com motivo e dono.");
  process.exit(1);
}
console.log("✓ TODOS — nenhum objeto fora do declarado");
