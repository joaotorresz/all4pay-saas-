/**
 * JORNADA: a conversa com a Quattro AI como uma pessoa a usa — perguntar,
 * marcar a resposta como útil, copiar, voltar outro dia, retomar, abrir a ficha
 * do cliente citado e continuar pelo MENU de outra tela.
 *
 * Desde 14/10/2026 a IA mora num lugar só: o chat em tela cheia, que abre por
 * cima de qualquer tela (menu, ⌘K, caixa da Home, `/quattro-ai`), com o
 * histórico em "Conversas". O botão flutuante e o painel lateral saíram.
 *
 * ⚠️ Cada passo aqui tinha um defeito medido numa rodada:
 *   · "Copiado" aparecia mesmo quando nada ia para a área de transferência;
 *   · a marca de "útil" sumia ao retomar a conversa (e contava de novo);
 *   · a conversa feita fora da página da IA não ia para o histórico;
 *   · a seta do botão Enviar era invisível (on-lime sobre ink, o mesmo tom).
 * E a ficha do contato é conferida pelo NÚMERO: o que a IA diz que se recebeu
 * do cliente tem de ser o "Recebido" da ficha.
 */
import { novoUsuario, verificador, brl, BASE } from "./kit.mjs";
import { perguntar, campoDoChat } from "./ia-numeros.mjs";

const RS = "R\\$\\s?(-?[\\d.]+,\\d{2})";
const CHAT = '[role="dialog"].a4p-chat-tela';

export default async function iaHistorico(navegador) {
  const v = verificador("ia-historico");
  const u = await novoUsuario(navegador);
  await u.ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
  const chat = () => u.page.locator(CHAT);
  const hist = () => u.page.locator('[data-ia="historico"]');
  /** Abre o painel "Conversas" do chat (ele fecha ao escolher uma conversa). */
  const abrirHistorico = async () => {
    if (!(await hist().count())) await chat().getByRole("button", { name: "Conversas" }).click();
    await hist().waitFor({ timeout: 8000 });
    return hist();
  };

  await u.ir("/quattro-ai");
  await campoDoChat(u).waitFor({ timeout: 10000 });
  v.ok(/As conversas que você tiver com a Quattro AI aparecem aqui/.test(await (await abrirHistorico()).innerText()), "o histórico começa vazio");

  // A seta do Enviar tem de CONTRASTAR com o botão (eram o mesmo tom).
  await campoDoChat(u).fill("x");
  const cores = await chat().locator('button[aria-label="Enviar pergunta"]').first().evaluate((b) => {
    const svg = b.querySelector("svg");
    return { fundo: getComputedStyle(b).backgroundColor, seta: svg ? getComputedStyle(svg).color : "" };
  });
  v.ok(!!cores.seta && cores.fundo !== cores.seta, "a seta do Enviar tem cor diferente do fundo do botão", JSON.stringify(cores));
  await campoDoChat(u).fill("");

  // 1) pergunta → a conversa entra no histórico de hoje
  const r1 = await perguntar(u, "quanto recebi da Brightwell Suprimentos?");
  const recebidoIA = brl(r1.match(new RegExp(`recebeu ${RS}`))?.[1] ?? "NaN");
  v.ok(Number.isFinite(recebidoIA) && recebidoIA > 0, "a IA diz quanto se recebeu do cliente", r1.slice(0, 120));
  const t1 = await (await abrirHistorico()).innerText();
  v.ok(/Hoje/.test(t1) && /Brightwell/.test(t1), "a conversa aparece no histórico, em \"Hoje\"");
  await chat().getByRole("button", { name: "Conversas" }).click();

  // 2) o rodapé (origem, fontes, copiar, útil/ruim) saiu a pedido do dono (21/10/2026)
  const bolha = u.page.locator('[data-ia="resposta"]').first();
  const txtBolha = await bolha.innerText();
  v.ok(!/Copiar|Fontes:|Calculado pelo sistema|escrito pela IA/.test(txtBolha) && await bolha.getByRole("button", { name: "Resposta útil" }).count() === 0, "a resposta não tem mais o rodapé de origem, fontes e feedback");

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
  await (await abrirHistorico()).getByRole("button", { name: /Brightwell/ }).first().click();
  await u.page.waitForTimeout(500);
  const retomada = u.page.locator('[data-ia="resposta"]').first();
  v.ok(await retomada.count() === 1 && /Brightwell/.test(await retomada.innerText()), "retomar a conversa recarrega a resposta");

  // 5) nova conversa → duas conversas na lista
  await (await abrirHistorico()).getByRole("button", { name: "Nova conversa" }).click();
  await perguntar(u, "qual minha margem esse mês?");
  const botoesHist = await (await abrirHistorico()).locator("button").allInnerTexts();
  v.ok(botoesHist.some((t) => /Brightwell/.test(t)) && botoesHist.some((t) => /margem/i.test(t)), "a nova conversa entra ao lado da primeira", botoesHist.join(" | ").slice(0, 160));

  // 6) o MENU de outra tela abre o MESMO chat, e ele grava no MESMO histórico
  await u.ir("/contas-a-receber/painel-de-vendas");
  v.ok((await u.page.locator(".a4p-ia-fab, aside.a4p-ia").count()) === 0, "o botão flutuante e o painel lateral não existem mais");
  const menu = u.page.locator(".a4p-sidebar");
  if (!(await menu.locator('a[href="/quattro-ai"]').count())) await menu.getByRole("button", { name: /Inteligência/ }).first().click();
  await menu.locator('a[href="/quattro-ai"]').first().click();
  await campoDoChat(u).waitFor({ timeout: 8000 });
  v.ok(new URL(u.page.url()).pathname === "/contas-a-receber/painel-de-vendas", "o menu abre o chat por cima da tela, sem sair dela", u.page.url());
  await perguntar(u, "quanto tenho a receber?");
  const depois = await (await abrirHistorico()).locator("button").allInnerTexts();
  v.ok(depois.some((t) => /a receber/i.test(t)) && depois.some((t) => /Brightwell/.test(t)), "a conversa aberta pelo menu entra no mesmo histórico", depois.join(" | ").slice(0, 200));
  await chat().getByRole("button", { name: "Fechar chat" }).click();
  await chat().waitFor({ state: "detached", timeout: 8000 });
  v.ok(true, "\"Fechar chat\" devolve a tela de baixo");

  // 7) as sugestões do estado vazio respondem de verdade (nenhuma cai no genérico)
  await u.ir("/quattro-ai");
  await campoDoChat(u).waitFor({ timeout: 10000 });
  const chips = await chat().locator('button[data-ia="chip"]').allInnerTexts();
  v.ok(chips.length >= 3, "o estado vazio oferece sugestões", String(chips.length));
  for (const q of chips.slice(0, 4)) {
    await (await abrirHistorico()).getByRole("button", { name: "Nova conversa" }).click();
    const n = await u.page.locator('[data-ia="resposta"]').count();
    await chat().locator('button[data-ia="chip"]', { hasText: q }).first().click();
    await u.page.waitForFunction((k) => document.querySelectorAll('[data-ia="resposta"]').length > k, n, { timeout: 30000 });
    const r = (await u.page.locator('[data-ia="resposta"]').last().innerText()).replace(/\s+/g, " ");
    v.ok(!/Reformule a pergunta|Não foi possível processar/.test(r) && /Fontes:/.test(r), `a sugestão "${q}" tem resposta com fonte`, r.slice(0, 90));
  }

  v.ok(u.erros.length === 0, "nenhum erro de página ou de console", u.erros.slice(0, 2).join(" | "));
  await u.ctx.close();
  return v.falhas();
}
