/**
 * JORNADA: "Nova empresa" (Configurações → Abrir outra empresa).
 *
 * ⚠️ O que esta jornada achou (revisão, 01/10/2026): "Criar Empresa" não
 * criava organização nenhuma — REESCREVIA o cadastro da empresa ABERTA com os
 * dados da "nova" (razão social, documento e o regime em branco), e
 * `/configuracoes` passava a anunciar "Organização: <a nova>". O banco não tem
 * porta para o cliente criar a segunda organização; a tela agora diz o caminho
 * que existe (uma conta para a nova empresa) e NÃO toca no cadastro atual.
 *
 * Confere VALORES: o cadastro guardado é byte a byte o mesmo antes e depois, e
 * a razão social, o CNPJ e o regime da empresa aberta continuam na tela.
 */
import { novoUsuario, verificador } from "./kit.mjs";

const CADASTRO = {
  db: {
    tipoConta: "empresa", tipoPessoa: "juridica", razaoSocial: "Padaria Atual Ltda", fantasia: "Padaria Atual",
    cnpj: "11.222.333/0001-81", regimeTributario: "Lucro Presumido", regime: "Lucro Presumido",
  },
};

export default async function novaEmpresa(navegador) {
  const v = verificador("plataforma-nova-empresa");
  const u = await novoUsuario(navegador);

  await u.ir("/");
  await u.page.evaluate((c) => localStorage.setItem("a4p_company", JSON.stringify(c)), CADASTRO);
  await u.ir("/configuracoes");
  const antesTxt = (await u.texto()).replace(/\n/g, " ");
  v.ok(/Padaria Atual Ltda/.test(antesTxt) && /11\.222\.333\/0001-81/.test(antesTxt), "/configuracoes mostra a empresa aberta");
  const antes = await u.page.evaluate(() => localStorage.getItem("a4p_company"));

  await u.ir("/empresas/nova");
  await u.page.locator("xpath=//label[contains(normalize-space(),'Razão Social')]/following::input[1]").first().fill("Outra Empresa Nova Ltda");
  await u.page.getByRole("button", { name: "Criar Empresa" }).click();
  await u.page.waitForTimeout(1200);
  const tela = (await u.texto()).replace(/\n/g, " ");
  v.ok(/A empresa Outra Empresa Nova Ltda não foi criada, e os dados da empresa aberta não foram alterados/.test(tela),
    "a tela diz que nada foi criado nem alterado");
  v.ok(/empresas\/nova/.test(u.page.url()), "a tela não finge ter criado (não navega para Configurações)", u.page.url());
  const link = u.page.getByRole("link", { name: "Criar conta para a nova empresa" });
  v.ok(await link.count() === 1 && (await link.getAttribute("href")) === "/criar-conta", "oferece o caminho que existe: uma conta para a nova empresa");

  const depois = await u.page.evaluate(() => localStorage.getItem("a4p_company"));
  v.ok(depois === antes, "o cadastro da empresa aberta é o MESMO, byte a byte", depois?.slice(0, 160) ?? "null");

  await u.ir("/configuracoes");
  const depoisTxt = (await u.texto()).replace(/\n/g, " ");
  v.ok(/Padaria Atual Ltda/.test(depoisTxt) && !/Outra Empresa Nova/.test(depoisTxt), "/configuracoes continua na empresa aberta");
  await u.ir("/dashboard/administration/company-data");
  const regime = await u.page.locator("select").evaluateAll((ss) => ss.map((s) => s.value));
  v.ok(regime.includes("presumido"), "o regime declarado (Lucro Presumido) continua selecionado", JSON.stringify(regime));

  v.ok(u.erros.length === 0, "nenhum erro de página ou de console", u.erros.slice(0, 2).join(" | "));
  await u.ctx.close();
  return v.falhas();
}
