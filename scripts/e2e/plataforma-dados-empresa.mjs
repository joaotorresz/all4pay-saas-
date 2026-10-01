/**
 * JORNADA: "Dados da empresa" (Administração) grava no MESMO cadastro que
 * `/configuracoes` lê — e o resto do sistema também.
 *
 * Cadastra a empresa pelo onboarding (CNPJ A, fantasia "Padaria Antiga",
 * Lucro Presumido), edita CNPJ, nome fantasia e regime em Administração, e
 * confere: `/configuracoes` mostra os NOVOS valores; o cadastro guarda cada
 * fato numa chave só; recarregar a tela não desfaz a edição.
 *
 * ⚠️ O que esta jornada achou: a tela gravava `documento`/`nomeFantasia` —
 * chaves que nenhuma outra tela lê — e só no cache do navegador. Trocar o
 * CNPJ aqui não mudava o CNPJ do arquivo do contador nem a chave PIX; e o
 * regime do onboarding ("Lucro Presumido") abria o seletor VAZIO, e o
 * salvar seguinte apagava o regime declarado.
 */
import { novoUsuario, verificador } from "./kit.mjs";

export default async function dadosEmpresa(navegador) {
  const v = verificador("plataforma-dados-empresa");
  const u = await novoUsuario(navegador);

  // Um cadastro como o onboarding deixa (as chaves históricas incluídas).
  await u.ir("/");
  await u.page.evaluate(() => localStorage.setItem("a4p_company", JSON.stringify({
    db: { razaoSocial: "Padaria Antiga Ltda", fantasia: "Padaria Antiga", cnpj: "11.222.333/0001-81", regime: "Lucro Presumido", repNome: "Rita" },
  })));

  await u.ir("/dashboard/administration/company-data");
  const cnpj = u.page.getByLabel("CNPJ");
  v.ok((await cnpj.inputValue()) === "11.222.333/0001-81", "a tela abre com o CNPJ do cadastro", await cnpj.inputValue());
  const regime = u.page.getByLabel("Regime tributário");
  v.ok((await regime.inputValue()) === "presumido", "o regime declarado no onboarding (\"Lucro Presumido\") aparece selecionado", await regime.inputValue());

  await cnpj.fill("04.252.011/0001-10");
  await u.page.getByLabel("Nome fantasia").fill("Padaria Nova");
  await regime.selectOption("simples");
  await u.page.getByRole("button", { name: "Salvar alterações" }).click();
  await u.page.waitForTimeout(1200);
  const aviso = await u.texto();
  v.ok(/Dados da empresa salvos/.test(aviso), "salvar confirma", aviso.match(/Não foi possível[^\n]*/)?.[0] ?? "");

  const db = await u.page.evaluate(() => JSON.parse(localStorage.getItem("a4p_company") || "{}").db ?? {});
  v.ok(db.cnpj === "04.252.011/0001-10" && db.fantasia === "Padaria Nova", "o cadastro guarda o CNPJ e o fantasia nas chaves que o sistema lê", JSON.stringify({ cnpj: db.cnpj, fantasia: db.fantasia }));
  v.ok(!("documento" in db) && !("nomeFantasia" in db), "nenhuma segunda morada sobra no cadastro", Object.keys(db).join(","));
  v.ok(/simples/i.test(db.regime) && /simples/i.test(db.regimeTributario ?? db.regime), "o regime novo vale", `${db.regime} · ${db.regimeTributario}`);
  v.ok(db.repNome === "Rita", "o que a tela não mostra continua no cadastro");

  await u.ir("/configuracoes");
  const conf = await u.texto();
  v.ok(/04\.252\.011\/0001-10/.test(conf), "/configuracoes mostra o CNPJ editado em Administração");
  v.ok(/Padaria Nova/.test(conf) && !/Padaria Antiga\b(?! Ltda)/.test(conf), "/configuracoes mostra o nome fantasia novo");

  await u.ir("/dashboard/administration/company-data");
  v.ok((await u.page.getByLabel("CNPJ").inputValue()) === "04.252.011/0001-10", "recarregar a tela não desfaz a edição");
  v.ok((await u.page.getByLabel("Regime tributário").inputValue()) === "simples", "o regime salvo volta selecionado");

  v.ok(u.erros.length === 0, "nenhum erro de página ou de console", u.erros.slice(0, 2).join(" | "));
  await u.ctx.close();
  return v.falhas();
}
