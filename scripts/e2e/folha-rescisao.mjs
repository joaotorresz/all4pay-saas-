/**
 * JORNADA: férias com adiantamento do 13º e rescisão — o que entra e o que SAI
 * do contas a pagar.
 *
 * O cadastro agenda doze competências e o 13º de uma vez. Dois eventos mudam o
 * que esses títulos significam, e a jornada confere com VALORES:
 *  - férias com o adiantamento da 1ª parcela: a parcela de 30/11 (2.500,00)
 *    SAI — senão a mesma metade do 13º seria paga duas vezes;
 *  - a rescisão em 15/12/2026: entram o líquido, a multa, o FGTS das verbas e
 *    o DARF; saem o salário de 12/2026 e o resto do 13º. E FICAM o salário, o
 *    FGTS e o DARF de 11/2026 — que vencem DEPOIS do desligamento e são
 *    devidos (retirar por vencimento os apagaria);
 * e nenhum erro de página ou de console.
 */
import { novoUsuario, verificador } from "./kit.mjs";
import { irParaCompetencia } from "./folha-colaborador.mjs";

const NOME = "Caio Reis";

async function titulosDoMes(u, mes) {
  await u.ir(`/contas-a-pagar/titulos?mes=${mes}`);
  return u.page.evaluate(() => [...document.querySelectorAll("main table tbody tr")]
    .map((tr) => [...tr.querySelectorAll("td")].map((td) => td.innerText.replace(/\s+/g, " ").replace(/ ,/g, ",").trim()).join(" | ")));
}
const tem = (linhas, texto, valor) => linhas.some((l) => l.includes(texto) && (valor == null || l.includes(valor)));

