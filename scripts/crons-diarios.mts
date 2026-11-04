/**
 * crons-diarios — todo cron diário deixa rastro, e alguém vigia o rastro
 * (Fase 3.4 do plano, 04/11/2026).
 *
 *   npm run crons-diarios        (dentro de npm test)
 *
 * O materializador de recorrências ficou meses sem rodar em produção sem que
 * ninguém visse. A prova contínua de que ele roda é a guarda agendada
 * `crons-no-ar` sobre `cron_execucoes`. Esta guarda reprova se alguém desfizer
 * uma das metades:
 *
 *   1. o prazo: 25 h está em dia, 27 h não, e "nunca rodou" não está;
 *   2. a lista de crons vigiados é a de vercel.json (nem cron sem vigia, nem
 *      vigia de cron que saiu), e a do CHECK da migration;
 *   3. cada rota grava a execução COMPLETA (ok = true) fora de qualquer laço
 *      por empresa, e grava a falha de leitura (ok = false);
 *   4. o job agendado do CI roda `crons-no-ar` com o banco de produção.
 *
 * ⚠️ Horas e nomes esperados são literais (regra 11).
 */
import { readFileSync } from "node:fs";
import { avaliarCrons, CRONS_DIARIOS } from "@/core/crons";

let falhas = 0;
const ok = (nome: string, cond: boolean, det = "") => {
  if (cond) console.log(`  ✓ ${nome}`);
  else { falhas++; console.log(`  ✗ ${nome}${det ? ` — ${det}` : ""}`); }
};

const agora = new Date("2026-11-04T12:00:00Z");
const sit = (iso: string | null) => avaliarCrons([{ job: "recorrencias", terminadoEm: iso }], agora).find((s) => s.job === "recorrencias")!;
console.log("\nprazo");
ok("1. execução há 25 h está em dia", sit("2026-11-03T11:00:00Z").emDia === true);
ok("1. execução há 27 h está atrasada", sit("2026-11-03T09:00:00Z").emDia === false);
ok("1. nunca ter rodado é atraso, e o motivo nomeia a rota",
   sit(null).emDia === false && /\/api\/recorrencias\/run nunca completou/.test(sit(null).motivo));
ok("1. um cron sem linha nenhuma também é atraso",
   avaliarCrons([], agora).every((s) => !s.emDia));

console.log("\nlista");
const vercel = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: { path: string }[] };
const rotasVercel = vercel.crons.map((c) => c.path).sort();
const rotasVigiadas = CRONS_DIARIOS.map((c) => c.rota).sort();
ok("2. os crons vigiados são os de vercel.json", JSON.stringify(rotasVercel) === JSON.stringify(rotasVigiadas),
   `vercel.json ${rotasVercel.join(", ")} × vigiados ${rotasVigiadas.join(", ")}`);
const mig = readFileSync("supabase/migrations/20261104110000_cron_execucoes.sql", "utf8");
const check = mig.match(/check \(job in \(([^)]*)\)\)/)?.[1] ?? "";
const jobsCheck = Array.from(check.matchAll(/'([^']+)'/g)).map((m) => m[1]).sort();
ok("2. o CHECK da tabela aceita exatamente os jobs vigiados",
   JSON.stringify(jobsCheck) === JSON.stringify(CRONS_DIARIOS.map((c) => c.job).sort()), `CHECK: ${jobsCheck.join(", ")}`);

console.log("\nrotas");
const semComentario = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
for (const c of CRONS_DIARIOS) {
  const arq = `src/app${c.rota}/route.ts`;
  const src = semComentario(readFileSync(arq, "utf8"));
  const sucesso = src.search(new RegExp(`registrarExecucaoCron\\(admin, "${c.job}", \\w+, true,`));
  ok(`3. ${c.rota} grava a execução completa`, sucesso > -1, "sem a linha, a rota volta a não deixar rastro quando não há trabalho");
  ok(`3. ${c.rota} grava a falha de leitura`, new RegExp(`registrarExecucaoCron\\(admin, "${c.job}", \\w+, false,`).test(src));
  // A gravação de sucesso fica DEPOIS do último laço `for (` da rota (não dentro dele).
  const ultimoFor = src.lastIndexOf("for (");
  const fechaLaco = ultimoFor > -1 ? src.indexOf("\n  }\n", ultimoFor) : -1;
  ok(`3. ${c.rota} grava fora do laço por empresa`, sucesso > fechaLaco, "dentro do laço, sem empresa não há rastro");
}

console.log("\nvigia");
const ci = readFileSync(".github/workflows/ci.yml", "utf8");
const esquemaProd = ci.slice(ci.indexOf("\n  esquema-prod:"), ci.indexOf("\n  no-ar:"));
ok("4. o job agendado roda crons-no-ar com o banco de produção",
   /SUPABASE_DB_URL: \$\{\{ secrets\.SUPABASE_DB_URL \}\}\s*\n\s*run: npm run crons-no-ar/.test(esquemaProd));
ok("4. esse job roda no schedule", /github\.event_name == 'schedule'/.test(esquemaProd));

if (falhas > 0) {
  console.log(`\n✗ crons-diarios: ${falhas} falha(s)\n`);
  process.exit(1);
}
console.log("\n✓ crons-diarios: todo cron diário deixa rastro, e o rastro é vigiado\n");
