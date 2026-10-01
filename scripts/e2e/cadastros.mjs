/**
 * JORNADA: os cadastros chegam ao formulário de lançamento (CAD, parte 2).
 *
 * Antes, os formulários liam o cadastro ANTIGO do navegador: a conta, o centro
 * e o projeto criados nas telas de Cadastros não apareciam no "Nova conta a
 * pagar", e em produção o id local ("5001") era recusado pelo banco. Esta
 * jornada dirige o caminho inteiro como um usuário:
 *
 *   1. a tela Contas bancárias lista exatamente as contas que a Visão geral
 *      soma — e uma conta nova com saldo de abertura move o saldo da Home;
 *   2. cria conta, centro, projeto (dois) e categoria nas telas de cadastro;
 *   3. confere que CADA um aparece no formulário de conta a pagar;
 *   4. salva o título com centro, projeto e categoria escolhidos, e confere
 *      que o título salvo MOSTRA os três;
 *   5. um título rateado 60/40 entre dois projetos mostra as duas fatias
 *      (o rateio é gravado, não descartado);
 *   6. o fornecedor com categoria padrão preenche a categoria; desativado,
 *      ele some do formulário — e a conta desativada também;
 *   7. o hub "Estrutura e cadastros" conta o que foi criado.
 */
import { novoUsuario, verificador, brl } from "./kit.mjs";

const SUF = "Jornada Cadastros";

async function salvarModal(u) {
  await u.page.getByRole("button", { name: "Salvar", exact: true }).last().click();
  await u.page.waitForTimeout(1500);
}

async function avisos(u) {
  return u.page.evaluate(() => [...document.querySelectorAll("[role=status], [role=alert], body > div.fixed")]
    .map((e) => e.textContent.trim()).filter((t) => t && t.length < 300).join(" | "));
}

/** As opções de um `SelectBusca` (abre, lê, fecha). */
async function opcoesBusca(u, botao) {
  await botao.click({ timeout: 8000 });
  await u.page.waitForTimeout(300);
  const ops = (await u.page.locator('[role="option"]').allTextContents()).map((o) => o.trim());
  await u.page.keyboard.press("Escape");
  await u.page.waitForTimeout(200);
  return ops;
}

async function escolherBusca(u, botao, texto) {
  await botao.click({ timeout: 8000 });
  await u.page.waitForTimeout(300);
  const busca = u.page.getByPlaceholder("Digite para buscar…");
  if (await busca.count()) { await busca.fill(texto); await u.page.waitForTimeout(300); }
  await u.page.locator('[role="option"]', { hasText: texto }).first().click();
  await u.page.waitForTimeout(300);
}

/** O saldo da Home ("Saldo em conta hoje"), em reais. */
async function saldoDaHome(u) {
  await u.ir("/");
  const t = await u.texto();
  const m = t.match(/Saldo em conta hoje\s*\n\s*R\$\s*\n?\s*([\d.]+)(?:\s*\n?\s*(,\d\d))?/);
  return m ? brl(`${m[1]}${m[2] ?? ",00"}`) : NaN;
}

const hojeISO = (u) => u.page.evaluate(() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
});

/** Preenche e salva uma conta a pagar; devolve a URL de destino. */
async function lancarContaAPagar(u, { conta, categoria, fornecedor, projetos = [], centros = [], valor }) {
  await u.ir("/dashboard/financial/payables/new");
  const main = u.page.locator("main");
  if (conta) await escolherBusca(u, main.locator("button", { hasText: /Busque a conta/ }).first(), conta);
  if (categoria) await escolherBusca(u, main.locator("button", { hasText: /Busque ou crie/ }).first(), categoria);
  const botaoForn = main.locator("button", { hasText: /Digite nome ou documento/ }).first();
  if (fornecedor) await escolherBusca(u, botaoForn, fornecedor);
  else {
    await botaoForn.click({ timeout: 8000 });
    await u.page.waitForTimeout(300);
    await u.page.locator('[role="option"]').first().click();
  }
  const hoje = await hojeISO(u);
  for (const d of await u.page.locator('main input[type="date"]').all()) await d.fill(hoje);
  await u.page.locator('main input[placeholder="0,00"]').first().fill(String(Math.round(valor * 100)));
  const card = (titulo) => u.page.locator("main [data-card]", { has: u.page.locator(`span:text-is("${titulo}")`) }).first();
  for (const [titulo, linhas, singular] of [["Projetos", projetos, "projeto"], ["Centros de custo", centros, "centro de custo"]]) {
    for (let k = 0; k < linhas.length; k++) {
      await card(titulo).getByRole("button", { name: "Adicionar" }).click();
      await u.page.waitForTimeout(250);
      await escolherBusca(u, card(titulo).locator("button", { hasText: new RegExp(`Busque o ${singular}`) }).last(), linhas[k].nome);
      await card(titulo).locator('input[type="number"]').nth(k).fill(String(linhas[k].pct));
    }
  }
  await u.page.getByRole("button", { name: "Salvar" }).last().click();
  await u.page.waitForTimeout(2500);
  return u.page.url();
}

