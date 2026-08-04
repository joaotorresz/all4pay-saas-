/**
 * esquema:sync — REFAZ O RETRATO DO BANCO.
 *
 *   SUPABASE_DB_URL=postgres://... npm run esquema:sync
 *
 * ⚠️ **Por que este arquivo precisou existir com urgência.** Eu documentei este
 * comando no manifesto e na própria guarda — e não o escrevi. O efeito é pior
 * que o de não ter documentado: a guarda offline compara o manifesto com os
 * arquivos, e sem um jeito de atualizar o manifesto ela nunca veria uma
 * alteração feita à mão no banco. Ela passaria para sempre, dando a impressão
 * de que a deriva estava coberta.
 *
 * Exige `SUPABASE_DB_URL` (a connection string do projeto). Sem ela o comando
 * FALHA — não escreve um manifesto vazio nem "assume que está tudo bem", porque
 * um retrato em branco passaria na guarda e é exatamente o resultado que não
 * pode acontecer.
 *
 * O sync NUNCA apaga `divergencias_conhecidas`: ele atualiza a lista de
 * migrations aplicadas, as contagens e a data. As dívidas declaradas são
 * decisão humana e só saem quando alguém as resolve.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const URL_DB = process.env.SUPABASE_DB_URL;
if (!URL_DB) {
  console.error(
    "✗ SUPABASE_DB_URL ausente.\n"
    + "  Este comando precisa falar com o banco — sem isso ele não tem como saber\n"
    + "  o que foi aplicado. Pegue a connection string em Project Settings → Database.\n",
  );
  process.exit(1);
}

const CONSULTA = `
select json_build_object(
  'migrations', (select json_agg(version || '_' || name order by version)
                   from supabase_migrations.schema_migrations),
  'contagens', json_build_object(
    'tabelas',   (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'),
    'funcoes',   (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'),
    'politicas', (select count(*) from pg_policy),
    'gatilhos',  (select count(*) from pg_trigger where not tgisinternal),
    'indices',   (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='i'),
    'enums',     (select count(*) from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' and t.typtype='e'),
    'colunas',   (select count(*) from information_schema.columns where table_schema='public'),
    'restricoes',(select count(*) from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public')
  )
)::text`;

let bruto;
try {
  bruto = execFileSync("psql", [URL_DB, "-t", "-A", "-c", CONSULTA], { encoding: "utf8" }).trim();
} catch (e) {
  console.error(`✗ não foi possível consultar o banco: ${e instanceof Error ? e.message : e}`);
  console.error("  (o comando usa `psql`; instale o cliente do PostgreSQL se ele faltar)");
  process.exit(1);
}

const dados = JSON.parse(bruto);
const CAMINHO = "supabase/esquema.json";
const atual = JSON.parse(readFileSync(CAMINHO, "utf8"));

const antes = new Set(atual.migrations_aplicadas ?? []);
const agora = dados.migrations ?? [];
const novas = agora.filter((m) => !antes.has(m));

atual.gerado_em = new Date().toISOString().slice(0, 10);
atual.contagens = dados.contagens;
atual.migrations_aplicadas = agora;
writeFileSync(CAMINHO, `${JSON.stringify(atual, null, 2)}\n`);

console.log(`manifesto atualizado: ${agora.length} migrations aplicadas`);
if (novas.length > 0) {
  console.log(`\n⚠️  ${novas.length} migration(s) apareceram desde o último retrato:`);
  for (const n of novas) console.log(`   · ${n}`);
  console.log(
    "\n   Cada uma precisa virar ARQUIVO ou entrar em `divergencias_conhecidas`\n"
    + "   com motivo e prazo. Rode `npm run esquema` para ver o que falta.\n",
  );
}
