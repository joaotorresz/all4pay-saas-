/**
 * JORNADA: links de pagamento — criar, ver o QR do PIX, sobreviver ao recarregar.
 *
 * Cria um link de R$ 350,00 e confere que o QR carrega o PIX copia-e-cola da
 * empresa (BR Code começando em `000201`, com o valor do link) — ou, sem CNPJ
 * no cadastro, que a tela DIZ que não há chave em vez de desenhar um QR.
 * ⚠️ Nenhuma URL `/pagar/<id>`: essa rota nunca existiu (404). Página pública
 * de pagamento é decisão do dono, pendente (docs/rodada-30-09/vender.md).
 */
import { novoUsuario, verificador } from "./kit.mjs";

const norm = (t) => t.replace(/\s+/g, " ").replace(/R\$\s*/g, "R$").replace(/(\d)\s+,(\d\d)/g, "$1,$2");

export default async function venderLinks(navegador) {
  const v = verificador("vender-links");
  const u = await novoUsuario(navegador);

  await u.ir("/dashboard/sales-invoices/payment-links");
  v.ok(/Nenhum link de pagamento criado/.test(await u.texto()), "sem links, a tela diz que não há nenhum");
  await u.page.getByRole("button", { name: "Novo link" }).click();
  await u.page.waitForTimeout(400);
  await u.page.locator('input[placeholder="Ex.: Mentoria — turma de setembro"]').fill("Mentoria outubro");
  // O valor é o campo de dinheiro do produto (digita CENTAVOS), não type=number.
  v.ok(await u.page.locator('input[type="number"]').count() === 0, "o valor do link não é mais um campo type=number");
  await u.page.locator('input[placeholder="0,00"]').first().fill("35000");
  await u.page.getByRole("button", { name: "Salvar", exact: true }).click();
  await u.page.waitForTimeout(800);

  const modal = norm(await u.texto());
  v.ok(!/\/pagar\//.test(modal), "nenhuma URL /pagar/ (rota que não existe) aparece na tela");
  const pix = (modal.match(/000201\S+/) || [])[0];
  const semChave = /Sem CNPJ no cadastro da empresa não há chave PIX/.test(modal);
  v.ok(!!pix || semChave, "o modal mostra o PIX copia-e-cola — ou diz que falta o CNPJ", pix ?? "sem CNPJ");
  if (pix) {
    v.ok(/5406350\.00/.test(pix), "o PIX leva o valor do link (campo 54 = 350.00)", pix);
    const qr = await u.page.locator("div.rounded-card.bg-white > svg").evaluate((s) => s.innerHTML.length).catch(() => 0);
    v.ok(qr > 500, "o QR do PIX é desenhado dentro do modal", `${qr} caracteres de SVG`);
  }
  v.ok(modal.includes("R$350,00"), "o modal mostra o valor do link");

  await u.ir("/dashboard/sales-invoices/payment-links");
  const lista = norm(await u.texto());
  v.ok(lista.includes("Mentoria outubro") && lista.includes("R$350,00"), "o link continua na lista depois de recarregar");
  const guardado = await u.page.evaluate(() => JSON.parse(localStorage.getItem("a4p_links_pagamento") ?? "[]"));
  v.ok(guardado.length === 1 && guardado[0].valor === 350, "o link é guardado pela chave da empresa (store-org)", JSON.stringify(guardado[0] ?? null).slice(0, 80));

  await u.page.getByRole("button", { name: "Excluir" }).first().click();
  await u.page.waitForTimeout(500);
  v.ok(/Nenhum link de pagamento criado/.test(await u.texto()), "excluir tira o link da lista");

  v.ok(u.erros.length === 0, "nenhum erro de página ou de console", u.erros.slice(0, 2).join(" | "));
  await u.ctx.close();
  return v.falhas();
}
