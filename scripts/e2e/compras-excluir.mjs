/**
 * JORNADA: excluir uma compra — e desfazer a exclusão.
 *
 * O fluxo que a jornada de aprovação não cobria: a lixeira da compra. Confere,
 * com VALORES:
 *  - uma compra de R$ 900,00 em 3x aprovada põe três parcelas de 300,00 em
 *    Títulos a pagar;
 *  - excluí-la RETIRA as três parcelas (e a compra some da lista);
 *  - "Desfazer" devolve a compra E as três parcelas, com os mesmos valores e
 *    datas — nenhuma a mais, nenhuma a menos;
 *  - excluir uma compra com parcela PAGA é recusado com o motivo, e as
 *    parcelas continuam lá;
 * e nenhum erro de página ou de console.
 */
import { novoUsuario, verificador } from "./kit.mjs";

async function titulosDoMes(u, mes) {
  await u.ir(`/contas-a-pagar/titulos?mes=${mes}`);
  return u.page.evaluate(() => [...document.querySelectorAll("main table tbody tr")]
    .map((tr) => [...tr.querySelectorAll("td")].map((td) => td.innerText.replace(/\s+/g, " ").replace(/ ,/g, ",").trim()).join(" | ")));
}
const idDaCompra = (u, numero) => u.page.evaluate((numero) => {
  try { return (JSON.parse(localStorage.getItem("a4p_compras") ?? "[]").find((c) => c.numero === numero) ?? {}).id ?? null; }
  catch { return null; }
}, numero);
/** O número que a tela deu à compra com esta descrição. */
const numeroPelaDescricao = (u, desc) => u.page.evaluate((desc) => {
  try { return (JSON.parse(localStorage.getItem("a4p_compras") ?? "[]").find((c) => c.descricao === desc) ?? {}).numero ?? null; }
  catch { return null; }
}, desc);
const linhasDaLista = (u) => u.page.evaluate(() => [...document.querySelectorAll("main table tbody tr")].map((tr) => tr.innerText).join(" || "));
const parcelasNoMes = (linhas, id) => linhas.filter((l) => l.includes(`compra-${id}-`));

async function novaCompra(u, { valor, parcelas, venc, desc, pago = false }) {
  const p = u.page;
  await u.ir("/dashboard/purchases/new");
  const sels = p.locator("main select");
  await sels.nth(0).selectOption({ index: 1 });
  await sels.nth(1).selectOption({ index: 1 });
  await sels.nth(2).selectOption({ label: "Fornecedores" });
  await sels.nth(3).selectOption(parcelas ? "parcelado" : "a_vista");
  await p.waitForTimeout(300);
  if (parcelas) await p.locator('main input[type="number"]').first().fill(String(parcelas));
  const datas = p.locator('main input[type="date"]');
  await datas.nth(0).fill(venc);
  await datas.nth(1).fill(venc);
  await p.locator('main input[placeholder="0,00"]').first().fill(valor);
  await p.getByPlaceholder("Descrição da compra").fill(desc);
  if (pago) { await p.getByText("Marcar como pago", { exact: true }).click(); await p.waitForTimeout(300); }
  await p.getByRole("button", { name: "Criar compra" }).click();
  await p.waitForTimeout(2000);
}

async function excluir(u, numero) {
  const linha = u.page.locator("main table tbody tr", { hasText: numero }).first();
  await linha.getByRole("button", { name: "Excluir" }).click();
  await u.page.waitForTimeout(400);
  await u.page.getByRole("dialog").getByRole("button", { name: "Excluir" }).click();
  await u.page.waitForTimeout(1500);
}

