/**
 * JORNADA: o razão e o balancete, como o contador os confere.
 *
 * 1. O saldo das contas no cartão de conciliação é o MESMO da Visão geral, e o
 *    "caixa no razão" é a linha 1.1.01 do balancete logo abaixo (era a soma
 *    de liquidados + previstos, um número que não aparecia em lugar nenhum).
 * 2. A diferença extrato − razão é a SOMA das parcelas, com o resíduo em número.
 * 3. Um lançamento manual DESBALANCEADO é recusado — nada muda no balancete.
 * 4. Um lançamento COMPOSTO balanceado (1 débito, 2 créditos) entra: os
 *    totais de débito e crédito sobem pelo valor exato, o caixa do razão cai
 *    pela parte que saiu do caixa, e a parcela "lançamentos próprios" a nomeia.
 * 5. O estorno devolve o balancete ao ponto de partida, e um segundo estorno
 *    do mesmo lançamento não é oferecido.
 */
import { novoUsuario, verificador, brl } from "./kit.mjs";

const num = async (loc) => {
  const t = (await loc.first().innerText()).replace(/\s+/g, "");
  const neg = /^[−-]/.test(t);
  return (neg ? -1 : 1) * brl(t.replace(/^[−-]/, ""));
};

async function leitura(u) {
  const card = u.page.locator("[data-conciliacao-caixa]");
  await card.waitFor({ timeout: 30000 });
  const parcela = (id) => num(card.locator(`[data-parcela="${id}"] .tabular-nums`));
  return {
    extrato: await num(card.locator('[data-valor="extrato"]')),
    caixa: await num(card.locator('[data-valor="caixa-razao"]')),
    diferenca: await num(card.locator('[data-valor="diferenca"]')),
    abertura: await parcela("abertura"),
    semData: await parcela("sem_data"),
    proprios: await parcela("proprios"),
    residuo: await parcela("residuo"),
    balCaixa: await num(u.page.locator('[data-conta="1.1.01"] [data-saldo]')),
    deb: await num(u.page.locator('[data-total="debito"]')),
    cred: await num(u.page.locator('[data-total="credito"]')),
    n: Number(await u.page.locator("[data-n-lancamentos]").getAttribute("data-n-lancamentos")),
  };
}

async function preencherLinha(u, k, conta, lado, centavos) {
  await u.page.getByLabel(`Conta da linha ${k}`, { exact: true }).selectOption(conta);
  await u.page.getByLabel(`Lado da linha ${k}`, { exact: true }).selectOption(lado);
  const v = u.page.getByLabel(`Valor da linha ${k}`, { exact: true });
  await v.fill("");
  await v.type(centavos);
}

