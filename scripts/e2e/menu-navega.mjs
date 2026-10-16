/**
 * JORNADA: de QUALQUER tela do menu dá para sair — pelo menu e pela logo.
 *
 * O defeito (16/10/2026): em Contas bancárias, Plano de contas, Centros de
 * custo e Projetos, um efeito gravava estado a cada render (a dependência era
 * um objeto montado na hora). O laço sem fim deixava o React sem vez: o menu
 * lateral nunca aparecia e nenhum link, nem a logo, navegava. A tela abria e
 * "travava". Nenhuma guarda via, porque o conteúdo da tela renderizava certo.
 *
 * Para cada destino do menu, a jornada confere três coisas: o menu lateral
 * está na tela, a página fica PARADA quando ninguém mexe (sem re-render sem
 * fim) e a logo leva à Home.
 */
import { BASE, novoUsuario, verificador } from "./kit.mjs";

const MENU = 'nav[aria-label="Seções do sistema"]';

export default async function menuNavega(navegador) {
  const v = verificador("menu-navega");
  const u = await novoUsuario(navegador);
  await u.ir("/");

  // Os destinos do menu: abre cada grupo e colhe os links.
  const destinos = new Set();
  const grupos = u.page.locator(`${MENU} > div > button`);
  const n = await grupos.count();
  for (let g = 0; g < n; g++) {
    await grupos.nth(g).click();
    await u.page.waitForTimeout(120);
    for (const h of await u.page.locator(`${MENU} a[href]`).evaluateAll((as) => as.map((a) => a.getAttribute("href")))) {
      // A Quattro AI abre o chat por cima da tela, e o /admin tem moldura própria.
      if (h && h.startsWith("/") && !h.startsWith("/quattro-ai") && !h.startsWith("/admin")) destinos.add(h);
    }
  }
  v.ok(destinos.size > 20, "o menu oferece os destinos", `${destinos.size} destino(s)`);

  const travadas = [];
  const semMenu = [];
  const logoMorta = [];
  for (const h of destinos) {
    await u.ir(h);
    if ((await u.page.locator(MENU).count()) === 0) semMenu.push(h);
    // Parada: em 1,5 s sem ninguém mexer, quase nada muda no DOM.
    const mudancas = await u.page.evaluate(() => new Promise((ok) => {
      let c = 0;
      const o = new MutationObserver((ms) => { c += ms.length; });
      o.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
      setTimeout(() => { o.disconnect(); ok(c); }, 1500);
    }));
    if (mudancas > 500) travadas.push(`${h} (${mudancas})`);
    await u.page.locator('[data-topbar="marca"]').click();
    try { await u.page.waitForURL(`${BASE}/`, { timeout: 8000 }); } catch { logoMorta.push(h); }
  }
  v.ok(semMenu.length === 0, "toda tela do menu mostra o menu lateral", semMenu.join(", "));
  v.ok(travadas.length === 0, "nenhuma tela re-renderiza sem parar", travadas.join(", "));
  v.ok(logoMorta.length === 0, "a logo leva à Home de qualquer tela", logoMorta.join(", "));

  // A logo do chat em tela cheia também leva à Home (o chat cobre a barra).
  await u.ir("/quattro-ai");
  await u.page.getByRole("link", { name: "Ir para a Home" }).click();
  let foi = true;
  try { await u.page.waitForURL(`${BASE}/`, { timeout: 8000 }); } catch { foi = false; }
  v.ok(foi, "a logo do chat leva à Home", u.page.url());

  await u.ctx.close();
  return v.falhas();
}
