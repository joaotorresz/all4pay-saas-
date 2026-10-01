/**
 * JORNADA (Rodada 5): o aviso de palpite do DRE vira declaração em um clique,
 * e confirmar a sugestão NÃO muda o resultado.
 *
 * - O DRE da demonstração abre com o aviso "classificados por palpite".
 * - "Revisar e declarar" abre a lista com a linha sugerida já marcada.
 * - Salvar sem mexer: o aviso some (ou diminui) e o Resultado Líquido da
 *   tabela é o MESMO de antes — declarar o que o palpite já fazia não pode
 *   mover um centavo.
 */
import { novoUsuario, verificador } from "./kit.mjs";

async function resultado(u) {
  const td = u.page.locator('tr[data-linha="resultado_liquido"] td[data-celula="total"]').first();
  return (await td.count()) ? Number(await td.getAttribute("data-valor")) : NaN;
}

async function contagemPalpite(u) {
  const aviso = u.page.locator('[data-aviso="palpite"]').first();
  if (!(await aviso.count())) return 0;
  const n = await aviso.locator("b").first().innerText();
  return Number(n.replace(/\D/g, "")) || 0;
}

export default async function dreDeclarar(navegador) {
  const v = verificador("dre-declarar");
  const u = await novoUsuario(navegador);

  await u.ir("/dashboard/reports/dre");
  const antes = await resultado(u);
  const nAntes = await contagemPalpite(u);
  v.ok(nAntes > 0, "o DRE da demonstração avisa o palpite", `${nAntes} lançamentos`);
  v.ok(Number.isFinite(antes), "o Resultado Líquido aparece na tabela", String(antes));

  await u.page.getByRole("button", { name: "Revisar e declarar" }).click();
  await u.page.waitForTimeout(600);
  const selects = u.page.locator('[data-declarar="lista"] select');
  const n = await selects.count();
  v.ok(n > 0, "a lista mostra as categorias adivinhadas", `${n} categorias`);
  const marcadas = await selects.evaluateAll((els) => els.filter((e) => e.value).length);
  v.ok(marcadas > 0, "a linha sugerida já vem marcada", `${marcadas} de ${n}`);

  await u.page.getByRole("button", { name: "Salvar", exact: true }).click();
  await u.page.waitForTimeout(2500);

  const nDepois = await contagemPalpite(u);
  const depois = await resultado(u);
  v.ok(nDepois < nAntes, "o palpite diminui depois de declarar", `${nAntes} → ${nDepois}`);
  v.ok(Math.abs(depois - antes) < 0.005, "confirmar a sugestão NÃO muda o Resultado Líquido", `${antes} → ${depois}`);
  v.ok(u.erros.length === 0, "sem erro de página", u.erros.join(" | "));

  await u.ctx.close();
  return v.falhas();
}
