/**
 * JORNADA: perguntar à Quattro AI e conferir cada número na TELA que responde
 * a mesma pergunta — e depois criar uma conta a pagar e ver a IA e o painel
 * andarem juntos, pelo valor exato.
 *
 * ⚠️ Por que existe: as guardas de motor provam a fórmula sobre uma fixture;
 * esta prova que a pessoa, com a IA de um lado e a tela do outro, lê o MESMO
 * número. Foi assim que apareceram os defeitos desta rodada — "runway de 0
 * meses" ao lado de "— não há queima", margem de caixa (39%) contra a do DRE
 * (56,4%), "lucro" respondido com o caixa e a semana de domingo a sábado
 * perdendo o vencimento de domingo que o painel mostrava.
 */
import { novoUsuario, verificador, brl } from "./kit.mjs";

/** Faz uma pergunta na página da IA e devolve o texto da resposta (em uma linha). */
export async function perguntar(u, q) {
  const n0 = await u.page.locator('[data-ia="resposta"]').count();
  await u.page.locator("textarea").first().fill(q);
  await u.page.keyboard.press("Enter");
  await u.page.waitForFunction((n) => document.querySelectorAll('[data-ia="resposta"]').length > n, n0, { timeout: 30000 });
  return (await u.page.locator('[data-ia="resposta"]').nth(n0).innerText()).replace(/\s+/g, " ");
}

/** O valor de um card de painel ("Contas a vencer\nR$\n29.166\n,91"). */
function card(texto, rotulo) {
  const t = texto.replace(/\s+/g, " ");
  const m = t.match(new RegExp(`${rotulo}\\s*R\\$\\s*(-?[\\d.]+)\\s*,?\\s*(\\d{2})?`));
  return m ? brl(`${m[1]},${m[2] ?? "00"}`) : NaN;
}

async function semanaDoPainel(u, rota, rotulos) {
  await u.ir(rota);
  await u.page.getByRole("button", { name: "Essa semana" }).first().click();
  await u.page.waitForTimeout(1200);
  const t = await u.texto();
  return rotulos.reduce((s, r) => s + card(t, r), 0);
}

/** A célula do DRE (valor e AV%) de uma linha num mês "MM/AAAA". */
async function celulaDRE(u, linha, mesAno) {
  return u.page.evaluate(({ linha, mesAno }) => {
    for (const t of document.querySelectorAll("table")) {
      let pos = 0, ini = -1;
      for (const th of t.querySelectorAll("thead th")) {
        if (th.textContent.trim() === mesAno) ini = pos;
        pos += th.colSpan || 1;
      }
      if (ini < 0) continue;
      for (const tr of t.querySelectorAll("tbody tr")) {
        const tds = [...tr.children];
        if (!tds.length || !tds[0].textContent.includes(linha)) continue;
        const cel = [];
        for (const td of tds) for (let k = 0; k < (td.colSpan || 1); k++) cel.push(td.textContent.trim());
        return { valor: cel[ini], pct: cel[ini + 1] };
      }
    }
    return null;
  }, { linha, mesAno });
}

const dinheiro = (txt, re) => { const m = txt.match(re); return m ? brl(m[1]) : NaN; };
const RS = "R\\$\\s?(-?[\\d.]+,\\d{2})";

