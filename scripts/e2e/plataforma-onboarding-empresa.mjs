/**
 * JORNADA: o cadastro da EMPRESA em 7 passos, do login até as telas que leem
 * o cadastro.
 *
 * Login no modo Empresa → /comecar → razão social, fantasia e CNPJ → avança os
 * 7 passos (a análise IA dá a maturidade) → Concluir → Visão geral. Confere
 * que `/configuracoes` e Administração → Empresa mostram os MESMOS dados — o
 * cadastro tem uma morada só.
 */
import { novoUsuario, verificador } from "./kit.mjs";

export default async function onboardingEmpresa(navegador) {
  const v = verificador("plataforma-onboarding-empresa");
  const u = await novoUsuario(navegador);

  await u.ir("/login");
  await u.page.getByRole("tab", { name: "Empresa" }).click();
  v.ok(/Acesse o painel financeiro Quattro\./.test(await u.texto()), "o login no modo Empresa fala do painel financeiro (marca grafada Quattro)");

  await u.ir("/comecar");
  const c0 = await u.texto();
  v.ok(/1\. Dados básicos|Dados básicos/.test(c0) && /Ambiente criado/.test(c0), "/comecar abre o cadastro de EMPRESA (7 passos)");
  await u.page.getByLabel("CNPJ", { exact: true }).fill("04.252.011/0001-10");
  await u.page.getByLabel("Razão social").fill("Oficina E2E Ltda");
  await u.page.getByLabel("Nome fantasia").fill("Oficina E2E");
  let passos = 0;
  for (let k = 0; k < 6; k++) {
    const b = u.page.getByRole("button", { name: /^(Próximo|Pular e continuar)$/ });
    if (!(await b.count())) break;
    await b.first().click();
    await u.page.waitForTimeout(400);
    passos++;
  }
  const analise = await u.texto();
  v.ok(passos === 6, "os 7 passos avançam até o último", String(passos));
  v.ok(/Concluir e entrar/.test(analise), "o último passo oferece concluir");
  await u.page.getByRole("button", { name: "Concluir e entrar" }).click();
  await u.page.waitForURL((url) => url.pathname === "/", { timeout: 20000 }).catch(() => {});
  await u.page.waitForTimeout(2000);
  v.ok(new URL(u.page.url()).pathname === "/", "concluir leva à Visão geral", u.page.url());

  const db = await u.page.evaluate(() => JSON.parse(localStorage.getItem("a4p_company") || "{}").db ?? {});
  v.ok(db.razaoSocial === "Oficina E2E Ltda" && db.cnpj === "04.252.011/0001-10" && db.fantasia === "Oficina E2E", "o cadastro guarda razão social, CNPJ e fantasia", JSON.stringify(db).slice(0, 160));

  await u.ir("/configuracoes");
  const conf = await u.texto();
  v.ok(/Oficina E2E Ltda/.test(conf) && /04\.252\.011\/0001-10/.test(conf), "/configuracoes mostra a razão social e o CNPJ do cadastro");
  await u.ir("/dashboard/administration/company-data");
  v.ok((await u.page.getByLabel("CNPJ").inputValue()) === "04.252.011/0001-10" && (await u.page.getByLabel("Nome fantasia").inputValue()) === "Oficina E2E",
    "Administração → Empresa abre com o MESMO CNPJ e fantasia");

  v.ok(u.erros.length === 0, "nenhum erro de página ou de console", u.erros.slice(0, 2).join(" | "));
  await u.ctx.close();
  return v.falhas();
}