export default async function contabilRazao(navegador) {
  const v = verificador("contabil-razao");
  const u = await novoUsuario(navegador);

  // A Visão geral mostra o saldo em conta SEM centavos (escopo do herói).
  await u.ir("/");
  const home = (await u.texto()).replace(/\n+/g, " ");
  const mHome = home.match(/Saldo em conta hoje\s*(−|-)?\s*R\$\s*([\d.]+)(,\d{2})?/);
  const saldoHome = mHome ? (mHome[1] ? -1 : 1) * brl(mHome[2] + (mHome[3] ?? "")) : NaN;

  await u.ir("/contabilidade?aba=razao");
  const a = await leitura(u);
  v.ok(Math.abs(a.extrato - saldoHome) <= 1, "o saldo das contas no razão é o da Visão geral (lá sem centavos)", `${a.extrato} × ${saldoHome}`);
  v.ok(Math.abs(a.caixa - a.balCaixa) < 0.01 && a.caixa !== 0, "o 'caixa no razão' é a linha 1.1.01 do balancete", `${a.caixa} × ${a.balCaixa}`);
  v.ok(Math.abs(a.diferenca - (a.extrato - a.caixa)) < 0.01, "a diferença é extrato − caixa do razão", `${a.diferenca}`);
  v.ok(Math.abs(a.diferenca - (a.abertura + a.semData + a.proprios + a.residuo)) < 0.01,
    "as parcelas SOMAM a diferença, com o resíduo em número", `${a.abertura} + ${a.semData} + ${a.proprios} + ${a.residuo} = ${a.diferenca}`);
  v.ok(Math.abs(a.deb - a.cred) < 0.01 && a.deb > 0, "o balancete fecha (débito = crédito)", `${a.deb} × ${a.cred}`);

  // 3. Desbalanceado: D 500,00 × C 300,00.
  await u.page.getByRole("button", { name: "Novo lançamento" }).click();
  await preencherLinha(u, 1, "1.1.01", "D", "50000");
  await preencherLinha(u, 2, "3.1.01", "C", "30000");
  v.ok(/Desbalanceado/.test(await u.texto()), "a tela mostra a diferença antes de postar");
  await u.page.getByRole("button", { name: "Postar (D=C)" }).click();
  await u.page.waitForTimeout(1200);
  const recusa = await u.texto();
  v.ok(/Lançamento recusado: Lançamento desbalanceado/.test(recusa), "o desbalanceado é RECUSADO, com o motivo");
  const b = await leitura(u);
  v.ok(b.n === a.n && Math.abs(b.deb - a.deb) < 0.01, "e nada entra no balancete", `${a.n} → ${b.n}`);

  // 4. Composto balanceado: D despesa 1.000 · C caixa 600 · C provisões 400.
  await preencherLinha(u, 1, "4.1.09", "D", "100000");
  await preencherLinha(u, 2, "1.1.01", "C", "60000");
  await u.page.getByRole("button", { name: "Adicionar linha" }).click();
  await preencherLinha(u, 3, "2.1.99", "C", "40000");
  await u.page.getByLabel("Descrição", { exact: true }).fill("Jornada contábil composta");
  await u.page.getByRole("button", { name: "Postar (D=C)" }).click();
  await u.page.waitForTimeout(1500);
  const c = await leitura(u);
  v.ok(/Lançamento postado/.test(await u.texto()), "o balanceado é postado");
  v.ok(c.n === a.n + 1, "um lançamento a mais no razão", `${a.n} → ${c.n}`);
  v.ok(Math.abs(c.deb - a.deb - 1000) < 0.01 && Math.abs(c.cred - a.cred - 1000) < 0.01, "débitos e créditos sobem R$ 1.000,00 cada", `${c.deb - a.deb} / ${c.cred - a.cred}`);
  v.ok(Math.abs(c.caixa - (a.caixa - 600)) < 0.01, "o caixa do razão cai a parte que saiu do caixa (R$ 600,00)", `${a.caixa} → ${c.caixa}`);
  v.ok(Math.abs(c.proprios - 600) < 0.01, "a parcela 'lançamentos próprios no caixa' nomeia os R$ 600,00", `${c.proprios}`);
  v.ok(Math.abs(c.extrato - a.extrato) < 0.01, "o extrato não se move (nenhum dinheiro andou no banco)");
  v.ok(Math.abs(c.diferenca - (c.abertura + c.semData + c.proprios + c.residuo)) < 0.01, "e as parcelas continuam somando a diferença");

  // 5. Estorno.
  await u.page.getByRole("button", { name: /^Jornada contábil composta/ }).first().click();
  await u.page.getByRole("button", { name: "Estornar", exact: true }).click();
  await u.page.getByRole("button", { name: "Confirmar estorno" }).click();
  await u.page.waitForTimeout(800);
  v.ok(/Estorno recusado: Informe o motivo/.test(await u.texto()), "estorno sem motivo é recusado");
  await u.page.getByLabel("Motivo do estorno").fill("Lançado em duplicidade na jornada");
  await u.page.getByRole("button", { name: "Confirmar estorno" }).click();
  await u.page.waitForTimeout(1500);
  const d = await leitura(u);
  v.ok(d.n === a.n + 2, "o estorno é um lançamento NOVO (o original fica)", `${a.n} → ${d.n}`);
  v.ok(Math.abs(d.caixa - a.caixa) < 0.01, "o caixa do razão volta ao ponto de partida", `${a.caixa} → ${d.caixa}`);
  v.ok(Math.abs(d.proprios) < 0.01, "e a parcela de lançamentos próprios volta a zero", `${d.proprios}`);
  v.ok(Math.abs(d.deb - d.cred) < 0.01, "o balancete continua fechando");
  // O original continua aberto (o estado de "aberto" sobrevive à recarga).
  const txt = await u.texto();
  v.ok(/Estornado/.test(txt), "o original fica marcado 'Estornado'");
  v.ok(await u.page.getByRole("button", { name: "Estornar", exact: true }).count() === 0, "e não oferece segundo estorno");
  await u.page.getByRole("button", { name: /^Estorno de Jornada contábil composta/ }).first().click();
  v.ok(/Estorno de outro lançamento/.test(await u.texto()), "o estorno se identifica e também não é estornável por este botão");

  v.ok(u.erros.length === 0, "nenhum erro de página ou de console", u.erros.slice(0, 2).join(" | "));
  await u.ctx.close();
  return v.falhas();
}
