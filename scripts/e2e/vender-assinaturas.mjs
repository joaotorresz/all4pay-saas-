/**
 * JORNADA: assinaturas — criar, ativar, MRR pelo ciclo, pausar e cancelar.
 *
 * Cria uma assinatura TRIMESTRAL de R$ 1.200 e uma ANUAL de R$ 3.200, ativa
 * as duas e confere: o MRR normaliza o ciclo (400 + 266,67 = 666,67); as
 * faturas previstas (180 dias, o horizonte de produção) entram em Títulos a
 * receber e no fluxo de caixa; pausar
 * tira as faturas da trimestral; cancelar tira as da anual e o churn sobe.
 */
import { novoUsuario, verificador, brl } from "./kit.mjs";

const norm = (t) => t.replace(/\s+/g, " ").replace(/R\$\s*/g, "R$").replace(/(\d)\s+,(\d\d)/g, "$1,$2");
const kpi = (t, rot) => brl((t.match(new RegExp(`${rot} (R\\$[\\d.]+,\\d\\d)`)) || [])[1] ?? "NaN");

async function faturasDe(u, titulo) {
  return u.page.evaluate((tt) => {
    const ds = JSON.parse(localStorage.getItem("a4p_imported_dataset") ?? "{}");
    return (ds.movements ?? []).filter((m) => (m.description ?? "").startsWith(`${tt} · `))
      .map((m) => ({ valor: m.amount, venc: m.due_date, tipo: m.type, status: m.status }));
  }, titulo);
}

/** "Entradas projetadas" do fluxo de caixa nos próximos 180 dias (pílula 6M). */
async function entradasProjetadas(u) {
  await u.ir("/fluxo-caixa");
  await u.page.getByRole("button", { name: "6M", exact: true }).first().click();
  await u.page.waitForTimeout(2000);
  return brl((norm(await u.texto()).match(/Entradas projetadas (R\$[\d.]+,\d\d)/) || [])[1] ?? "NaN");
}

/** A primeira fatura da trimestral que cai dentro dos próximos 180 dias soma no fluxo. */
const dentroDe180 = (venc) => (new Date(venc + "T00:00:00") - new Date(new Date().toDateString())) / 864e5 <= 180;

