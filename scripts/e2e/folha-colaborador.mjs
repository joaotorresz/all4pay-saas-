/**
 * JORNADA: cadastrar um CLT e um PJ na folha — do formulário ao painel, aos
 * títulos a pagar e ao fluxo de caixa.
 *
 * Confere, com VALORES:
 *  - o CLT de R$ 5.000 a partir de 09/2026 (regime não declarado = cenário
 *    mais caro): custo 8.122,23 (1,62×), líquido 4.490,40, memória de 11 passos;
 *  - os três títulos da competência em DUAS datas (salário no 5º dia útil,
 *    FGTS e DARF no dia 20) com a competência escrita na descrição;
 *  - o 13º PROPORCIONAL de quem entrou em setembro (4/12: 833,34 + 706,10) e os
 *    encargos do 13º como títulos próprios — nunca os 2.500 do 13º inteiro;
 *  - nenhum 13º de 2027 (o cadastro de 12 meses para em agosto de 2027);
 *  - o PJ fora do Simples: nota líquida 9.385 + DARF das retenções 615;
 *  - as "Saídas projetadas" do fluxo de caixa sobem EXATAMENTE a soma dos
 *    títulos que vencem nos próximos 30 dias;
 * e nenhum erro de página ou de console.
 */
import { novoUsuario, verificador, brl } from "./kit.mjs";

const DESDE = "2026-09";

async function escolherConta(u) {
  await u.page.locator("main button", { hasText: /Busque a conta/ }).first().click({ timeout: 8000 });
  await u.page.waitForTimeout(300);
  await u.page.locator('[role="option"]').first().click();
  await u.page.waitForTimeout(300);
}

/** As linhas da tabela de títulos: [descrição/fornecedor, vencimento, valor]. */
async function titulosDoMes(u, mes) {
  await u.ir(`/contas-a-pagar/titulos?mes=${mes}`);
  return u.page.evaluate(() => [...document.querySelectorAll("main table tbody tr")].map((tr) => {
    // O <BRL> quebra "R$ 4.490 ,40" em partes: junta antes de comparar.
    const tds = [...tr.querySelectorAll("td")].map((td) => td.innerText.replace(/\s+/g, " ").replace(/ ,/g, ",").trim());
    return tds;
  }));
}
const temLinha = (linhas, texto, valor, venc) => linhas.some((l) => {
  const j = l.join(" | ");
  return j.includes(texto) && (valor == null || j.includes(valor)) && (venc == null || j.includes(venc));
});

async function saidasProjetadas(u) {
  await u.ir("/fluxo-caixa");
  const rot = await u.page.locator('button[aria-label^="Saídas projetadas"]').first().textContent();
  const m = /R\$\s*([\d.]+)\s*,\s*(\d{2})/.exec(rot ?? "");
  return m ? brl(`${m[1]},${m[2]}`) : NaN;
}

/** Os títulos que o formulário diz que vai criar: [{ desc, venc: "YYYY-MM-DD", valor }]. */
async function previaDoCadastro(u) {
  return u.page.evaluate(() => {
    const reg = document.querySelector('[role="region"][aria-label="Títulos que serão criados"]');
    if (!reg) return [];
    return [...reg.children].map((el) => {
      const t = el.innerText.replace(/\s+/g, " ");
      const v = /vence (\d{2})\/(\d{2})\/(\d{4})/.exec(t);
      const val = /R\$\s*([\d.]+)\s*,\s*(\d{2})\s*$/.exec(t);
      return v && val ? { desc: t.split(" · ")[0], venc: `${v[3]}-${v[2]}-${v[1]}`, valor: Number(`${val[1].replace(/\./g, "")}.${val[2]}`) } : null;
    }).filter(Boolean);
  });
}

