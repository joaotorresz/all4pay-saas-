/**
 * JORNADA: o dashboard customizado — criar, adicionar widgets, páginas, salvar
 * e reabrir; os números são os do sistema.
 *
 * Confere: o KPI "Saldo em caixa" é o total do widget "Saldos das contas" e o
 * saldo da Visão geral; o KPI de runway, numa empresa que não queima caixa,
 * NÃO diz "0 meses"; o painel salvo reaparece depois de recarregar, com as
 * duas páginas.
 *
 * ⚠️ O que esta jornada achou: as fontes do widget tinham conta própria — o
 * "Burn mensal" era a média BRUTA das saídas e o runway dava "0 meses" sem
 * despesa —, e a lista gravava fora do `store-org`.
 */
import { novoUsuario, verificador, brl } from "./kit.mjs";

async function adicionar(u, nomeCatalogo) {
  await u.page.getByRole("button", { name: "Adicionar widget" }).click();
  await u.page.waitForTimeout(300);
  const titulo = u.page.locator("div.text-label", { hasText: new RegExp(`^${nomeCatalogo.replace(/[()/]/g, "\\$&")}$`) });
  const card = u.page.locator("div.bg-surface-2", { has: titulo }).first();
  await card.getByRole("button", { name: "Adicionar" }).click();
  await u.page.waitForTimeout(400);
}

export default async function dashboards(navegador) {
  const v = verificador("plataforma-dashboards");
  const u = await novoUsuario(navegador);

  await u.ir("/");
  const home = (await u.texto()).replace(/\n/g, " ");
  const saldoHome = brl(home.match(/Saldo em conta hoje\s*R\$\s*([\d.]+)/)?.[1] ?? "x");

  await u.ir("/dashboard/dashboards/custom");
  await u.page.getByRole("button", { name: "Novo painel" }).first().click();
  await u.page.getByPlaceholder("Nome do painel").fill("Painel E2E");
  await adicionar(u, "Saldos das contas");
  await adicionar(u, "KPI");                       // nasce "Saldo em caixa"
  await adicionar(u, "KPI");
  // O último KPI vira o runway.
  await u.page.getByRole("button", { name: "Editar" }).last().click();
  await u.page.getByLabel("Fonte da métrica").selectOption("runway");
  await u.page.waitForTimeout(800);

  const t1 = (await u.texto()).replace(/\n/g, " ");
  const saldoKpi = brl(t1.match(/Saldo em caixa\s*R\$\s*([\d.]+\s*,\s*\d{2})/)?.[1] ?? "x");
  const totalSaldos = brl(t1.match(/Saldos das contas\s*R\$\s*([\d.]+\s*,\s*\d{2})/)?.[1] ?? "x");
  v.ok(Number.isFinite(saldoKpi) && Math.abs(saldoKpi - totalSaldos) < 0.01, "o KPI Saldo em caixa == total do widget Saldos das contas", `${saldoKpi} × ${totalSaldos}`);
  v.ok(Math.abs(Math.round(saldoKpi) - saldoHome) <= 1, "e == saldo da Visão geral", `${saldoKpi} × ${saldoHome}`);
  v.ok(!/Runway\s*0\s*meses/.test(t1), "o runway não diz \"0 meses\" para quem não queima caixa", t1.match(/Runway[^R]{0,80}/)?.[0] ?? "");

  await u.page.getByRole("button", { name: "Adicionar página" }).click();
  await adicionar(u, "Gráfico de pizza/rosca");
  const t2 = (await u.texto()).replace(/\n/g, " ");
  v.ok(/2\. Página 2/.test(t2) && /Despesas por categoria \(12 meses\)\s*R\$/.test(t2), "a página 2 recebe a pizza com o total em R$");

  await u.page.getByRole("button", { name: "Salvar", exact: true }).click();
  await u.page.waitForTimeout(600);
  await u.ir("/dashboard/dashboards/custom");
  const lista = (await u.texto()).replace(/\n/g, " ");
  v.ok(/Painel E2E/.test(lista) && /2 página\(s\) · 4 widget\(s\)/.test(lista), "o painel salvo reaparece depois de recarregar, com 2 páginas e 4 widgets");
  const guardado = await u.page.evaluate(() => JSON.parse(localStorage.getItem("a4p_dashboards_custom") || "[]"));
  v.ok(guardado.length === 1 && guardado[0].dono === "local", "o painel guarda o dono (pessoal só aparece para quem criou)", JSON.stringify(guardado.map((d) => d.dono)));

  v.ok(u.erros.length === 0, "nenhum erro de página ou de console", u.erros.slice(0, 2).join(" | "));
  await u.ctx.close();
  return v.falhas();
}
