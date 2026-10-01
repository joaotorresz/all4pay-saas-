/**
 * JORNADA: os relatórios contábeis fecham entre si, e o drill-down abre
 * exatamente o que soma o número.
 *
 * - DFC: saldo inicial + fluxo líquido = saldo final, coluna a coluna E na
 *   coluna Total (o Total do saldo inicial era o do ÚLTIMO mês); o saldo final
 *   é o saldo das contas; e, recortado por conta, a soma dos saldos finais das
 *   contas é o saldo final de todas (cada conta partia do saldo da empresa).
 * - DRE: com um filtro de conta, o cartão "Lucro líquido" é o Resultado
 *   Líquido da tabela (o cartão ignorava o filtro).
 * - Drill-down: a gaveta de uma célula soma o valor da célula.
 * - XLSX: o arquivo abre (openpyxl) e o total da Receita Bruta é o da tela.
 * - DRE/DFC multiempresas: o drill-down abre os lançamentos do consolidado
 *   (abria "Nenhuma transação"), o DFC tem saldo (saía R$ 0,00) e fecha.
 * - Análise de variação: os dois lados da diferença abrem os lançamentos, e o
 *   total da gaveta é o valor da categoria no mês.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { novoUsuario, verificador } from "./kit.mjs";

const c2 = (n) => Math.round(n * 100) / 100;

async function linhaRel(u, id) {
  const tr = u.page.locator(`tr[data-linha="${id}"]`).first();
  if (!(await tr.count())) return null;
  const cols = await tr.locator("td[data-celula]").evaluateAll((tds) => tds.map((td) => [td.getAttribute("data-celula"), Number(td.getAttribute("data-valor"))]));
  const porMes = cols.filter(([k]) => k !== "total").map(([, v]) => v);
  const total = cols.find(([k]) => k === "total")?.[1];
  return { porMes, total };
}

async function atualizar(u) {
  await u.page.getByRole("button", { name: "Atualizar" }).click();
  await u.page.waitForTimeout(1500);
}

/** Abre a gaveta clicando na célula e devolve { n, soma, valorCelula }. */
async function gaveta(u, td) {
  const valorCelula = Number(await td.getAttribute("data-valor"));
  await td.locator("button").click();
  await u.page.waitForTimeout(700);
  const vals = await u.page.locator("[data-gaveta-valor]").evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-gaveta-valor"))));
  await u.page.getByRole("button", { name: "Fechar" }).last().click();
  await u.page.waitForTimeout(300);
  return { n: vals.length, soma: c2(vals.reduce((s, v) => s + v, 0)), valorCelula };
}

function fechaDFC(v, nome, si, fl, sf) {
  const okCols = si.porMes.every((x, k) => Math.abs(c2(x + fl.porMes[k]) - sf.porMes[k]) < 0.01
    && (k === 0 || Math.abs(si.porMes[k] - sf.porMes[k - 1]) < 0.01));
  v.ok(okCols, `${nome}: inicial + fluxo = final em cada mês, e o final de um mês é o inicial do seguinte`);
  v.ok(Math.abs(si.total - si.porMes[0]) < 0.01, `${nome}: o Total do saldo inicial é o do PRIMEIRO mês`, `${si.total} × ${si.porMes[0]}`);
  v.ok(Math.abs(c2(si.total + fl.total) - sf.total) < 0.01, `${nome}: na coluna Total, inicial + fluxo líquido = final`, `${si.total} + ${fl.total} × ${sf.total}`);
}

