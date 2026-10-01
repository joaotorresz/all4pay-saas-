/**
 * JORNADA (CAMP-A): fechar o mês com dono e revisor; ver o aging e a previsão
 * mudarem com uma conta nova.
 *
 *  1. O checklist do mês nasce com as cinco tarefas do modelo. Atribui
 *     responsável, revisor e um prazo já vencido (a tarefa aparece ATRASADA),
 *     conclui como titular, e confere que o titular NÃO consegue revisar a
 *     própria tarefa (há outra pessoa habilitada). A contadora revisa.
 *  2. A trava do mês: com tarefa aberta, motivo de fachada não trava; com
 *     motivo de 20+ caracteres trava. Depois de travado, o checklist congela —
 *     e tudo continua lá ao recarregar.
 *  3. Uma conta a pagar NOVA, em aberto, vencendo daqui a 10 dias: o aging da
 *     carteira sobe exatamente esse valor na faixa "8 a 15 dias", e a camada
 *     AGENDADA da previsão do mês sobe exatamente esse valor (quando o
 *     vencimento cai no mês corrente).
 */
import { novoUsuario, verificador } from "./kit.mjs";

const num = async (loc) => Number(await loc.first().getAttribute("data-valor"));

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

async function leituraAging(u) {
  await u.ir("/contas-a-pagar");
  const card = u.page.locator('[data-aging="pagar"]');
  await card.waitFor({ timeout: 20000 });
  return {
    carteira: await num(card.locator('[data-aging-total="carteira"]')),
    vencido: await num(card.locator('[data-aging-total="vencido"]')),
    aVencer: await num(card.locator('[data-aging-total="a-vencer"]')),
    f8a15: await num(card.locator('[data-faixa="de_8_a_15"]')),
  };
}

async function leituraPrevisao(u) {
  await u.ir("/fluxo-caixa");
  const card = u.page.locator("[data-previsao-mes]");
  await card.waitFor({ timeout: 30000 });
  const camada = async (c) => ({
    entradas: Number(await card.locator(`[data-camada="${c}"]`).getAttribute("data-entradas")),
    saidas: Number(await card.locator(`[data-camada="${c}"]`).getAttribute("data-saidas")),
  });
  return {
    mes: await card.getAttribute("data-previsao-mes"),
    resultado: await num(card.locator('[data-previsao="resultado"]')),
    realizado: await camada("realizado"),
    agendado: await camada("agendado"),
    estimado: await camada("estimado"),
  };
}

