/**
 * Prova do A4P-078: a rota de cron RECUSA quando `CRON_SECRET` não existe.
 *
 * ⚠️ O caso que importa é o PRIMEIRO. Antes do conserto ele devolvia "PASSA" —
 * era a porta aberta pela ausência de configuração.
 */
import { recusaDeCron } from "@/lib/cron-auth";

const req = (bearer?: string) =>
  new Request("https://x/api", { headers: bearer ? { authorization: bearer } : {} });

let falhas = 0;
const caso = (nome: string, esperado: string, obtido: string) => {
  const ok = esperado === obtido;
  if (!ok) falhas++;
  console.log(`${ok ? "✓" : "✗"} ${nome.padEnd(38)} esperado ${esperado.padEnd(11)} obtido ${obtido}`);
};
const ler = (r: ReturnType<typeof recusaDeCron>) => (r === null ? "PASSA(200)" : `RECUSA(${r.status})`);

delete process.env.CRON_SECRET;
caso("sem CRON_SECRET — o defeito A4P-078", "RECUSA(503)", ler(recusaDeCron(req())));

process.env.CRON_SECRET = "s3gr3d0";
caso("com segredo, sem bearer",   "RECUSA(401)", ler(recusaDeCron(req())));
caso("com segredo, bearer errado","RECUSA(401)", ler(recusaDeCron(req("Bearer outro"))));
caso("com segredo, bearer certo", "PASSA(200)",  ler(recusaDeCron(req("Bearer s3gr3d0"))));

console.log(falhas === 0 ? "\n✓ TODOS — a rota de cron falha FECHADA\n" : `\n✗ ${falhas} FALHA(S)\n`);
if (falhas > 0) process.exit(1);
