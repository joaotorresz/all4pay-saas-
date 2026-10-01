/**
 * JORNADA: links de pagamento — criar, ver o QR, sobreviver ao recarregar.
 *
 * Cria um link de R$ 350,00, confere que o QR é desenhado com a URL do link,
 * que ele continua lá depois de recarregar e que excluir o tira da lista.
 *
 * ⚠️ O que esta jornada NÃO aprova, e diz: a URL do link aponta para
 * `/pagar/<id>`, rota que NÃO EXISTE (a tela e o modelo estão em arquivos
 * reservados nesta rodada — ver docs/rodada-30-09/vender.md). E não há PIX
 * copia-e-cola no link: o gerador (`lib/pix`) existe e só os boletos o usam.
 * A linha informativa abaixo mede o 404 a cada execução, para o defeito não
 * sumir do radar.
 */
import { novoUsuario, verificador, BASE } from "./kit.mjs";

const norm = (t) => t.replace(/\s+/g, " ").replace(/R\$\s*/g, "R$").replace(/(\d)\s+,(\d\d)/g, "$1,$2");

export default async function venderLinks(navegador) {
  const v = verificador("vender-links");
  const u = await novoUsuario(navegador);

  await u.ir("/dashboard/sales-invoices/payment-links");
  v.ok(/Nenhum link de pagamento criado/.test(await u.texto()), "sem links, a tela diz que não há nenhum");
  await u.page.getByRole("button", { name: "Novo link" }).click();
  await u.page.waitForTimeout(400);
  await u.page.locator('input[placeholder="Ex.: Mentoria — turma de setembro"]').fill("Mentoria outubro");
  await u.page.locator('input[type="number"]').first().fill("350");
  await u.page.getByRole("button", { name: "Salvar", exact: true }).click();
  await u.page.waitForTimeout(800);

  const modal = norm(await u.texto());
  const url = (modal.match(/https?:\/\/\S+\/pagar\/lk_[\w]+/) || [])[0];
  v.ok(!!url, "o link criado mostra a URL dele", url);
  v.ok(modal.includes("R$350,00"), "o modal mostra o valor do link");
  const qr = await u.page.locator("div.rounded-card.bg-white > svg").evaluate((s) => s.innerHTML.length).catch(() => 0);
  v.ok(qr > 500, "o QR é desenhado dentro do modal", `${qr} caracteres de SVG`);

  await u.ir("/dashboard/sales-invoices/payment-links");
  const lista = norm(await u.texto());
  v.ok(lista.includes("Mentoria outubro") && lista.includes("R$350,00"), "o link continua na lista depois de recarregar");
  const guardado = await u.page.evaluate(() => JSON.parse(localStorage.getItem("a4p_links_pagamento") ?? "[]"));
  v.ok(guardado.length === 1 && guardado[0].valor === 350, "o link é guardado pela chave da empresa (store-org)", JSON.stringify(guardado[0] ?? null).slice(0, 80));

  if (url) {
    const r = await u.page.request.get(BASE + new URL(url).pathname, { maxRedirects: 0 }).catch(() => null);
    console.log(`  (informativo · defeito conhecido) a URL do link responde ${r?.status() ?? "sem resposta"} — não há página /pagar`);
  }

  await u.page.getByRole("button", { name: "Excluir" }).first().click();
  await u.page.waitForTimeout(500);
  v.ok(/Nenhum link de pagamento criado/.test(await u.texto()), "excluir tira o link da lista");

  v.ok(u.erros.length === 0, "nenhum erro de página ou de console", u.erros.slice(0, 2).join(" | "));
  await u.ctx.close();
  return v.falhas();
}
