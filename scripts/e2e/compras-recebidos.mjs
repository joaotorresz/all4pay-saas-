/**
 * JORNADA: a caixa de entrada fiscal — boleto pela linha digitável, nota pela
 * chave de acesso.
 *
 * Confere, com VALORES:
 *  - a linha digitável de um boleto Bradesco de R$ 842,17 vencendo em
 *    20/10/2026 é LIDA (banco, valor, vencimento, dígitos) antes de entrar;
 *  - a linha com UM dígito trocado é denunciada e NÃO entra;
 *  - lançar pede a conta e a categoria (não pega a primeira da lista) e o
 *    título aparece em Títulos a pagar com o valor, a data e a categoria
 *    escolhida; o fluxo de caixa sobe esse valor;
 *  - colar o MESMO boleto de novo não o substitui (continua "Lançado") e não
 *    cria segundo título;
 *  - a chave de acesso de uma NF-e de MG é lida (UF, emissão, CNPJ, série,
 *    número); a chave com dígito errado não entra; aprovar a nota a marca, e
 *    colar a mesma chave de novo não a devolve para "pendente";
 * e nenhum erro de página ou de console.
 */
import { novoUsuario, verificador, brl } from "./kit.mjs";

const LINHA = "23799876504321098765743210987657516050000084217";
const CHAVE = "31260911222333000181550020000043211876543219";

const limpo = (s) => s.replace(/\s+/g, " ").replace(/ ,/g, ",");
/** O texto da linha que contém `texto` — vazio quando ela sumiu (sem esperar 30s). */
const linhaCom = async (p, texto) => {
  const l = p.locator("main table tbody tr", { hasText: texto });
  return (await l.count()) ? limpo(await l.first().innerText()) : "";
};

async function titulosDoMes(u, mes) {
  await u.ir(`/contas-a-pagar/titulos?mes=${mes}`);
  return u.page.evaluate(() => [...document.querySelectorAll("main table tbody tr")]
    .map((tr) => [...tr.querySelectorAll("td")].map((td) => td.innerText.replace(/\s+/g, " ").replace(/ ,/g, ",").trim()).join(" | ")));
}
async function saidasProjetadas(u) {
  await u.ir("/fluxo-caixa");
  const rot = await u.page.locator('button[aria-label^="Saídas projetadas"]').first().textContent();
  const m = /R\$\s*([\d.]+)\s*,\s*(\d{2})/.exec(rot ?? "");
  return m ? brl(`${m[1]},${m[2]}`) : NaN;
}

