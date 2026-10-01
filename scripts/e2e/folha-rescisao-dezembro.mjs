/**
 * JORNADA: rescisão em DEZEMBRO, depois de a 1ª parcela do 13º já ter sido PAGA.
 *
 * O caso que a jornada de rescisão não cobria: o funcionário recebeu a 1ª
 * parcela em 30/11 e é desligado em 20/12. A rescisão paga o 13º proporcional
 * (12/12 = 6.000,00) — e, sem descontar a metade que já saiu do caixa, pagava
 * os mesmos 3.000,00 duas vezes. Confere, com VALORES:
 *  - o cadastro agenda a 1ª parcela de 3.000,00 em 30/11, e pagá-la a tira de
 *    "a vencer";
 *  - o modal de rescisão já abre com "13º já pago neste ano" = 3.000,00 (lido
 *    da parcela BAIXADA) e a memória mostra o desconto;
 *  - o líquido da rescisão com o desconto é EXATAMENTE 3.000,00 menor que sem
 *    ele (zerar o campo devolve a diferença);
 *  - o título de rescisão que entra em Títulos a pagar tem o valor descontado,
 *    e a parcela paga continua lá, paga;
 * e nenhum erro de página ou de console.
 */
import { novoUsuario, verificador, brl } from "./kit.mjs";
import { irParaCompetencia } from "./folha-colaborador.mjs";

const NOME = "Davi Prado";

async function titulosDoMes(u, mes) {
  await u.ir(`/contas-a-pagar/titulos?mes=${mes}`);
  return u.page.evaluate(() => [...document.querySelectorAll("main table tbody tr")]
    .map((tr) => [...tr.querySelectorAll("td")].map((td) => td.innerText.replace(/\s+/g, " ").replace(/ ,/g, ",").trim()).join(" | ")));
}
const linha = (linhas, texto) => linhas.find((l) => l.includes(texto)) ?? "";

/** O valor do título de rescisão na lista "Entra em Títulos a pagar" do modal. */
async function liquidoNoModal(dlg) {
  const t = (await dlg.innerText()).replace(/\s+/g, " ").replace(/ ,/g, ",");
  const m = new RegExp(`Rescisão · ${NOME} · [^R]*vence [\\d/]+ R\\$ ?([\\d.]+,\\d{2})`).exec(t);
  return { t, valor: m ? brl(m[1]) : NaN };
}

