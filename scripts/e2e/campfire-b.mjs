/**
 * JORNADA CAMP-B — as cinco funções do Campfire, dirigidas como um usuário:
 *
 *  1. CAIXA DE ENTRADA: dois boletos chegam (tela de boletos recebidos), a aba
 *     "Caixa de entrada" de Títulos a pagar os CONTA; um é descartado — sem
 *     motivo a tela recusa, com motivo ele vai para "Descartados" —, o outro
 *     vira conta pelo formulário de sempre, JÁ PREENCHIDO, e sai da fila.
 *  2. BUSCA GLOBAL: ⌘K com "1.234,56" acha a conta recém-criada e abre a lista
 *     de títulos já filtrada nela.
 *  3. EDIÇÃO EM MASSA: a conta é marcada, a categoria trocada com o plano
 *     mostrado ANTES ("vão mudar 1 título"), e a troca aparece na lista e na
 *     trilha de auditoria.
 *  4. EXTRATO DO CLIENTE: a ficha do contato gera o extrato; só o documento
 *     vai à impressão, com a identificação da empresa e o total em aberto
 *     igual ao da prévia.
 *  5. CONSOLIDADO: a lista das eliminações intercompany aparece, e o
 *     consolidado depois delas é menor que a soma das partes pelo valor exato
 *     da lista — com o resultado igual nos dois.
 */
import { novoUsuario, verificador, brl } from "./kit.mjs";

const LINHA_1234 = "34191234546789012345767890123457416050000123456"; // Itaú · R$ 1.234,56 · vence 20/10/2026
const LINHA_777 = "34199876504321098765743210987657516050000077777";  // Itaú · R$ 777,77

async function escolherNaBusca(u, rotuloBotao) {
  await u.page.locator("main button", { hasText: rotuloBotao }).first().click({ timeout: 8000 });
  await u.page.waitForTimeout(300);
  const opcao = u.page.locator('[role="option"]').first();
  const tem = await opcao.count();
  if (tem) await opcao.click();
  else await u.page.keyboard.press("Enter");
  await u.page.waitForTimeout(300);
  return tem > 0;
}

const plano = (s) => s.replace(/\s+/g, " ");

