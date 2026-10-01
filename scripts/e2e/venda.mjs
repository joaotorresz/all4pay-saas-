/**
 * JORNADA: a venda — do formulário ao DRE.
 * Cria uma venda de 2 × R$ 12.345,67 e confere que ela chega à lista de
 * vendas (com o total dos itens), ao título a receber (com o NOME da
 * categoria) e ao DRE.
 */
import { novoUsuario, verificador } from "./kit.mjs";

export default async function venda(navegador) {
  const v = verificador("venda");
  const u = await novoUsuario(navegador);

  await u.ir("/dashboard/reports/dre");
  const dreAntes = await u.texto();

  await u.ir("/dashboard/sales-invoices/new");
  const opcoesCategoria = await u.select("Selecione a categoria").locator("option").count();
  v.ok(opcoesCategoria > 1, "o campo obrigatório de categoria oferece opções", `${opcoesCategoria - 1} categoria(s)`);
  await u.select("Selecione o cliente").selectOption({ index: 1 });
  await u.select("Selecione o produto").selectOption({ index: 1 });
  await u.page.locator('input[type="number"]').first().fill("2");
  await u.page.locator('input[placeholder="0,00"]').first().fill("1234567");
  await u.page.waitForTimeout(300);
  const total = await u.page.locator('input[placeholder="0,00"]').nth(1).inputValue();
  v.ok(total === "24.691,34", "o valor total acompanha quantidade × preço", `total do campo: ${total}`);
  await u.select("Selecione a conta").selectOption({ index: 1 });
  await u.select("Selecione a categoria").selectOption({ index: 1 });
  const nomeCategoria = await u.select("Selecione a categoria").evaluate((s) => s.options[s.selectedIndex].text);
  await u.page.getByRole("button", { name: "Salvar venda" }).click();
  await u.page.waitForTimeout(2500);
  v.ok(u.page.url().endsWith("/dashboard/sales-invoices"), "salvar leva de volta à lista", u.page.url());

  const lista = await u.texto();
  const numero = (lista.match(/20\d\d-\d{4}/) || [])[0];
  v.ok(!!numero, "a venda aparece na lista com número do ano", numero ?? "sem número");
  v.ok(/24\.691\s*,34/.test(lista.replace(/\n/g, "")), "a lista mostra o total dos itens");

  await u.ir("/contas-a-receber/titulos");
  const titulos = (await u.texto()).replace(/\n/g, " ");
  v.ok(/24\.691\s*,34/.test(titulos), "a venda virou título a receber com o mesmo valor");
  v.ok(titulos.includes(nomeCategoria), "o título mostra o NOME da categoria", nomeCategoria);
  v.ok(!/\bcat-[a-z]/.test(titulos), "nenhum código interno de categoria aparece na tela");

  await u.ir("/dashboard/reports/dre");
  v.ok((await u.texto()) !== dreAntes, "o DRE reflete a venda nova");

  v.ok(u.erros.length === 0, "nenhum erro de página ou de console", u.erros.slice(0, 2).join(" | "));
  await u.ctx.close();
  return v.falhas();
}