export default async function campfireA(navegador) {
  const v = verificador("campfire-a");
  const u = await novoUsuario(navegador);
  const { page } = u;

  /* ---------------- 1. CHECKLIST ---------------- */
  await u.ir("/dashboard/reports/monthly-closing?painel=checklist");
  await page.locator("[data-tarefa]").first().waitFor({ timeout: 20000 });
  const chaves = await page.locator("[data-tarefa]").evaluateAll((els) => els.map((e) => e.getAttribute("data-tarefa")));
  v.ok(chaves.length === 5 && ["conciliar_bancos", "provisoes", "revisar_dre", "conferir_impostos", "exportar_contador"].every((k) => chaves.includes(k)),
    "o mês nasce com as cinco tarefas do modelo", chaves.join(","));

  const t = page.locator('[data-tarefa="conciliar_bancos"]');
  const [selResp, selRev] = [t.locator("select").nth(0), t.locator("select").nth(1)];
  await selResp.selectOption({ label: "Você (titular)" });
  await page.waitForTimeout(400);
  await selRev.selectOption({ label: "Marina Lopes · contadora" });
  await page.waitForTimeout(400);
  await t.locator('input[type="date"]').fill("2026-01-05");
  await page.waitForTimeout(600);
  v.ok(/Atrasada · o prazo era 05\/01\/2026/.test(await t.innerText()), "prazo vencido aparece como ATRASADA (com o ponto de alerta)");

  await t.getByRole("button", { name: "Concluir" }).click();
  await page.waitForTimeout(600);
  const aposConcluir = await t.innerText();
  v.ok(/Aguardando revisão/.test(aposConcluir) && /Concluída por Você \(titular\)/.test(aposConcluir), "concluir carimba quem concluiu");
  const revisar = t.getByRole("button", { name: /^Revisar/ });
  v.ok(await revisar.isDisabled(), "quem concluiu NÃO revisa a própria tarefa quando há outro revisor");
  v.ok(/outra pessoa com o papel de fechamento precisa revisar/i.test(aposConcluir), "e a tela diz por quê antes do clique");

  await page.locator('select[aria-label="Agindo como"]').selectOption({ label: "Agindo como: Marina Lopes · contadora" });
  await page.waitForTimeout(400);
  await t.getByRole("button", { name: /^Revisar/ }).click();
  await page.waitForTimeout(600);
  const aposRevisar = await t.innerText();
  v.ok(/Revisada/.test(aposRevisar) && /revisada por Marina Lopes/.test(aposRevisar) && !/Autorrevisão/.test(aposRevisar),
    "outra pessoa habilitada revisa, sem carimbo de autorrevisão");
  v.ok(!/Atrasada/.test(aposRevisar), "revisada deixa de estar atrasada");

  /* ---------------- 2. TRAVA ---------------- */
  const travar = page.getByRole("button", { name: "Travar período" });
  v.ok(await travar.isDisabled(), "com 4 tarefas abertas o mês não trava sem motivo");
  const motivo = page.locator("#motivo-trava");
  await motivo.fill("ok");
  await page.waitForTimeout(200);
  v.ok(await travar.isDisabled(), "motivo de fachada não destrava a trava");
  await motivo.fill("Contador entrega as guias na segunda-feira");
  await page.waitForTimeout(200);
  v.ok(!(await travar.isDisabled()), "motivo de 20+ caracteres libera a trava");
  await travar.click();
  await page.waitForTimeout(800);
  v.ok(/Período travado/.test(await u.texto()), "o mês fica travado");
  v.ok(await page.locator('[data-tarefa="provisoes"]').getByRole("button", { name: "Concluir" }).isDisabled(),
    "mês travado congela o checklist");

  await u.ir("/dashboard/reports/monthly-closing?painel=checklist");
  await page.locator("[data-tarefa]").first().waitFor({ timeout: 20000 });
  const recarregado = await page.locator('[data-tarefa="conciliar_bancos"]').innerText();
  v.ok(/Revisada/.test(recarregado) && /Período travado/.test(await u.texto()), "ao recarregar, a revisão e a trava continuam lá");

  /* ---------------- 3. AGING E PREVISÃO ---------------- */
  const agAntes = await leituraAging(u);
  v.ok(Math.abs(agAntes.vencido + agAntes.aVencer - agAntes.carteira) < 0.01, "aging: vencido + a vencer fecha com a carteira",
    JSON.stringify(agAntes));
  const pvAntes = await leituraPrevisao(u);
  const soma = (k) => pvAntes.realizado[k] + pvAntes.agendado[k] + pvAntes.estimado[k];
  v.ok(Math.abs(soma("entradas") - soma("saidas") - pvAntes.resultado) < 0.01, "previsão: o resultado é a soma das três camadas",
    JSON.stringify(pvAntes));

  const vence = await page.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + 10); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; });
  await u.ir("/dashboard/financial/payables/new");
  await escolherNaBusca(u, /Busque a conta/);
  await escolherNaBusca(u, /Busque ou crie/);
  await escolherNaBusca(u, /Digite nome ou documento/);
  for (const d of await page.locator('main input[type="date"]').all()) await d.fill(vence);
  await page.locator('main input[placeholder="0,00"]').first().fill("123457");
  await page.getByRole("button", { name: "Salvar" }).last().click();
  await page.waitForTimeout(2500);
  v.ok(!page.url().includes("/new"), "a conta a pagar em aberto foi salva", page.url());

  const agDepois = await leituraAging(u);
  v.ok(Math.abs(agDepois.carteira - agAntes.carteira - 1234.57) < 0.01, "aging: a carteira sobe exatamente o valor do título",
    `${agAntes.carteira} → ${agDepois.carteira}`);
  v.ok(Math.abs(agDepois.f8a15 - agAntes.f8a15 - 1234.57) < 0.01, "aging: e ele cai na faixa '8 a 15 dias'",
    `${agAntes.f8a15} → ${agDepois.f8a15}`);
  v.ok(agDepois.vencido === agAntes.vencido, "aging: o vencido não muda");

  const pvDepois = await leituraPrevisao(u);
  if (vence.slice(0, 7) === pvAntes.mes) {
    v.ok(Math.abs(pvDepois.agendado.saidas - pvAntes.agendado.saidas - 1234.57) < 0.01,
      "previsão: a camada AGENDADA sobe exatamente o valor do título do mês", `${pvAntes.agendado.saidas} → ${pvDepois.agendado.saidas}`);
  } else {
    v.ok(pvDepois.agendado.saidas === pvAntes.agendado.saidas,
      "previsão: título de OUTRO mês não entra no agendado deste", `${pvAntes.agendado.saidas} → ${pvDepois.agendado.saidas}`);
  }
  v.ok(pvDepois.realizado.saidas === pvAntes.realizado.saidas, "previsão: o realizado não muda (o título não foi pago)");

  v.ok(u.erros.length === 0, "nenhum erro de página ou de console", u.erros.slice(0, 2).join(" | "));
  await u.ctx.close();
  return v.falhas();
}
