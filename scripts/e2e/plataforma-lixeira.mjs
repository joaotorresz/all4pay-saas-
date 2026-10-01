/**
 * JORNADA: a Lixeira — um título CANCELADO é lançado de novo.
 *
 * Cancelado é terminal (decisão do dono): "Lançar de novo" cria um título
 * NOVO com os mesmos dados de negócio, e o cancelado sai da lista. Esta
 * jornada confere o DINHEIRO, não só a mensagem: o total de "Contas a pagar"
 * cai exatamente pelo valor cancelado e volta exatamente a ele depois de
 * lançar de novo — com um título de id NOVO, procedência manual, mesma conta,
 * mesmo valor e mesmo vencimento —, e lançar de novo não duplica (um clique,
 * um título).
 *
 * ⚠️ A demonstração não tem tela que cancele um título (em produção quem
 * cancela é a máquina de estados da Central). O cancelamento é SIMULADO no
 * dataset local — é a única parte que não passa pela tela.
 */
import { novoUsuario, verificador, brl } from "./kit.mjs";

async function contasAPagar(u) {
  await u.ir("/contas-a-pagar/titulos");
  const t = (await u.texto()).replace(/\n/g, " ");
  const m = t.match(/Contas a pagar \((\d+)\)\s*R\$\s*([\d.\s]+,\s*\d{2})/);
  return m ? { n: Number(m[1]), total: brl(m[2]) } : { n: NaN, total: NaN };
}

export default async function lixeira(navegador) {
  const v = verificador("plataforma-lixeira");
  const u = await novoUsuario(navegador);

  // Materializa o dataset local da demonstração (uma transferência entre contas
  // próprias: não mexe em "Contas a pagar").
  await u.ir("/dashboard/financial/accounts-and-transfers?novo=1");
  const contas = u.page.locator('select[aria-label="Selecione uma conta"]');
  await contas.nth(0).selectOption({ index: 1 });
  await contas.nth(1).selectOption({ index: 2 });
  await u.page.locator('input[placeholder="0,00"]').first().fill("1000");
  await u.page.getByRole("button", { name: "Salvar transferência" }).click();
  await u.page.waitForTimeout(1500);

  const antes = await contasAPagar(u);
  v.ok(antes.n > 1 && antes.total > 0, "Contas a pagar do mês tem títulos para começar", `${antes.n} · ${antes.total}`);

  // O título que vai ser cancelado: o primeiro a pagar pendente do mês corrente.
  const alvo = await u.page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem("a4p_imported_dataset") || "null");
    const hoje = new Date();
    const mes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
    const m = d?.movements.find((x) => x.type === "saida" && x.status === "pendente" && x.due_date.startsWith(mes));
    if (!m) return null;
    m.status = "cancelado";
    localStorage.setItem("a4p_imported_dataset", JSON.stringify(d));
    return { id: m.id, amount: m.amount, due_date: m.due_date, account_id: m.account_id, description: m.description };
  });
  v.ok(!!alvo, "há um título a pagar pendente no mês para cancelar", JSON.stringify(alvo));
  if (!alvo) { await u.ctx.close(); return v.falhas(); }

  const cancelado = await contasAPagar(u);
  v.ok(cancelado.n === antes.n - 1 && Math.abs(cancelado.total - (antes.total - alvo.amount)) < 0.01,
    "cancelar tira o título — e o valor exato — de Contas a pagar", `${antes.total} → ${cancelado.total} (−${alvo.amount})`);

  await u.ir("/lixeira");
  const lista = (await u.texto()).replace(/\n/g, " ");
  const valorTxt = alvo.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
  v.ok(lista.replace(/\s/g, "").includes(valorTxt.replace(/\s/g, "")), "o cancelado aparece na Lixeira com o valor", valorTxt);
  const botoes = u.page.getByRole("button", { name: "Lançar de novo" });
  v.ok(await botoes.count() === 1, "um botão Lançar de novo por cancelado", String(await botoes.count()));
  await botoes.first().click();
  await u.page.waitForTimeout(1500);
  const depoisTxt = (await u.texto()).replace(/\n/g, " ");
  v.ok(/Lançado de novo/.test(depoisTxt), "a tela confirma o lançamento novo");
  v.ok(await u.page.getByRole("button", { name: "Lançar de novo" }).count() === 0, "o cancelado sai da lista (não dá para lançar duas vezes)");

  const ds = await u.page.evaluate(() => JSON.parse(localStorage.getItem("a4p_imported_dataset") || "null"));
  const novos = ds.movements.filter((x) => x.id !== alvo.id && x.amount === alvo.amount && x.due_date === alvo.due_date && x.type === "saida" && x.status === "pendente");
  v.ok(novos.length === 1, "existe exatamente UM título novo com o mesmo valor e vencimento", String(novos.length));
  v.ok(novos[0]?.account_id === alvo.account_id && novos[0]?.description === alvo.description && novos[0]?.origem === "manual",
    "o título novo tem a mesma conta e descrição, com procedência manual", JSON.stringify(novos[0] ?? {}).slice(0, 200));
  v.ok(!ds.movements.some((x) => x.id === alvo.id), "o cancelado não fica no dataset ao lado do novo");

  const depois = await contasAPagar(u);
  v.ok(depois.n === antes.n && Math.abs(depois.total - antes.total) < 0.01,
    "Contas a pagar volta EXATAMENTE ao total de antes do cancelamento", `${antes.total} → ${depois.total}`);

  v.ok(u.erros.length === 0, "nenhum erro de página ou de console", u.erros.slice(0, 2).join(" | "));
  await u.ctx.close();
  return v.falhas();
}
