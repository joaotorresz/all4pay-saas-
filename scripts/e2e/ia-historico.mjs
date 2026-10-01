/**
 * JORNADA: a conversa com a Quattro AI como uma pessoa a usa — perguntar,
 * marcar a resposta como útil, copiar, voltar outro dia, retomar, abrir a ficha
 * do cliente citado e continuar pelo painel flutuante de outra tela.
 *
 * ⚠️ Cada passo aqui tinha um defeito medido nesta rodada:
 *   · "Copiado" aparecia mesmo quando nada ia para a área de transferência;
 *   · a marca de "útil" sumia ao retomar a conversa (e contava de novo);
 *   · a conversa feita no painel flutuante não ia para o histórico;
 *   · a seta do botão Enviar era invisível (on-lime sobre ink, o mesmo tom).
 * E a ficha do contato é conferida pelo NÚMERO: o que a IA diz que se recebeu
 * do cliente tem de ser o "Recebido" da ficha.
 */
import { novoUsuario, verificador, brl, BASE } from "./kit.mjs";
import { perguntar } from "./ia-numeros.mjs";

const RS = "R\\$\\s?(-?[\\d.]+,\\d{2})";

export default async function iaHistorico(navegador) {
  const v = verificador("ia-historico");
  const u = await novoUsuario(navegador);
  await u.ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });

  await u.ir("/quattro-ai");
  v.ok(/As conversas que você tiver com a IA aparecem aqui/.test(await u.texto()), "o histórico começa vazio");

  // A seta do Enviar tem de CONTRASTAR com o botão (eram o mesmo tom).
  await u.page.locator("textarea").first().fill("x");
  const cores = await u.page.locator('main button[aria-label="Enviar"]').first().evaluate((b) => {
    const svg = b.querySelector("svg");
    return { fundo: getComputedStyle(b).backgroundColor, seta: svg ? getComputedStyle(svg).color : "" };
  });
  v.ok(!!cores.seta && cores.fundo !== cores.seta, "a seta do Enviar tem cor diferente do fundo do botão", JSON.stringify(cores));
  await u.page.locator("textarea").first().fill("");

  // 1) pergunta → a conversa entra no histórico de hoje
  const r1 = await perguntar(u, "quanto recebi da Brightwell Suprimentos?");
  const recebidoIA = brl(r1.match(new RegExp(`recebeu ${RS}`))?.[1] ?? "NaN");
  v.ok(Number.isFinite(recebidoIA) && recebidoIA > 0, "a IA diz quanto se recebeu do cliente", r1.slice(0, 120));
  const hist = () => u.page.locator("main aside").first();
  v.ok(/Hoje/.test(await hist().innerText()) && /Brightwell/.test(await hist().innerText()), "a conversa aparece no histórico, em \"Hoje\"");

  // 2) útil + copiar: o estado é o que aconteceu
  const bolha = u.page.locator('[data-ia="resposta"]').first();
  await bolha.getByRole("button", { name: "Resposta útil" }).click();
  v.ok(await bolha.getByRole("button", { name: "Resposta útil" }).getAttribute("aria-pressed") === "true", "marcar como útil fica marcado");
  await bolha.getByRole("button", { name: "Copiar resposta" }).click();
  await u.page.waitForTimeout(300);
  const rotuloCopia = await bolha.getByRole("button", { name: "Copiar resposta" }).innerText();
  const area = await u.page.evaluate(() => navigator.clipboard.readText()).catch(() => "");
  v.ok(rotuloCopia === "Copiado" && area.includes("Brightwell") && area.includes("Recebido"), "\"Copiado\" só com o texto na área de transferência", `${rotuloCopia} · ${area.slice(0, 60)}`);

  // 3) a ficha do contato: o "Recebido" da ficha é o número da IA
  await bolha.getByRole("button", { name: /Abrir ficha do contato/ }).click();
  const ficha = u.page.locator('[role="dialog"][aria-label="Ficha do contato"]');
  await ficha.waitFor({ timeout: 8000 });
  const tFicha = (await ficha.innerText()).replace(/\s+/g, " ");
  const recebidoFicha = brl(tFicha.match(/Recebido\s*R\$\s*([\d.]+\s*,?\s*\d{0,2})/)?.[1]?.replace(/\s/g, "") ?? "NaN");
  v.ok(/Brightwell/.test(tFicha), "a ficha abre no cliente citado");
  v.ok(Math.abs(recebidoFicha - recebidoIA) < 0.005, "o Recebido da ficha é o que a IA disse", `IA ${recebidoIA} · ficha ${recebidoFicha}`);
  await ficha.getByRole("button", { name: "Fechar" }).click();

  // 4) outro dia: recarregar, retomar, e a marca de útil continua lá
  await u.ir("/quattro-ai");
  await hist().getByRole("button", { name: /Brightwell/ }).first().click();
  await u.page.waitForTimeout(500);
  const retomada = u.page.locator('[data-ia="resposta"]').first();
  v.ok(await retomada.count() === 1 && /Brightwell/.test(await retomada.innerText()), "retomar a conversa recarrega a resposta");
  v.ok(await retomada.getByRole("button", { name: "Resposta útil" }).getAttribute("aria-pressed") === "true", "a marca de útil sobrevive à retomada (era só estado de tela)");

  // 5) nova conversa → duas conversas na lista
  await u.page.getByRole("button", { name: "Nova conversa" }).first().click();
  await perguntar(u, "qual minha margem esse mês?");
  const botoesHist = await hist().locator("button").allInnerTexts();
  v.ok(botoesHist.some((t) => /Brightwell/.test(t)) && botoesHist.some((t) => /margem/i.test(t)), "a nova conversa entra ao lado da primeira", botoesHist.join(" | ").slice(0, 160));

  // 6) o painel flutuante de outra tela grava no MESMO histórico
  await u.ir("/contas-a-receber");
  await u.page.locator(".a4p-ia-fab").click();
  const painel = u.page.locator('aside[role="dialog"].a4p-ia');
  await painel.waitFor({ timeout: 8000 });
  const n0 = await painel.locator('[data-ia="resposta"]').count();
  await painel.locator("input, textarea").last().fill("quanto tenho a receber?");
  await u.page.keyboard.press("Enter");
  await u.page.waitForFunction((n) => document.querySelectorAll('aside.a4p-ia [data-ia="resposta"]').length > n, n0, { timeout: 30000 });
  await u.ir("/quattro-ai");
  const depois = await hist().locator("button").allInnerTexts();
  v.ok(depois.some((t) => /a receber/i.test(t)), "a conversa do painel flutuante aparece no histórico da página", depois.join(" | ").slice(0, 200));

  // 7) as sugestões do estado vazio respondem de verdade (nenhuma cai no genérico)
  await u.page.getByRole("button", { name: "Nova conversa" }).first().click();
  const chips = await u.page.locator('button[data-ia="chip"]').allInnerTexts();
  v.ok(chips.length >= 3, "o estado vazio oferece sugestões", String(chips.length));
  for (const q of chips.slice(0, 4)) {
    await u.page.getByRole("button", { name: "Nova conversa" }).first().click();
    const n = await u.page.locator('[data-ia="resposta"]').count();
    await u.page.locator('button[data-ia="chip"]', { hasText: q }).first().click();
    await u.page.waitForFunction((k) => document.querySelectorAll('[data-ia="resposta"]').length > k, n, { timeout: 30000 });
    const r = (await u.page.locator('[data-ia="resposta"]').last().innerText()).replace(/\s+/g, " ");
    v.ok(!/Reformule a pergunta|Não foi possível processar/.test(r) && /Fontes:/.test(r), `a sugestão "${q}" tem resposta com fonte`, r.slice(0, 90));
  }

  v.ok(u.erros.length === 0, "nenhum erro de página ou de console", u.erros.slice(0, 2).join(" | "));
  await u.ctx.close();
  return v.falhas();
}