export default async function contabilRelatorios(navegador) {
  const v = verificador("contabil-relatorios");
  const u = await novoUsuario(navegador);

  // Saldo das contas — o mesmo número que o razão usa.
  await u.ir("/contabilidade?aba=razao");
  const extTxt = (await u.page.locator('[data-valor="extrato"]').innerText()).replace(/\s+/g, "");
  const extrato = (/^[−-]/.test(extTxt) ? -1 : 1) * Number(extTxt.replace(/[^\d,]/g, "").replace(",", "."));

  /* ── DFC ── */
  await u.ir("/dashboard/reports/dfc");
  const si = await linhaRel(u, "saldo_inicial");
  const fl = await linhaRel(u, "fluxo_liquido");
  const sf = await linhaRel(u, "saldo_final");
  v.ok(!!si && !!fl && !!sf && si.porMes.length >= 12, "o DFC tem saldo inicial, fluxo líquido e saldo final");
  fechaDFC(v, "DFC", si, fl, sf);
  v.ok(Math.abs(sf.total - extrato) < 0.01, "o saldo final do DFC é o saldo das contas", `${sf.total} × ${extrato}`);

  // Recorte por conta: a soma dos saldos finais das contas é o saldo de todas.
  const contaSel = u.page.getByLabel("Contas bancárias", { exact: true });
  const opcoes = (await contaSel.locator("option").evaluateAll((os) => os.map((o) => o.value))).filter(Boolean);
  let somaFinais = 0;
  let todasFecham = true;
  for (const id of opcoes) {
    await contaSel.selectOption(id);
    await atualizar(u);
    const a = await linhaRel(u, "saldo_inicial"), b = await linhaRel(u, "fluxo_liquido"), c = await linhaRel(u, "saldo_final");
    if (!a || !b || !c) { todasFecham = false; continue; }
    if (Math.abs(c2(a.total + b.total) - c.total) >= 0.01) todasFecham = false;
    somaFinais = c2(somaFinais + c.total);
  }
  v.ok(opcoes.length >= 2, "há mais de uma conta para recortar", String(opcoes.length));
  v.ok(todasFecham, "cada conta fecha: inicial + fluxo = final");
  v.ok(Math.abs(somaFinais - extrato) < 0.01, "a soma dos saldos finais por conta é o saldo de todas as contas", `${somaFinais} × ${extrato}`);
  await contaSel.selectOption("");
  await atualizar(u);

  // Drill-down no DFC.
  const tdEnt = u.page.locator('tr[data-linha="entradas_operacionais"] td[data-celula="11"]').first();
  const g1 = await gaveta(u, tdEnt);
  v.ok(g1.n > 0 && Math.abs(g1.soma - g1.valorCelula) < 0.01, "DFC: a gaveta das entradas do mês soma a célula", `${g1.n} lançamentos · ${g1.soma} × ${g1.valorCelula}`);

  /* ── DRE ── */
  await u.ir("/dashboard/reports/dre");
  const rec = await linhaRel(u, "receita_bruta");
  v.ok(!!rec && rec.total > 0, "o DRE tem receita bruta", String(rec?.total));
  const tdDesp = u.page.locator('tr[data-linha="custos_variaveis"] td[data-celula="total"], tr[data-linha="despesas_operacionais"] td[data-celula="total"]');
  for (let i = 0; i < await tdDesp.count(); i++) {
    const td = tdDesp.nth(i);
    if (!(await td.locator("button").count())) continue;
    const g = await gaveta(u, td);
    // Linha de despesa: a célula é a magnitude, a gaveta lista com o sinal.
    v.ok(g.n > 0 && Math.abs(Math.abs(g.soma) - Math.abs(g.valorCelula)) < 0.01, "DRE: a gaveta de uma linha de despesa soma a célula (em módulo)", `${g.n} · ${g.soma} × ${g.valorCelula}`);
    break;
  }
  const gR = await gaveta(u, u.page.locator('tr[data-linha="receita_bruta"] td[data-celula="total"]').first());
  v.ok(gR.n > 0 && Math.abs(gR.soma - gR.valorCelula) < 0.01, "DRE: a gaveta da receita bruta total soma a célula", `${gR.n} · ${gR.soma} × ${gR.valorCelula}`);

  // XLSX abre e bate.
  const [dl] = await Promise.all([
    u.page.waitForEvent("download", { timeout: 30000 }),
    u.page.getByRole("button", { name: "Exportar XLSX" }).click(),
  ]);
  // O openpyxl recusa arquivo sem a extensão .xlsx — o download chega sem nome.
  const caminho = join(mkdtempSync(join(tmpdir(), "e2e-xlsx-")), "dre.xlsx");
  copyFileSync(await dl.path(), caminho);
  let xlsx = null;
  try {
    xlsx = JSON.parse(execFileSync("python3", ["-c", `
import openpyxl, json, sys
wb = openpyxl.load_workbook(sys.argv[1])
ws = wb.worksheets[0]
rows = [[c.value for c in r] for r in ws.iter_rows()]
print(json.dumps(rows, default=str))
`, caminho]).toString());
  } catch (e) { xlsx = null; }
  v.ok(Array.isArray(xlsx) && xlsx.length > 10, "o XLSX do DRE abre no openpyxl", xlsx ? `${xlsx.length} linhas` : "não abriu");
  if (Array.isArray(xlsx)) {
    const cab = xlsx[0];
    const iTot = cab.indexOf("Total");
    const linha = xlsx.find((r) => String(r[0]).trim().startsWith("+ Receita Bruta"));
    v.ok(linha && Math.abs(Number(linha[iTot]) - rec.total) < 0.01, "o total da Receita Bruta no XLSX é o da tela", `${linha?.[iTot]} × ${rec.total} · ${JSON.stringify(xlsx.slice(0, 3)).slice(0, 300)}`);
  }

  // Cartões × tabela com filtro de conta.
  await u.page.getByLabel("Contas bancárias", { exact: true }).selectOption(opcoes[0]);
  await atualizar(u);
  const res = await linhaRel(u, "resultado_liquido");
  const txt = (await u.texto()).replace(/\n+/g, " ");
  const m = txt.match(/Lucro líquido\s*(−|-)?\s*R\$\s*([\d.]+)\s*,(\d{2})/);
  const cartao = m ? (m[1] ? -1 : 1) * Number(m[2].replace(/\./g, "") + "." + m[3]) : NaN;
  v.ok(Math.abs(cartao - res.total) < 0.01, "com filtro de conta, o cartão 'Lucro líquido' é o Resultado Líquido da tabela", `${cartao} × ${res.total}`);

  /* ── DRE e DFC multiempresas ── */
  await u.ir("/dashboard/reports/dre-multi");
  v.ok(!/Filtrar contas/.test(await u.texto()), "o seletor de contas que não filtrava nada saiu");
  await atualizar(u);
  const tdMulti = u.page.locator('tr[data-linha="receita_bruta"] td[data-celula="total"]').first();
  const gM = await gaveta(u, tdMulti);
  v.ok(gM.n > 0 && Math.abs(gM.soma - gM.valorCelula) < 0.01, "DRE multi: a gaveta abre os lançamentos do consolidado e soma a célula", `${gM.n} · ${gM.soma} × ${gM.valorCelula}`);
  v.ok(!/Sem eliminações intercompany/.test(await u.texto()), "a tela não afirma mais que não há eliminação");

  await u.ir("/dashboard/reports/dfc-multi");
  await atualizar(u);
  const msi = await linhaRel(u, "saldo_inicial"), mfl = await linhaRel(u, "fluxo_liquido"), msf = await linhaRel(u, "saldo_final");
  v.ok(!!msi && !!msf && msf.total !== 0, "DFC multi: o saldo do grupo não sai R$ 0,00", String(msf?.total));
  if (msi && mfl && msf) fechaDFC(v, "DFC multi", msi, mfl, msf);

  /* ── Análise de variação ── */
  await u.ir("/dashboard/reports/variance");
  const linhaMat = u.page.getByRole("button", { name: /(Melhora|Piora) o resultado/ }).first();
  v.ok(await linhaMat.count() > 0, "há linha material para explicar");
  if (await linhaMat.count()) {
    await linhaMat.click();
    await u.page.waitForTimeout(400);
    const botoes = u.page.getByRole("button", { name: /^Ver \d+ de / });
    const nb = await botoes.count();
    v.ok(nb > 0, "a linha aberta oferece os lançamentos", String(nb));
    let todos = true;
    for (let i = 0; i < Math.min(nb, 4); i++) {
      const b = botoes.nth(i);
      const n = Number((await b.innerText()).match(/\d+/)[0]);
      await b.click();
      await u.page.waitForTimeout(500);
      const vals = await u.page.locator("[data-gaveta-valor]").evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-gaveta-valor"))));
      const cab = (await u.page.locator(".fixed .text-caption").first().innerText()).replace(/\s+/g, "");
      const mv = cab.match(/(−|-)?R\$([\d.]+)\s*,(\d{2})/);
      const valorCab = mv ? Number(mv[2].replace(/\./g, "") + "." + mv[3]) : NaN;
      const soma = Math.abs(c2(vals.reduce((s, x) => s + x, 0)));
      if (vals.length !== n || Math.abs(soma - valorCab) >= 0.01) todos = false;
      await u.page.getByRole("button", { name: "Fechar" }).last().click();
      await u.page.waitForTimeout(250);
    }
    v.ok(todos, "cada botão abre exatamente os N lançamentos e eles somam o valor da categoria no mês");
  }

  v.ok(u.erros.length === 0, "nenhum erro de página ou de console", u.erros.slice(0, 2).join(" | "));
  await u.ctx.close();
  return v.falhas();
}
