/**
 * JORNADA: a hierarquia de cadastros — do cadastro até o lançamento.
 *
 * Os cadastros passaram a morar numa casa só (as tabelas do banco; em
 * demonstração, o dataset). Esta jornada confere a morada pelo lado de quem
 * USA o cadastro, não de quem o edita:
 *
 *   1. a conta criada em Contas bancárias aparece na transferência;
 *   2. a conta que ficou só no navegador (o rastro antigo) aparece no bloco
 *      "Cadastros antigos deste navegador" e só entra no cadastro pelo botão
 *      — e, trazida, não volta a aparecer como pendência;
 *   3. no plano de contas, um grupo com subcategoria NÃO é oferecido ao
 *      lançamento (só a folha é) — é a mesma regra que o banco cobra;
 *   4. a categoria que recebeu lançamento não vai para a lixeira, e a tela diz
 *      QUANTOS lançamentos ela tem antes de recusar;
 *   5. a categoria sem lançamento vai, depois da confirmação;
 *   6. o centro de custo filho aparece sob o grupo, e o projeto encerrado diz
 *      que está encerrado.
 */
import { novoUsuario, verificador } from "./kit.mjs";

const plano = "/dashboard/registrations/chart-of-accounts";

async function salvarModal(u) {
  await u.page.getByRole("button", { name: "Salvar", exact: true }).last().click();
  await u.page.waitForTimeout(1500);
}

const linha = (u, nome) => u.page.locator("tbody tr", { hasText: nome }).first();

async function avisos(u) {
  // O toast do cadastro não tem papel ARIA: ele é o `div.fixed` que o portal
  // pendura direto no <body>. Lê os dois, para a falha dizer o que a tela disse.
  return u.page.evaluate(() => [...document.querySelectorAll("[role=status], [role=alert], body > div.fixed")]
    .map((e) => e.textContent.trim()).filter((t) => t && t.length < 300).join(" | "));
}