export default async function comprasExcluir(navegador) {
  const v = verificador("compras-excluir");
  const u = await novoUsuario(navegador);
  const p = u.page;
  const ano = new Date().getFullYear();
  const mesDe = (k) => p.evaluate((k) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + k); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }, k);
  const m1 = await mesDe(1); const m2 = await mesDe(2); const m3 = await mesDe(3);
  const hoje = await p.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; });

  /* ---- a compra aprovada põe três parcelas no caixa ---- */
  await novaCompra(u, { valor: "90000", parcelas: 3, venc: `${m1}-10`, desc: "Estantes" });
  await u.ir("/dashboard/purchases");
  await u.page.locator("main table tbody tr", { hasText: `${ano}-C0001` }).first().getByRole("button", { name: "Aprovar" }).click();
  await p.waitForTimeout(1500);
  const id = await idDaCompra(u, `${ano}-C0001`);
  const antes = [await titulosDoMes(u, m1), await titulosDoMes(u, m2), await titulosDoMes(u, m3)].map((l) => parcelasNoMes(l, id));
  v.ok(antes.every((l) => l.length === 1 && l[0].includes("300,00")), "aprovada, a compra tem 300,00 em cada um dos três meses",
    antes.map((l) => l.join(" ")).join(" || "));

  /* ---- excluir retira as parcelas ---- */
  await u.ir("/dashboard/purchases");
  await excluir(u, `${ano}-C0001`);
  v.ok(!(await linhasDaLista(u)).includes(`${ano}-C0001`), "a compra excluída sai da lista");
  // O desfazer vive no toast desta tela: conferir os títulos agora custaria a
  // janela de desfazer. Primeiro desfaz; a retirada é provada no segundo ciclo.
  const desfazer = p.getByRole("button", { name: /Desfazer/ });
  v.ok(await desfazer.count() > 0, "a exclusão oferece Desfazer");
  await desfazer.first().click();
  await p.waitForTimeout(1500);
  v.ok((await linhasDaLista(u)).includes(`${ano}-C0001`), "desfazer devolve a compra à lista");
  const depois = [await titulosDoMes(u, m1), await titulosDoMes(u, m2), await titulosDoMes(u, m3)].map((l) => parcelasNoMes(l, id));
  v.ok(depois.every((l) => l.length === 1 && l[0].includes("300,00")),
    "e as três parcelas voltam — 300,00 em cada mês, nenhuma duplicada", depois.map((l) => l.join(" ")).join(" || "));

  // Agora excluir de vez e conferir que o caixa ficou sem nada dela.
  await u.ir("/dashboard/purchases");
  await excluir(u, `${ano}-C0001`);
  await p.waitForTimeout(9000); // a janela de desfazer passa
  const fim = [await titulosDoMes(u, m1), await titulosDoMes(u, m2), await titulosDoMes(u, m3)].map((l) => parcelasNoMes(l, id));
  v.ok(fim.every((l) => l.length === 0), "excluída de vez, nenhuma parcela fica em Títulos a pagar", fim.flat().join(" || "));

  /* ---- a compra com parcela PAGA não se exclui ---- */
  await novaCompra(u, { valor: "60000", parcelas: 2, venc: hoje, desc: "Monitor pago", pago: true });
  const n2 = await numeroPelaDescricao(u, "Monitor pago");
  await u.ir("/dashboard/purchases");
  await excluir(u, n2);
  const t = (await u.texto()).replace(/\s+/g, " ");
  v.ok(/já paga/.test(t) && /Estorne o pagamento/.test(t), "excluir com parcela paga é RECUSADO, com o motivo");
  v.ok((await linhasDaLista(u)).includes(n2), "e a compra continua na lista");
  const id2 = await idDaCompra(u, n2);
  const m0 = hoje.slice(0, 7);
  const pagas = parcelasNoMes(await titulosDoMes(u, m0), id2);
  v.ok(pagas.length === 1 && pagas[0].includes("300,00") && /Pag[ao]/.test(pagas[0]), "a parcela paga (300,00) continua lá, paga", pagas.join(" || "));
  const prevista = parcelasNoMes(await titulosDoMes(u, m1), id2);
  v.ok(prevista.length === 1 && prevista[0].includes("300,00"), "e a prevista do mês seguinte também (nada apagado pela metade)");

  v.ok(u.erros.length === 0, "nenhum erro de página ou de console", u.erros.slice(0, 2).join(" | "));
  await u.ctx.close();
  return v.falhas();
}
