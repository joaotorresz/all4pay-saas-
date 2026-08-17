#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DDL SEM MIGRATION — a guarda do EVENTO (P-18 item 14, corrigido)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O registro de DDL JÁ EXISTE no banco: `ddl_log`, o gatilho de evento
 * `registrar_ddl()` e a função `ddl_recentes()`. Toda alteração de esquema em
 * `public` fica atribuível. O que faltava era um CONSUMIDOR que lê e reprova.
 *
 * ⚠️ **Isto é o par do `npm run objetos`, não o substituto.** Um mede ESTADO,
 * o outro mede EVENTO — e a diferença é concreta:
 *
 *   `npm run objetos` compara o estado atual de produção com as migrations.
 *   Ele NÃO consegue ver um objeto que foi criado e depois DROPADO: some do
 *   estado. Medido em produção: `ddl_log` registrou `CREATE TABLE own_probe2`,
 *   `own_q`, `own_prod`, `own_d` — quatro tabelas de sondagem criadas à mão em
 *   13/08 e já removidas. O estado não guarda rastro; o log guarda.
 *
 * ⚠️ **Por que não uso o campo `contexto` para separar.** A intuição seria
 * "DDL de migration tem um contexto, DDL manual tem outro". Medido: os 305
 * eventos do log são TODOS `mgmt-api`. Neste projeto as migrations são
 * aplicadas pelo management API (via MCP), o MESMO canal do editor de SQL do
 * painel — então o contexto não distingue nada. O sinal honesto é outro: o
 * NOME do objeto. Se uma migration do repositório menciona aquele objeto, a
 * mudança tem procedência; se nenhuma menciona, é DDL sem migration.
 *
 * ⚠️ **O casamento é por NOME, e isso tem um limite declarado.** "Menciona o
 * objeto" não é "esta migration exata produziu esta mudança" — uma coluna nova
 * numa tabela conhecida passa, porque o nome da tabela aparece em alguma
 * migration. É deliberado: o alvo é o objeto ÓRFÃO (tabela/função que
 * repositório nenhum conhece), que é a classe do A4P-076. A deriva fina de
 * coluna é o território do `npm run objetos`, pela assinatura.
 *
 * Uso:
 *   SUPABASE_DB_URL=… node scripts/ddl-sem-migration.mjs [--dias 30]
 */

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";

const URL = process.env.SUPABASE_DB_URL;
if (!URL) {
  // Falha, não pula: guarda que pula sem credencial é guarda que não roda.
  console.error("✗ SUPABASE_DB_URL ausente. Esta guarda lê o ddl_log de produção; sem ele não mede nada.");
  process.exit(1);
}

const arg = (n, p) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : p; };
const DIAS = Number(arg("dias", "30"));

/**
 * ⚠️ Lê `ddl_log` DIRETO, não via `ddl_recentes()`. A função é gateada por
 * `is_platform_admin()` — correto para a tela, errado para o CI, que se conecta
 * como `postgres` e não tem sessão de admin de plataforma. O guarda precisa do
 * dado cru.
 */
const SQL = `
  select string_agg(distinct objeto, chr(10))
  from public.ddl_log
  where quando >= now() - make_interval(days => ${Math.max(1, DIAS)})
    and objeto is not null
`;
const bruto = execFileSync("psql", [URL, "-tAX", "-c", SQL], { encoding: "utf8" }).trim();
const objetos = bruto ? bruto.split("\n").map((s) => s.trim()).filter(Boolean) : [];

/** `public.own_probe2` → `own_probe2` · `public.movements.col` → `movements` · `public.f()` → `f` */
function nucleoDoObjeto(id) {
  let s = id.replace(/^public\./, "");
  s = s.replace(/\(.*$/, "");   // tira a assinatura de função
  s = s.split(".")[0];          // tira a coluna: tabela.coluna → tabela
  return s.replace(/[^a-z0-9_]/gi, "").toLowerCase();
}

/** O texto de todas as migrations, uma vez. */
const corpusMigrations = readdirSync("supabase/migrations")
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(`supabase/migrations/${f}`, "utf8").toLowerCase())
  .join("\n");

const semMigration = [];
const vistos = new Set();
for (const id of objetos) {
  const nucleo = nucleoDoObjeto(id);
  if (!nucleo || vistos.has(nucleo)) continue;
  vistos.add(nucleo);
  // \b para não casar `own_q` dentro de `own_qualquer`.
  const re = new RegExp(`\\b${nucleo}\\b`);
  if (!re.test(corpusMigrations)) semMigration.push({ id, nucleo });
}

console.log(`ddl_log: ${objetos.length} objeto(s) tocado(s) nos últimos ${DIAS} dias · `
  + `${vistos.size} núcleo(s) distinto(s) · ${semMigration.length} sem migration`);

if (semMigration.length > 0) {
  console.error("\n✗ DDL EM PRODUÇÃO SEM MIGRATION NO REPOSITÓRIO:");
  for (const { id, nucleo } of semMigration) console.error(`   · ${id}   (núcleo: ${nucleo})`);
  console.error("\nCada objeto: vire migration versionada, ou — se foi sondagem/limpeza — nada");
  console.error("no repositório o explica, e é isso que esta guarda existe para tornar visível.");
  process.exit(1);
}
console.log("✓ TODOS — nenhum objeto tocado em produção sem migration que o mencione");
