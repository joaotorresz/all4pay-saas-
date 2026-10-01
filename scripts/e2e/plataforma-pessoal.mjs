/**
 * JORNADA: a conta PESSOAL, do login ao primeiro gasto.
 *
 * Login com o seletor Empresa/Pessoal → cadastro de 3 passos → a Visão geral
 * no modo pessoal (menu próprio, sem módulo de empresa) → "Adicionar" → uma
 * despesa de R$ 87,65 → ela aparece no extrato de pagamentos, com o valor.
 *
 * ⚠️ O que esta jornada achou: no modo pessoal NÃO havia botão para lançar um
 * gasto. O "Adicionar" (despesa · receita · transferência) só era montado no
 * painel de Vendas, que a pessoa física não vê; a única porta era ⌘K.
 */
import { novoUsuario, verificador } from "./kit.mjs";

export default async function pessoal(navegador) {
  const v = verificador("plataforma-pessoal");
  const u = await novoUsuario(navegador);

  // 1) Login: o seletor troca a roupa da tela.
  await u.ir("/login");
  await u.page.getByRole("tab", { name: "Pessoal" }).click();
  await u.page.waitForTimeout(300);
  const login = await u.texto();
  v.ok(/Controle seus gastos do dia a dia com a Quattro\./.test(login), "o login no modo pessoal fala de gastos (e grafa a marca como Quattro)");
  v.ok(/Criar conta pessoal/.test(login), "o login pessoal oferece criar conta PESSOAL");

  // 2) Cadastro de 3 passos (+ a tela de pronto).
  await u.ir("/comecar");
  const c0 = await u.texto();
  v.ok(/Criar conta pessoal/.test(c0) && /1\. Você/.test(c0) && /3\. Gastos do dia a dia/.test(c0), "/comecar abre o cadastro PESSOAL em 3 passos");
  await u.page.getByLabel("Como podemos te chamar?").fill("Ana Teste");
  await u.page.getByRole("button", { name: "Próximo" }).click();
  await u.page.getByLabel("Renda mensal").fill("650000");
  await u.page.getByLabel("Saldo atual (opcional)").fill("123400");
  await u.page.getByRole("button", { name: "Próximo" }).click();
  await u.page.getByRole("button", { name: "Próximo" }).click();
  const pronto = await u.texto();
  v.ok(/Tudo pronto, Ana Teste!/.test(pronto), "o último passo cumprimenta pelo nome digitado");
  await u.page.getByRole("button", { name: "Concluir e entrar" }).click();
  await u.page.waitForURL((url) => url.pathname === "/", { timeout: 20000 }).catch(() => {});
  await u.page.waitForTimeout(2500);
  v.ok(new URL(u.page.url()).pathname === "/", "concluir leva à Visão geral", u.page.url());
  const perfil = await u.page.evaluate(() => JSON.parse(localStorage.getItem("a4p_company") || "{}"));
  v.ok(perfil?.pessoal?.nome === "Ana Teste" && perfil?.pessoal?.saldoInicial === 1234 && perfil?.pessoal?.rendaMensal === 6500,
    "o perfil pessoal guarda nome, renda (R$ 6.500) e saldo (R$ 1.234)", JSON.stringify(perfil?.pessoal));
  v.ok(perfil?.estrutura?.contas?.[0]?.saldo === 1234, "o saldo informado vai para a PRIMEIRA carteira (era perguntado e descartado)",
    JSON.stringify(perfil?.estrutura?.contas));

  // 3) O modo pessoal: menu próprio, sem módulo de empresa.
  const home = await u.texto();
  v.ok(/Meu dia a dia/.test(home) && /Contas e carteiras/.test(home) && /Orçamento e metas/.test(home), "o menu é o PESSOAL");
  v.ok(!/Vender e receber|Comprar e pagar|Contabilidade\n/.test(home), "o menu pessoal não mostra grupos de empresa");
  v.ok(!/Modo Pro/.test(home), "o interruptor Modo Pro some no modo pessoal");

  // 4) "Adicionar" existe e oferece só o dia a dia.
  const adicionar = u.page.getByRole("button", { name: "Adicionar" }).first();
  v.ok(await adicionar.count() > 0, "a Visão geral tem o botão Adicionar no modo pessoal");
  await adicionar.click();
  await u.page.waitForTimeout(400);
  const itens = await u.page.locator('[role="menuitem"]').allInnerTexts();
  const nomes = itens.map((t) => t.replace(/\s+[A-Z]$/m, "").split("\n")[0].trim());
  v.ok(nomes.length === 3 && nomes.some((n) => /Nova despesa/.test(n)) && nomes.some((n) => /Nova receita/.test(n)) && nomes.some((n) => /Transferência/.test(n)),
    "Adicionar oferece despesa, receita e transferência — e nada de venda/compra/cadastro", nomes.join(" | "));

  // 5) Uma despesa de R$ 87,65, paga hoje.
  await u.page.getByRole("menuitem", { name: /Nova despesa/ }).click();
  await u.page.waitForTimeout(800);
  const modal = await u.texto();
  v.ok(/Nova despesa/.test(modal), "o formulário se chama Nova despesa no modo pessoal");
  // O formulário da pessoa física não fala de empresa (eram cinco campos de
  // contabilidade num "anotar um gasto").
  for (const rotulo of ["Fornecedor", "Centro de custo", "Projeto", "Código de referência", "Informar NSU?"]) {
    v.ok(!(await u.page.getByLabel(rotulo, { exact: true }).count()), `no modo pessoal o formulário não mostra "${rotulo}"`);
  }
  const hoje = await u.page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; });
  await u.page.getByLabel("Valor").first().fill("8765");
  await u.page.getByLabel("Descrição *").fill("Mercado da esquina E2E");
  for (const d of await u.page.locator('input[type="date"]').all()) if (await d.isVisible()) await d.fill(hoje);
  const cat = u.page.getByLabel("Categoria").first();
  await cat.selectOption({ index: 1 });
  const conta = u.page.getByLabel("Conta de pagamento").first();
  if (await conta.count()) await conta.selectOption({ index: 1 });
  await u.page.getByRole("button", { name: "Salvar", exact: true }).first().click();
  await u.page.waitForTimeout(1200);
  const posSalvar = await u.texto();
  const erroForm = await u.page.evaluate(() => [...document.querySelectorAll("[role=alert], .text-negative")].map((e) => e.textContent.trim()).filter(Boolean).join(" | "));
  v.ok(/Despesa salva/.test(posSalvar), "salvar confirma a despesa", erroForm);
  v.ok(!(await u.page.getByLabel("Descrição *").count()), "salvar fecha o formulário", erroForm);

  // ⚠️ Antes NÃO conferido: na demonstração `createLancamento` não gravava
  // nada e a tela dizia "Despesa salva". Agora a despesa tem de estar lá.
  await u.ir("/contas-a-pagar/titulos");
  const tit = (await u.texto()).replace(/\n/g, " ");
  v.ok(/Mercado da esquina E2E/.test(tit) && /87\s*,65/.test(tit), "a despesa salva aparece nos títulos a pagar, com o valor");

  // O perfil se chama "Meu perfil" no menu pessoal E na tela.
  await u.ir("/configuracoes");
  const perfilTela = await u.texto();
  v.ok(/Meu perfil/.test(perfilTela) && !/Configurações da empresa/.test(perfilTela), "a tela do perfil se chama Meu perfil (não \"Configurações da empresa\")");

  v.ok(u.erros.length === 0, "nenhum erro de página ou de console", u.erros.slice(0, 2).join(" | "));
  await u.ctx.close();
  return v.falhas();
}
