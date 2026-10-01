/**
 * JORNADA: provisionamento de impostos das vendas — da venda à conta a pagar.
 *
 * Declara o regime (Lucro Presumido), lança uma venda COMPLETA e uma com
 * CHARGEBACK, e confere: a base do imposto exclui o chargeback; mudar a
 * alíquota do ISS muda o valor; "Criar contas a pagar" cria UMA conta por
 * imposto, vencendo no mês SEGUINTE; elas aparecem em Títulos a pagar; e
 * clicar de novo não duplica.
 */
import { novoUsuario, verificador, brl } from "./kit.mjs";

const r2 = (n) => Math.round(n * 100) / 100;
/** O texto da tela com o dinheiro remontado: "R$ 10.000 ,00" → "R$10.000,00". */
const norm = (t) => t.replace(/\s+/g, " ").replace(/R\$\s*/g, "R$").replace(/(\d)\s+,(\d\d)/g, "$1,$2");
const fmt = (n) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Lança uma venda pela tela, com 1 × `centavos` e o status pedido. */
export async function lancarVenda(u, centavos, status) {
  await u.ir("/dashboard/sales-invoices/new");
  await u.select("Selecione o cliente").selectOption({ index: 1 });
  await u.select("Selecione o produto").selectOption({ index: 1 });
  await u.page.locator('input[type="number"]').first().fill("1");
  await u.page.locator('input[placeholder="0,00"]').first().fill(String(centavos));
  await u.select("Selecione a conta").selectOption({ index: 1 });
  await u.select("Selecione a categoria").selectOption({ index: 1 });
  // O rótulo "Status" não está ligado ao campo (sem htmlFor — ver o relatório);
  // o select é achado pela opção que só ele tem.
  if (status) await u.page.locator('select:has(option[value="chargeback"])').first().selectOption(status);
  await u.page.getByRole("button", { name: "Salvar venda" }).click();
  await u.page.waitForTimeout(2500);
}

