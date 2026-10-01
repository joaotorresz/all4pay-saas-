/**
 * JORNADA: ligar as automações, ver a prévia com os números da empresa e
 * disparar o teste — do interruptor ao registro do envio.
 *
 * Liga o resumo do caixa do dia e o lembrete de contas a pagar em
 * Configurações › Automações, salva, e confere:
 *   · que a gravação ficou (recarregar a tela mostra as duas LIGADAS);
 *   · que a prévia do resumo traz o MESMO saldo da Visão geral;
 *   · que cada conta listada no lembrete existe, com o mesmo valor, nos
 *     títulos a pagar (o lembrete não inventa conta nem valor);
 *   · que "Enviar teste para mim" registra o envio como SIMULADO — na
 *     demonstração nada sai, e simulado nunca aparece como enviado.
 */
import { novoUsuario, verificador, brl } from "./kit.mjs";

const cartao = (u, tipo) => u.page.locator(`[data-automacao="${tipo}"]`);

async function ligarESalvar(u, v, tipo, nome) {
  const c = cartao(u, tipo);
  const sw = c.locator(`#sw-automacao-${tipo}`);
  v.ok((await sw.getAttribute("aria-checked")) === "false", `${nome} nasce DESLIGADO`);
  await sw.click();
  await u.page.waitForTimeout(200);
  v.ok((await sw.getAttribute("aria-checked")) === "true", `${nome}: o interruptor liga`);
  await c.getByRole("button", { name: "Salvar" }).click();
  await u.page.waitForTimeout(1200);
  const status = await u.page.locator("[role=status]").allInnerTexts();
  v.ok(status.some((s) => s.includes(`${nome}: ligada e salva`)), `${nome}: salvar confirma`, status.join(" | "));
}

async function previa(u, tipo) {
  const c = cartao(u, tipo);
  await c.getByRole("button", { name: "Ver prévia" }).click();
  await u.page.waitForTimeout(800);
  const p = u.page.locator(`[data-previa="${tipo}"]`);
  await p.waitFor({ timeout: 15000 });
  const pre = p.locator("pre");
  return (await pre.count()) ? await pre.innerText() : await p.innerText();
}

