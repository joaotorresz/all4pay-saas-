/**
 * JORNADA: o Relatório ao investidor — os KPIs batem com as telas de origem e
 * o texto copiável é o que a tela mostra.
 *
 * ⚠️ O que esta jornada achou: no dia 1º de outubro o relatório dizia
 * "Fechamos outubro de 2026" — um mês com um dia —, com a receita de
 * competência do mês INTEIRO e um MoM tirado de outra base (caixa). E o botão
 * "Copiar" dizia "Copiado" antes de saber se copiou.
 */
import { novoUsuario, verificador, brl } from "./kit.mjs";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export default async function investidores(navegador) {
  const v = verificador("plataforma-investidores");
  const u = await novoUsuario(navegador);
  await u.ctx.grantPermissions(["clipboard-read", "clipboard-write"]);

  await u.ir("/");
  const home = (await u.texto()).replace(/\n/g, " ");
  const mh = home.match(/Saldo em conta hoje\s*R\$\s*([\d.]+)/);
  const saldoHome = mh ? brl(mh[1]) : NaN;

  await u.ir("/investidores");
  const t = await u.texto();
  const plano = t.replace(/\n/g, " ");
  const mc = plano.match(/Caixa\s*R\$\s*([\d.]+)\s*,\s*(\d{2})/);
  const caixa = mc ? brl(`${mc[1]},${mc[2]}`) : NaN;
  v.ok(Number.isFinite(caixa) && Math.abs(Math.round(caixa) - saldoHome) <= 1, "o Caixa do relatório é o saldo da Visão geral", `${caixa} × ${saldoHome}`);

  const hoje = await u.page.evaluate(() => [new Date().getFullYear(), new Date().getMonth()]);
  const [ano, mes0] = hoje[1] === 0 ? [hoje[0] - 1, 11] : [hoje[0], hoje[1] - 1];
  const mesFechado = `${MESES[mes0]} de ${ano}`;
  v.ok(t.includes(`Métricas · ${mesFechado}`), "as métricas são do ÚLTIMO MÊS FECHADO", mesFechado);
  // (O "Runway 0 meses" para quem não queima caixa é consertado no galho da
  // IA — r3/ia —, que mexe no motor quantitativo; não é conferido aqui.)
  const mom = plano.match(/Crescimento MoM\s*(\S+)/)?.[1] ?? "";
  v.ok(/^[+−]\d|^—$/.test(mom), "o MoM tem o sinal ESCRITO (+ ou −) ou é ausente", mom);

  await u.page.getByLabel(/Nome da empresa/).fill("Padaria E2E");
  await u.page.waitForTimeout(300);
  const pre = await u.page.locator("pre").first().innerText();
  v.ok(pre.startsWith("Padaria E2E — Relatório ao investidor") && pre.includes(`Fechamos ${mesFechado}`), "o texto pronto usa o nome digitado e o mês fechado", pre.split("\n")[0]);
  v.ok(pre.includes(`- Caixa: R$`) && pre.includes(mom === "—" ? "Crescimento MoM: —" : `Crescimento MoM: ${mom}`), "as métricas do texto são as dos cartões");

  await u.page.getByRole("button", { name: "Copiar" }).click();
  await u.page.waitForTimeout(500);
  const copiado = await u.page.evaluate(() => navigator.clipboard.readText()).catch(() => "");
  v.ok(copiado === pre, "Copiar põe na área de transferência EXATAMENTE o texto mostrado", `${copiado.length} × ${pre.length}`);
  v.ok(/Copiado/.test(await u.texto()), "o botão confirma depois de copiar");

  v.ok(u.erros.length === 0, "nenhum erro de página ou de console", u.erros.slice(0, 2).join(" | "));
  await u.ctx.close();
  return v.falhas();
}
