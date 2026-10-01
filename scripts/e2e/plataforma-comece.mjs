/**
 * JORNADA: a jornada de adesão (/comece), a metodologia pública e a Lixeira.
 *
 *  - o progresso fecha: a soma dos estágios é o "N de 11", o % é N/11, e
 *    visitar uma tela que é passo da jornada AVANÇA a contagem em um;
 *  - /metodologia abre e descreve a cascata até o Resultado Líquido;
 *  - a Lixeira não promete "restaurar" um cancelado (o banco recusa essa
 *    transição em produção): o gesto é "lançar de novo".
 *
 * ⚠️ NÃO PROVADO AQUI: o clique em "Lançar de novo". A demonstração não tem
 * caminho de tela que cancele um lançamento (o cancelamento vive na fila de
 * revisão, que só opera em produção), então a lista de cancelados nasce
 * vazia. A regra está presa por guarda no engine-audit (bloco PLATAFORMA).
 */
import { novoUsuario, verificador } from "./kit.mjs";

function placar(t) {
  const m = t.match(/(\d+) de (\d+) passos/);
  const pct = Number(t.match(/\n(\d+)%\n/)?.[1] ?? NaN);
  const estagios = [...t.matchAll(/\n(\d+)\/(\d+)\n/g)].map((x) => [Number(x[1]), Number(x[2])]);
  return { feitos: Number(m?.[1]), total: Number(m?.[2]), pct, estagios };
}

export default async function comece(navegador) {
  const v = verificador("plataforma-comece");
  const u = await novoUsuario(navegador);

  await u.ir("/comece");
  const a = placar(await u.texto());
  v.ok(a.total === 11 && Number.isFinite(a.feitos), "a jornada tem 11 passos e diz quantos estão feitos", `${a.feitos}/${a.total}`);
  v.ok(a.estagios.length === 4 && a.estagios.reduce((s, e) => s + e[0], 0) === a.feitos && a.estagios.reduce((s, e) => s + e[1], 0) === a.total,
    "os quatro estágios somam o placar do topo", JSON.stringify(a.estagios));
  v.ok(a.pct === Math.round((a.feitos / a.total) * 100), "o % é feitos ÷ total", `${a.pct}%`);
  v.ok(!/Gere o relatório ao investidor[\s\S]{0,200}✓/.test(await u.texto()), "o passo do relatório ao investidor ainda não está feito");

  await u.ir("/investidores");
  await u.ir("/comece");
  const b = placar(await u.texto());
  v.ok(b.feitos === a.feitos + 1, "visitar o relatório ao investidor avança a jornada em UM passo", `${a.feitos} → ${b.feitos}`);
  v.ok(b.pct === Math.round((b.feitos / b.total) * 100), "e o % acompanha", `${b.pct}%`);

  // Cada "Abrir" da jornada leva a uma tela que existe.
  const botoes = await u.page.locator("main button").allInnerTexts();
  v.ok(botoes.some((x) => /Abrir DRE/.test(x)), "os passos oferecem o botão que leva à tela");
  await u.page.getByRole("button", { name: "Abrir DRE" }).first().click();
  await u.page.waitForURL(/\/dashboard\/reports\/dre/, { timeout: 15000 }).catch(() => {});
  v.ok(/\/dashboard\/reports\/dre/.test(u.page.url()), "o passo \"Abrir DRE\" leva ao DRE", u.page.url());

  // A metodologia é pública e descreve a cascata.
  const st = await u.ir("/metodologia");
  const met = await u.texto();
  v.ok(st === 200 && /Receita Bruta Operacional/.test(met) && /Resultado Líquido/.test(met) && /Saldo Inicial/.test(met),
    "/metodologia abre e descreve o DRE e o fluxo de caixa linha a linha");

  // A Lixeira não promete ressuscitar cancelado.
  await u.ir("/lixeira");
  const lix = await u.texto();
  v.ok(/lance de novo/.test(lix) && !/restaure para/.test(lix), "a Lixeira oferece lançar de novo (cancelado não volta), não restaurar");

  v.ok(u.erros.length === 0, "nenhum erro de página ou de console", u.erros.slice(0, 2).join(" | "));
  await u.ctx.close();
  return v.falhas();
}
