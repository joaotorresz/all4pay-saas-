/**
 * JORNADA: a compra como PEDIDO — só a aprovada vira conta a pagar.
 *
 * Confere, com VALORES:
 *  - duas compras criadas (à vista R$ 1.234,56 hoje · parcelada R$ 1.000,00 em
 *    3x a partir do dia 15 do mês seguinte) entram em "Aguardando aprovação" e
 *    NENHUM título nasce antes da decisão — nem nos títulos, nem no fluxo;
 *  - aprovar põe as parcelas em Títulos a pagar com os valores certos
 *    (333,33 · 333,33 · 333,34 — o resto dos centavos na ÚLTIMA) e as datas
 *    mês a mês, e as saídas projetadas do fluxo sobem exatamente o que vence
 *    nos próximos 30 dias;
 *  - reprovar um pedido não cria título nenhum; cancelar uma aprovada RETIRA
 *    as parcelas previstas, e o fluxo volta;
 *  - a compra marcada como paga nasce aprovada, com a 1ª parcela paga — e
 *    cancelá-la é RECUSADO com o motivo (apagaria dinheiro que já saiu);
 * e nenhum erro de página ou de console.
 */
import { novoUsuario, verificador, brl } from "./kit.mjs";

async function titulosDoMes(u, mes) {
  await u.ir(`/contas-a-pagar/titulos?mes=${mes}`);
  return u.page.evaluate(() => [...document.querySelectorAll("main table tbody tr")]
    .map((tr) => [...tr.querySelectorAll("td")].map((td) => td.innerText.replace(/\s+/g, " ").replace(/ ,/g, ",").trim()).join(" | ")));
}
const tem = (linhas, texto, valor, venc) =>
  linhas.some((l) => l.includes(texto) && (valor == null || l.includes(valor)) && (venc == null || l.includes(venc)));
/*
 * ⚠️ Títulos a pagar NÃO mostra a descrição (colunas: ID · situação · datas ·
 * conta · categoria · fornecedor · valor). A parcela é reconhecida pelo ID que
 * a compra dá ao título em demonstração — `compra-<id da compra>-<parcela>` —
 * e pelo valor e vencimento. (Defeito de tela registrado: TitulosView é
 * arquivo reservado nesta rodada.)
 */
const parcela = (linhas, compraId, n, valor, venc) =>
  linhas.filter((l) => l.startsWith(`compra-${compraId}-${n} `) || l.includes(` compra-${compraId}-${n} `) || l.includes(`compra-${compraId}-${n} |`))
    .some((l) => (valor == null || l.includes(valor)) && (venc == null || l.includes(venc)));
const idDaCompra = (u, numero) => u.page.evaluate((numero) => {
  try {
    const lista = JSON.parse(localStorage.getItem("a4p_compras") ?? "[]");
    return lista.find((c) => c.numero === numero)?.id ?? null;
  } catch { return null; }
}, numero);

async function saidasProjetadas(u) {
  await u.ir("/fluxo-caixa");
  const rot = await u.page.locator('button[aria-label^="Saídas projetadas"]').first().textContent();
  const m = /R\$\s*([\d.]+)\s*,\s*(\d{2})/.exec(rot ?? "");
  return m ? brl(`${m[1]},${m[2]}`) : NaN;
}

async function novaCompra(u, { valor, parcelas, venc, comp, desc, pago = false }) {
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
  await datas.nth(1).fill(comp);
  await p.locator('main input[placeholder="0,00"]').first().fill(valor);
  await p.getByPlaceholder("Descrição da compra").fill(desc);
  if (pago) {
    await p.getByText("Marcar como pago", { exact: true }).click();
    await p.waitForTimeout(300);
  }
  await p.waitForTimeout(300);
  const form = (await u.texto()).replace(/\s+/g, " ").replace(/ ,/g, ",");
  await p.getByRole("button", { name: "Criar compra" }).click();
  await p.waitForTimeout(2000);
  return form;
}

/** Clica numa ação da linha da compra (pela descrição não aparece na lista; pelo número). */
async function acao(u, numero, rotulo) {
  const linha = u.page.locator("main table tbody tr", { hasText: numero }).first();
  await linha.getByRole("button", { name: rotulo }).click();
  await u.page.waitForTimeout(1500);
}

