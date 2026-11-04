/**
 * crons-no-ar — os crons diários rodaram nas últimas 26 horas? (Fase 3.4)
 *
 *   SUPABASE_DB_URL=… npm run crons-no-ar        (job esquema-prod, agendado)
 *
 * Lê `cron_execucoes` de PRODUÇÃO (papel só-leitura) e reprova, nomeando a
 * rota, o cron diário sem execução bem-sucedida dentro do prazo. É a prova de
 * que o materializador de recorrências roda todo dia: uma leitura única
 * provaria o momento; o agendamento a cada 15 minutos prova o estado.
 */
import { execFileSync } from "node:child_process";
import { avaliarCrons, type UltimaExecucao } from "../src/core/crons/index.ts";

const URL = process.env.SUPABASE_DB_URL;
if (!URL) { console.error("✗ crons-no-ar: SUPABASE_DB_URL ausente"); process.exit(1); }

const SQL = `select job || '|' || coalesce(to_char(max(terminado_em) filter (where ok) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), '') from public.cron_execucoes group by job`;
const bruto = execFileSync("psql", [URL, "-tAX", "-c", SQL], { encoding: "utf8" }).trim();
const ultimas: UltimaExecucao[] = bruto.split("\n").filter(Boolean).map((l) => {
  const [job, t] = l.split("|");
  return { job, terminadoEm: t || null };
});

const sit = avaliarCrons(ultimas, new Date());
for (const s of sit) console.log(`  ${s.emDia ? "✓" : "✗"} ${s.job}: ${s.motivo}`);
const atrasados = sit.filter((s) => !s.emDia);
if (atrasados.length) {
  console.log(`\n✗ crons-no-ar: ${atrasados.length} cron(s) diário(s) parado(s). Confira na Vercel: Cron Jobs ligados, CRON_SECRET e SUPABASE_SERVICE_ROLE_KEY.\n`);
  process.exit(1);
}
console.log("\n✓ crons-no-ar: todos os crons diários completaram nas últimas 26 horas\n");