export default async function automacoes(navegador) {
  const v = verificador("automacoes");
  const u = await novoUsuario(navegador);

  // O número de referência: o saldo da Visão geral (arredondado ao real).
  await u.ir("/");
  const home = (await u.texto()).replace(/\n/g, " ");
  const mh = home.match(/Saldo em conta hoje\s*R\$\s*([\d.]+)\s*,?\s*(\d{2})?/);
  const saldoHome = mh ? brl(`${mh[1]},${mh[2] ?? "00"}`) : NaN;
  v.ok(Number.isFinite(saldoHome), "a Visão geral mostra o saldo em conta", String(saldoHome));

  await u.ir("/configuracoes?aba=automacoes");
  await cartao(u, "resumo_diario").waitFor({ timeout: 20000 });
  const tela = await u.texto();
  v.ok(/Resumo do caixa do dia/.test(tela) && /Régua de cobrança automática/.test(tela), "a aba Automações abre com as automações");
  v.ok(!/(TWILIO|RESEND|ANTHROPIC)_[A-Z_]+/.test(tela), "a tela não nomeia variável de ambiente");
  v.ok(/não configurado — envios ficam simulados|demonstração: nada é enviado/.test(tela), "a tela diz que, sem provedor, o envio é simulado");

  await ligarESalvar(u, v, "resumo_diario", "Resumo do caixa do dia");
  await ligarESalvar(u, v, "lembrete_pagar", "Lembrete de contas a pagar");

  // A prévia do resumo: o MESMO saldo da Visão geral.
  const pr = await previa(u, "resumo_diario");
  const ms = pr.match(/Saldo em conta hoje:\s*(−|-)?R\$\s*([\d.,]+)/);
  const saldoPrevia = ms ? (ms[1] ? -1 : 1) * brl(ms[2]) : NaN;
  v.ok(Number.isFinite(saldoPrevia) && Math.abs(Math.round(saldoPrevia) - Math.round(saldoHome)) <= 1,
    "a prévia do resumo traz o mesmo saldo da Visão geral", `prévia ${saldoPrevia} · Visão geral ${saldoHome}`);
  v.ok(!/R\$\s*0,00/.test(pr) || /A (receber|pagar) hoje: R\$/.test(pr), "o resumo não imprime R$0,00 no lugar de 'nada vence hoje'");

  // A prévia do lembrete: toda conta listada existe nos títulos a pagar, com o
  // mesmo valor. ⚠️ A lista de títulos abre no MÊS corrente (`?mes=`): a conta
  // de 01/10 é conferida na lista de outubro, a vencida na do mês em que venceu.
  const pl = await previa(u, "lembrete_pagar");
  const hojeISO = await u.page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; });
  const itens = [];
  let mesSecao = null;
  for (const l of pl.split("\n")) {
    let m;
    if ((m = l.match(/^Vence hoje \((\d{2})\/(\d{2})\)/))) mesSecao = `${hojeISO.slice(0, 4)}-${m[2]}`;
    else if ((m = l.match(/^Vence em (\d{2})\/(\d{2})\/(\d{4})/))) mesSecao = `${m[3]}-${m[2]}`;
    else if (/^Já venceram/.test(l)) mesSecao = null;
    else if ((m = l.match(/^· (.+?) — R\$([\d.]+,\d{2})(?: \((.*)\))?/))) {
      const mv = m[3]?.match(/venceu em (\d{2})\/(\d{2})\/(\d{4})/);
      const mes = mv ? `${mv[3]}-${mv[2]}` : mesSecao;
      if (mes) itens.push({ quem: m[1].trim(), valor: m[2], mes });
    }
  }
  const semNada = /Hoje não sairia nada/.test(pl);
  v.ok(semNada || itens.length > 0, "a prévia do lembrete lista as contas (ou diz por que não sai)", semNada || itens.length ? "" : pl.slice(0, 200));
  v.ok(/Vence hoje|Vence em|Já venceram/.test(pl) || semNada, "o lembrete agrupa por data", "");

  const faltando = [];
  for (const mes of [...new Set(itens.map((i) => i.mes))]) {
    await u.ir(`/contas-a-pagar/titulos?mes=${mes}`);
    // O <BRL> quebra o valor em partes (R$ · inteiro · centavos): compara sem espaços.
    const titulos = (await u.texto()).replace(/\s+/g, "");
    for (const i of itens.filter((x) => x.mes === mes)) if (!titulos.includes(`R$${i.valor}`)) faltando.push(i);
  }
  v.ok(itens.length > 0 && faltando.length === 0, "cada conta do lembrete está nos títulos a pagar com o mesmo valor",
    `${itens.length} conferida(s)${faltando.length ? ` · faltando: ${faltando.slice(0, 3).map((l) => `${l.quem} R$${l.valor} (${l.mes})`).join(" | ")}` : ""}`);

  // A gravação ficou: recarregar mostra as duas ligadas.
  await u.ir("/configuracoes?aba=automacoes");
  await cartao(u, "resumo_diario").waitFor({ timeout: 20000 });
  for (const t of ["resumo_diario", "lembrete_pagar"]) {
    v.ok((await cartao(u, t).locator(`#sw-automacao-${t}`).getAttribute("aria-checked")) === "true", `${t} continua ligada depois de recarregar`);
  }
  v.ok((await cartao(u, "regua_cobranca").locator("#sw-automacao-regua_cobranca").getAttribute("aria-checked")) === "false",
    "a régua de cobrança continua desligada (ninguém a ligou)");

  // O teste: registra como SIMULADO (demonstração) e aparece em Últimos envios.
  await cartao(u, "resumo_diario").getByRole("button", { name: "Enviar teste para mim (E-mail)" }).click();
  await u.page.waitForTimeout(2500);
  const res = await cartao(u, "resumo_diario").locator("[role=status]").allInnerTexts();
  v.ok(res.some((s) => /registrado como simulado/.test(s)), "o teste diz que ficou registrado como simulado", res.join(" | "));
  const linha = u.page.locator('tr[data-envio-status]', { hasText: "Resumo do caixa do dia · teste" }).first();
  await linha.waitFor({ timeout: 10000 }).catch(() => {});
  v.ok((await linha.count()) === 1 && (await linha.getAttribute("data-envio-status")) === "simulado",
    "o envio de teste aparece em Últimos envios como SIMULADO");
  v.ok((await u.page.locator('tr[data-envio-status="enviado"]').count()) === 0, "nenhum envio aparece como ENVIADO na demonstração");
  v.ok(/Simulado — nada saiu/.test(await linha.innerText().catch(() => "")), "a situação diz que nada saiu");

  v.ok(u.erros.length === 0, "nenhum erro de página ou de console", u.erros.slice(0, 2).join(" | "));
  await u.ctx.close();
  return v.falhas();
}
