/**
 * JORNADA: a nota da venda depois de emitida — excluir e cancelar.
 *
 * Lança uma venda, emite a NF pela linha e confere:
 *  - excluir a venda com nota emitida é RECUSADO, com o motivo, e nada some
 *    (a venda, o título a receber e o DRE ficam);
 *  - cancelar a nota no emissor NÃO apaga o título da venda (ele não nasceu da
 *    nota) e leva o status "Cancelada" de volta para a venda, nos dois painéis;
 *  - com a nota cancelada, excluir a venda passa e o título sai do a receber.
 * Revisão de 30/09: antes, excluir apagava a venda de uma nota válida, e a
 * lista seguia dizendo "Emitida" de uma nota cancelada.
 */
import { novoUsuario, verificador } from "./kit.mjs";
import { lancarVenda } from "./vender-impostos.mjs";

const norm = (t) => t.replace(/\s+/g, " ").replace(/R\$\s*/g, "R$").replace(/(\d)\s+,(\d\d)/g, "$1,$2");
const card = (t, rotulo) => {
  const m = t.match(new RegExp(`${rotulo} \\((\\d+)\\) R\\$([\\d.]+,\\d\\d)`));
  return m ? { n: Number(m[1]), valor: m[2] } : null;
};
const VALOR = "R$8.765,40";

/** Os títulos da venda no dataset da demonstração (o que o contas a receber lê). */
const titulosDaVenda = (u) => u.page.evaluate(() => {
  const ds = JSON.parse(localStorage.getItem("a4p_imported_dataset") ?? "{}");
  return (ds.movements ?? []).filter((m) => m.type === "entrada" && Math.abs(m.amount - 8765.4) < 0.005).map((m) => ({ id: m.id, status: m.status }));
});

export default async function venderNotaCancelar(navegador) {
  const v = verificador("vender-nota-cancelar");
  const u = await novoUsuario(navegador);
  u.page.on("dialog", (d) => d.accept());

  await lancarVenda(u, 876_540, "completa");
  await u.ir("/dashboard/sales-invoices");
  await u.page.getByRole("button", { name: "Emitir NF" }).first().click();
  await u.page.waitForTimeout(3500);
  const numeroNF = (norm(await u.texto()).match(/NF (\d+) emitida para a venda/) || [])[1];
  v.ok(!!numeroNF, "a nota da venda foi emitida", numeroNF);
  const tit0 = await titulosDaVenda(u);
  v.ok(tit0.length === 1, "a venda tem UM título a receber de R$ 8.765,40", JSON.stringify(tit0));

  // Excluir com a nota emitida: recusado.
  await u.ir("/dashboard/sales-invoices");
  await u.page.getByRole("button", { name: "Excluir" }).first().click();
  await u.page.waitForTimeout(1500);
  const r1 = norm(await u.texto());
  v.ok(/Cancele a nota no emissor de NFS-e antes de excluir a venda/.test(r1), "excluir a venda com nota emitida é recusado, com o motivo",
    (r1.match(/A venda [^.]{0,80}\./) || [])[0]);
  await u.ir("/dashboard/sales-invoices");
  const l1 = norm(await u.texto());
  v.ok(card(l1, "NFs emitidas")?.n === 1 && l1.includes(VALOR), "a venda continua na lista, com a nota emitida", JSON.stringify(card(l1, "NFs emitidas")));
  v.ok((await titulosDaVenda(u)).length === 1, "e o título a receber continua lá");

  // Cancelar a nota no emissor.
  await u.ir("/dashboard/sales-invoices/invoices?aba=nfse");
  const linha = u.page.locator("div.border-t", { hasText: numeroNF ?? "—" }).first();
  await linha.getByTitle("Cancelar").click();
  await u.page.waitForTimeout(1500);
  const e1 = norm(await u.texto());
  v.ok(/o título a receber da venda continua/.test(e1), "o emissor diz que o título da venda fica (não diz que removeu lançamentos)",
    (e1.match(/NFS-e cancelada[^.]{0,120}/) || [])[0]);
  const tit1 = await titulosDaVenda(u);
  v.ok(tit1.length === 1 && tit1[0].id === tit0[0]?.id, "cancelar a nota NÃO apaga o título da venda", `${JSON.stringify(tit0)} → ${JSON.stringify(tit1)}`);

  await u.ir("/dashboard/sales-invoices");
  const l2 = norm(await u.texto());
  v.ok(card(l2, "NFs emitidas")?.n === 0, "a venda sai de 'NFs emitidas'", JSON.stringify(card(l2, "NFs emitidas")));
  v.ok(/Cancelada · nº/.test(l2), "a lista de vendas mostra a nota CANCELADA, com o número", (l2.match(/(Emitida|Cancelada) · nº \d+/) || [])[0]);
  await u.ir("/dashboard/sales-invoices/invoices");
  const n2 = norm(await u.texto());
  v.ok(card(n2, "NF canceladas")?.n === 1 && card(n2, "NF canceladas")?.valor === "8.765,40", "a tela de notas conta a nota cancelada", JSON.stringify(card(n2, "NF canceladas")));

  // Agora a exclusão passa e o título vai junto.
  await u.ir("/dashboard/sales-invoices");
  await u.page.getByRole("button", { name: "Excluir" }).first().click();
  await u.page.waitForTimeout(1500);
  v.ok(/enviados para a lixeira/.test(norm(await u.texto())), "com a nota cancelada, a exclusão passa");
  v.ok((await titulosDaVenda(u)).length === 0, "e o título a receber da venda sai junto");

  v.ok(u.erros.length === 0, "nenhum erro de página ou de console", u.erros.slice(0, 2).join(" | "));
  await u.ctx.close();
  return v.falhas();
}
