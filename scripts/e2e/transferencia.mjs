/**
 * JORNADA: transferência entre contas próprias.
 * Um fato com DOIS lados: sai de uma conta e entra na outra. O saldo TOTAL não
 * muda, o DRE não muda (transferência nunca é receita nem despesa), e a
 * transferência aparece na lista de transferências.
 */
import { novoUsuario, verificador, brl } from "./kit.mjs";

async function saldoHome(u) {
  await u.ir("/");
  const t = (await u.texto()).replace(/\n/g, " ");
  const m = t.match(/Saldo em conta hoje\s*R\$\s*([\d.]+)/);
  return m ? brl(m[1]) : NaN;
}

export default async function transferencia(navegador) {
  const v = verificador("transferencia");
  const u = await novoUsuario(navegador);
  const saldoAntes = await saldoHome(u);
  await u.ir("/dashboard/reports/dre");
  const dreAntes = await u.texto();

  await u.ir("/dashboard/financial/accounts-and-transfers?novo=1");
  const origem = u.page.locator('select[aria-label="Selecione uma conta"]').nth(0);
  const destino = u.page.locator('select[aria-label="Selecione uma conta"]').nth(1);
  v.ok(await origem.count() > 0, "?novo=1 abre o formulário de transferência");
  await origem.selectOption({ index: 1 });
  await destino.selectOption({ index: 1 });
  await u.page.locator('input[placeholder="0,00"]').first().fill("50000");
  await u.page.getByRole("button", { name: "Salvar transferência" }).click();
  await u.page.waitForTimeout(1200);
  const recusa = (await u.texto()).replace(/\n/g, " ");
  v.ok(/mesma conta|origem.*destino|diferente/i.test(recusa), "origem igual ao destino é recusada com explicação");

  await destino.selectOption({ index: 2 });
  await u.page.getByRole("button", { name: "Salvar transferência" }).click();
  await u.page.waitForTimeout(2000);
  const depois = (await u.texto()).replace(/\n/g, " ");
  v.ok(/500\s*,00/.test(depois), "a transferência aparece na lista", depois.slice(0, 0));

  const saldoDepois = await saldoHome(u);
  v.ok(saldoAntes === saldoDepois, "o saldo total NÃO muda (dinheiro entre contas próprias)", `${saldoAntes} → ${saldoDepois}`);
  await u.ir("/dashboard/reports/dre");
  v.ok((await u.texto()) === dreAntes, "o DRE NÃO muda (transferência não é receita nem despesa)");
  v.ok(u.erros.length === 0, "nenhum erro de página ou de console", u.erros.slice(0, 2).join(" | "));
  await u.ctx.close();
  return v.falhas();
}
