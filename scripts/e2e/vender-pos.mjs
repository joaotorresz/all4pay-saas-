/**
 * JORNADA: a maquininha (POS) — da venda ao contas a receber e a pagar.
 *
 * Vende um Monitor 27 4K (R$ 2.190) no crédito em 3x e confere: a taxa MDR da
 * tela de venda é a mesma da tabela de taxas (/pos/taxas); entram TRÊS
 * parcelas a receber com o BRUTO (R$ 730) e TRÊS taxas a pagar na data de cada
 * repasse — a taxa sai UMA vez do resultado; o líquido mostrado é bruto − taxa.
 */
import { novoUsuario, verificador, brl } from "./kit.mjs";

const norm = (t) => t.replace(/\s+/g, " ").replace(/R\$\s*/g, "R$").replace(/(\d)\s+,(\d\d)/g, "$1,$2");
const r2 = (n) => Math.round(n * 100) / 100;

export default async function venderPos(navegador) {
  const v = verificador("vender-pos");
  const u = await novoUsuario(navegador);

  // A taxa final ao estabelecimento, Mastercard, 3x — o que a tabela promete.
  await u.ir("/pos/taxas");
  const tabela = norm(await u.texto());
  const taxaTabela = Number(((tabela.match(/Taxa final para o estabelecimento[^]*?\b3X (\d+,\d\d)%/) || [])[1] ?? "NaN").replace(",", ".")) / 100;
  v.ok(taxaTabela > 0, "a tabela de taxas mostra a taxa de 3x", `${(taxaTabela * 100).toFixed(2)}%`);

  const antes = await u.page.evaluate(() => (JSON.parse(localStorage.getItem("a4p_imported_dataset") ?? "{}").movements ?? []).length);

  await u.ir("/pos/venda");
  await u.page.locator('button[title="Adicionar"]', { hasText: "Monitor 27 4K" }).click();
  await u.page.getByRole("button", { name: /Avançar para o pagamento/ }).click();
  await u.page.getByRole("button", { name: "Crédito parcelado" }).click();
  await u.page.getByRole("button", { name: "3x", exact: true }).click();
  await u.page.waitForTimeout(300);
  const pag = norm(await u.texto());
  const taxaTela = Number(((pag.match(/Taxa MDR · Crédito parcelado 3x (\d+,\d\d)%/) || [])[1] ?? "NaN").replace(",", ".")) / 100;
  v.ok(Math.abs(taxaTela - taxaTabela) < 1e-9, "a taxa da maquininha é a da tabela de taxas", `${taxaTela} × ${taxaTabela}`);
  const liquidoTela = brl((pag.match(/Você recebe \(líquido\) (R\$[\d.]+,\d\d)/) || [])[1] ?? "");
  const taxaTotal = r2(2190 * taxaTela);
  v.ok(liquidoTela === r2(2190 - taxaTotal), "o líquido mostrado é bruto − taxa", `${liquidoTela}`);

  await u.page.getByRole("button", { name: /^Cobrar/ }).click();
  await u.page.waitForTimeout(4500);
  v.ok(/Aprovado|aprovad/i.test(await u.texto()), "a venda é aprovada");

  const novos = await u.page.evaluate((n) => (JSON.parse(localStorage.getItem("a4p_imported_dataset") ?? "{}").movements ?? []).slice(0, Infinity)
    .filter((m) => /\bPOS\b/.test(`${m.description} ${m.category}`)).map((m) => ({ tipo: m.type, valor: m.amount, venc: m.due_date, cat: m.category, status: m.status })), antes);
  const entradas = novos.filter((m) => m.tipo === "entrada"), saidas = novos.filter((m) => m.tipo === "saida");
  v.ok(entradas.length === 3 && r2(entradas.reduce((s, m) => s + m.valor, 0)) === 2190, "três parcelas a receber que somam o BRUTO (R$ 2.190)", entradas.map((m) => `${m.venc}:${m.valor}`).join(" "));
  v.ok(saidas.length === 3 && r2(saidas.reduce((s, m) => s + m.valor, 0)) === taxaTotal, "três taxas a pagar que somam a taxa UMA vez", saidas.map((m) => `${m.venc}:${m.valor}`).join(" "));
  v.ok(saidas.every((s) => entradas.some((e) => e.venc === s.venc)), "cada taxa vence com o repasse da sua parcela");
  v.ok(novos.every((m) => m.status === "pendente"), "tudo nasce previsto (o repasse ainda não caiu)");

  await u.ir("/contas-a-receber/titulos");
  const verTudo = u.page.getByText("ver todo o período");
  if (await verTudo.count()) { await verTudo.first().click(); await u.page.waitForTimeout(800); }
  v.ok(norm(await u.texto()).includes("R$730,00"), "a parcela de R$ 730,00 aparece em Títulos a receber");
  await u.ir("/contas-a-pagar/titulos");
  if (await verTudo.count()) { await verTudo.first().click(); await u.page.waitForTimeout(800); }
  const taxaParcela = saidas[0]?.valor ?? NaN;
  const fmt = (n) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  v.ok(norm(await u.texto()).includes(`R$${fmt(taxaParcela)}`), "a taxa da parcela aparece em Títulos a pagar", `R$${fmt(taxaParcela)}`);

  v.ok(u.erros.length === 0, "nenhum erro de página ou de console", u.erros.slice(0, 2).join(" | "));
  await u.ctx.close();
  return v.falhas();
}
