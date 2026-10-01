/**
 * JORNADA: Administração — usuários, logs, integrações e as telas de
 * plataforma (armazenamento, segurança, rotas, relatórios exportados).
 *
 *  - o titular (único administrador) NÃO sai; um convidado entra e sai;
 *  - os Logs acham "de 25.000 para 78.000" escrito como uma pessoa escreve;
 *  - a chave de API aparece UMA vez e, ao voltar à tela, só mascarada;
 *  - as demais telas abrem com o conteúdo que prometem.
 *
 * ⚠️ O que esta jornada achou: o resumo dos logs falava a língua do código
 * ("valor: de 25000 para 78000") e a busca anunciada pelo próprio campo
 * ("de 1.000 para 10.000…") não achava nada; o titular aparecia como
 * "Titular da conta" com e-mail "—" porque a tela lia chaves que nenhum
 * cadastro grava.
 */
import { novoUsuario, verificador } from "./kit.mjs";

export default async function admin(navegador) {
  const v = verificador("plataforma-admin");
  const u = await novoUsuario(navegador);

  // ── usuários ──
  await u.ir("/");
  await u.page.evaluate(() => localStorage.setItem("a4p_company", JSON.stringify({
    db: { razaoSocial: "Loja E2E Ltda", fantasia: "Loja E2E", repNome: "Rita Dona", repEmail: "rita@e2e.com" },
  })));
  await u.ir("/dashboard/administration/users");
  let t = await u.texto();
  v.ok(/Rita Dona/.test(t) && /rita@e2e\.com/.test(t), "o titular aparece com o nome e o e-mail do cadastro (era \"Titular da conta\" e \"—\")");
  await u.page.getByRole("button", { name: "Remover" }).first().click();
  await u.page.waitForTimeout(500);
  t = await u.texto();
  v.ok(/não pode ser removido|único administrador/.test(t), "remover o titular é recusado com o motivo");
  v.ok(/Rita Dona/.test(t), "e o titular continua na lista");

  await u.page.getByRole("button", { name: "Convidar usuário" }).click();
  await u.page.getByLabel("E-mail", { exact: true }).fill("bia@e2e.com");
  await u.page.getByLabel("Nome", { exact: true }).fill("Bia Convidada");
  await u.page.getByRole("button", { name: "Vincular usuário" }).click();
  await u.page.waitForTimeout(800);
  t = await u.texto();
  v.ok(/bia@e2e\.com/.test(t), "o convidado entra na lista");
  v.ok(!/Convite enviado/.test(t), "a tela não promete e-mail que não é enviado");

  // ── logs ──
  await u.ir("/dashboard/administration/audit-logs");
  const datas = u.page.locator('input[type="date"]');
  await datas.nth(0).fill("2026-03-01");
  await u.page.getByPlaceholder(/de 1\.000 para 10\.000/).fill("de 25.000 para 78.000");
  await u.page.getByRole("button", { name: "Aplicar" }).click();
  await u.page.waitForTimeout(500);
  t = await u.texto();
  const linhas = await u.page.locator("tbody tr").count();
  v.ok(linhas === 1 && /valor: de 25\.000 para 78\.000/.test(t), "a busca \"de 25.000 para 78.000\" acha a alteração de valor", `${linhas} linha(s)`);
  v.ok(/antes da janela de retenção/.test(t), "pedir antes dos 30 dias avisa que o resto foi descartado");
  await u.page.getByPlaceholder(/de 1\.000 para 10\.000/).fill("de 25.000 para 99.000");
  await u.page.getByRole("button", { name: "Aplicar" }).click();
  await u.page.waitForTimeout(400);
  v.ok(/Nenhum log encontrado/.test(await u.texto()), "e não acha o que não aconteceu");

  // ── integrações: o segredo aparece UMA vez ──
  await u.ir("/dashboard/administration/integrations?cartao=apis");
  await u.page.getByRole("button", { name: /Gerar chave|Gerar nova chave/ }).first().click();
  await u.page.waitForTimeout(400);
  const chave = (await u.texto()).match(/a4p_live_[0-9a-f]{48}/)?.[0];
  v.ok(!!chave, "gerar mostra a chave inteira, uma vez");
  await u.ir("/dashboard/administration/integrations?cartao=apis");
  const depois = await u.texto();
  v.ok(!!chave && !depois.includes(chave) && /Chave ativa/.test(depois), "voltando à tela, a chave só aparece mascarada");
  const guardado = await u.page.evaluate(() => JSON.stringify(localStorage));
  v.ok(!!chave && !guardado.includes(chave), "a chave crua não fica guardada no navegador");

  // ── telas de plataforma ──
  const telas = [
    ["/dashboard/administration/storage", /Armazenamento|navegador|servidor/i],
    ["/dashboard/administration/security", /isolamento/i],
    ["/dashboard/administration/routes", /rotas publicadas|canônica/i],
    ["/dashboard/administration/exported-reports", /Relatórios exportados|exportaç/i],
    ["/dashboard/administration/subscription", /Plano|Assinatura/i],
  ];
  for (const [rota, re] of telas) {
    const st = await u.ir(rota);
    v.ok(st === 200 && re.test(await u.texto()), `${rota} abre com o conteúdo`, String(st));
  }

  v.ok(u.erros.length === 0, "nenhum erro de página ou de console", u.erros.slice(0, 2).join(" | "));
  await u.ctx.close();
  return v.falhas();
}
