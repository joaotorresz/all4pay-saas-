/**
 * menu-portas — as telas que SAÍRAM do menu (Fase 2 do plano, 03/11/2026)
 * continuam com porta. Uma tela fora do menu e sem botão que leve até ela é
 * uma tela perdida. Cobra, para cada uma:
 *  - não voltou como linha do menu (a decisão tem as duas metades);
 *  - a tela existe no inventário;
 *  - a página que é a porta dela tem o link.
 *
 *   npm run menu-portas
 */
import { readFileSync } from "node:fs";
import { INVENTARIO } from "@/core/rotas/inventario";

const PORTAS: { rota: string; porta: string }[] = [
  { rota: "/dashboard/financial/credit-card-invoices", porta: "src/app/dashboard/registrations/bank-accounts/page.tsx" },
  { rota: "/dashboard/financial/transfers", porta: "src/app/dashboard/registrations/bank-accounts/page.tsx" },
  { rota: "/upload/regras", porta: "src/app/upload/page.tsx" },
  { rota: "/upload/duplicatas", porta: "src/app/upload/page.tsx" },
  { rota: "/dashboard/accounting/dominio-export", porta: "src/app/exportar/page.tsx" },
  { rota: "/dashboard/accounting/nfe-export", porta: "src/app/exportar/page.tsx" },
  { rota: "/cronogramas", porta: "src/app/receita/page.tsx" },
  { rota: "/orcamento/realizado", porta: "src/app/orcamento/page.tsx" },
  { rota: "/dashboard/reports/dfc-multi", porta: "src/app/dashboard/reports/dre-multi/page.tsx" },
];

const falhas: string[] = [];
const ok = (nome: string, cond: boolean) => { if (!cond) falhas.push(nome); };
const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

// Só o menu da EMPRESA (`SECTIONS`): o da pessoa física tem o seu próprio
// "Planejado × Realizado" e não entra nesta decisão.
const navInteiro = ler("src/components/dashboard/nav-data.ts");
const inicio = navInteiro.indexOf("export const SECTIONS");
const nav = navInteiro.slice(inicio, navInteiro.indexOf("\nexport ", inicio + 1));
if (inicio < 0 || nav.length < 500) falhas.push("não achei o menu da empresa (SECTIONS) em nav-data.ts");
const rotas = new Set(INVENTARIO.map((r) => r.rota));
for (const { rota, porta } of PORTAS) {
  ok(`${rota} voltou como linha do menu (a porta é ${porta})`, !nav.includes(`href: "${rota}"`));
  ok(`${rota} não existe no inventário`, rotas.has(rota));
  ok(`${rota} ficou sem porta: ${porta} não tem o link`, ler(porta).includes(`href="${rota}"`));
}

if (falhas.length) {
  console.error(`menu-portas: ${falhas.length} falha(s)\n - ` + falhas.join("\n - "));
  process.exit(1);
}
console.log(`menu-portas: ${PORTAS.length} telas fora do menu, todas com porta. OK`);