/** A folha abre no mês corrente; anda até a competência pedida. */
export async function irParaCompetencia(u, comp) {
  const rotulo = `${comp.slice(5)}/${comp.slice(0, 4)}`;
  let t = (await u.texto()).replace(/\n+/g, " ");
  for (let k = 0; k < 36 && !t.includes(rotulo); k++) {
    const atual = /(\d{2})\/(\d{4})\s*Próximo|Tabelas legais\s*(\d{2})\/(\d{4})/.exec(t);
    const aqui = atual ? `${atual[2] ?? atual[4]}-${atual[1] ?? atual[3]}` : "";
    await u.page.getByRole("button", { name: comp < aqui ? "Mês anterior" : "Próximo mês" }).click();
    await u.page.waitForTimeout(250);
    t = (await u.texto()).replace(/\n+/g, " ");
  }
  return t;
}

async function cadastrar(u, { nome, valorCentavos, pj = false, simples = "" }) {
  await u.ir("/dashboard/financial/payables/new");
  await u.page.getByRole("radio", { name: /Colaborador \(folha\)/ }).click();
  await u.page.waitForTimeout(300);
  if (pj) {
    await u.page.getByRole("radio", { name: /PJ \(prestador com CNPJ\)/ }).click();
    await u.page.waitForTimeout(200);
  }
  await u.page.getByPlaceholder("Como aparece no contrato").fill(nome);
  await u.page.locator('main input[type="month"]').first().fill(DESDE);
  await escolherConta(u);
  await u.page.locator('main input[placeholder="0,00"]').last().fill(String(valorCentavos));
  if (pj && simples) {
    await u.page.locator("main select").filter({ has: u.page.locator('option[value="nao"]') }).first().selectOption(simples);
  }
  await u.page.waitForTimeout(600);
  const previa = await previaDoCadastro(u);
  const textoForm = (await u.texto()).replace(/\n+/g, " ");
  const n = /(\d+) títulos ·/.exec(textoForm);
  await u.page.getByRole("button", { name: "Salvar" }).last().click();
  await u.page.waitForTimeout(2500);
  return { previa, textoForm, quantos: n ? Number(n[1]) : 0 };
}

