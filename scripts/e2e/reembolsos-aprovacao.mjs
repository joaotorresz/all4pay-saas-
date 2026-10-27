/**
 * JORNADA: o reembolso do colaborador — pedir, aprovar pela alçada, e um
 * título de saída POR ITEM.
 *
 * Confere, com VALORES:
 *  - o pedido de Carla Dias (almoço R$ 6.123,45 + Uber R$ 87,90 = 6.211,35)
 *    entra "Em aprovação" e aparece na fila de aprovações, e NENHUM título
 *    nasce antes da decisão;
 *  - aprovado, vira "A pagar" e Títulos a pagar ganha DOIS títulos — um por
 *    item, com o valor e a CATEGORIA de cada um (Alimentação · Transporte) e
 *    o colaborador como favorecido; o fluxo de caixa sobe 6.211,35;
 *  - voltar à tela (a sincronização roda de novo) não duplica os títulos;
 *  - o pedido rejeitado vai para "Rejeitados" e não cria título nenhum;
 *  - abaixo da alçada (R$ 5.000) o pedido é aprovado na hora, com o título;
 * e nenhum erro de página ou de console.
 */
import { novoUsuario, verificador, brl } from "./kit.mjs";

const limpo = (s) => s.replace(/\s+/g, " ").replace(/ ,/g, ",");

async function titulosDoMes(u, mes) {
  await u.ir(`/contas-a-pagar/titulos?mes=${mes}`);
  return u.page.evaluate(() => [...document.querySelectorAll("main table tbody tr")]
    .map((tr) => [...tr.querySelectorAll("td")].map((td) => td.innerText.replace(/\s+/g, " ").replace(/ ,/g, ",").trim()).join(" | ")));
}
async function saidasProjetadas(u) {
  await u.ir("/fluxo-caixa");
  const rot = await u.page.locator('button[aria-label^="Saídas projetadas"]').first().textContent();
  const m = /R\$\s*([\d.]+)\s*,\s*(\d{2})/.exec(rot ?? "");
  return m ? brl(`${m[1]},${m[2]}`) : NaN;
}

async function pedir(u, colaborador, itens) {
  const p = u.page;
  await u.ir("/dashboard/financial/reimbursements");
  await p.getByPlaceholder("Colaborador", { exact: true }).fill(colaborador);
  await p.getByPlaceholder("Chave Pix do colaborador").fill(`${colaborador.split(" ")[0].toLowerCase()}@exemplo.com`);
  for (let k = 0; k < itens.length; k++) {
    if (k > 0) await p.getByRole("button", { name: "+ adicionar item" }).click();
    await p.getByPlaceholder("Descrição (ex.: almoço cliente)").nth(k).fill(itens[k].desc);
    await p.locator('main input[placeholder="0,00"]').nth(k).fill(itens[k].centavos);
    if (itens[k].cat) await p.locator("main select").nth(k).selectOption(itens[k].cat);
  }
  await p.getByRole("button", { name: "Solicitar" }).click();
  await p.waitForTimeout(1500);
}

async function decidir(u, colaborador, acao) {
  const p = u.page;
  await u.ir("/aprovacoes");
  const item = p.locator("main button", { hasText: colaborador });
  if (!(await item.count())) return false;
  await item.first().click();
  await p.waitForTimeout(500);
  await p.getByRole("button", { name: acao, exact: true }).click();
  await p.waitForTimeout(800);
  return true;
}

export default async function reembolsosAprovacao(navegador) {
  const v = verificador("reembolsos-aprovacao");
  const u = await novoUsuario(navegador);
  const p = u.page;
  const mes = await p.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; });

  const saidas0 = await saidasProjetadas(u);
  const antes = (await titulosDoMes(u, mes)).filter((l) => l.includes("Carla Dias")).length;

  /* ---- pedir ---- */
  await pedir(u, "Carla Dias", [
    { desc: "Almoço com cliente", centavos: "612345" },
    { desc: "Uber aeroporto", centavos: "8790", cat: "Transporte" },
  ]);
  let t = limpo(await u.texto());
  v.ok(/Carla Dias · 2 item\(ns\)/.test(t) && /Em aprovação/.test(t) && /6\.211,35/.test(t),
    "o pedido entra 'Em aprovação' com o total de 6.211,35");
  v.ok((await titulosDoMes(u, mes)).filter((l) => l.includes("Carla Dias")).length === antes,
    "antes da aprovação, nenhum título a pagar");

  /* ---- aprovar ---- */
  v.ok(await decidir(u, "Carla Dias", "Aprovar"), "o pedido está na fila de aprovações");
  await u.ir("/dashboard/financial/reimbursements");
  t = limpo(await u.texto());
  v.ok(/A pagar \(na Central\)/.test(t), "aprovado, o reembolso passa a 'A pagar'");
  let tit = (await titulosDoMes(u, mes)).filter((l) => l.includes("Carla Dias"));
  v.ok(tit.length === antes + 2, "um título POR ITEM (dois)", tit.join(" || "));
  v.ok(tit.some((l) => l.includes("Alimentação") && l.includes("6.123,45"))
    && tit.some((l) => l.includes("Transporte") && l.includes("87,90")),
    "cada título com o valor e a categoria do SEU item (Alimentação 6.123,45 · Transporte 87,90)");
  const saidas1 = await saidasProjetadas(u);
  v.ok(Math.abs((saidas1 - saidas0) - 6211.35) < 0.011, "o fluxo de caixa sobe exatamente 6.211,35", `${saidas0} → ${saidas1}`);

  /* ---- voltar à tela não duplica ---- */
  await u.ir("/dashboard/financial/reimbursements");
  await u.ir("/dashboard/financial/reimbursements");
  tit = (await titulosDoMes(u, mes)).filter((l) => l.includes("Carla Dias"));
  v.ok(tit.length === antes + 2, "sincronizar de novo não cria títulos a mais", String(tit.length));

  /* ---- rejeitar ---- */
  await pedir(u, "Davi Lopes", [{ desc: "Hotel sem autorização", centavos: "850000", cat: "Hospedagem" }]);
  v.ok(await decidir(u, "Davi Lopes", "Rejeitar"), "o segundo pedido também está na fila");
  await u.ir("/dashboard/financial/reimbursements");
  await p.getByRole("button", { name: "Rejeitados" }).first().click().catch(() => {});
  await p.waitForTimeout(300);
  t = limpo(await u.texto());
  v.ok(/Davi Lopes/.test(t) && /Rejeitado/.test(t), "o rejeitado aparece em 'Rejeitados'");
  v.ok(!(await titulosDoMes(u, mes)).some((l) => l.includes("Davi Lopes")), "e não cria título nenhum");

  /* ---- abaixo da alçada (até R$ 5.000): aprovado sozinho ---- */
  await pedir(u, "Eva Prado", [{ desc: "Estacionamento", centavos: "4500", cat: "Transporte" }]);
  t = limpo(await u.texto());
  v.ok(/Eva Prado/.test(t) && /A pagar \(na Central\)/.test(t.slice(t.indexOf("Eva Prado"))),
    "o pedido abaixo da alçada é aprovado na hora e já fica 'A pagar'");
  v.ok((await titulosDoMes(u, mes)).some((l) => l.includes("Eva Prado") && l.includes("45,00") && l.includes("Transporte")),
    "e o título de 45,00 entra em Títulos a pagar");

  v.ok(u.erros.length === 0, "nenhum erro de página ou de console", u.erros.slice(0, 2).join(" | "));
  await u.ctx.close();
  return v.falhas();
}