export default async function venderAssinaturas(navegador) {
  const v = verificador("vender-assinaturas");
  const u = await novoUsuario(navegador);
  const fluxoAntes = await entradasProjetadas(u);

  const criar = async (titulo, ciclo, item, qtd) => {
    await u.page.locator('input[placeholder="Título (ex.: Assinatura mensal)"]').fill(titulo);
    await u.page.getByLabel("Cliente", { exact: true }).selectOption({ index: 1 });
    await u.page.getByLabel("Ciclo", { exact: true }).selectOption(ciclo);
    const itemSel = u.page.locator('select:has(option:text-is("Escolher do catálogo…"))').first();
    const opcao = await itemSel.locator("option").evaluateAll((os, it) => os.find((o) => o.textContent.startsWith(it))?.value, item);
    await itemSel.selectOption(opcao);
    const qtdIn = itemSel.locator("xpath=following::input[@type='number'][1]");
    await qtdIn.fill(String(qtd));
    await u.page.getByRole("button", { name: "Criar", exact: true }).click();
    await u.page.waitForTimeout(1200);
  };

  await u.ir("/dashboard/sales-invoices/subscriptions");
  await criar("Plano Suporte Tri", "trimestral", "Suporte mensal", 1);   // 1.200 por trimestre
  await criar("Licença Anual", "anual", "Consultoria (hora)", 10);       // 3.200 por ano
  let t = norm(await u.texto());
  v.ok(kpi(t, "MRR") === 0, "rascunho não conta no MRR", `MRR ${kpi(t, "MRR")}`);
  v.ok((await faturasDe(u, "Plano Suporte Tri")).length === 0, "rascunho não lança fatura nenhuma");

  for (let k = 0; k < 2; k++) {
    await u.page.getByRole("button", { name: "Ativar" }).first().click();
    await u.page.waitForTimeout(1500);
  }
  t = norm(await u.texto());
  const mrr = kpi(t, "MRR");
  v.ok(Math.abs(mrr - 666.67) < 0.006, "o MRR normaliza o ciclo: 1.200/3 + 3.200/12 = 666,67", `MRR ${mrr}`);
  v.ok(/Recorrências ativas 2\b/.test(t), "duas recorrências ativas");

  const tri = await faturasDe(u, "Plano Suporte Tri");
  const anual = await faturasDe(u, "Licença Anual");
  v.ok(tri.length >= 1 && tri.every((f) => f.valor === 1200 && f.tipo === "entrada" && f.status === "pendente"),
    "ativar a trimestral lança as faturas previstas de R$ 1.200 a receber", `${tri.length} fatura(s) · ${tri.map((f) => f.venc).join(" ")}`);
  // ⚠️ O mesmo horizonte de produção (180 dias). Eram "6 faturas": a anual
  // virava seis ANOS de receita a receber.
  v.ok([...tri, ...anual].every((f) => dentroDe180(f.venc)) && anual.length <= 1,
    "nenhuma fatura além de 180 dias — a anual lança no máximo uma", `${anual.map((f) => f.venc).join(" ")}`);
  const meses = tri.map((f) => Number(f.venc.slice(0, 4)) * 12 + Number(f.venc.slice(5, 7))).sort((a, b) => a - b);
  v.ok(meses.every((m, i) => i === 0 || m - meses[i - 1] === 3), "as faturas da trimestral vêm de 3 em 3 meses", tri.map((f) => f.venc).join(" "));
  v.ok(anual.every((f) => f.valor === 3200), "a fatura da anual (quando cai na janela) é de R$ 3.200", `${anual.length}`);

  await u.ir("/contas-a-receber/titulos");
  const verTudo = u.page.getByText("ver todo o período");
  if (await verTudo.count()) { await verTudo.first().click(); await u.page.waitForTimeout(800); }
  const tit = norm(await u.texto());
  v.ok(tit.includes("R$1.200,00") && (anual.length === 0 || tit.includes("R$3.200,00")), "as faturas aparecem em Títulos a receber");

  const esperado = [...tri, ...anual].filter((f) => dentroDe180(f.venc)).reduce((a, f) => a + f.valor, 0);
  const fluxoDepois = await entradasProjetadas(u);
  v.ok(esperado > 0 && Math.abs(fluxoDepois - fluxoAntes - esperado) < 0.006,
    "o fluxo de caixa (180 dias) soma exatamente as faturas que vencem na janela", `${fluxoAntes} → ${fluxoDepois} (esperado +${esperado})`);

  // Pausar a trimestral e cancelar a anual.
  await u.ir("/dashboard/sales-invoices/subscriptions");
  const linhaTri = u.page.locator("div.border-t", { hasText: "Plano Suporte Tri" }).first();
  await linhaTri.getByRole("button", { name: "Pausar" }).click();
  await u.page.waitForTimeout(1500);
  v.ok((await faturasDe(u, "Plano Suporte Tri")).length === 0, "pausar tira as faturas previstas do a receber");
  t = norm(await u.texto());
  v.ok(Math.abs(kpi(t, "MRR") - 266.67) < 0.006, "o MRR cai para o da anual (266,67)", `MRR ${kpi(t, "MRR")}`);
  v.ok(/Churn 0%/.test(t), "pausa não é churn", (t.match(/Churn \d+%/) || [])[0]);

  const linhaAnual = u.page.locator("div.border-t", { hasText: "Licença Anual" }).first();
  await linhaAnual.getByTitle("Cancelar (churn)").click();
  await u.page.waitForTimeout(1500);
  v.ok((await faturasDe(u, "Licença Anual")).length === 0, "cancelar tira as faturas previstas");
  t = norm(await u.texto());
  v.ok(kpi(t, "MRR") === 0, "sem ativas, MRR zero", `MRR ${kpi(t, "MRR")}`);
  v.ok(/Churn 50%/.test(t), "um cancelado de dois contratos = churn de 50%", (t.match(/Churn \d+%/) || [])[0]);
  const corChurn = await u.page.getByText("50%", { exact: true }).first().evaluate((el) => getComputedStyle(el.parentElement).color);
  const tinta = await u.page.evaluate(() => getComputedStyle(document.body).getPropertyValue("--color-ink"));
  // #B3261E (o único vermelho do sistema) = rgb(179, 38, 30).
  v.ok(await u.page.locator('[aria-label="atenção"]').count() === 1 && corChurn !== "rgb(179, 38, 30)",
    "churn acima de 20% ganha o PONTO de alerta, e o número fica na tinta", `cor do número ${corChurn} · ink ${tinta.trim()}`);

  v.ok(Math.abs(await entradasProjetadas(u) - fluxoAntes) < 0.006, "depois de pausar e cancelar, o fluxo volta ao que era");

  await u.ir("/contas-a-receber/titulos");
  if (await verTudo.count()) { await verTudo.first().click(); await u.page.waitForTimeout(800); }
  const tit2 = norm(await u.texto());
  v.ok(!tit2.includes("R$1.200,00") && !tit2.includes("R$3.200,00"), "depois de pausar e cancelar, nenhuma fatura sobra em Títulos a receber");

  v.ok(u.erros.length === 0, "nenhum erro de página ou de console", u.erros.slice(0, 2).join(" | "));
  await u.ctx.close();
  return v.falhas();
}
