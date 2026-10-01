/**
 * JORNADA: o painel de contas a receber bate com os títulos.
 *
 * Confere, antes e depois de lançar uma venda de R$ 7.777,77: os três cards do
 * painel (recebido · a vencer · vencidas) são os MESMOS números da tela de
 * Títulos a receber no mesmo mês; a idade do atraso soma as suas faixas; a
 * exposição por cliente soma o total da carteira; e a venda nova entra em
 * "a vencer" e na exposição do cliente, pelo valor exato, e em nenhum card de
 * vencido.
 */
import { novoUsuario, verificador, brl } from "./kit.mjs";
import { lancarVenda } from "./vender-impostos.mjs";

const norm = (t) => t.replace(/\s+/g, " ").replace(/R\$\s*/g, "R$").replace(/(\d)\s+,(\d\d)/g, "$1,$2");
const r2 = (n) => Math.round(n * 100) / 100;
const pega = (t, re) => { const m = t.match(re); return m ? brl(m[1]) : NaN; };

async function painel(u) {
  await u.ir("/contas-a-receber");
  const t = norm(await u.texto());
  const idade = t.slice(t.indexOf("Idade do atraso"), t.indexOf("Exposição por cliente"));
  const expo = t.slice(t.indexOf("Exposição por cliente"));
  const faixas = [...idade.matchAll(/(?:Até 30 dias|31 a 60 dias|61 a 90 dias|Mais de 90 dias) · \d+ [\d,]+% (R\$[\d.]+,\d\d)/g)].map((m) => brl(m[1]));
  const clientes = [...expo.matchAll(/[\d,]+% (R\$[\d.]+,\d\d)/g)].map((m) => brl(m[1]));
  return {
    recebido: pega(t, /Total recebido no período (R\$[\d.]+,\d\d)/),
    aVencer: pega(t, /Contas a vencer (R\$[\d.]+,\d\d)/),
    nAVencer: Number((t.match(/Contas a vencer R\$[\d.]+,\d\d (\d+) títulos?/) || [])[1]),
    vencidas: pega(t, /Contas vencidas (R\$[\d.]+,\d\d)/),
    idadeTotal: pega(idade, /carteira inteira (R\$[\d.]+,\d\d)/),
    faixas,
    carteira: pega(expo, /carteira inteira (R\$[\d.]+,\d\d)/),
    clientes,
    texto: t,
  };
}

async function cardsTitulos(u) {
  await u.ir("/contas-a-receber/titulos");
  const t = norm(await u.texto());
  return {
    recebido: pega(t, /Contas recebidas \(\d+\) (R\$[\d.]+,\d\d)/),
    aVencer: pega(t, /Contas a receber \(\d+\) (R\$[\d.]+,\d\d)/),
    vencidas: pega(t, /Contas atrasadas \(\d+\) (R\$[\d.]+,\d\d)/),
  };
}

export default async function venderReceber(navegador) {
  const v = verificador("vender-receber");
  const u = await novoUsuario(navegador);

  const a = await painel(u);
  const ta = await cardsTitulos(u);
  v.ok(a.recebido === ta.recebido && a.aVencer === ta.aVencer && a.vencidas === ta.vencidas,
    "os três cards do painel são os da tela de títulos no mesmo mês", `painel ${a.recebido}/${a.aVencer}/${a.vencidas} · títulos ${ta.recebido}/${ta.aVencer}/${ta.vencidas}`);
  v.ok(a.faixas.length === 4 && r2(a.faixas.reduce((s, x) => s + x, 0)) === a.idadeTotal, "as faixas de atraso somam o total vencido", `${a.faixas.join("+")} = ${a.idadeTotal}`);
  v.ok(a.clientes.length > 0 && Math.abs(r2(a.clientes.reduce((s, x) => s + x, 0)) - a.carteira) < 0.011, "a exposição por cliente soma a carteira em aberto", `${r2(a.clientes.reduce((s, x) => s + x, 0))} × ${a.carteira}`);
  v.ok(a.carteira >= a.idadeTotal, "a carteira em aberto contém o vencido");

  await lancarVenda(u, 777_777, "completa"); // R$ 7.777,77 — vence dentro do mês

  const b = await painel(u);
  const tb = await cardsTitulos(u);
  v.ok(r2(b.aVencer - a.aVencer) === 7777.77 && b.nAVencer === a.nAVencer + 1, "a venda nova entra em 'a vencer' pelo valor exato", `${a.aVencer} → ${b.aVencer} · ${a.nAVencer} → ${b.nAVencer}`);
  v.ok(b.vencidas === a.vencidas && b.idadeTotal === a.idadeTotal, "e em nenhum card de vencido");
  v.ok(r2(b.carteira - a.carteira) === 7777.77, "a carteira em aberto sobe o valor da venda", `${a.carteira} → ${b.carteira}`);
  v.ok(b.recebido === tb.recebido && b.aVencer === tb.aVencer && b.vencidas === tb.vencidas, "painel e títulos continuam batendo depois da venda");

  v.ok(u.erros.length === 0, "nenhum erro de página ou de console", u.erros.slice(0, 2).join(" | "));
  await u.ctx.close();
  return v.falhas();
}
