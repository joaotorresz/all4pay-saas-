/**
 * JORNADA: aprovar e rejeitar pagamentos acima da alçada.
 *
 * Aprovar é o controle que separa quem pede de quem libera dinheiro. A jornada
 * confere que a fila anda (uma decisão tira o pedido da fila), que a rejeição
 * guarda o MOTIVO na trilha, e que a tela nunca deixa um botão de aprovar ativo
 * quando a regra recusaria — a recusa vem escrita antes do clique.
 */
import { novoUsuario, verificador } from "./kit.mjs";

const contaFila = async (u) => {
  const t = (await u.texto()).replace(/\n+/g, " ");
  const m = t.match(/Aguardando minha aprovação\s*(\d+)/i);
  return m ? Number(m[1]) : NaN;
};

export default async function aprovacoes(navegador) {
  const v = verificador("aprovacoes");
  const u = await novoUsuario(navegador);
  await u.ir("/aprovacoes");

  const itens = u.page.locator("main button", { hasText: /R\$/ });
  const n0 = await itens.count();
  v.ok(n0 > 0, "a fila traz pedidos acima da alçada", `${n0} pedido(s)`);
  const fila0 = await contaFila(u);

  // Rejeitar o primeiro, com motivo.
  await itens.first().click();
  await u.page.waitForTimeout(500);
  const motivo = "Fornecedor sem contrato vigente";
  await u.page.getByPlaceholder("Comentário (opcional)").fill(motivo);
  await u.page.getByRole("button", { name: "Rejeitar" }).click();
  await u.page.waitForTimeout(800);
  const t1 = (await u.texto()).replace(/\n+/g, " ");
  v.ok(/Solicitação rejeitada/.test(t1), "rejeitar confirma na tela");
  const fila1 = await contaFila(u);
  v.ok(fila1 === fila0 - 1, "a fila diminui um", `${fila0} → ${fila1}`);

  await u.page.getByRole("button", { name: /Rejeitadas/ }).click();
  await u.page.waitForTimeout(400);
  await u.page.locator("main button", { hasText: /R\$/ }).first().click();
  await u.page.waitForTimeout(400);
  v.ok((await u.texto()).includes(motivo), "o motivo da rejeição fica na trilha");

  // Aprovar: ou o botão está ativo e a fila anda, ou está desligado COM a razão escrita.
  await u.page.getByRole("button", { name: /Aguardando minha aprovação/ }).first().click();
  await u.page.waitForTimeout(400);
  await u.page.locator("main button", { hasText: /R\$/ }).first().click();
  await u.page.waitForTimeout(400);
  const aprovar = u.page.getByRole("button", { name: "Aprovar" });
  v.ok(await aprovar.count() > 0, "o pedido da fila oferece Aprovar");
  if (await aprovar.isDisabled()) {
    const t = (await u.texto()).replace(/\n+/g, " ");
    v.ok(/não|papel|própria|alçada/i.test(t), "aprovar desligado vem com a razão escrita");
  } else {
    await aprovar.click();
    await u.page.waitForTimeout(800);
    const t = (await u.texto()).replace(/\n+/g, " ");
    v.ok(/Aprovada|Nível aprovado/.test(t), "aprovar confirma na tela e diz o próximo passo");
  }

  // A decisão sobrevive a recarregar a página (não era só estado de tela).
  await u.ir("/aprovacoes");
  const fila2 = await contaFila(u);
  v.ok(fila2 <= fila1, "depois de recarregar, a fila continua sem o pedido decidido", `${fila1} → ${fila2}`);

  v.ok(u.erros.length === 0, "nenhum erro de página ou de console", u.erros.slice(0, 2).join(" | "));
  await u.ctx.close();
  return v.falhas();
}
