/**
 * JORNADA: uma transferência entre contas próprias NÃO é receita nem gasto —
 * também para a Quattro AI.
 *
 * ⚠️ Por que existe (revisão de 01/10/2026): o DRE e a jornada `transferencia`
 * já provam que a transferência não mexe no resultado. A IA, não: "quanto
 * gastei esse mês?" somava a perna de saída e "quanto faturei?" a de entrada
 * (o mesmo dinheiro, só mudando de conta). Aqui a transferência é CRIADA pela
 * tela e a IA é perguntada antes e depois: gasto e faturamento ficam parados,
 * e só o "quanto entrou" (caixa) anda — pelo valor exato, e dito como "não é
 * faturamento".
 */
import { novoUsuario, verificador, brl } from "./kit.mjs";
import { perguntar } from "./ia-numeros.mjs";

const RS = "R\\$\\s?(-?[\\d.]+,\\d{2})";
const num = (txt, re) => { const m = txt.match(re); return m ? brl(m[1]) : NaN; };

async function ler(u) {
  await u.ir("/quattro-ai");
  const gasto = num(await perguntar(u, "quanto gastei esse mês?"), new RegExp(`gastos pagos em \\S+ somam ${RS}`));
  const fat = num(await perguntar(u, "quanto faturei esse mês?"), new RegExp(`receita recebida em \\S+ soma ${RS}`));
  const rEnt = await perguntar(u, "quanto entrou esse mês?");
  const entrou = num(rEnt, new RegExp(`(?:Entraram|receita recebida em \\S+ soma) ${RS}`));
  return { gasto, fat, entrou, rEnt };
}

export default async function iaReceita(navegador) {
  const v = verificador("ia-receita");
  const u = await novoUsuario(navegador);

  const antes = await ler(u);
  v.ok([antes.gasto, antes.fat, antes.entrou].every((x) => Number.isFinite(x) && x > 0), "a IA responde gasto, faturamento e entradas do mês", JSON.stringify({ g: antes.gasto, f: antes.fat, e: antes.entrou }));

  // CRIAR: transferência de R$ 1.234,56 entre duas contas da empresa
  await u.ir("/dashboard/financial/accounts-and-transfers?novo=1");
  await u.page.locator('select[aria-label="Selecione uma conta"]').nth(0).selectOption({ index: 1 });
  await u.page.locator('select[aria-label="Selecione uma conta"]').nth(1).selectOption({ index: 2 });
  await u.page.locator('input[placeholder="0,00"]').first().fill("123456");
  await u.page.getByRole("button", { name: "Salvar transferência" }).click();
  await u.page.waitForTimeout(2000);
  v.ok(/1\.234\s*,56/.test((await u.texto()).replace(/\n/g, " ")), "a transferência de R$ 1.234,56 aparece na lista");

  const depois = await ler(u);
  v.ok(Math.abs(depois.gasto - antes.gasto) < 0.005, "o GASTO do mês não muda (a saída foi para outra conta da empresa)", `${antes.gasto} → ${depois.gasto}`);
  v.ok(Math.abs(depois.fat - antes.fat) < 0.005, "o FATURAMENTO do mês não muda", `${antes.fat} → ${depois.fat}`);
  v.ok(Math.abs(depois.entrou - antes.entrou - 1234.56) < 0.005, "o que ENTROU no caixa sobe exatamente R$ 1.234,56", `${antes.entrou} → ${depois.entrou}`);
  v.ok(/não são faturamento/.test(depois.rEnt), "e a resposta diz que essa parte não é faturamento", depois.rEnt.slice(0, 160));

  v.ok(u.erros.length === 0, "nenhum erro de página ou de console", u.erros.slice(0, 2).join(" | "));
  await u.ctx.close();
  return v.falhas();
}