export default async function iaNumeros(navegador) {
  const v = verificador("ia-numeros");
  const u = await novoUsuario(navegador);

  await u.ir("/quattro-ai");
  const rSaldo = await perguntar(u, "qual meu saldo?");
  const rRunway = await perguntar(u, "qual meu runway?");
  const rSemana = await perguntar(u, "o que vence esta semana?");
  const rLucro = await perguntar(u, "qual meu lucro esse mês?");
  const rMargem = await perguntar(u, "qual minha margem esse mês?");

  // 1) saldo × Visão geral (a Home arredonda ao real)
  const saldoIA = dinheiro(rSaldo, new RegExp(`saldo consolidado é ${RS}`));
  await u.ir("/");
  const home = await u.texto();
  const saldoHome = card(home, "Saldo em conta hoje");
  v.ok(Number.isFinite(saldoIA) && Math.round(saldoIA) === Math.round(saldoHome), "o saldo da IA é o saldo em conta da Visão geral", `IA ${saldoIA} · Home ${saldoHome}`);
  const resultadoHome = card(home, "Resultado consolidado");

  // 2) runway × Fluxo de caixa: a AUSÊNCIA dita igual nos dois lados
  await u.ir("/fluxo-caixa");
  const fluxo = (await u.texto()).replace(/\s+/g, " ");
  const telaSemQueima = /Runway — não há queima/.test(fluxo);
  v.ok(telaSemQueima, "o Fluxo de caixa mostra o runway como \"— não há queima\"");
  v.ok(telaSemQueima === /não houve queima/.test(rRunway) && !/\b0(,0)? meses\b/.test(rRunway) && !/\b0(,0)? meses\b/.test(rSaldo),
    "a IA diz o mesmo sobre o runway (sem \"0 meses\")", `${rRunway.slice(0, 110)} | ${rSaldo.slice(0, 110)}`);

  // 3) semana × painéis de contas a pagar/receber (segunda a domingo nos dois)
  const semIA = rSemana.match(new RegExp(`${RS} a receber e ${RS} a pagar`));
  const recIA = semIA ? brl(semIA[1]) : NaN, pagIA = semIA ? brl(semIA[2]) : NaN;
  const pagTela = await semanaDoPainel(u, "/contas-a-pagar", ["Contas atrasadas", "Contas a vencer"]);
  const recTela = await semanaDoPainel(u, "/contas-a-receber", ["Contas a vencer", "Contas vencidas"]);
  v.ok(Math.abs(pagIA - pagTela) < 0.005, "o que vence a pagar na semana é o do painel de contas a pagar", `IA ${pagIA} · tela ${pagTela}`);
  v.ok(Math.abs(recIA - recTela) < 0.005, "o que vence a receber na semana é o do painel de contas a receber", `IA ${recIA} · tela ${recTela}`);

  // 4) lucro e margem × DRE (competência), e o caixa dito × Visão geral
  const hoje = await u.page.evaluate(() => { const d = new Date(); return { mes: `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}` }; });
  await u.ir("/dashboard/reports/dre");
  const dre = await celulaDRE(u, "Resultado Líquido", hoje.mes);
  v.ok(!!dre, "o DRE tem a coluna do mês corrente", hoje.mes);
  const lucroIA = dinheiro(rLucro, new RegExp(`resultado líquido de ${RS}`));
  v.ok(!!dre && Math.abs(lucroIA - brl(dre.valor)) < 0.005, "o lucro da IA é o Resultado Líquido do DRE no mês", `IA ${lucroIA} · DRE ${dre?.valor}`);
  const margemIA = rMargem.match(/é (-?[\d,]+%)/)?.[1];
  v.ok(!!dre && margemIA === dre.pct, "a margem da IA é o % do Resultado Líquido no DRE (base: receita líquida)", `IA ${margemIA} · DRE ${dre?.pct}`);
  const caixaIA = dinheiro(rLucro, new RegExp(`sobraram ${RS}|faltaram ${RS}`));
  v.ok(/Pelo caixa/.test(rLucro) && Math.round(caixaIA) === Math.round(resultadoHome), "o caixa citado junto do lucro é o resultado da Visão geral", `IA ${caixaIA} · Home ${resultadoHome}`);

  // 5) CRIAR: uma conta a pagar pendente que vence no DOMINGO desta semana
  const domingo = await u.page.evaluate(() => {
    const d = new Date(); const falta = (7 - d.getDay()) % 7; d.setDate(d.getDate() + falta);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  await u.ir("/dashboard/financial/payables/new");
  for (const rotulo of [/Busque a conta/, /Busque ou crie/, /Digite nome ou documento/]) {
    await u.page.locator("main button", { hasText: rotulo }).first().click({ timeout: 8000 });
    await u.page.waitForTimeout(300);
    const op = u.page.locator('[role="option"]').first();
    if (await op.count()) await op.click(); else await u.page.keyboard.press("Enter");
    await u.page.waitForTimeout(300);
  }
  for (const d of await u.page.locator('main input[type="date"]').all()) await d.fill(domingo);
  await u.page.locator('main input[placeholder="0,00"]').first().fill("432177");
  await u.page.getByRole("button", { name: "Salvar" }).last().click();
  await u.page.waitForTimeout(2500);
  const aviso = await u.page.evaluate(() => [...document.querySelectorAll("[role=status], [role=alert], .text-negative")].map((e) => e.textContent.trim()).filter(Boolean).join(" | "));
  v.ok(!u.page.url().includes("/new"), "a conta a pagar de R$ 4.321,77 é salva", aviso || u.page.url());

  const pagTela2 = await semanaDoPainel(u, "/contas-a-pagar", ["Contas atrasadas", "Contas a vencer"]);
  v.ok(Math.abs(pagTela2 - pagTela - 4321.77) < 0.005, "o painel da semana sobe exatamente R$ 4.321,77 (o vencimento de domingo entra)", `${pagTela} → ${pagTela2}`);
  await u.ir("/quattro-ai");
  const rSemana2 = await perguntar(u, "o que vence esta semana?");
  const pagIA2 = dinheiro(rSemana2, new RegExp(`${RS} a pagar`));
  v.ok(Math.abs(pagIA2 - pagIA - 4321.77) < 0.005, "a IA sobe o MESMO valor na semana", `${pagIA} → ${pagIA2}`);
  v.ok(Math.abs(pagIA2 - pagTela2) < 0.005, "e continua batendo com o painel depois da criação", `IA ${pagIA2} · tela ${pagTela2}`);

  v.ok(u.erros.length === 0, "nenhum erro de página ou de console", u.erros.slice(0, 2).join(" | "));
  await u.ctx.close();
  return v.falhas();
}