export default async function venderImpostos(navegador) {
  const v = verificador("vender-impostos");
  const u = await novoUsuario(navegador);

  // O regime é declarado no cadastro da empresa (Configurações) — sem ele a
  // tela não calcula imposto nenhum, e é isso que ela tem de dizer.
  await u.ir("/dashboard/sales-invoices/tax-provisioning");
  v.ok(/regime tribut[aá]rio n[aã]o declarado/i.test(await u.texto()), "sem regime, a tela diz que não calcula (não inventa alíquota)");
  await u.page.evaluate(() => localStorage.setItem("a4p_company", JSON.stringify({ db: { regimeTributario: "Lucro Presumido", razaoSocial: "Padaria Teste" } })));

  await lancarVenda(u, 1_000_000, "completa");          // R$ 10.000,00 tributável
  await lancarVenda(u, 400_000, "chargeback");          // R$ 4.000,00 fora da base

  const hoje = new Date();
  const comp = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
  const seg = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);
  const mesSeg = `${String(seg.getMonth() + 1).padStart(2, "0")}/${seg.getFullYear()}`;
  const ultimoSeg = new Date(seg.getFullYear(), seg.getMonth() + 1, 0).getDate();

  await u.ir("/dashboard/sales-invoices/tax-provisioning");
  const t1 = norm(await u.texto());
  const fat = brl((t1.match(/Faturamento total no período (R\$[\d.]+,\d\d)/) || [])[1] ?? "");
  v.ok(fat === 10_000, "a base exclui o chargeback (só a venda completa entra)", `faturamento ${fat}`);
  const linhasTabela = (t1.match(/\d{4}-\d{4} R\$/g) || []).length;
  v.ok(linhasTabela === 1, "a tabela de impostos tem UMA linha (o chargeback não é tributado)", `${linhasTabela} linha(s)`);
  v.ok(/· 1 venda tributável/.test(t1), "o resumo conta a MESMA venda que a tabela (dizia '2 vendas' contando o chargeback)",
    (t1.match(/· \d+ vendas? [^ ]*/) || [])[0]);

  // Configurar: conta, fornecedores propostos e ISS de 5% → 2%.
  const configurar = async () => { await u.page.getByRole("button", { name: "Configurar", exact: true }).click(); await u.page.waitForTimeout(600); };
  await configurar();
  // "Propor fornecedores" ESCOLHE os três órgãos no modal aberto, e "Salvar"
  // não pode apagar a escolha (o modal guardava a cópia de quando abriu, e o
  // atalho não recebia o id do criado). Nada é escolhido à mão aqui: é o
  // atalho que tem de deixar a configuração completa.
  await u.page.getByRole("button", { name: "Propor fornecedores" }).click();
  await u.page.waitForTimeout(1500);
  const propostos = await u.page.locator('select[aria-label="Selecione o fornecedor"]').evaluateAll((ss) => ss.map((x) => x.value).filter(Boolean).length);
  v.ok(propostos === 3, "o atalho 'Propor fornecedores' escolhe os três órgãos no modal aberto", `${propostos} de 3`);
  await u.select("Selecione a conta").selectOption({ index: 1 });
  const iss = u.page.locator('xpath=//label[normalize-space()="ISS · alíquota (%)"]/following-sibling::*[1]/descendant-or-self::input').first();
  await iss.fill("2");
  await u.page.getByRole("button", { name: "Salvar", exact: true }).click();
  await u.page.waitForTimeout(1000);

  const t2 = norm(await u.texto());
  v.ok(!/Configuração incompleta/.test(t2), "com conta e fornecedores escolhidos, a configuração fica completa",
    (t2.match(/· (fornecedor[^·]*|conta[^·]*)/g) || []).join(" "));
  // Colunas: Base · ICMS · PIS · COFINS · IPI · ISS · CSLL · INSS · IRPJ · Total
  const colunas = ((t2.match(/Total do período ((?:(?:R\$[\d.]+,\d\d|—) ?){10})/) || [])[1] ?? "").trim().split(" ");
  const issTabela = brl(colunas[5] ?? "");
  v.ok(issTabela === r2(10_000 * 0.02), "a alíquota editada muda o ISS (5% → 2%)", `ISS na tabela ${issTabela}`);

  // O seletor de mês abre no mês corrente; cria as contas.
  const botao = u.page.getByRole("button", { name: "Criar contas a pagar" });
  v.ok(await botao.isEnabled(), "o botão de criar contas a pagar libera com a configuração completa");
  await botao.click();
  await u.page.waitForTimeout(1500);
  v.ok(/\d+ contas a pagar criadas/.test(await u.texto()), "a tela confirma quantas contas criou");
  await botao.click(); // de novo: não pode duplicar
  await u.page.waitForTimeout(1500);
  // ⚠️ Revisão: o segundo clique dizia "5 contas a pagar criadas" de novo — a
  // demonstração SUBSTITUÍA os títulos (e uma guia já paga voltava a pendente).
  // Agora a regra é a de produção: o que já tem título não ganha outro.
  v.ok(/Nada a criar/.test(await u.texto()) && !/\d+ contas a pagar criadas/.test(await u.texto()),
    "o segundo clique não afirma ter criado nada (as contas da competência já existem)");

  // O que foi gravado: UMA conta por imposto, mesmo depois de dois cliques.
  const impostos = await u.page.evaluate(() => {
    const ds = JSON.parse(localStorage.getItem("a4p_imported_dataset") ?? "{}");
    return (ds.movements ?? []).filter((m) => /· competência /.test(m.description ?? ""))
      .map((m) => ({ d: m.description, valor: m.amount, venc: m.due_date, tipo: m.type, cat: m.category }));
  });
  await u.ir("/contas-a-pagar/titulos");
  const verTudo = u.page.getByText("ver todo o período");
  if (await verTudo.count()) { await verTudo.first().click(); await u.page.waitForTimeout(800); }
  const titulos = norm(await u.texto());
  const proxMes = `${seg.getFullYear()}-${String(seg.getMonth() + 1).padStart(2, "0")}`;
  for (const [rot, pct, dia] of [["PIS", 0.65, "25"], ["COFINS", 3, "25"], ["ISS", 2, "10"], ["CSLL", 2.88, String(ultimoSeg)], ["IRPJ", 4.8, String(ultimoSeg)]]) {
    const deste = impostos.filter((x) => x.d === `${rot} · competência ${comp}`);
    v.ok(deste.length === 1, `UMA conta a pagar de ${rot} da competência (clicar duas vezes não duplica)`, `${deste.length}`);
    const valor = r2((10_000 * pct) / 100);
    v.ok(deste[0]?.valor === valor && deste[0]?.tipo === "saida", `${rot}: saída de R$ ${fmt(valor)} (alíquota sobre a base)`, JSON.stringify(deste[0]));
    v.ok(deste[0]?.venc === `${proxMes}-${dia.padStart(2, "0")}`, `${rot} vence no mês SEGUINTE à competência`, deste[0]?.venc);
    v.ok(titulos.includes(`R$${fmt(valor)}`), `${rot} aparece em Títulos a pagar com o valor`, `R$${fmt(valor)}`);
  }
  v.ok(impostos.every((x) => !/^\d+$/.test(String(x.cat))), "a categoria do título é nome, não id", impostos.map((x) => x.cat).join(", "));
  void mesSeg;

  v.ok(u.erros.length === 0, "nenhum erro de página ou de console", u.erros.slice(0, 2).join(" | "));
  await u.ctx.close();
  return v.falhas();
}