export default async function comprasAprovacao(navegador) {
  const v = verificador("compras-aprovacao");
  const u = await novoUsuario(navegador);
  const p = u.page;

  const hoje = await p.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; });
  const mesDe = (k) => p.evaluate((k) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + k); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }, k);
  const m0 = await mesDe(0); const m1 = await mesDe(1); const m2 = await mesDe(2); const m3 = await mesDe(3);
  const br = (iso) => iso.split("-").reverse().join("/");
  const dia15 = (m) => `${m}-15`;
  const em30 = await p.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + 30); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; });

  const saidas0 = await saidasProjetadas(u);
  v.ok(Number.isFinite(saidas0), "o fluxo mostra as saídas projetadas", String(saidas0));

  /* ---- dois pedidos, nenhum título ---- */
  await novaCompra(u, { valor: "123456", venc: hoje, comp: hoje, desc: "Papelaria do trimestre" });
  const form2 = await novaCompra(u, { valor: "100000", parcelas: 3, venc: dia15(m1), comp: hoje, desc: "Cadeiras do escritório" });
  v.ok(form2.includes("Parcelas que serão criadas") && form2.includes("333,33") && form2.includes("333,34"),
    "o formulário mostra as parcelas ANTES de gravar (333,33 · 333,33 · 333,34)");
  let t = (await u.texto()).replace(/\s+/g, " ").replace(/ ,/g, ",");
  v.ok(/Aguardando aprovação \(2\) R\$ 2\.234,56/.test(t), "as duas compras aguardam aprovação: 2.234,56", t.slice(0, 0));
  v.ok(/2026-C0001/.test(t) && /2026-C0002/.test(t), "numeradas C0001 e C0002");
  let tit = await titulosDoMes(u, m0);
  const c1a = await idDaCompra(u, "2026-C0001");
  v.ok(!!c1a && !tit.some((l) => l.includes(`compra-${c1a}-`)), "sem aprovação, a compra NÃO está em Títulos a pagar");
  v.ok(Math.abs((await saidasProjetadas(u)) - saidas0) < 0.005, "e o fluxo de caixa não se moveu");

  /* ---- aprovar ---- */
  await u.ir("/dashboard/purchases");
  await acao(u, "2026-C0001", "Aprovar");
  await acao(u, "2026-C0002", "Aprovar");
  t = (await u.texto()).replace(/\s+/g, " ").replace(/ ,/g, ",");
  v.ok(/Aprovadas \(2\) R\$ 2\.234,56/.test(t), "as duas aprovadas: 2.234,56");
  const c1 = await idDaCompra(u, "2026-C0001"); const c2 = await idDaCompra(u, "2026-C0002");
  v.ok(!!c1 && !!c2, "as compras estão gravadas no estado da organização", `${c1} ${c2}`);
  tit = await titulosDoMes(u, m0);
  v.ok(parcela(tit, c1, 1, "1.234,56", br(hoje)), "a à vista entra em Títulos a pagar: 1.234,56 hoje", tit.filter((l) => l.includes("compra-")).join(" || "));
  const t1 = await titulosDoMes(u, m1); const t2 = await titulosDoMes(u, m2); const t3 = await titulosDoMes(u, m3);
  v.ok(parcela(t1, c2, 1, "333,33", br(dia15(m1)))
    && parcela(t2, c2, 2, "333,33", br(dia15(m2)))
    && parcela(t3, c2, 3, "333,34", br(dia15(m3))),
    "as três parcelas, mês a mês, com o resto dos centavos na ÚLTIMA",
    [t1, t2, t3].map((x) => x.filter((l) => l.includes("compra-")).join(" ")).join(" || "));
  v.ok(!parcela(t1, c2, 4) && !parcela(t2, c2, 1), "nenhuma parcela a mais nem fora do seu mês");
  const naJanela = 1234.56 + (dia15(m1) <= em30 ? 333.33 : 0);
  const saidas1 = await saidasProjetadas(u);
  v.ok(Math.abs((saidas1 - saidas0) - naJanela) < 0.011,
    "as saídas projetadas sobem exatamente o que vence nos próximos 30 dias",
    `antes ${saidas0} · depois ${saidas1} · esperado +${naJanela.toFixed(2)}`);

  /* ---- reprovar um pedido: nada nasce ---- */
  await novaCompra(u, { valor: "50000", venc: hoje, comp: hoje, desc: "Frigobar não aprovado" });
  await acao(u, "2026-C0003", "Reprovar");
  t = (await u.texto()).replace(/\s+/g, " ").replace(/ ,/g, ",");
  v.ok(/Reprovadas ou canceladas \(1\) R\$ 500,00/.test(t), "a reprovada vai para o card de reprovadas (500,00)");
  const c3 = await idDaCompra(u, "2026-C0003");
  tit = await titulosDoMes(u, m0);
  v.ok(!!c3 && !tit.some((l) => l.includes(`compra-${c3}-`)), "e não existe em Títulos a pagar");

  /* ---- cancelar a aprovada: as parcelas saem ---- */
  await u.ir("/dashboard/purchases");
  await acao(u, "2026-C0002", "Cancelar compra");
  const t1b = await titulosDoMes(u, m1); const t3b = await titulosDoMes(u, m3);
  v.ok(!t1b.some((l) => l.includes(`compra-${c2}-`)) && !t3b.some((l) => l.includes(`compra-${c2}-`)), "cancelar retira as três parcelas previstas");
  const saidas2 = await saidasProjetadas(u);
  v.ok(Math.abs((saidas2 - saidas0) - 1234.56) < 0.011, "e o fluxo volta a ter só a à vista", `${saidas2 - saidas0}`);

  /* ---- a compra PAGA: nasce aprovada, e cancelar é recusado ---- */
  await novaCompra(u, { valor: "200000", parcelas: 2, venc: hoje, comp: hoje, desc: "Notebook pago", pago: true });
  t = (await u.texto()).replace(/\s+/g, " ").replace(/ ,/g, ",");
  v.ok(/Aprovadas \(2\) R\$ 3\.234,56/.test(t), "a compra paga nasce APROVADA (não fica aguardando)");
  const c4 = await idDaCompra(u, "2026-C0004");
  tit = await titulosDoMes(u, m0);
  v.ok(parcela(tit, c4, 1, "1.000,00") && tit.some((l) => l.includes(`compra-${c4}-1`) && /Pag[ao]/.test(l)),
    "a 1ª parcela entra PAGA", tit.filter((l) => l.includes(`compra-${c4}`)).join(" || "));
  await u.ir("/dashboard/purchases");
  await acao(u, "2026-C0004", "Cancelar compra");
  t = (await u.texto()).replace(/\s+/g, " ");
  v.ok(/já paga/.test(t) && /Estorne o pagamento/.test(t), "cancelar com parcela paga é RECUSADO, com o motivo na tela");
  const m1c = await titulosDoMes(u, m1);
  v.ok(parcela(m1c, c4, 2, "1.000,00"), "e a parcela prevista continua lá (nada foi apagado pela metade)");

  v.ok(u.erros.length === 0, "nenhum erro de página ou de console", u.erros.slice(0, 2).join(" | "));
  await u.ctx.close();
  return v.falhas();
}
