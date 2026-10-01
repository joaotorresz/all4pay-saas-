/**
 * JORNADA: "quanto tenho a receber?" na Quattro AI × a carteira do painel de
 * Contas a receber — e o que acontece quando entra uma ENTRADA que não é conta
 * a receber (rendimento a creditar).
 *
 * ⚠️ Por que existe (revisão de 01/10/2026): a IA somava ao "a receber" toda
 * entrada pendente — rendimento, resgate, empréstimo, transferência entre
 * contas próprias. O painel (`ehContaAReceber`) não soma. Sobre a demonstração
 * os dois batiam por acaso (não há entrada assim em aberto); bastava lançar um
 * rendimento a creditar para a IA dizer um total e a tela outro, e a IA passar
 * a cobrar como "devedor" um dinheiro que ninguém deve.
 */
import { novoUsuario, verificador, brl } from "./kit.mjs";
import { perguntar } from "./ia-numeros.mjs";

const RS = "R\\$\\s?(-?[\\d.]+,\\d{2})";
const aReceberDaIA = (r) => { const m = r.match(new RegExp(`Há ${RS} a receber`)); return m ? brl(m[1]) : NaN; };

async function carteiraDoPainel(u) {
  await u.ir("/contas-a-receber");
  const t = (await u.texto()).replace(/\s+/g, " ");
  const m = t.match(/Exposição por cliente carteira inteira R\$\s*([\d.]+)\s*,?\s*(\d{2})?\s*em aberto/);
  return m ? brl(`${m[1]},${m[2] ?? "00"}`) : NaN;
}

export default async function iaCarteira(navegador) {
  const v = verificador("ia-carteira");
  const u = await novoUsuario(navegador);

  await u.ir("/quattro-ai");
  const ia0 = aReceberDaIA(await perguntar(u, "quanto tenho a receber?"));
  const tela0 = await carteiraDoPainel(u);
  v.ok(Number.isFinite(ia0) && ia0 > 0, "a IA responde um total a receber", String(ia0));
  v.ok(Math.abs(ia0 - tela0) < 0.005, "o \"a receber\" da IA é a carteira em aberto do painel", `IA ${ia0} · tela ${tela0}`);

  // CRIAR: uma conta a receber PENDENTE na categoria "Juros e rendimentos"
  await u.ir("/dashboard/financial/receivables/new");
  await u.page.locator("main button", { hasText: /Busque a conta/ }).first().click({ timeout: 8000 });
  await u.page.waitForTimeout(300);
  await u.page.locator('[role="option"]').first().click();
  await u.page.waitForTimeout(300);
  await u.page.locator("main button", { hasText: /Busque ou crie/ }).first().click({ timeout: 8000 });
  await u.page.waitForTimeout(300);
  await u.page.keyboard.type("Juros");
  await u.page.waitForTimeout(400);
  const opJuros = u.page.locator('[role="option"]', { hasText: /Juros e rendimentos/ }).first();
  v.ok(await opJuros.count() > 0, "a categoria \"Juros e rendimentos\" existe no formulário");
  await opJuros.click();
  await u.page.waitForTimeout(300);
  await u.page.locator("main button", { hasText: /Digite nome ou documento/ }).first().click({ timeout: 8000 });
  await u.page.waitForTimeout(300);
  await u.page.locator('[role="option"]').first().click();
  await u.page.waitForTimeout(300);
  const hoje = await u.page.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + 10); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; });
  for (const d of await u.page.locator('main input[type="date"]').all()) await d.fill(hoje);
  await u.page.locator('main input[placeholder="0,00"]').first().fill("77777");
  await u.page.getByRole("button", { name: "Salvar" }).last().click();
  await u.page.waitForTimeout(2500);
  const aviso = await u.page.evaluate(() => [...document.querySelectorAll("[role=status], [role=alert], .text-negative")].map((e) => e.textContent.trim()).filter(Boolean).join(" | "));
  v.ok(!u.page.url().includes("/new"), "o rendimento a creditar de R$ 777,77 é salvo", aviso || u.page.url());

  const tela1 = await carteiraDoPainel(u);
  v.ok(Math.abs(tela1 - tela0) < 0.005, "o painel de Contas a receber NÃO muda (rendimento não é conta a receber)", `${tela0} → ${tela1}`);
  await u.ir("/quattro-ai");
  const ia1 = aReceberDaIA(await perguntar(u, "quanto tenho a receber?"));
  v.ok(Math.abs(ia1 - ia0) < 0.005, "e a IA também não muda", `${ia0} → ${ia1}`);
  v.ok(Math.abs(ia1 - tela1) < 0.005, "IA e painel continuam no mesmo número", `IA ${ia1} · tela ${tela1}`);

  v.ok(u.erros.length === 0, "nenhum erro de página ou de console", u.erros.slice(0, 2).join(" | "));
  await u.ctx.close();
  return v.falhas();
}
