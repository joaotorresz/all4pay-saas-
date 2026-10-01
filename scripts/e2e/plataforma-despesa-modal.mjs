/**
 * JORNADA: a despesa lançada pelo MODAL (Criar → Nova despesa) chega ao
 * extrato, ao saldo e ao DRE.
 *
 * ⚠️ O que ela fixa: na demonstração `createLancamento` (o escritor do modal)
 * fazia `return` sem gravar e a tela dizia "salva". A despesa não aparecia em
 * lugar nenhum. A jornada confere o DINHEIRO nos três lugares — não só que a
 * mensagem apareceu.
 */
import { novoUsuario, verificador, brl } from "./kit.mjs";

const VALOR = 4321.07;
const DESCRICAO = "Manutenção do ar E2E";

async function saldoHome(u) {
  await u.ir("/");
  const t = (await u.texto()).replace(/\n/g, " ");
  const m = t.match(/Saldo em conta hoje\s*R\$\s*([\d.]+)\s*,?\s*(\d{2})?/);
  return m ? brl(`${m[1]},${m[2] ?? "00"}`) : NaN;
}

/** A linha "Despesas operacionais" (ou a primeira linha de despesa) do DRE, total. */
async function totalDespesasDRE(u) {
  await u.ir("/dashboard/reports/dre");
  return u.page.evaluate(() => {
    const linhas = [...document.querySelectorAll("tr")];
    const alvo = linhas.find((tr) => /Despesas Operacionais/i.test(tr.cells?.[0]?.textContent ?? ""));
    if (!alvo) return null;
    // ⚠️ A4P-028: o cabeçalho "Total" tem colSpan=2 (valor + %). Conta-se a
    // coluna PELO CABEÇALHO, somando os colSpan — "a penúltima célula" lia o %.
    const tabela = alvo.closest("table");
    const cab = [...(tabela?.querySelectorAll("thead tr") ?? [])].pop();
    let col = 0, ixTotal = -1;
    for (const th of cab?.cells ?? []) {
      if (/^\s*Total\s*$/i.test(th.textContent ?? "")) { ixTotal = col; break; }
      col += th.colSpan || 1;
    }
    if (ixTotal < 0) return null;
    const cel = alvo.cells[ixTotal]?.textContent ?? "";
    const n = Number(cel.replace(/[^\d,]/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  });
}

export default async function despesaModal(navegador) {
  const v = verificador("plataforma-despesa-modal");
  const u = await novoUsuario(navegador);

  const saldoAntes = await saldoHome(u);
  v.ok(Number.isFinite(saldoAntes), "a Visão geral mostra o saldo em conta", String(saldoAntes));
  const dreAntes = await totalDespesasDRE(u);

  // Criar → Nova conta a pagar (o MESMO modal de despesa, sem navegar).
  await u.ir("/");
  await u.page.evaluate(() => window.dispatchEvent(new Event("a4p:criar")));
  await u.page.waitForTimeout(500);
  await u.page.getByRole("link", { name: /Nova conta a pagar|Nova despesa/ }).first().click();
  await u.page.waitForTimeout(800);
  v.ok(await u.page.getByLabel("Descrição *").count() > 0, "Criar → Nova conta a pagar abre o formulário de despesa");

  const hoje = await u.page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; });
  await u.page.getByLabel("Valor").first().fill("432107");
  await u.page.getByLabel("Descrição *").fill(DESCRICAO);
  for (const d of await u.page.locator('input[type="date"]').all()) if (await d.isVisible()) await d.fill(hoje);
  // Uma categoria de despesa OPERACIONAL ("Manutenção", "Aluguel"…); sem ela, a primeira.
  const cat = u.page.getByLabel("Categoria").first();
  const opcoes = await cat.locator("option").allInnerTexts();
  const ix = opcoes.findIndex((o) => /manuten|aluguel|utilidade|software|assinatura/i.test(o));
  await cat.selectOption({ index: ix > 0 ? ix : 1 });
  const conta = u.page.getByLabel("Conta de pagamento").first();
  if (await conta.count()) await conta.selectOption({ index: 1 });
  await u.page.getByText(/Pago \(baixa imediata\)/).click();
  await u.page.getByRole("button", { name: "Salvar", exact: true }).first().click();
  await u.page.waitForTimeout(1500);
  const posSalvar = await u.texto();
  v.ok(/salva/.test(posSalvar) && !/Não foi possível salvar/.test(posSalvar), "salvar confirma a despesa", posSalvar.match(/Não foi possível[^\n]*/)?.[0] ?? "");

  // 1) O extrato.
  await u.ir("/dashboard/financial/statement");
  const ext = (await u.texto()).replace(/\n/g, " ");
  v.ok(ext.includes(DESCRICAO) || /4\.321\s*,07/.test(ext), "a despesa aparece no extrato");
  await u.ir("/contas-a-pagar/titulos");
  const tit = (await u.texto()).replace(/\n/g, " ");
  v.ok(tit.includes(DESCRICAO) && /4\.321\s*,07/.test(tit), "a despesa aparece nos títulos a pagar, com o valor");

  // 2) O saldo: paga hoje, cai exatamente o valor (a Home arredonda ao real).
  const saldoDepois = await saldoHome(u);
  const delta = Math.round(saldoAntes - saldoDepois);
  v.ok(Math.abs(delta - VALOR) <= 1, "o saldo em conta cai o valor pago", `antes ${saldoAntes} · depois ${saldoDepois} · diferença ${delta}`);

  // 3) O DRE: a linha de despesas operacionais sobe o valor (competência = hoje).
  const dreDepois = await totalDespesasDRE(u);
  v.ok(dreAntes != null && dreDepois != null && Math.abs(Math.abs(dreDepois - dreAntes) - VALOR) < 1,
    "o DRE leva a despesa às Despesas Operacionais, pelo valor exato", `antes ${dreAntes} · depois ${dreDepois}`);

  v.ok(u.erros.length === 0, "nenhum erro de página ou de console", u.erros.slice(0, 2).join(" | "));
  await u.ctx.close();
  return v.falhas();
}
