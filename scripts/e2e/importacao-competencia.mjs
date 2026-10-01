/**
 * JORNADA (Rodada 8): a competência na revisão do extrato.
 *
 * - A revisão diz que, sem escolha, cada linha usa a data do extrato.
 * - "Levar N contas para o mês anterior" mostra o número ANTES do clique e
 *   aplica exatamente esse número; "Desfazer" volta a zero.
 * - Confirmado, o lançamento gravado carrega a competência escolhida (e só os
 *   escolhidos: o resto segue com a data do extrato).
 */
import { resolve } from "node:path";
import { novoUsuario, verificador } from "./kit.mjs";

const ARQUIVO = resolve("public/exemplos/extrato-exemplo-quattro.csv");

export default async function importacaoCompetencia(navegador) {
  const v = verificador("importacao-competencia");
  const u = await novoUsuario(navegador);

  await u.ir("/upload?aba=enviar");
  await u.page.locator('input[type="file"]').first().setInputFiles(ARQUIVO);
  const painel = u.page.locator('[data-competencia="painel"]');
  await painel.waitFor({ timeout: 60000 });
  const contagem = u.page.locator('[data-competencia="contagem"]');
  v.ok(/Nenhuma competência ajustada/.test(await contagem.innerText()), "sem escolha, a tela diz que vale a data do extrato");

  await painel.locator('input[aria-label="Dia limite"]').fill("28");
  const propor = u.page.locator('[data-competencia="propor"]');
  const rotulo = await propor.innerText();
  const n = Number((rotulo.match(/Levar\s+(\d+)/) ?? [])[1] ?? NaN);
  v.ok(n > 0, "a proposta diz quantas contas fixas vão para o mês anterior", rotulo);

  await propor.click();
  await u.page.waitForTimeout(400);
  v.ok(new RegExp(`^${n} linha`).test(await contagem.innerText()), "aplicar ajusta exatamente o número prometido", await contagem.innerText());
  await u.page.locator('[data-competencia="desfazer"]').click();
  await u.page.waitForTimeout(300);
  v.ok(/Nenhuma competência ajustada/.test(await contagem.innerText()), "desfazer volta tudo à data do extrato");
  await propor.click();
  await u.page.waitForTimeout(400);

  const gravar = u.page.getByRole("button", { name: /Confirmar e gravar/ });
  await gravar.click();
  await u.page.getByText("Importação confirmada").waitFor({ timeout: 30000 });

  const r = await u.page.evaluate(() => {
    const ds = JSON.parse(localStorage.getItem("a4p_imported_dataset") ?? "{}");
    const movs = (ds.movements ?? []).filter((m) => m.origem === "extrato");
    const mes = (d) => (d ?? "").slice(0, 7);
    return {
      total: movs.length,
      ajustados: movs.filter((m) => m.competence_date && mes(m.competence_date) !== mes(m.due_date)).length,
      semCompetencia: movs.filter((m) => !m.competence_date).length,
    };
  });
  v.ok(r.ajustados === n, "o lançamento gravado carrega a competência escolhida — e só os escolhidos", JSON.stringify(r));
  v.ok(r.semCompetencia === 0, "nenhuma linha do extrato grava sem competência", JSON.stringify(r));
  v.ok(u.erros.length === 0, "sem erro de página", u.erros.slice(0, 2).join(" | "));
  await u.ctx.close();
  return v.falhas();
}