export default async function cad(navegador) {
  const v = verificador("cad");
  const u = await novoUsuario(navegador);
  const dialogos = [];
  u.page.on("dialog", (d) => { dialogos.push(d.message()); void d.accept(); });

  /* ── 1. Conta bancária: do cadastro para a transferência ── */
  await u.ir("/dashboard/registrations/bank-accounts");
  const contas = await u.texto();
  v.ok(contas.includes("Itaú · Conta Movimento"), "Contas bancárias lista as contas da empresa");
  await u.page.getByRole("button", { name: "Nova conta bancária" }).first().click();
  await u.page.waitForTimeout(400);
  await u.page.getByPlaceholder("Ex.: Conta Principal, Conta Investimentos").fill("Conta Jornada CAD");
  await u.select("Selecione o banco").selectOption({ index: 1 });
  await salvarModal(u);
  v.ok((await u.texto()).includes("Conta Jornada CAD"), "a conta criada entra na lista", await avisos(u));

  await u.ir("/dashboard/financial/accounts-and-transfers?novo=1");
  const opcoesConta = await u.page.locator('select[aria-label="Selecione uma conta"]').first()
    .locator("option").allTextContents();
  v.ok(opcoesConta.some((o) => o.includes("Conta Jornada CAD")), "a conta criada é oferecida na transferência",
    opcoesConta.join(" · ").slice(0, 160));

  /* ── 2. O rastro antigo: só entra pelo botão ── */
  await u.page.evaluate(() => localStorage.setItem("a4p_contas_bancarias", JSON.stringify([{
    id: "antiga-1", nome: "Conta Antiga CAD", banco: "itau", tipo: "corrente", agencia: "0001",
    numero: "999-1", dataSaldoInicial: "", saldoInicial: 0, codigoContabil: "77",
    diaFechamento: null, diaVencimento: null, ativo: true,
  }])));
  await u.ir("/dashboard/registrations/bank-accounts");
  const bloco = u.page.locator('[data-bloco="cadastros-antigos"]');
  v.ok(await bloco.count() > 0 && (await bloco.innerText()).includes("Conta Antiga CAD"),
    "a conta que só existe no navegador aparece no bloco de cadastros antigos");
  v.ok(await u.page.locator("tbody tr", { hasText: "Conta Antiga CAD" }).count() === 0,
    "o rastro antigo NÃO entra na lista sozinho");
  await bloco.getByRole("button", { name: "Trazer para o cadastro" }).first().click();
  await u.page.waitForTimeout(1500);
  v.ok(await u.page.locator("tbody tr", { hasText: "Conta Antiga CAD" }).count() > 0,
    "trazida, a conta entra no cadastro", await avisos(u));
  await u.ir("/dashboard/registrations/bank-accounts");
  v.ok(await u.page.locator('[data-bloco="cadastros-antigos"]').count() === 0,
    "depois de trazida, ela não volta como pendência");

  /* ── 3. Plano de contas: grupo com folha — só a folha recebe lançamento ── */
  await u.ir(plano);
  await u.page.getByRole("button", { name: "Nova categoria ou grupo" }).first().click();
  await u.page.waitForTimeout(400);
  await u.page.getByPlaceholder("Ex.: Produto Online").fill("Grupo Jornada CAD");
  await salvarModal(u);
  await linha(u, "Grupo Jornada CAD").getByRole("button", { name: "Subcategoria" }).click();
  await u.page.waitForTimeout(400);
  await u.page.getByPlaceholder("Ex.: Produto Online").fill("Folha Jornada CAD");
  await salvarModal(u);
  await u.page.getByRole("button", { name: "Nova categoria ou grupo" }).first().click();
  await u.page.waitForTimeout(400);
  await u.page.getByPlaceholder("Ex.: Produto Online").fill("Sobra Jornada CAD");
  await salvarModal(u);
  const arvore = await u.texto();
  v.ok(["Grupo Jornada CAD", "Folha Jornada CAD", "Sobra Jornada CAD"].every((n) => arvore.includes(n)),
    "o grupo, a subcategoria e a categoria solta entram na árvore", await avisos(u));
  v.ok((await linha(u, "Grupo Jornada CAD").innerText()).includes("grupo"),
    "com uma subcategoria, a categoria vira GRUPO");

  await u.ir("/dashboard/financial/payables/new");
  await u.page.locator("main button", { hasText: /Busque a conta/ }).first().click({ timeout: 8000 });
  await u.page.waitForTimeout(300);
  await u.page.locator('[role="option"]').first().click();
  await u.page.locator("main button", { hasText: /Busque ou crie/ }).first().click({ timeout: 8000 });
  await u.page.waitForTimeout(300);
  await u.page.getByPlaceholder("Digite para buscar…").fill("Jornada CAD");
  await u.page.waitForTimeout(400);
  const opcoesCat = await u.page.locator('[role="option"]').allTextContents();
  v.ok(opcoesCat.some((o) => o.trim() === "Folha Jornada CAD"), "a subcategoria (folha) é oferecida no lançamento",
    opcoesCat.join(" · "));
  v.ok(!opcoesCat.some((o) => o.includes("Grupo Jornada CAD")), "o GRUPO não é oferecido no lançamento",
    opcoesCat.join(" · "));
  await u.page.locator('[role="option"]', { hasText: "Folha Jornada CAD" }).first().click();
  await u.page.waitForTimeout(300);
  await u.page.locator("main button", { hasText: /Digite nome ou documento/ }).first().click({ timeout: 8000 });
  await u.page.waitForTimeout(300);
  const parte = u.page.locator('[role="option"]').first();
  if (await parte.count()) await parte.click(); else await u.page.keyboard.press("Enter");
  const hoje = await u.page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; });
  for (const d of await u.page.locator('main input[type="date"]').all()) await d.fill(hoje);
  await u.page.locator('main input[placeholder="0,00"]').first().fill("12345");
  await u.page.getByRole("button", { name: "Salvar" }).last().click();
  await u.page.waitForTimeout(2500);
  v.ok(!u.page.url().includes("/new"), "a conta a pagar na subcategoria é salva", (await avisos(u)) || u.page.url());

  /* ── 4. Com lançamento, a categoria não vai para a lixeira — e a tela diz quantos ── */
  await u.ir(plano);
  await linha(u, "Folha Jornada CAD").getByRole("button", { name: "Excluir" }).click();
  await u.page.waitForTimeout(1500);
  const recusa = await avisos(u);
  v.ok(/tem 1 lançamento\(s\) e não pode ir para a lixeira/.test(recusa),
    "excluir a categoria com lançamento é recusado, dizendo quantos", recusa);
  v.ok(dialogos.length === 0, "a recusa vem ANTES da confirmação (nada é perguntado à toa)", dialogos.join(" | "));
  await linha(u, "Grupo Jornada CAD").getByRole("button", { name: "Excluir" }).click();
  await u.page.waitForTimeout(1500);
  v.ok(/subcategorias têm 1 lançamento/.test(await avisos(u)),
    "excluir o GRUPO conta os lançamentos das subcategorias", await avisos(u));
  await u.ir(plano);
  v.ok((await u.texto()).includes("Folha Jornada CAD"), "a categoria recusada continua na árvore");

  /* ── 5. Sem lançamento, vai — depois da confirmação ── */
  await linha(u, "Sobra Jornada CAD").getByRole("button", { name: "Excluir" }).click();
  await u.page.waitForTimeout(1500);
  v.ok(dialogos.some((d) => d.includes("Sobra Jornada CAD") && d.includes("não tem lançamento")),
    "a exclusão sem lançamento pede confirmação, dizendo que não há lançamento", dialogos.join(" | "));
  await u.ir(plano);
  v.ok(!(await u.texto()).includes("Sobra Jornada CAD"), "confirmada, a categoria sem lançamento sai da árvore");

  /* ── 6. Centro de custo filho e projeto encerrado ── */
  await u.ir("/dashboard/registrations/cost-centers");
  await u.page.getByRole("button", { name: "Novo centro de custo" }).first().click();
  await u.page.waitForTimeout(400);
  await u.page.getByPlaceholder("Ex.: Marketing").fill("Centro Jornada CAD");
  await u.select("Sem grupo").selectOption({ label: "Comercial" });
  await salvarModal(u);
  const centros = await u.texto();
  const iC = centros.indexOf("Comercial");
  const iF = centros.indexOf("Centro Jornada CAD");
  v.ok(iC >= 0 && iF > iC, "o centro filho entra na lista, logo abaixo do grupo", await avisos(u));

  await u.ir("/dashboard/registrations/projects");
  await u.page.getByRole("button", { name: "Novo projeto" }).first().click();
  await u.page.waitForTimeout(400);
  await u.page.getByPlaceholder("Ex.: Lançamento Turma 12").fill("Projeto Jornada CAD");
  const opcoesCentro = await u.select("Sem centro").locator("option").allTextContents();
  v.ok(opcoesCentro.some((o) => o.includes("Centro Jornada CAD")), "o centro criado é oferecido como responsável do projeto",
    opcoesCentro.join(" · "));
  await salvarModal(u);
  await linha(u, "Projeto Jornada CAD").getByRole("button", { name: "Encerrar" }).click();
  await u.page.waitForTimeout(1200);
  await u.ir("/dashboard/registrations/projects");
  v.ok((await linha(u, "Projeto Jornada CAD").innerText()).includes("Encerrado"), "o projeto encerrado diz que está encerrado");

  v.ok(u.erros.length === 0, "nenhum erro de página ou de console", u.erros.slice(0, 2).join(" | "));
  await u.ctx.close();
  return v.falhas();
}