export default async function campfireB(navegador) {
  const v = verificador("campfire-b");
  const u = await novoUsuario(navegador);
  const { page } = u;

  /* ── 1. caixa de entrada ─────────────────────────────────────────────── */
  await u.ir("/dashboard/purchases/received-boletos");
  for (const [linha, benef] of [[LINHA_1234, "Energia Campfire SA"], [LINHA_777, "Gráfica Campfire"]]) {
    await page.locator('input[placeholder^="00000.00000"]').fill(linha);
    await page.locator('input[placeholder="Beneficiário (opcional)"]').fill(benef);
    await page.getByRole("button", { name: "Adicionar", exact: true }).click();
    await page.waitForTimeout(500);
  }

  await u.ir("/contas-a-pagar/titulos?aba=caixa-de-entrada");
  const aba = plano(await page.locator('main button', { hasText: /Caixa de entrada \(/ }).first().innerText());
  const contador = Number((aba.match(/\((\d+)\)/) ?? [])[1]);
  v.ok(contador >= 2, "a aba mostra o CONTADOR do que chegou", aba);
  let t = plano(await u.texto());
  v.ok(/Energia Campfire SA/.test(t) && /Gráfica Campfire/.test(t), "os dois boletos estão na fila");

  const itemGrafica = page.locator("li[data-caixa-item]", { hasText: "Gráfica Campfire" });
  await itemGrafica.getByRole("button", { name: "Descartar" }).click();
  await page.locator('[role="dialog"][aria-label="Descartar documento"]').getByRole("button", { name: "Descartar" }).click();
  await page.waitForTimeout(400);
  const recusa = plano(await page.locator('[role="dialog"] [role="alert"]').first().innerText().catch(() => ""));
  v.ok(/motivo/i.test(recusa), "descartar SEM motivo é recusado, dizendo por quê", recusa);
  await page.locator('textarea[aria-label="Motivo do descarte"]').fill("já pago pelo cartão em 12/09");
  await page.locator('[role="dialog"][aria-label="Descartar documento"]').getByRole("button", { name: "Descartar" }).click();
  await page.waitForTimeout(800);
  const aba2 = plano(await page.locator('main button', { hasText: /Caixa de entrada \(/ }).first().innerText());
  v.ok(Number((aba2.match(/\((\d+)\)/) ?? [])[1]) === contador - 1, "o contador desce com o descarte", `${aba} → ${aba2}`);
  await page.locator('[role="tab"]', { hasText: "Descartados" }).click();
  await page.waitForTimeout(400);
  t = plano(await u.texto());
  v.ok(/Gráfica Campfire/.test(t) && /motivo: já pago pelo cartão em 12\/09/.test(t), "o descartado fica no filtro com o motivo");
  await page.locator('[role="tab"]', { hasText: "Esperando decisão" }).click();
  await page.waitForTimeout(300);

  await page.locator("li[data-caixa-item]", { hasText: "Energia Campfire SA" }).getByRole("button", { name: "Criar conta a pagar" }).click();
  await page.waitForURL(/payables\/new/, { timeout: 20000 });
  await page.waitForTimeout(1500);
  t = plano(await u.texto());
  v.ok(/caixa de entrada/i.test(t) && /Energia Campfire SA/.test(t), "o formulário abre dizendo de onde veio");
  const valorCampo = await page.locator('main input[placeholder="0,00"]').first().inputValue();
  v.ok(brl(valorCampo) === 1234.56, "o valor do boleto já vem preenchido", valorCampo);
  const venc = await page.locator('main [data-campo="vencimento"] input[type="date"]').first().inputValue().catch(() => "");
  v.ok(venc === "2026-10-20", "o vencimento do boleto já vem preenchido", venc);
  await escolherNaBusca(u, /Busque a conta/);
  await escolherNaBusca(u, /Busque ou crie/);
  if (await page.locator("main button", { hasText: /Digite nome ou documento/ }).count()) await escolherNaBusca(u, /Digite nome ou documento/);
  for (const d of await page.locator('main input[type="date"]').all()) if (!(await d.inputValue())) await d.fill("2026-10-20");
  await page.getByRole("button", { name: "Salvar" }).last().click();
  await page.waitForTimeout(2500);
  v.ok(!page.url().includes("/new"), "salvar sai do formulário", page.url());

  await u.ir("/contas-a-pagar/titulos?aba=caixa-de-entrada");
  const aba3 = plano(await page.locator('main button', { hasText: /Caixa de entrada \(/ }).first().innerText());
  v.ok(Number((aba3.match(/\((\d+)\)/) ?? [])[1]) === contador - 2, "a conta criada TIRA o documento da fila", aba3);
  t = plano(await u.texto());
  v.ok(/Viraram conta \(1\)/.test(t), "o documento aparece em \"Viraram conta\"");

  /* ── 2. busca global ─────────────────────────────────────────────────── */
  await u.ir("/");
  await page.keyboard.press("Control+k");
  await page.waitForTimeout(400);
  await page.keyboard.type("1.234,56");
  await page.waitForTimeout(2500);
  const hit = page.locator('[role="dialog"] button, [role="dialog"] [role="option"]', { hasText: /1\.234,56/ }).first();
  v.ok(await hit.count() > 0, "a busca por \"1.234,56\" acha o título");
  if (await hit.count()) {
    await hit.click();
    await page.waitForURL(/contas-a-pagar\/titulos\?busca=/, { timeout: 20000 });
    await page.waitForTimeout(2500);
    t = plano(await u.texto());
    v.ok(/1\.234\s*,56/.test(t), "a busca abre a lista de títulos já filtrada no título", page.url());
  }

  /* ── 3. edição em massa ──────────────────────────────────────────────── */
  const linhas = page.locator("main tbody tr");
  v.ok(await linhas.count() === 1, "a lista filtrada pela busca mostra só aquele título", String(await linhas.count()));
  const catAntes = plano(await linhas.first().innerText());
  await linhas.first().locator("label").first().click();
  await page.getByRole("button", { name: /Editar em massa \(1\)/ }).click();
  await page.waitForTimeout(800);
  const novo = page.locator('select[aria-label="Novo valor da edição em massa"]');
  const opcoes = await novo.locator("option").allInnerTexts();
  const alvo = opcoes.find((o) => o && !/Escolha/.test(o) && !catAntes.includes(o));
  if (alvo) await novo.selectOption({ label: alvo });
  await page.waitForTimeout(400);
  const planoTxt = plano(await page.locator("[data-plano-edicao]").innerText().catch(() => ""));
  v.ok(/Vão mudar 1 título/.test(planoTxt) && /1\.234\s*,56/.test(planoTxt) && planoTxt.includes(alvo ?? "§"), "o plano mostra quantos, quanto e o de→para ANTES de aplicar", planoTxt);
  await page.getByRole("button", { name: /Aplicar a 1 título/ }).click();
  await page.waitForTimeout(2000);
  const catDepois = plano(await page.locator("main tbody tr").first().innerText().catch(() => ""));
  v.ok(!!alvo && catDepois.includes(alvo), "a nova categoria aparece na lista", `${alvo} · ${catDepois}`);
  const catDe = (planoTxt.match(/Categoria: (.+?) →/) ?? [])[1] ?? "§";

  /* ── 4. extrato (do fornecedor do título, pela ficha aberta na lista) ── */
  await page.locator("main tbody tr").first().locator("td button.decoration-dotted").first().click();
  await page.waitForTimeout(2500);
  v.ok(!/Confirmar pagamento/.test(await u.texto()), "clicar no nome do fornecedor abre SÓ a ficha (não o modal de baixa por cima)");
  await extrato();

  await u.ir("/dashboard/administration/audit-logs");
  t = plano(await u.texto());
  v.ok(t.includes(`Categoria: de ${catDe} para ${alvo}`), "a troca entra na trilha, com o de→para do título", catDe);

  async function extrato() {
  const secao = page.locator("[data-secao-extrato]");
  v.ok(await secao.count() === 1, "a ficha do contato tem a seção do extrato");
  const datas = secao.locator('input[type="date"]');
  await datas.nth(0).fill("2025-01-01");
  await page.waitForTimeout(400);
  const finalPrevia = brl(await secao.locator("[data-extrato-final]").innerText());
  await page.evaluate(() => { window.print = () => { window.__extrato = document.querySelector("[data-documento-impressao]")?.innerText ?? null; }; });
  await secao.getByRole("button", { name: /Gerar extrato/ }).click();
  await page.waitForTimeout(800);
  const doc = plano((await page.evaluate(() => window.__extrato)) ?? "");
  v.ok(doc.length > 0, "o extrato foi montado e mandado à impressão");
  v.ok(/CNPJ/.test(doc) && /Extrato do (cliente|fornecedor)/.test(doc), "o documento identifica a empresa e o tipo de extrato", doc.slice(0, 160));
  const totalDoc = brl((doc.match(/Total em aberto\s*(R\$\s*[\d.]+,\d{2})/) ?? [])[1] ?? "");
  v.ok(finalPrevia >= 1234.56 && totalDoc === finalPrevia, "o total em aberto do PDF é o da prévia — e inclui a conta de R$ 1.234,56 que vence no mês seguinte", `${finalPrevia} × ${totalDoc}`);
  await page.emulateMedia({ media: "print" });
  const soDocumento = await page.evaluate(() => {
    const d = document.querySelector("[data-documento-impressao]");
    const outros = [...document.body.children].filter((e) => e !== d && getComputedStyle(e).display !== "none");
    return !!d && getComputedStyle(d).display !== "none" && outros.length === 0;
  });
  v.ok(soDocumento, "na impressão só o documento aparece (nada da tela atrás da ficha)");
  await page.emulateMedia({ media: "screen" });
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  }

  /* ── 5. consolidado com eliminações ──────────────────────────────────── */
  await u.ir("/contabilidade?aba=consolidado");
  await page.waitForTimeout(1500);
  t = plano(await u.texto());
  v.ok(/Eliminações entre empresas/.test(t) && /Critério conservador/.test(t), "o consolidado mostra as eliminações e o critério");
  const linhasElim = await page.locator("[data-eliminacoes] tbody tr").count();
  v.ok(linhasElim >= 2, "a lista diz quem, quanto e em que competência", String(linhasElim));
  const tot = async (q) => (await page.locator(`[data-linha-total="${q}"] > span`).allInnerTexts()).map(brl);
  const antes = await tot("antes"), depois = await tot("depois");
  const totalElim = brl((await page.locator("[data-eliminacoes] tbody tr").last().locator("td").last().innerText()));
  v.ok(antes.length === 5 && Math.abs((antes[2] - depois[2]) - totalElim) < 0.01, "receita consolidada = soma das partes − eliminações", `${antes[2]} − ${totalElim} = ${depois[2]}`);
  v.ok(Math.abs(antes[4] - depois[4]) < 0.01, "o resultado é o mesmo antes e depois (os dois lados saem juntos)", `${antes[4]} × ${depois[4]}`);

  v.ok(u.erros.length === 0, "nenhum erro de página ou de console", u.erros.slice(0, 2).join(" | "));
  await u.ctx.close();
  return v.falhas();
}
