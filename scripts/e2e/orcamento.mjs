/**
 * JORNADA: cadastrar um orçamento e compará-lo com o realizado no DRE.
 *
 * O orçamento é digitado por CATEGORIA e comparado por LINHA do DRE — a ponte
 * (`orcadoPorLinha`) é onde previsto e realizado podem acabar em linhas
 * diferentes. A jornada cadastra uma receita orçada, salva, e confere que o
 * DRE oferece o orçamento e mostra o orçado com o valor digitado.
 */
import { novoUsuario, verificador, brl } from "./kit.mjs";

export default async function orcamento(navegador) {
  const v = verificador("orcamento");
  const u = await novoUsuario(navegador);
  await u.ir("/dashboard/registrations/budgets");

  await u.page.getByRole("button", { name: "Novo orçamento" }).first().click();
  await u.page.getByPlaceholder("Ex.: Orçamento 2026").fill("Plano de teste");
  await u.page.getByRole("button", { name: "Ano inteiro" }).click();
  await u.page.getByRole("button", { name: "Salvar e continuar" }).click();
  await u.page.waitForTimeout(600);
  v.ok(/Etapa 2 de 2/.test(await u.texto()), "a etapa 2 abre a tabela de alocação");

  await u.page.getByRole("button", { name: "Linha de receita" }).click();
  // A categoria vem do CADASTRO (plano de contas), não de texto livre.
  const selCat = u.page.locator("tbody tr").last().locator("select").first();
  const opcoes = await selCat.locator("option").evaluateAll((os) => os.map((o) => o.value).filter(Boolean));
  v.ok(opcoes.length > 0, "a linha de receita oferece categorias do cadastro", `${opcoes.length} opção(ões)`);
  await selCat.selectOption(opcoes[0] ?? "");
  // Janeiro recebe o ano inteiro, e "distribuir" espalha pelos 12 meses.
  const celulas = u.page.locator("tbody tr").last().locator('input[inputmode="decimal"], input[placeholder="0,00"]');
  await celulas.first().fill("12000000"); // máscara de centavos: 12000000 → R$ 120.000,00
  await u.page.getByRole("button", { name: "Distribuir o total igualmente pelos meses" }).last().click();
  await u.page.waitForTimeout(400);
  const t2 = (await u.texto()).replace(/\n+/g, " ");
  const rec = t2.match(/Receita prevista\s*R\$\s*([\d.]+)/);
  v.ok(rec && brl(rec[1]) === 120000, "a receita prevista soma o que foi digitado", rec?.[1]);

  await u.page.getByRole("button", { name: "Salvar orçamento" }).click();
  await u.page.waitForTimeout(800);
  v.ok((await u.texto()).includes("Plano de teste"), "o orçamento aparece na lista");

  await u.ir("/dashboard/reports/dre");
  const sel = u.page.locator("select").filter({ has: u.page.locator("option", { hasText: "Plano de teste" }) }).first();
  v.ok(await sel.count() > 0, "o DRE oferece o orçamento de competência para comparar");
  if (await sel.count() > 0) {
    const valor = await sel.locator("option", { hasText: "Plano de teste" }).first().getAttribute("value");
    await sel.selectOption(valor ?? "");
    await u.page.waitForTimeout(800);
    const t3 = (await u.texto()).replace(/\n+/g, " ");
    v.ok(/Orçado/.test(t3) && /Diferença/.test(t3), "as colunas Orçado e Diferença aparecem");
    v.ok(/10\.000/.test(t3), "o orçado mensal da receita (R$ 10.000) aparece na tabela");
  }
  v.ok(u.erros.length === 0, "nenhum erro de página ou de console", u.erros.slice(0, 2).join(" | "));
  await u.ctx.close();
  return v.falhas();
}