export default async function cadastros(navegador) {
  const v = verificador("cadastros");
  const u = await novoUsuario(navegador);
  u.page.on("dialog", (d) => void d.accept());

  /* ── 1. Contas bancárias = as contas que a Visão geral soma ── */
  const saldoAntes = await saldoDaHome(u);
  await u.ir("/dashboard/registrations/bank-accounts");
  const saldosTela = (await u.page.locator("tbody tr").allInnerTexts())
    .map((t) => { const m = t.match(/R\$\s*\n?\s*(-?[\d.]+)\s*\n?\s*(,\d\d)/); return m ? brl(m[1] + m[2]) : 0; });
  const somaTela = Math.round(saldosTela.reduce((s, x) => s + x, 0));
  v.ok(Number.isFinite(saldoAntes) && Math.abs(somaTela - saldoAntes) <= 1,
    "a soma dos saldos em Contas bancárias é o 'Saldo em conta hoje' da Visão geral",
    `tela ${somaTela} · home ${saldoAntes}`);

  await u.page.getByRole("button", { name: "Nova conta bancária" }).first().click();
  await u.page.waitForTimeout(400);
  await u.page.getByPlaceholder("Ex.: Conta Principal, Conta Investimentos").fill(`Conta ${SUF}`);
  await u.select("Selecione o banco").selectOption({ index: 1 });
  // O campo é o CurrencyInput sob o rótulo "Saldo inicial" (o rótulo do Campo não se associa ao input).
  // O campo de dinheiro digita CENTAVOS (como o teclado de um caixa): 100000 = R$ 1.000,00.
  await u.page.locator("div:has(> label:text-is('Saldo inicial')) input").first().fill("100000");
  await salvarModal(u);
  v.ok((await u.texto()).includes(`Conta ${SUF}`), "a conta criada entra na lista", await avisos(u));
  const saldoDepois = await saldoDaHome(u);
  v.ok(Math.abs(saldoDepois - saldoAntes - 1000) <= 1,
    "a conta nova com R$ 1.000 de abertura move o saldo da Home em R$ 1.000",
    `antes ${saldoAntes} · depois ${saldoDepois}`);

  /* ── 2. Centro, projetos e categoria nas telas de cadastro ── */
  await u.ir("/dashboard/registrations/cost-centers");
  await u.page.getByRole("button", { name: "Novo centro de custo" }).first().click();
  await u.page.waitForTimeout(400);
  await u.page.getByPlaceholder("Ex.: Marketing").fill(`Centro ${SUF}`);
  await salvarModal(u);
  v.ok((await u.texto()).includes(`Centro ${SUF}`), "o centro criado entra na lista", await avisos(u));

  for (const nome of [`Projeto ${SUF}`, `Projeto B ${SUF}`]) {
    await u.ir("/dashboard/registrations/projects");
    await u.page.getByRole("button", { name: "Novo projeto" }).first().click();
    await u.page.waitForTimeout(400);
    await u.page.getByPlaceholder("Ex.: Lançamento Turma 12").fill(nome);
    await salvarModal(u);
    v.ok((await u.texto()).includes(nome), `o projeto "${nome}" entra na lista`, await avisos(u));
  }

  await u.ir("/dashboard/registrations/chart-of-accounts");
  await u.page.getByRole("button", { name: "Nova categoria ou grupo" }).first().click();
  await u.page.waitForTimeout(400);
  await u.page.getByPlaceholder("Ex.: Produto Online").fill(`Despesa ${SUF}`);
  await u.page.locator('select:has(option[value="despesa"])').last().selectOption("despesa");
  await u.page.waitForTimeout(200);
  const linhaDre = u.page.locator("select", { has: u.page.locator('option[value="despesas_operacionais"]') }).last();
  if (await linhaDre.count()) await linhaDre.selectOption("despesas_operacionais");
  await salvarModal(u);
  v.ok((await u.texto()).includes(`Despesa ${SUF}`), "a categoria criada entra no plano de contas", await avisos(u));

  /* ── 3. Cada cadastro aparece no formulário de conta a pagar ── */
  await u.ir("/dashboard/financial/payables/new");
  const main = u.page.locator("main");
  const contasForm = await opcoesBusca(u, main.locator("button", { hasText: /Busque a conta/ }).first());
  v.ok(contasForm.some((o) => o.includes(`Conta ${SUF}`)), "a conta criada é oferecida na conta a pagar", contasForm.join(" · ").slice(0, 200));
  const catsForm = await opcoesBusca(u, main.locator("button", { hasText: /Busque ou crie/ }).first());
  v.ok(catsForm.some((o) => o.endsWith(`Despesa ${SUF}`)), "a categoria criada é oferecida na conta a pagar", catsForm.join(" · ").slice(0, 200));
  v.ok(!catsForm.some((o) => /Venda de produtos|Prestação de serviços/.test(o)),
    "a conta a pagar não oferece categoria de RECEITA", catsForm.join(" · ").slice(0, 200));
  const card = (titulo) => u.page.locator("main [data-card]", { has: u.page.locator(`span:text-is("${titulo}")`) }).first();
  await card("Projetos").getByRole("button", { name: "Adicionar" }).click();
  await u.page.waitForTimeout(250);
  const projForm = await opcoesBusca(u, card("Projetos").locator("button", { hasText: /Busque o projeto/ }).first());
  v.ok(projForm.some((o) => o.includes(`Projeto ${SUF}`)), "o projeto criado é oferecido na conta a pagar", projForm.join(" · "));
  await card("Centros de custo").getByRole("button", { name: "Adicionar" }).click();
  await u.page.waitForTimeout(250);
  const ccForm = await opcoesBusca(u, card("Centros de custo").locator("button", { hasText: /Busque o centro de custo/ }).first());
  v.ok(ccForm.some((o) => o.includes(`Centro ${SUF}`)), "o centro criado é oferecido na conta a pagar", ccForm.join(" · ").slice(0, 200));

  /* ── 4. O título salvo mostra centro, projeto e categoria ── */
  const destino = await lancarContaAPagar(u, {
    conta: `Conta ${SUF}`, categoria: `Despesa ${SUF}`, fornecedor: "",
    projetos: [{ nome: `Projeto ${SUF}`, pct: 100 }], centros: [{ nome: `Centro ${SUF}`, pct: 100 }], valor: 4321,
  });
  v.ok(!destino.includes("/new"), "a conta a pagar com centro, projeto e categoria é salva", (await avisos(u)) || destino);
  const linhaTit = u.page.locator("tbody tr", { hasText: `Despesa ${SUF}` }).first();
  v.ok(await linhaTit.count() > 0, "o título aparece na lista de títulos a pagar, com a categoria escolhida");
  if (await linhaTit.count()) {
    await linhaTit.click();
    await u.page.waitForTimeout(800);
    const ficha = await u.texto();
    v.ok(/Centro de custo\s*\n?\s*Centro Jornada Cadastros/.test(ficha), "o título salvo mostra o CENTRO escolhido");
    v.ok(/Projeto\s*\n?\s*Projeto Jornada Cadastros/.test(ficha), "o título salvo mostra o PROJETO escolhido");
    v.ok(/Categoria\s*\n?\s*Despesa Jornada Cadastros/.test(ficha), "o título salvo mostra a CATEGORIA escolhida");
    await u.page.keyboard.press("Escape");
    await u.page.getByRole("button", { name: "Fechar" }).first().click().catch(() => {});
  }

  /* ── 5. Rateio 60/40: as duas fatias chegam ao título ── */
  await lancarContaAPagar(u, {
    conta: `Conta ${SUF}`, categoria: `Despesa ${SUF}`,
    projetos: [{ nome: `Projeto ${SUF}`, pct: 60 }, { nome: `Projeto B ${SUF}`, pct: 40 }], valor: 1000,
  });
  const rateado = u.page.locator("tbody tr", { hasText: `Despesa ${SUF}` });
  let achou = false;
  let temBloco = false;
  for (let i = 0; i < await rateado.count(); i++) {
    await rateado.nth(i).click();
    await u.page.waitForTimeout(600);
    const bloco = u.page.locator('[data-rateio="1"]');
    if (await bloco.count()) {
      temBloco = true;
      const t = await bloco.innerText();
      achou = /Projeto Jornada Cadastros[\s\S]*60%[\s\S]*600,00/.test(t) && /Projeto B Jornada Cadastros[\s\S]*40%[\s\S]*400,00/.test(t);
      v.ok(achou, "o título rateado mostra as duas fatias (60% = R$ 600 · 40% = R$ 400)", t.replace(/\s+/g, " "));
      break;
    }
    await u.page.getByRole("button", { name: "Fechar" }).first().click().catch(() => {});
  }
  if (!temBloco) v.ok(false, "o título rateado mostra o bloco de rateio", "nenhum título com rateio encontrado");

  /* ── 6. Fornecedor: categoria padrão preenche; inativo some; conta inativa some ── */
  await u.ir("/dashboard/registrations/suppliers");
  await u.page.getByRole("button", { name: "Novo fornecedor" }).first().click();
  await u.page.waitForTimeout(400);
  await u.page.getByPlaceholder("00.000.000/0000-00").fill("11222333000181");
  await u.page.locator("div:has(> label:text-is('Razão Social *')) input, div:has(> label:has-text('Razão Social')) input").first().fill(`Fornecedor ${SUF}`);
  await u.select("Selecione a categoria").selectOption({ label: `Despesa ${SUF}` });
  await salvarModal(u);
  v.ok((await u.texto()).includes(`Fornecedor ${SUF}`), "o fornecedor criado entra na lista", await avisos(u));

  await u.ir("/dashboard/financial/payables/new");
  await escolherBusca(u, u.page.locator("main button", { hasText: /Digite nome ou documento/ }).first(), `Fornecedor ${SUF}`);
  await u.page.waitForTimeout(500);
  const catPreenchida = await u.page.locator("main button", { hasText: `Despesa ${SUF}` }).count();
  v.ok(catPreenchida > 0, "escolher o fornecedor preenche a categoria padrão dele (default_category_id)");

  await u.ir("/dashboard/registrations/suppliers");
  await u.page.locator("tbody tr", { hasText: `Fornecedor ${SUF}` }).first().getByRole("button", { name: "Editar" }).click();
  await u.page.waitForTimeout(400);
  await u.page.getByRole("switch").last().click();
  await salvarModal(u);
  await u.ir("/dashboard/registrations/bank-accounts");
  await u.page.locator("tbody tr", { hasText: `Conta ${SUF}` }).first().getByRole("button", { name: "Desativar" }).click();
  await u.page.waitForTimeout(1200);
  await u.ir("/dashboard/financial/payables/new");
  const fornAgora = await opcoesBusca(u, u.page.locator("main button", { hasText: /Digite nome ou documento/ }).first());
  v.ok(!fornAgora.some((o) => o.includes(`Fornecedor ${SUF}`)), "o fornecedor INATIVO some do formulário", fornAgora.join(" · ").slice(0, 200));
  const contasAgora = await opcoesBusca(u, u.page.locator("main button", { hasText: /Busque a conta/ }).first());
  v.ok(!contasAgora.some((o) => o.includes(`Conta ${SUF}`)) && contasAgora.length > 0,
    "a conta INATIVA some do formulário (as outras continuam)", contasAgora.join(" · "));

  /* ── 7. O hub conta o que foi criado e diz o que falta ── */
  await u.ir("/dashboard/registrations");
  const hub = await u.texto();
  v.ok(hub.includes("O que falta para lançar") && hub.includes("Nível 6"), "o hub mostra o checklist e os sete níveis");
  const qtd = async (rotulo) => Number(await u.page.locator(`[data-item-estrutura="${rotulo}"] [data-quantidade]`).first().getAttribute("data-quantidade"));
  v.ok(await qtd("Projetos") === 2, "o hub conta os dois projetos criados", String(await qtd("Projetos")));
  v.ok(await qtd("Contas bancárias") === 5, "o hub conta as cinco contas (quatro da demonstração + a nova)", String(await qtd("Contas bancárias")));

  v.ok(u.erros.length === 0, "nenhum erro de página ou de console", u.erros.slice(0, 2).join(" | "));
  await u.ctx.close();
  return v.falhas();
}
