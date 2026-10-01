/**
 * JORNADA (Rodada 5): o número que a IA cita leva à tela que mostra o mesmo
 * número. Pergunta o EBITDA, clica no número e confere que caiu no DRE; pede o
 * runway e confere que caiu no fluxo de caixa.
 */
import { novoUsuario, verificador } from "./kit.mjs";
import { perguntar } from "./ia-numeros.mjs";

async function clicarNumero(u, rota) {
  const link = u.page.locator(`[data-ia="resposta"] a[data-ia-numero="${rota}"]`).last();
  if (!(await link.count())) return false;
  await Promise.all([u.page.waitForURL((url) => url.pathname === rota, { timeout: 30000 }), link.click()]);
  await u.page.waitForTimeout(800);
  return true;
}

export default async function iaOrigem(navegador) {
  const v = verificador("ia-origem");
  const u = await novoUsuario(navegador);

  await u.ir("/quattro-ai");
  await perguntar(u, "qual meu EBITDA este mês?");
  const foiDRE = await clicarNumero(u, "/dashboard/reports/dre");
  v.ok(foiDRE, "o número do EBITDA é um link e leva ao DRE", u.page.url());

  await u.ir("/quattro-ai");
  await perguntar(u, "qual meu runway?");
  const foiFluxo = await clicarNumero(u, "/fluxo-caixa");
  v.ok(foiFluxo, "o número do runway é um link e leva ao fluxo de caixa", u.page.url());

  v.ok(u.erros.length === 0, "sem erro de página", u.erros.join(" | "));
  await u.ctx.close();
  return v.falhas();
}
