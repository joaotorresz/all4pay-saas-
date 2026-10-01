/**
 * JORNADA: depreciação e amortização do mês, do cronograma ao razão.
 *
 * 1. "Lançar no razão" posta o lançamento consolidado do mês: as contas de
 *    despesa (4.3.01 · 4.3.02) e a conta de ativo (1.2.99) mudam pelo valor
 *    exato que o cronograma mostra, e o balancete continua fechando.
 * 2. Clicar de novo não duplica — e a tela DIZ que já estava lá (dizia
 *    "Lançado no razão" e o razão não mudava).
 * 3. Mudar um cronograma e lançar de novo é RECUSADO com o valor que está no
 *    razão (antes a tela anunciava "Lançado" e o razão ficava com o antigo).
 * 4. Estornado o lançamento no Razão, o valor novo entra — a chave não fica
 *    presa para sempre.
 */
import { novoUsuario, verificador, brl } from "./kit.mjs";

const valorBRL = (t) => { const s = t.replace(/\s+/g, ""); return (/^[−-]/.test(s) ? -1 : 1) * brl(s.replace(/^[−-]/, "")); };

async function razao(u) {
  await u.ir("/contabilidade?aba=razao");
  await u.page.locator("[data-n-lancamentos]").waitFor({ timeout: 30000 });
  const bal = Object.fromEntries(await u.page.locator("[data-conta]").evaluateAll((els) =>
    els.map((e) => [e.getAttribute("data-conta"), e.querySelector("[data-saldo]").innerText])));
  const saldo = (c) => (bal[c] ? valorBRL(bal[c]) : 0);
  return {
    n: Number(await u.page.locator("[data-n-lancamentos]").getAttribute("data-n-lancamentos")),
    dep: saldo("4.3.01"), amort: saldo("4.3.02"), ativo: saldo("1.2.99"),
    deb: valorBRL(await u.page.locator('[data-total="debito"]').innerText()),
    cred: valorBRL(await u.page.locator('[data-total="credito"]').innerText()),
  };
}

async function lancar(u) {
  await u.ir("/contabilidade?aba=cronogramas");
  const total = valorBRL((await u.texto()).match(/Total a lançar \(saída\)\s*([\s\S]*?,\d{2})/)[1]);
  await u.page.getByRole("button", { name: "Lançar no razão" }).click();
  await u.page.waitForTimeout(1500);
  const msg = (await u.texto()).match(/(Depreciação e amortização de [^\n]*|A depreciação e amortização de [^\n]*|Falha: [^\n]*)/)?.[0] ?? "";
  return { total, msg };
}

export default async function contabilCronogramas(navegador) {
  const v = verificador("contabil-cronogramas");
  const u = await novoUsuario(navegador);

  const a = await razao(u);
  const l1 = await lancar(u);
  v.ok(l1.total > 0, "o cronograma tem o que lançar no mês", String(l1.total));
  v.ok(/lançadas no razão/.test(l1.msg) && l1.msg.includes(l1.total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })), "a tela diz o valor lançado", l1.msg);
  const b = await razao(u);
  v.ok(b.n === a.n + 1, "um lançamento a mais no razão", `${a.n} → ${b.n}`);
  v.ok(Math.abs((b.dep + b.amort) - (a.dep + a.amort) - l1.total) < 0.01, "as despesas de depreciação e amortização sobem o total do mês", `${a.dep + a.amort} → ${b.dep + b.amort}`);
  v.ok(Math.abs(b.ativo - a.ativo + l1.total) < 0.01, "a conta do ativo cai o mesmo valor", `${a.ativo} → ${b.ativo}`);
  v.ok(Math.abs(b.deb - b.cred) < 0.01, "o balancete continua fechando");

  // 2. De novo, sem mudar nada.
  const l2 = await lancar(u);
  v.ok(/já estava no razão com este mesmo valor/.test(l2.msg), "o segundo clique diz que já estava lá (não anuncia 'lançado')", l2.msg);
  const c = await razao(u);
  v.ok(c.n === b.n && Math.abs(c.dep + c.amort - (b.dep + b.amort)) < 0.01, "e nada duplica", `${b.n} → ${c.n}`);

  // 3. Muda um cronograma: a licença passa de R$ 12.000 para R$ 24.000 (parcela +R$ 1.000).
  await u.ir("/contabilidade?aba=cronogramas");
  await u.page.getByRole("button", { name: "Editar" }).first().click();
  const campo = u.page.getByLabel("Valor total", { exact: true });
  await campo.fill("");
  await campo.type("2400000");
  await u.page.getByRole("button", { name: "Salvar cronograma" }).click();
  await u.page.waitForTimeout(800);
  const l3 = await lancar(u);
  v.ok(Math.abs(l3.total - l1.total - 1000) < 0.01, "o lançamento do mês passa a ser R$ 1.000,00 maior", `${l1.total} → ${l3.total}`);
  v.ok(/Falha: Já existe no razão .* com outro valor/.test(l3.msg) && l3.msg.includes(l1.total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })),
    "lançar o valor novo é RECUSADO, nomeando o valor que está no razão", l3.msg);
  const d = await razao(u);
  v.ok(d.n === c.n && Math.abs(d.dep + d.amort - (c.dep + c.amort)) < 0.01, "e o razão não muda calado", `${c.n} → ${d.n}`);

  // 4. Estorna o lançamento antigo no Razão e lança de novo.
  await u.page.getByRole("button", { name: /^Depreciação\/amortização/ }).first().click();
  await u.page.getByRole("button", { name: "Estornar", exact: true }).click();
  await u.page.getByLabel("Motivo do estorno").fill("Cronograma da licença corrigido");
  await u.page.getByRole("button", { name: "Confirmar estorno" }).click();
  await u.page.waitForTimeout(1500);
  const l4 = await lancar(u);
  v.ok(/lançadas no razão/.test(l4.msg), "depois do estorno, o valor novo entra", l4.msg);
  const e = await razao(u);
  v.ok(e.n === a.n + 3, "lançamento original, estorno e o novo — nada apagado", `${a.n} → ${e.n}`);
  v.ok(Math.abs((e.dep + e.amort) - (a.dep + a.amort) - l3.total) < 0.01, "as despesas do mês ficam com o valor NOVO (o antigo foi anulado pelo estorno)", `${a.dep + a.amort} → ${e.dep + e.amort} (esperado +${l3.total})`);
  v.ok(Math.abs(e.ativo - a.ativo + l3.total) < 0.01, "e a conta do ativo também", `${e.ativo}`);
  v.ok(Math.abs(e.deb - e.cred) < 0.01, "o balancete continua fechando");

  v.ok(u.erros.length === 0, "nenhum erro de página ou de console", u.erros.slice(0, 2).join(" | "));
  await u.ctx.close();
  return v.falhas();
}