export default async function folhaRescisaoDezembro(navegador) {
  const v = verificador("folha-rescisao-dezembro");
  const u = await novoUsuario(navegador);
  const p = u.page;

  /* ---- o cadastro: CLT de 6.000 desde janeiro de 2026 (13º cheio) ---- */
  await u.ir("/dashboard/financial/payables/new");
  await p.getByRole("radio", { name: /Colaborador \(folha\)/ }).click();
  await p.getByPlaceholder("Como aparece no contrato").fill(NOME);
  await p.locator('main input[type="month"]').first().fill("2026-01");
  await p.locator("main button", { hasText: /Busque a conta/ }).first().click();
  await p.waitForTimeout(300);
  await p.locator('[role="option"]').first().click();
  await p.locator('main input[placeholder="0,00"]').last().fill("600000");
  await p.waitForTimeout(500);
  await p.getByRole("button", { name: "Salvar" }).last().click();
  await p.waitForTimeout(2500);

  /* ---- a 1ª parcela do 13º é PAGA ---- */
  let nov = await titulosDoMes(u, "2026-11");
  const parcela = `13º 2026 · 1ª parcela · ${NOME}`;
  v.ok(linha(nov, parcela).includes("3.000,00"), "o cadastro agendou a 1ª parcela de 3.000,00", linha(nov, parcela));
  await p.locator("main table tbody tr", { hasText: parcela }).first().click();
  await p.waitForTimeout(500);
  // O modal abre sem conta escolhida (o select mostra a 1ª, mas o estado é
  // vazio e o botão fica desabilitado): escolher uma de verdade.
  await p.getByLabel("Conta de saída").selectOption({ index: 1 });
  await p.waitForTimeout(200);
  await p.getByRole("button", { name: "Confirmar pagamento" }).last().click();
  await p.waitForTimeout(1500);
  nov = await titulosDoMes(u, "2026-11");
  v.ok(/Pag[ao]/.test(linha(nov, parcela)), "a 1ª parcela ficou PAGA", linha(nov, parcela));

  /* ---- a rescisão em 20/12 ---- */
  await u.ir("/contas-a-pagar/folha");
  await irParaCompetencia(u, "2026-09");
  await p.getByRole("button", { name: `Ver a conta de ${NOME}` }).click();
  await p.getByRole("button", { name: /Calcular rescisão/ }).click();
  await p.waitForTimeout(400);
  const dlg = p.getByRole("dialog", { name: `Rescisão de ${NOME}` });
  await dlg.locator('input[type="date"]').nth(1).fill("2026-12-20");
  await p.waitForTimeout(600);
  const campo = dlg.locator('input[placeholder="0,00"]').last();
  v.ok((await campo.inputValue()).includes("3.000,00"), "o modal já traz '13º já pago neste ano' = 3.000,00, lido da parcela paga",
    await campo.inputValue());
  const com = await liquidoNoModal(dlg);
  v.ok(/Adiantamento do 13º já pago/.test(com.t) && /13º proporcional · 12\/12/.test(com.t),
    "a memória mostra o 13º proporcional de 12/12 E o desconto do adiantamento");
  const saiTxt = com.t.slice(com.t.indexOf("Sai de Títulos a pagar"));
  v.ok(saiTxt.length > 0 && !new RegExp(`(?<!do )${parcela}`).test(saiTxt),
    "a parcela PAGA não aparece entre o que sai (dinheiro que saiu não se retira)", saiTxt.slice(0, 300));
  v.ok(!saiTxt.includes(`FGTS do 13º 2026 · 1ª parcela · ${NOME}`),
    "nem o FGTS dela: é devido pelo que já foi pago (a rescisão recolhe só sobre o resto)");
  v.ok(saiTxt.includes(`13º 2026 · 2ª parcela · ${NOME}`) && saiTxt.includes(`Salário 12/2026 · ${NOME}`),
    "saem a 2ª parcela e o salário de dezembro");

  // Sem o desconto, o líquido é exatamente 3.000,00 maior — a prova de que o
  // campo mexe no dinheiro (e de que, antes, a metade era paga duas vezes).
  await campo.fill("0");
  await p.waitForTimeout(500);
  const sem = await liquidoNoModal(dlg);
  v.ok(Number.isFinite(com.valor) && Math.abs((sem.valor - com.valor) - 3000) < 0.005,
    "o líquido sem o desconto é 3.000,00 maior", `com ${com.valor} · sem ${sem.valor}`);
  await campo.fill("300000");
  await p.waitForTimeout(500);
  const de_novo = await liquidoNoModal(dlg);
  v.ok(Math.abs(de_novo.valor - com.valor) < 0.005, "devolver o valor devolve o líquido descontado");

  await dlg.getByRole("button", { name: /^Agendar/ }).click();
  await p.waitForTimeout(1500);
  const dez = await titulosDoMes(u, "2026-12");
  const resc = linha(dez, `Rescisão · ${NOME}`);
  const valorTitulo = brl((/R\$ ?([\d.]+,\d{2})/.exec(resc) ?? [])[1] ?? "");
  v.ok(Math.abs(valorTitulo - com.valor) < 0.005, "o título de rescisão entra com o líquido JÁ descontado",
    `${resc} · esperado ${com.valor}`);
  v.ok(!dez.some((l) => l.includes(`13º 2026 · 2ª parcela · ${NOME}`)), "a 2ª parcela prevista saiu (vira 13º da rescisão)");
  v.ok(dez.some((l) => l.includes(`FGTS do 13º 2026 · 1ª parcela · ${NOME}`) && l.includes("240,00")),
    "o FGTS da 1ª parcela paga (240,00) continua agendado em dezembro");
  nov = await titulosDoMes(u, "2026-11");
  v.ok(/Pag[ao]/.test(linha(nov, parcela)), "e a 1ª parcela paga continua lá, paga");

  v.ok(u.erros.length === 0, "nenhum erro de página ou de console", u.erros.slice(0, 2).join(" | "));
  await u.ctx.close();
  return v.falhas();
}