export default async function folhaColaborador(navegador) {
  const v = verificador("folha-colaborador");
  const u = await novoUsuario(navegador);

  const hoje = await u.page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; });
  const em30 = await u.page.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + 30); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; });
  const saidasAntes = await saidasProjetadas(u);
  v.ok(Number.isFinite(saidasAntes), "o fluxo de caixa mostra as saídas projetadas", String(saidasAntes));

  /* ------------------------------- o CLT ------------------------------- */
  const clt = await cadastrar(u, { nome: "Ana Souza", valorCentavos: 500000 });
  v.ok(/A empresa gasta\s*R\$\s*8\.122\s*,23/.test(clt.textoForm), "o formulário mostra o custo de 8.122,23 antes de salvar");
  v.ok(/O funcionário recebe\s*R\$\s*4\.490\s*,40/.test(clt.textoForm), "e o líquido de 4.490,40");
  v.ok(clt.quantos === 41, "a prévia anuncia 36 títulos mensais + 5 do 13º (parcelas e encargos)", `${clt.quantos} títulos`);
  v.ok(u.page.url().includes("/contas-a-pagar/folha"), "salvar leva à folha", u.page.url());

  let t = await irParaCompetencia(u, DESDE);
  v.ok(/Salários e notas \(bruto\)\s*R\$\s*5\.000/.test(t), "o painel mostra o bruto de 5.000");
  v.ok(/Custo total da empresa\s*R\$\s*8\.122/.test(t) && /1\.62× o bruto/.test(t), "o custo total e o multiplicador 1,62×");
  v.ok(/1 CLT · 0 PJ/.test(t), "um CLT, nenhum PJ");
  await u.page.getByRole("button", { name: "Ver a conta de Ana Souza" }).click();
  await u.page.waitForTimeout(300);
  t = (await u.texto()).replace(/\n+/g, " ");
  v.ok(/\(−\) INSS do empregado.*R\$\s*509\s*,60/.test(t) || /INSS do empregado[^|]*509/.test(t), "a memória abre com o INSS de 509,60");
  v.ok(/\(=\) Custo mensal da empresa/.test(t) && /Provisão de 13º/.test(t), "a memória tem os 11 passos até o custo mensal");
  v.ok(/07\/10\/2026\s*R\$\s*4\.490\s*,40/.test(t) && /20\/10\/2026\s*R\$\s*2\.309\s*,60/.test(t),
    "a agenda do mês: 4.490,40 em 07/10 e 2.309,60 (FGTS + DARF) em 20/10");

  const out = await titulosDoMes(u, "2026-10");
  v.ok(temLinha(out, "Salário 09/2026 · Ana Souza", "4.490,40", "07/10/2026"), "Títulos a pagar: salário de 09/2026 em 07/10 (5º dia útil)");
  v.ok(temLinha(out, "FGTS 09/2026 · Ana Souza", "400,00", "20/10/2026"), "FGTS de 400,00 no dia 20");
  v.ok(temLinha(out, "INSS e IRRF 09/2026 · Ana Souza", "1.909,60", "20/10/2026"), "DARF de 1.909,60 no dia 20");
  const nov = await titulosDoMes(u, "2026-11");
  v.ok(temLinha(nov, "13º 2026 (4/12) · 1ª parcela · Ana Souza", "833,34", "30/11/2026"),
    "a 1ª parcela do 13º é PROPORCIONAL (833,34 = 4/12), em 30/11");
  v.ok(!nov.some((l) => l.join(" ").includes("Ana Souza") && l.join(" ").includes("2.500,00")),
    "nenhum 13º inteiro de 2.500,00 para quem entrou em setembro");
  const dez = await titulosDoMes(u, "2026-12");
  v.ok(temLinha(dez, "13º 2026 (4/12) · 2ª parcela · Ana Souza", "706,10", "18/12/2026"), "a 2ª parcela (706,10) antecipa o domingo 20/12 para 18/12");
  v.ok(temLinha(dez, "INSS do 13º 2026 · Ana Souza", "593,90") && temLinha(dez, "FGTS do 13º 2026 · 1ª parcela · Ana Souza", "66,67"),
    "os encargos do 13º viraram títulos: INSS 593,90 e FGTS 66,67");
  const nov27 = await titulosDoMes(u, "2027-11");
  v.ok(!nov27.some((l) => /13º 2027/.test(l.join(" "))), "nenhum 13º de 2027 (os salários de 2027 não foram gerados até novembro)");

  // O fluxo de caixa recebe exatamente o que vence nos próximos 30 dias.
  const noJanela = clt.previa.filter((x) => x.venc >= hoje && x.venc <= em30).reduce((s, x) => s + x.valor, 0);
  const saidasDepois = await saidasProjetadas(u);
  v.ok(Math.abs((saidasDepois - saidasAntes) - noJanela) < 0.011,
    "as saídas projetadas do fluxo de caixa sobem exatamente o que a folha agenda para os próximos 30 dias",
    `antes ${saidasAntes} · depois ${saidasDepois} · esperado +${noJanela.toFixed(2)}`);

  /* ------------------------------- o PJ ------------------------------- */
  const pj = await cadastrar(u, { nome: "Bia Lima", valorCentavos: 1000000, pj: true, simples: "nao" });
  v.ok(/IRRF retido[^|]*1,5%/.test(pj.textoForm) && /R\$\s*150\s*,00/.test(pj.textoForm),
    "o PJ fora do Simples mostra a retenção de IRRF de 150,00 na memória");
  const outPJ = await titulosDoMes(u, "2026-10");
  v.ok(temLinha(outPJ, "Nota 09/2026 · Bia Lima", "9.385,00", "07/10/2026"), "a nota do PJ entra LÍQUIDA (9.385,00)");
  const novPJ = await titulosDoMes(u, "2026-11");
  v.ok(temLinha(novPJ, "Retenções da nota 09/2026 · Bia Lima", "615,00", "19/11/2026"),
    "e o DARF das retenções (615,00) — antes ele sumia do caixa");
  await u.ir("/contas-a-pagar/folha");
  t = await irParaCompetencia(u, DESDE);
  v.ok(/1 CLT · 1 PJ/.test(t) && /Salários e notas \(bruto\)\s*R\$\s*15\.000/.test(t),
    "a folha de 09/2026 conta um CLT e um PJ, 15.000 de bruto");

  v.ok(u.erros.length === 0, "nenhum erro de página ou de console", u.erros.slice(0, 2).join(" | "));
  await u.ctx.close();
  return v.falhas();
}
