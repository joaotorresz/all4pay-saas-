/**
 * taxonomia — RODA A GUARDA DA ÁRVORE E DO CATÁLOGO.
 *
 *   SUPABASE_DB_URL=postgres://... npm run taxonomia
 *
 * ⚠️ Exige `SUPABASE_DB_URL` e **falha sem ela**, pelo mesmo motivo do
 * `isolamento`: uma guarda que "pula quando não tem credencial" é uma guarda
 * que não roda, e a ONDA 2 já pagou por um teste que nunca executou e cuja
 * ausência ninguém percebeu por meses.
 *
 * Ela é SEGURA contra qualquer banco, inclusive produção: o script termina em
 * `rollback` e não deixa linha nenhuma — o que importa aqui mais do que no
 * isolamento, porque esta guarda CRIA cadastro, e uma guarda de higiene que
 * suja o banco seria a piada que ela existe para evitar.
 */
import { execFileSync } from "node:child_process";

const URL_DB = process.env.SUPABASE_DB_URL;
if (!URL_DB) {
  console.error(
    "✗ SUPABASE_DB_URL ausente.\n"
    + "  Esta guarda precisa de um banco com o schema aplicado — ela tenta pôr\n"
    + "  despesa dentro de receita, repetir código de produto e criar título sem\n"
    + "  origem, e exige que o banco recuse os três.\n"
    + "  Local: `supabase start` e use postgresql://postgres:postgres@127.0.0.1:54322/postgres\n",
  );
  process.exit(1);
}

try {
  const saida = execFileSync(
    "psql",
    [URL_DB, "-v", "ON_ERROR_STOP=1", "-f", "scripts/taxonomia.sql"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  if (saida.trim()) console.log(saida.trim());
  console.log(
    "\n✓ TAXONOMIA — árvore do plano coerente · código de produto único ·"
    + " título sem origem recusado · extrato não vira título",
  );
} catch (e) {
  const err = /** @type {{ stderr?: Buffer|string, message?: string }} */ (e);
  console.error(String(err.stderr ?? err.message ?? e).trim());
  console.error(
    "\n✗ TAXONOMIA REPROVADA — o banco aceitou dado que a ONDA 5 existe para impedir.",
  );
  process.exit(1);
}