export default async function comprasRecebidos(navegador) {
  const v = verificador("compras-recebidos");
  const u = await novoUsuario(navegador);
  const p = u.page;

  const em30 = await p.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + 30); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; });
  const saidas0 = await saidasProjetadas(u);
  const antesOut = (await titulosDoMes(u, "2026-10")).filter((l) => l.includes("842,17")).length;

  /* ---- boleto: a linha errada não entra ---- */
  await u.ir("/dashboard/purchases/received-boletos");
  const campo = p.getByPlaceholder("00000.00000 00000.000000 00000.000000 0 00000000000000");
  const errada = LINHA.slice(0, 12) + (LINHA[12] === "9" ? "0" : "9") + LINHA.slice(13);
  await campo.fill(errada);
  await p.waitForTimeout(300);
  let t = limpo(await u.texto());
  v.ok(!/Dígitos conferem/.test(t) && await p.getByRole("button", { name: "Adicionar" }).isDisabled(),
    "a linha com um dígito trocado é denunciada e o botão fica travado");

  /* ---- boleto: a linha certa é lida ---- */
  await campo.fill(LINHA);
  await p.getByPlaceholder("Beneficiário (opcional)").fill("Gráfica Aurora");
  await p.waitForTimeout(300);
  t = limpo(await u.texto());
  v.ok(/237 · Bradesco/.test(t) && /R\$ ?842,17/.test(t) && /20\/10\/2026/.test(t) && /Dígitos conferem/.test(t),
    "a leitura mostra banco 237 Bradesco, R$ 842,17, vencimento 20/10/2026 e os dígitos conferidos");
  await p.getByRole("button", { name: "Adicionar" }).click();
  await p.waitForTimeout(500);
  const linhaBoleto = p.locator("main table tbody tr", { hasText: "Gráfica Aurora" }).first();
  v.ok(await linhaBoleto.count() === 1, "o boleto entra na caixa de entrada");

  /* ---- lançar: conta e categoria escolhidas ---- */
  await linhaBoleto.getByRole("button", { name: "Lançar em contas a pagar" }).click();
  await p.waitForTimeout(300);
  const botaoLancar = p.getByRole("button", { name: /^Lançar/ }).last();
  v.ok(await botaoLancar.isDisabled(), "sem conta e categoria escolhidas, lançar fica travado");
  await p.locator("main select").filter({ has: p.locator("option", { hasText: "Escolha a conta" }) }).first().selectOption({ index: 1 });
  await p.locator("main select").filter({ has: p.locator("option", { hasText: "Escolha a categoria" }) }).first().selectOption({ label: "Marketing" });
  await botaoLancar.click();
  await p.waitForTimeout(1500);
  t = limpo(await u.texto());
  v.ok(/Boleto lançado em contas a pagar · vence 20\/10\/2026/.test(t), "a tela confirma o lançamento com o vencimento");
  v.ok(/Lançado/.test(await linhaCom(p, "Gráfica Aurora")),
    "a linha passa a dizer 'Lançado'");

  const out = await titulosDoMes(u, "2026-10");
  const doBoleto = out.filter((l) => l.includes("842,17") && l.includes("20/10/2026"));
  v.ok(doBoleto.length === antesOut + 1 && doBoleto.some((l) => l.includes("Marketing")),
    "Títulos a pagar tem o boleto: 842,17 em 20/10/2026, na categoria ESCOLHIDA (Marketing)", doBoleto.join(" || "));
  const saidas1 = await saidasProjetadas(u);
  const esperado = "2026-10-20" <= em30 ? 842.17 : 0;
  v.ok(Math.abs((saidas1 - saidas0) - esperado) < 0.011, "o fluxo de caixa sobe o valor do boleto", `${saidas0} → ${saidas1}`);

  /* ---- o mesmo boleto de novo: nada muda ---- */
  await u.ir("/dashboard/purchases/received-boletos");
  await p.getByPlaceholder("00000.00000 00000.000000 00000.000000 0 00000000000000").fill(LINHA);
  await p.waitForTimeout(300);
  await p.getByRole("button", { name: "Adicionar" }).click();
  await p.waitForTimeout(500);
  t = limpo(await u.texto());
  v.ok(/já está na caixa de entrada/.test(t), "colar o mesmo boleto avisa que ele já está lá");
  const linhas = await p.locator("main table tbody tr", { hasText: "Bradesco" }).count();
  v.ok(linhas === 1 && /Lançado/.test(await linhaCom(p, "Gráfica Aurora")),
    "e ele continua UM boleto, ainda 'Lançado' (não voltou a oferecer o lançamento)");
  const out2 = await titulosDoMes(u, "2026-10");
  v.ok(out2.filter((l) => l.includes("842,17") && l.includes("20/10/2026")).length === antesOut + 1, "e nenhum segundo título");

  /* ---- NF-e pela chave ---- */
  await u.ir("/dashboard/purchases/received-invoices");
  const campoChave = p.getByPlaceholder("Chave de acesso (44 dígitos)");
  await campoChave.fill(CHAVE.slice(0, 43) + String((Number(CHAVE[43]) + 1) % 10));
  await p.waitForTimeout(300);
  t = limpo(await u.texto());
  v.ok(/Dígito verificador não confere/.test(t) && await p.getByRole("button", { name: "Adicionar" }).isDisabled(),
    "a chave com o dígito errado é denunciada e não entra");
  await campoChave.fill(CHAVE);
  await p.getByPlaceholder("Fornecedor (opcional)").fill("Metalúrgica Serra");
  await p.getByPlaceholder("Valor").fill("1.300,00");
  await p.waitForTimeout(300);
  t = limpo(await u.texto());
  v.ok(/UF\s*MG/.test(t) && /09\/2026/.test(t) && /11222333000181/.test(t) && /NF-e · série 2 · nº 4321/.test(t) && /Dígito confere/.test(t),
    "a chave é lida: MG, emissão 09/2026, CNPJ, NF-e série 2 nº 4321, dígito conferido");
  await p.getByRole("button", { name: "Adicionar" }).click();
  await p.waitForTimeout(500);
  let nota = await linhaCom(p, "Metalúrgica Serra");
  v.ok(/4321/.test(nota) && /NFE/.test(nota) && /1\.300,00/.test(nota), "a nota entra na lista com número, tipo e valor", nota);
  await p.locator("main table tbody tr", { hasText: "Metalúrgica Serra" }).first().getByRole("button", { name: "Aprovar nota" }).click();
  await p.waitForTimeout(400);
  nota = await linhaCom(p, "Metalúrgica Serra");
  v.ok(/Aprovada/.test(nota), "aprovar marca a nota", nota);
  await campoChave.fill(CHAVE);
  await p.waitForTimeout(300);
  await p.getByRole("button", { name: "Adicionar" }).click();
  await p.waitForTimeout(500);
  t = limpo(await u.texto());
  nota = await linhaCom(p, "4321");
  v.ok(/já está na lista/.test(t) && /Aprovada/.test(nota) && await p.locator("main table tbody tr", { hasText: "4321" }).count() === 1,
    "colar a mesma chave avisa, e a nota continua UMA e APROVADA", nota);

  v.ok(u.erros.length === 0, "nenhum erro de página ou de console", u.erros.slice(0, 2).join(" | "));
  await u.ctx.close();
  return v.falhas();
}
