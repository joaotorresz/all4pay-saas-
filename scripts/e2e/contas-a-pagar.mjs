/**
 * JORNADA: a conta a pagar paga — do formulário ao saldo e ao DRE.
 * Cria uma conta única de R$ 3.210,99 já marcada como paga e confere que ela
 * aparece nos títulos a pagar, que o saldo em conta da Visão geral cai
 * EXATAMENTE esse valor, e que o DRE reflete a despesa.
 */
import { novoUsuario, verificador, brl } from "./kit.mjs";

async function escolherNaBusca(u, rotuloBotao) {
  await u.page.locator("main button", { hasText: rotuloBotao }).first().click({ timeout: 8000 });
  await u.page.waitForTimeout(300);
  const opcao = u.page.locator('[role="option"]').first();
  const tem = await opcao.count();
  if (tem) await opcao.click();
  else await u.page.keyboard.press("Enter");
  await u.page.waitForTimeout(300);
  return tem > 0;
}

async function saldoHome(u) {
  await u.ir("/");
  const t = (await u.texto()).replace(/\n/g, " ");
  const m = t.match(/Saldo em conta hoje\s*R\$\s*([\d.]+)\s*,?\s*(\d{2})?/);
  return m ? brl(`${m[1]},${m[2] ?? "00"}`) : NaN;
}

export default async function contasAPagar(navegador) {
  const v = verificador("contas-a-pagar");
  const u = await novoUsuario(navegador);

  const saldoAntes = await saldoHome(u);
  v.ok(Number.isFinite(saldoAntes), "a Visão geral mostra o saldo em conta", String(saldoAntes));
  await u.ir("/dashboard/reports/dre");
  const dreAntes = await u.texto();

  await u.ir("/dashboard/financial/payables/new");
  v.ok(await escolherNaBusca(u, /Busque a conta/), "o campo de conta oferece contas");
  v.ok(await escolherNaBusca(u, /Busque ou crie/), "o campo de categoria oferece categorias");
  await escolherNaBusca(u, /Digite nome ou documento/);
  const hoje = await u.page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; });
  for (const d of await u.page.locator('main input[type="date"]').all()) await d.fill(hoje);
  await u.page.locator('main input[placeholder="0,00"]').first().fill("321099");
  await u.page.locator("#cb-pagamento-realizado").evaluate((el) => { el.scrollIntoView(); el.click(); });
  await u.page.waitForTimeout(300);
  for (const d of await u.page.locator('main input[type="date"]').all()) if (!(await d.inputValue())) await d.fill(hoje);
  await u.page.getByRole("button", { name: "Salvar" }).last().click();
  await u.page.waitForTimeout(2500);
  const aviso = await u.page.evaluate(() => [...document.querySelectorAll("[role=status], [role=alert], .text-negative")].map((e) => e.textContent.trim()).filter(Boolean).join(" | "));
  v.ok(!u.page.url().includes("/new"), "salvar sai do formulário", aviso || u.page.url());

  await u.ir("/contas-a-pagar/titulos");
  const tit = (await u.texto()).replace(/\n/g, " ");
  v.ok(/3\.210\s*,99/.test(tit), "a conta aparece nos títulos a pagar");

  const saldoDepois = await saldoHome(u);
  // A Home mostra o saldo ARREDONDADO ao real: a queda tem de ser o valor pago
  // arredondado junto com os dois saldos (nunca uma truncagem).
  const delta = Math.round(saldoAntes - saldoDepois);
  v.ok(Math.abs(delta - 3210.99) <= 1, "o saldo em conta cai o valor pago", `antes ${saldoAntes} · depois ${saldoDepois} · diferença ${delta}`);

  await u.ir("/dashboard/reports/dre");
  v.ok((await u.texto()) !== dreAntes, "o DRE reflete a despesa");
  v.ok(u.erros.length === 0, "nenhum erro de página ou de console", u.erros.slice(0, 2).join(" | "));
  await u.ctx.close();
  return v.falhas();
}
