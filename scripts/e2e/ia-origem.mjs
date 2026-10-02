/**
 * JORNADA (Rodadas 5 e 9): o número que a IA cita leva à origem.
 *
 * - Número de TELA (EBITDA, runway) é link e cai na tela que mostra o mesmo
 *   número (Rodada 5).
 * - Número que é SOMA ("quanto gastei este mês?") abre a gaveta com os
 *   lançamentos, e a soma das linhas da gaveta É o número da resposta; o pé da
 *   gaveta leva à tela (Rodada 9).
 * - Número de CALCULADORA é marcado como simulação e não vira link.
 * - A aba Sugestões tem a seção Executar e nenhum disparo cru; a cobrança,
 *   quando existe, pede confirmação com os nomes antes de enviar.
 */
import { novoUsuario, verificador } from "./kit.mjs";
import { perguntar } from "./ia-numeros.mjs";

const brl = (t) => Number(String(t).replace(/[^\d,−-]/g, "").replace(/\./g, "").replace(",", ".").replace("−", "-"));

async function clicarNumeroDeTela(u, rota) {
  const link = u.page.locator(`[data-ia="resposta"] a[data-ia-numero="tela"][href="${rota}"]`).last();
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
  v.ok(await clicarNumeroDeTela(u, "/dashboard/reports/dre"), "o número do EBITDA é um link e leva ao DRE", u.page.url());

  await u.ir("/quattro-ai");
  await perguntar(u, "qual meu runway?");
  v.ok(await clicarNumeroDeTela(u, "/fluxo-caixa"), "o número do runway é um link e leva ao fluxo de caixa", u.page.url());

  // ── a soma abre a gaveta, e a gaveta fecha com o número ──
  await u.ir("/quattro-ai");
  await perguntar(u, "quanto gastei esse mês?");
  const resp = u.page.locator('[data-ia="resposta"]').last();
  const soma = resp.locator('button[data-ia-numero="soma"]').first();
  v.ok((await soma.count()) > 0, "o gasto do mês é um botão que abre os lançamentos");
  if (await soma.count()) {
    const valorTexto = await soma.locator("div").nth(1).innerText();
    await soma.click();
    await u.page.locator("[data-gaveta-valor]").first().waitFor({ timeout: 15000 });
    const linhas = await u.page.locator("[data-gaveta-valor]").evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-gaveta-valor"))));
    const totalGaveta = Math.abs(linhas.reduce((s, x) => s + x, 0));
    v.ok(Math.abs(totalGaveta - Math.abs(brl(valorTexto))) < 0.01,
      "a soma das linhas da gaveta é o número da resposta", `${valorTexto} × gaveta ${totalGaveta.toFixed(2)} (${linhas.length} linhas)`);
    const pe = u.page.locator("[data-gaveta-tela]");
    v.ok((await pe.count()) === 1 && (await pe.getAttribute("data-gaveta-tela")) === "/dashboard/financial/statement",
      "o pé da gaveta leva ao Extrato");
    await u.page.getByRole("button", { name: "Fechar" }).first().click();
  }

  // ── calculadora: simulação, sem link ──
  await perguntar(u, "simular financiamento de 100 mil em 24x a 1,5% ao mês");
  const calc = u.page.locator('[data-ia="resposta"]').last();
  v.ok((await calc.locator('[data-ia-numero="simulacao"]').count()) > 0
    && (await calc.locator('a[data-ia-numero], button[data-ia-numero]').count()) === 0,
  "o número da calculadora é marcado como simulação e não vira link");

  // ── Sugestões: a seção Executar existe e não há disparo cru ──
  await u.ir("/quattro-ai?aba=autonomo");
  await u.page.getByText("Sugestões da Quattro AI").first().waitFor({ timeout: 30000 });
  v.ok((await u.page.getByText("Disparar no WhatsApp").count()) === 0, "a aba Sugestões não tem mais o disparo cru de WhatsApp");
  const enviar = u.page.locator('[data-executa="envia"]').first();
  if (await enviar.count()) {
    await enviar.click();
    const conf = u.page.locator("[data-confirmar-cobranca]");
    await conf.waitFor({ timeout: 5000 });
    v.ok(/Envia WhatsApp de verdade para|nada seria enviado/.test(await conf.innerText()),
      "o envio da cobrança pede confirmação e diz quem recebe", await conf.innerText());
    await conf.getByRole("button", { name: "Cancelar" }).click();
  } else {
    console.log("  (sem sugestão de cobrança acionável nesta demonstração — o passo da confirmação não se aplica)");
  }

  // ── a sugestão enviada à alçada CONTINUA enviada (o id era um contador e
  //    mudava a cada redesenho: o selo sumia e o botão voltava) ──
  const aprov = u.page.locator('[data-executa="aprovacao"]');
  const nAprov = await aprov.count();
  if (nAprov) {
    await aprov.first().click();
    await u.page.getByText("Em aprovação").first().waitFor({ timeout: 15000 });
    await u.page.waitForTimeout(2500);
    v.ok((await u.page.getByText("Em aprovação").count()) > 0 && (await aprov.count()) === nAprov - 1,
      "enviada à alçada, a sugestão segue marcada e o botão não volta (sem segundo envio)",
      `botões ${nAprov} → ${await aprov.count()}`);
  }

  v.ok(u.erros.length === 0, "sem erro de página", u.erros.join(" | "));
  await u.ctx.close();
  return v.falhas();
}