export default async function folhaRescisao(navegador) {
  const v = verificador("folha-rescisao");
  const u = await novoUsuario(navegador);
  const p = u.page;

  /* ---- o cadastro: CLT de 5.000 desde janeiro de 2026 (13º cheio) ---- */
  await u.ir("/dashboard/financial/payables/new");
  await p.getByRole("radio", { name: /Colaborador \(folha\)/ }).click();
  await p.getByPlaceholder("Como aparece no contrato").fill(NOME);
  await p.locator('main input[type="month"]').first().fill("2026-01");
  await p.locator("main button", { hasText: /Busque a conta/ }).first().click();
  await p.waitForTimeout(300);
  await p.locator('[role="option"]').first().click();
  await p.locator('main input[placeholder="0,00"]').last().fill("500000");
  await p.waitForTimeout(500);
  await p.getByRole("button", { name: "Salvar" }).last().click();
  await p.waitForTimeout(2500);
  const nov0 = await titulosDoMes(u, "2026-11");
  v.ok(tem(nov0, `13º 2026 · 1ª parcela · ${NOME}`, "2.500,00"), "o cadastro agendou a 1ª parcela do 13º cheio (2.500,00) para 30/11");

  /* ---- férias com o adiantamento do 13º ---- */
  await u.ir("/contas-a-pagar/folha");
  await irParaCompetencia(u, "2026-09");
  await p.getByRole("button", { name: `Ver a conta de ${NOME}` }).click();
  await p.getByRole("button", { name: /Programar férias/ }).click();
  await p.waitForTimeout(400);
  const dlgF = p.getByRole("dialog", { name: `Férias de ${NOME}` });
  await dlgF.locator('input[type="date"]').first().fill("2026-11-09");
  await dlgF.getByText(/Adiantar a 1ª parcela do 13º/).click();
  await p.waitForTimeout(400);
  let t = (await dlgF.innerText()).replace(/\s+/g, " ").replace(/ ,/g, ",");
  v.ok(/Sai de Títulos a pagar — o adiantamento vai junto com as férias/.test(t) && t.includes(`13º 2026 · 1ª parcela · ${NOME}`),
    "o modal de férias mostra, ANTES de confirmar, a 1ª parcela que sai");
  v.ok(/Salário 11\/2026/.test(t) && /ajuste-os em Títulos a pagar/.test(t),
    "e avisa que o salário de 11/2026 já agendado cobre os dias de férias");
  await dlgF.getByRole("button", { name: /^Agendar/ }).click();
  await p.waitForTimeout(1500);
  const nov1 = await titulosDoMes(u, "2026-11");
  v.ok(tem(nov1, `Férias · ${NOME} · 30 dias`), "as férias entram em Títulos a pagar (06/11, dois dias úteis antes)");
  v.ok(!nov1.some((l) => l.includes(`13º 2026 · 1ª parcela · ${NOME}`) && l.includes("30/11/2026")),
    "a 1ª parcela de 30/11 SAIU — o adiantamento é a mesma metade do 13º");
  // O adiantamento entra como título PRÓPRIO, com o nome da 1ª parcela, na data
  // das férias — é assim que a rescisão de dezembro sabe que metade do 13º já saiu.
  v.ok(nov1.some((l) => l.includes(`13º 2026 · 1ª parcela · ${NOME}`) && l.includes("2.500,00") && !l.includes("30/11/2026")),
    "e o adiantamento (2.500,00) entra como 1ª parcela na data das férias", nov1.filter((l) => l.includes("13º")).join(" || "));

  /* ---- a rescisão ---- */
  await u.ir("/contas-a-pagar/folha");
  await irParaCompetencia(u, "2026-09");
  await p.getByRole("button", { name: `Ver a conta de ${NOME}` }).click();
  await p.getByRole("button", { name: /Calcular rescisão/ }).click();
  await p.waitForTimeout(400);
  const dlgR = p.getByRole("dialog", { name: `Rescisão de ${NOME}` });
  await dlgR.locator('input[type="date"]').nth(1).fill("2026-12-15");
  await p.waitForTimeout(500);
  t = (await dlgR.innerText()).replace(/\s+/g, " ").replace(/ ,/g, ",");
  v.ok(/Entra em Títulos a pagar/.test(t) && t.includes(`FGTS da rescisão · ${NOME}`) && t.includes(`INSS e IRRF da rescisão · ${NOME}`),
    "o modal de rescisão lista o que ENTRA — inclusive o FGTS das verbas e o DARF, que antes não viravam título");
  const sai = /Sai de Títulos a pagar — (\d+) títulos/.exec(t);
  v.ok(!!sai && Number(sai[1]) >= 7 && t.includes(`Salário 12/2026 · ${NOME}`) && t.includes(`13º 2026 · 2ª parcela · ${NOME}`),
    "e o que SAI: o salário de 12/2026 e o resto do 13º", sai?.[0] ?? "(sem a lista)");
  v.ok(!t.includes(`Salário 11/2026 · ${NOME}`) && !t.includes(`FGTS 11/2026 · ${NOME}`),
    "o salário e o FGTS de 11/2026 NÃO saem (vencem depois do desligamento, e são devidos)");
  await dlgR.getByRole("button", { name: /^Agendar/ }).click();
  await p.waitForTimeout(1500);

  const dez = await titulosDoMes(u, "2026-12");
  v.ok(tem(dez, `Rescisão · ${NOME} · Dispensa sem justa causa`), "a rescisão entra em dezembro (dez dias corridos, antecipando o Natal)");
  v.ok(tem(dez, `FGTS 11/2026 · ${NOME}`, "400,00"), "o FGTS de novembro (vence 18/12) continua agendado");
  v.ok(!tem(dez, `13º 2026 · 2ª parcela · ${NOME}`) && !tem(dez, `INSS do 13º 2026 · ${NOME}`),
    "o 13º que a rescisão paga como proporcional saiu de dezembro");
  const jan = await titulosDoMes(u, "2027-01");
  v.ok(!tem(jan, `Salário 12/2026 · ${NOME}`) && !tem(jan, `FGTS 12/2026 · ${NOME}`),
    "nenhum salário de dezembro de quem saiu em 15/12 (ele virou saldo de salário na rescisão)");

  await u.ir("/contas-a-pagar/folha");
  t = await irParaCompetencia(u, "2027-01");
  v.ok(!t.includes(NOME), "a folha de 01/2027 não tem mais o colaborador");

  v.ok(u.erros.length === 0, "nenhum erro de página ou de console", u.erros.slice(0, 2).join(" | "));
  await u.ctx.close();
  return v.falhas();
}
