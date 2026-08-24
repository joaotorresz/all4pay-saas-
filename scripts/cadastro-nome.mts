/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A4P-085 — TETO ZERO: nenhuma porta de cadastro cria conta sem o nome
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **O conserto tem DUAS metades, e esta guarda é a segunda.** A primeira
 * (`scripts/cadastro-nome.sql`, no job `isolamento`) prova, contra um Postgres
 * de verdade, que o gatilho grava o nome LITERAL e nunca o deriva do e-mail.
 * Ela não tem como ver a outra ponta: se nenhuma tela ENVIAR o nome, o gatilho
 * fica correto e o produto continua nascendo com "Minha empresa" em todo
 * cadastro — verde no banco, defeito na tela.
 *
 * Foi assim que o A4P-085 aconteceu: o gatilho JÁ lia
 * `raw_user_meta_data->>'company'` desde a migration 0005. O caminho certo
 * existia e ninguém o alimentava.
 *
 * ⚠️ **A asserção que carrega o valor é a que prova o PROIBIDO:** nenhum
 * arquivo fora de `lib/entrada` chama `auth.signUp` por conta própria. Era
 * exatamente essa a quarta porta — `OnboardingPessoal` chamava direto, e por
 * isso o compilador NÃO a acusou quando o nome virou parâmetro obrigatório.
 * Um tipo só alcança quem passa pelo ajudante; quem desvia dele fica invisível.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let falhas = 0;
const ok = (nome: string, cond: boolean, detalhe = "") => {
  if (cond) console.log(`✓ ${nome}`);
  else { falhas++; console.log(`✗ FAIL ${nome}${detalhe ? `\n    ${detalhe}` : ""}`); }
};

function arquivos(dir: string): string[] {
  const fora: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) fora.push(...arquivos(p));
    else if (p.endsWith(".ts") || p.endsWith(".tsx")) fora.push(p);
  }
  return fora;
}

const semComentario = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

console.log("\nO NOME DA EMPRESA, DO CAMPO ATÉ O BANCO\n");

/* ── 1. O ajudante único ─────────────────────────────────────────────────── */
const ENTRADA = "src/lib/entrada.ts";
const entrada = semComentario(readFileSync(ENTRADA, "utf8"));

ok("cadastro: o ajudante manda o nome no signUp",
   /options:\s*\{\s*data:\s*\{\s*company:/.test(entrada),
   "`auth.signUp` só preenche `raw_user_meta_data` por `options.data` — sem isso o gatilho não tem de onde tirar o nome");

/* ⚠️ Obrigatório, não opcional. Opcional é como o defeito volta: a porta nova
   esquece, o TypeScript não reclama, e o nome some outra vez. */
ok("cadastro: o nome é parâmetro OBRIGATÓRIO de criarContaEEntrar",
   /criarContaEEntrar\([^)]*empresa:\s*string[^)]*\)/s.test(entrada)
   && !/empresa\?\s*:\s*string/.test(entrada),
   "com `empresa?` opcional, uma porta nova compila sem responder que nome vai para a organização");

/* ── 2. TETO ZERO: ninguém chama signUp por fora ─────────────────────────── */
const foraDoAjudante: string[] = [];
for (const f of arquivos("src")) {
  if (f.replace(/\\/g, "/") === ENTRADA) continue;
  if (/\.auth\.signUp\s*\(/.test(semComentario(readFileSync(f, "utf8")))) foraDoAjudante.push(f);
}
ok("cadastro: nenhuma tela chama auth.signUp por fora do ajudante",
   foraDoAjudante.length === 0,
   foraDoAjudante.length
     ? `${foraDoAjudante.join(", ")} — use \`criarContaEEntrar\` (lib/entrada): quem desvia do ajudante fica invisível ao tipo e volta a criar org sem nome`
     : "");

/* ⚠️ E a varredura tem de estar OLHANDO alguma coisa. Se o padrão parar de
   casar até com o ajudante, ela passa calada para sempre. */
ok("cadastro: a varredura ainda encontra o signUp do ajudante",
   /\.auth\.signUp\s*\(/.test(entrada),
   "o padrão parou de casar — a guarda ficou cega");

/* ── 3. Toda porta passa um nome de verdade ──────────────────────────────── */
const PORTAS = [
  { arquivo: "src/components/entrada/CriarContaView.tsx", o_que: "o campo digitado" },
  { arquivo: "src/components/onboarding/OnboardingWizard.tsx", o_que: "a razão social" },
  { arquivo: "src/components/onboarding/OnboardingPessoal.tsx", o_que: "o nome da pessoa" },
];
for (const p of PORTAS) {
  const src = semComentario(readFileSync(p.arquivo, "utf8"));
  const m = src.match(/criarContaEEntrar\(([^)]*)\)/);
  const args = m ? m[1].split(",").map((a) => a.trim()) : [];
  ok(`cadastro: ${p.arquivo.split("/").pop()} passa ${p.o_que}`,
     args.length === 3 && args[2].length > 0 && args[2] !== '""' && args[2] !== "''",
     m ? `terceiro argumento: ${args[2] ?? "(ausente)"}` : "não chama criarContaEEntrar");
}

/* ── 4. O vazio é recusado na TELA ───────────────────────────────────────── */
const cadastro = semComentario(readFileSync("src/components/entrada/CriarContaView.tsx", "utf8"));
ok("cadastro: nome vazio é RECUSADO no campo, não resolvido em silêncio",
   /setErroEmpresa\(/.test(cadastro) && /empresa\.trim\(\)/.test(cadastro),
   "o gatilho tem um último recurso para não derrubar o signup; ele não é o caminho de quem está olhando o campo");

/* ── 5. A migration não reintroduz a derivação ───────────────────────────── */
const mig = readFileSync("supabase/migrations/20260824220000_nome_da_empresa_do_cadastro.sql", "utf8");
const corpo = mig.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
ok("cadastro: a migration NÃO deriva o nome do e-mail",
   !/split_part\s*\(\s*[^)]*email/i.test(corpo),
   "o ramo do e-mail é o defeito A4P-085 — ele grava um nome plausível em silêncio");
ok("cadastro: a migration apara as bordas no servidor",
   /btrim\s*\(\s*new\.raw_user_meta_data/.test(corpo),
   "a tela é conveniência; a garantia é no único escritor");

console.log(
  falhas === 0
    ? `\n✓ TODOS — o nome sai do campo, viaja no signUp e chega ao gatilho · ${PORTAS.length} portas de cadastro\n`
    : `\n✗ ${falhas} problema(s) no caminho do nome da empresa\n`,
);
if (falhas > 0) process.exit(1);
