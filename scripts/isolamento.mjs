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

  // ⚠️ QUALQUER erro do psql saía como "ISOLAMENTO ROMPIDO", e isso é MENTIR
  // sobre a natureza da falha. Medido na ONDA 5: um gatilho novo recusou a
  // fixture desta própria guarda por falta de `origem`, e o painel do CI
  // anunciou uma brecha de segurança que não existia — quem lesse largaria
  // tudo para investigar um vazamento inexistente.
  //
  // A distinção sai do PRÓPRIO script: ele só levanta a exceção de veredicto
  // quando um cruzamento passa, e essa exceção carrega a palavra ISOLAMENTO.
  // Erro que não a carrega é falha de setup — e dizer isso é a diferença entre
  // um alarme e um alarme confiável.
  // A sentinela `[A4P-VAZAMENTO]` é levantada SÓ no veredicto do script, e não
  // aparece em comentário nenhum — casar pela frase em português faria o
  // comentário que documenta esta decisão disparar o alarme que ele explica.
  const rompeu = texto.includes("[A4P-VAZAMENTO]");
  console.error(rompeu
    ? "\n✗ ISOLAMENTO ROMPIDO — o banco deixou uma empresa alcançar dado da outra."
    : "\n✗ A GUARDA NÃO RODOU — o script falhou antes de concluir o veredicto.\n"
      + "  Isto NÃO é um vazamento: é a fixture ou o schema recusando o setup.\n"
      + "  Leia o erro do psql acima; ele diz qual regra do produto barrou a montagem.");
  process.exit(1);
}
