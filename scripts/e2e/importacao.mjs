/**
 * JORNADA: importar o extrato do banco — e importar DE NOVO.
 *
 * Importar é um ato que a pessoa repete (por engano, ou porque o arquivo do mês
 * seguinte contém o anterior). A segunda importação do MESMO arquivo tem de
 * gravar zero, dizer que as linhas já existiam, e não mexer em número nenhum.
 * E o que a pessoa criou ANTES de importar não pode sumir — era o defeito da
 * demonstração: a importação substituía o dataset inteiro.
 */
import { resolve } from "node:path";
import { novoUsuario, verificador, brl } from "./kit.mjs";

const ARQUIVO = resolve("public/exemplos/extrato-exemplo-quattro.csv");

async function importar(u) {
  await u.ir("/upload?aba=enviar");
  await u.page.locator('input[type="file"]').first().setInputFiles(ARQUIVO);
  const botao = u.page.getByRole("button", { name: /Confirmar e gravar/ });
  await botao.waitFor({ timeout: 60000 });
  await u.page.waitForTimeout(1500);
  const rotulo = (await botao.textContent()) ?? "";
  const n = Number((rotulo.match(/gravar\s+([\d.]+)/) ?? [])[1]?.replace(/\./g, "") ?? NaN);
  return { botao, n, texto: (await u.texto()).replace(/\n/g, " ") };
}

async function dreResumo(u) {
  await u.ir("/dashboard/reports/dre");
  const t = (await u.texto()).replace(/\n/g, " ");
  const m = t.match(/Receita Bruta Operacional[^R]*R\$\s*([\d.,]+)/);
  return m ? brl(m[1]) : NaN;
}

export default async function importacao(navegador) {
  const v = verificador("importacao");
  const u = await novoUsuario(navegador);

  // Algo criado ANTES de importar: uma transferência (dois lançamentos).
  await u.ir("/dashboard/financial/accounts-and-transfers?novo=1");
  const sel = u.page.locator('select[aria-label="Selecione uma conta"]');
  await sel.nth(0).selectOption({ index: 1 });
  await sel.nth(1).selectOption({ index: 2 });
  await u.page.locator('input[placeholder="0,00"]').first().fill("12345");
  await u.page.getByRole("button", { name: "Salvar transferência" }).click();
  await u.page.waitForTimeout(1500);

  const primeira = await importar(u);
  v.ok(primeira.n > 300, "a primeira importação oferece as linhas do arquivo", `${primeira.n} a gravar`);
  await primeira.botao.click();
  await u.page.getByText("Importação confirmada").waitFor({ timeout: 30000 });
  const conf = (await u.texto()).replace(/\n/g, " ");
  v.ok(new RegExp(`Lançamentos\\s*${primeira.n}`).test(conf) || conf.includes(String(primeira.n)),
    "a confirmação diz quantos lançamentos entraram");

  const receita1 = await dreResumo(u);
  v.ok(receita1 > 0, "o DRE passa a ter receita do extrato", String(receita1));

  await u.ir("/dashboard/financial/accounts-and-transfers");
  v.ok(/123\s*,45/.test((await u.texto()).replace(/\n/g, " ")),
    "a transferência criada ANTES da importação continua lá");

  const segunda = await importar(u);
  v.ok(segunda.n === 0, "reimportar o MESMO arquivo não oferece nada para gravar", `${segunda.n} a gravar`);
  v.ok(await segunda.botao.isDisabled(), "o botão de gravar fica desligado");
  v.ok(/ficam de fora por já existirem/.test(segunda.texto), "a tela diz que as linhas já existiam");
  const outro = u.page.getByRole("button", { name: /Confirmar importação/ });
  v.ok((await outro.count()) === 0 || (await outro.first().isDisabled()),
    "o segundo botão de confirmar também não grava (as duas portas contam igual)");

  const receita2 = await dreResumo(u);
  v.ok(receita2 === receita1, "o DRE não muda com a reimportação", `${receita1} → ${receita2}`);
  v.ok(u.erros.length === 0, "nenhum erro de página ou de console", u.erros.slice(0, 2).join(" | "));
  await u.ctx.close();
  return v.falhas();
}
