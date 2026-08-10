/**
 * isolamento — RODA A GUARDA DE DUAS EMPRESAS.
 *
 *   SUPABASE_DB_URL=postgres://... npm run isolamento
 *
 * ⚠️ Exige `SUPABASE_DB_URL` e **falha sem ela**. É a mesma decisão do
 * `esquema:sync`, e pelo mesmo motivo: uma guarda que "pula quando não tem
 * credencial" é uma guarda que não roda — e o defeito que esta onda inteira
 * encontrou foi exatamente esse, um teste de isolamento que nunca executou e
 * cuja ausência ninguém percebeu por meses.
 *
 * Ela é SEGURA contra qualquer banco, inclusive produção: o script termina em
 * `rollback` e não deixa linha nenhuma. Foi assim que a primeira medição foi
 * feita.
 */
import { execFileSync } from "node:child_process";

const URL_DB = process.env.SUPABASE_DB_URL;
if (!URL_DB) {
  console.error(
    "✗ SUPABASE_DB_URL ausente.\n"
    + "  Esta guarda precisa de um banco com o schema aplicado — ela cria duas\n"
    + "  empresas e dois usuários e tenta o cruzamento nos dois sentidos.\n"
    + "  Local: `supabase start` e use postgresql://postgres:postgres@127.0.0.1:54322/postgres\n",
  );
  process.exit(1);
}

try {
  const saida = execFileSync(
    "psql",
    [URL_DB, "-v", "ON_ERROR_STOP=1", "-f", "scripts/isolamento-par.sql"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  // O `raise notice` do script sai por stderr no psql; o stdout traz o BEGIN/
  // ROLLBACK. Ambos são ruído — o que importa é ter saído com zero.
  if (saida.trim()) console.log(saida.trim());
  console.log("\n✓ ISOLAMENTO — 2 empresas · 2 usuários · 8 cruzamentos tentados · 0 passaram");
} catch (e) {
  const err = /** @type {{ stderr?: Buffer|string, message?: string }} */ (e);
  const texto = String(err.stderr ?? err.message ?? e);
  console.error(texto.trim());
  console.error("\n✗ ISOLAMENTO ROMPIDO — o banco deixou uma empresa alcançar dado da outra.");
  process.exit(1);
}
