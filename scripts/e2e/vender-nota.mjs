/**
 * JORNADA: a nota fiscal da venda — da lista de vendas aos dois painéis.
 *
 * Lança uma venda completa e uma com chargeback, confere o painel de NF
 * ("a emitir" só conta a venda que aconteceu), emite a NFS-e pela linha da
 * venda e confere: o status e o número voltam para a venda nos DOIS painéis
 * (lista de vendas e tela de notas), a nota aparece no emissor, e a receita
 * NÃO dobra — o título a receber continua um só e o DRE não se move.
 */
import { novoUsuario, verificador } from "./kit.mjs";
import { lancarVenda } from "./vender-impostos.mjs";

const norm = (t) => t.replace(/\s+/g, " ").replace(/R\$\s*/g, "R$").replace(/(\d)\s+,(\d\d)/g, "$1,$2");
const card = (t, rotulo) => {
  const m = t.match(new RegExp(`${rotulo} \\((\\d+)\\) R\\$([\\d.]+,\\d\\d)`));
  return m ? { n: Number(m[1]), valor: m[2] } : null;
};

export default async function venderNota(navegador) {
  const v = verificador("vender-nota");
  const u = await novoUsuario(navegador);

  await lancarVenda(u, 1_234_500, "completa");   // R$ 12.345,00
  await lancarVenda(u, 300_000, "chargeback");   // R$ 3.000,00 — não houve venda

  await u.ir("/dashboard/sales-invoices");
  const l1 = norm(await u.texto());
  v.ok(card(l1, "Completa")?.n === 1 && card(l1, "Chargeback")?.n === 1, "o painel de status da venda separa completa e chargeback",
    `${JSON.stringify(card(l1, "Completa"))} ${JSON.stringify(card(l1, "Chargeback"))}`);
  v.ok(card(l1, "NFs a emitir")?.n === 1 && card(l1, "NFs a emitir")?.valor === "12.345,00",
    "'NFs a emitir' conta só a venda que aconteceu (o chargeback não pede nota)", JSON.stringify(card(l1, "NFs a emitir")));
  const botoes = u.page.getByRole("button", { name: "Emitir NF" });
  v.ok(await botoes.count() === 1, "só a venda completa oferece 'Emitir NF'", `${await botoes.count()} botão(ões)`);

  await u.ir("/dashboard/reports/dre");
  const dreAntes = norm(await u.texto());
  await u.ir("/contas-a-receber/titulos");
  const titAntes = (norm(await u.texto()).match(/R\$12\.345,00/g) || []).length;

  await u.ir("/dashboard/sales-invoices");
  await u.page.getByRole("button", { name: "Emitir NF" }).first().click();
  await u.page.waitForTimeout(3500);
  const l2 = norm(await u.texto());
  const numeroNF = (l2.match(/NF (\d+) emitida para a venda/) || [])[1];
  v.ok(!!numeroNF, "a tela confirma a nota emitida com número", (l2.match(/NF [^—]{0,60}/) || [])[0]);
  await u.ir("/dashboard/sales-invoices");
  const l3 = norm(await u.texto());
  v.ok(card(l3, "NFs emitidas")?.n === 1 && card(l3, "NFs emitidas")?.valor === "12.345,00", "a venda passa para 'NFs emitidas' no painel da lista", JSON.stringify(card(l3, "NFs emitidas")));
  v.ok(card(l3, "NFs a emitir")?.n === 0, "e sai de 'NFs a emitir'", JSON.stringify(card(l3, "NFs a emitir")));
  v.ok(await u.page.getByRole("button", { name: "Emitir NF" }).count() === 0, "a venda com nota não oferece emitir de novo");
  v.ok(!!numeroNF && l3.includes(numeroNF), "o número da NF aparece na lista de vendas", numeroNF);

  await u.ir("/dashboard/sales-invoices/invoices");
  const n1 = norm(await u.texto());
  v.ok(card(n1, "NF emitidas")?.n === 1 && card(n1, "NF emitidas")?.valor === "12.345,00", "a tela de notas mostra a mesma nota emitida", JSON.stringify(card(n1, "NF emitidas")));

  await u.ir("/dashboard/sales-invoices/invoices?aba=nfse");
  const e1 = norm(await u.texto());
  v.ok(!!numeroNF && e1.includes(numeroNF), "a nota aparece no emissor de NFS-e com o número", numeroNF);

  await u.ir("/contas-a-receber/titulos");
  const titDepois = (norm(await u.texto()).match(/R\$12\.345,00/g) || []).length;
  v.ok(titAntes >= 1 && titDepois === titAntes, "o título a receber da venda continua UM (a nota não lança a receita de novo)", `${titAntes} → ${titDepois}`);
  await u.ir("/dashboard/reports/dre");
  v.ok(norm(await u.texto()) === dreAntes, "o DRE não se move ao emitir a nota");

  v.ok(u.erros.length === 0, "nenhum erro de página ou de console", u.erros.slice(0, 2).join(" | "));
  await u.ctx.close();
  return v.falhas();
}
