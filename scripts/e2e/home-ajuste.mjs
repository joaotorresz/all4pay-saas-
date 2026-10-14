/**
 * JORNADA: arrumar a Home conversando (14/10/2026, pedido do dono).
 *
 * "Ajustar prioridades" abre o chat com a pergunta "O que você gostaria de ver
 * primeiro quando abre o Quattro?". O que a pessoa DIGITA arruma os itens da
 * Home (sobe, esconde, volta ao padrão), o chat diz o que mudou e oferece
 * desfazer. O arranjo fica guardado: recarregar a página não o perde.
 *
 * A ordem é conferida no DOM (`data-item-home`), não no texto do chat: o chat
 * dizer "pronto" e a Home não mudar é exatamente o defeito que importa.
 */
import { novoUsuario, verificador } from "./kit.mjs";

const CHAT = '[role="dialog"].a4p-chat-tela';

export default async function homeAjuste(navegador) {
  const v = verificador("home-ajuste");
  const u = await novoUsuario(navegador);
  const ordem = () => u.page.locator("[data-item-home]").evaluateAll((els) => els.map((e) => e.getAttribute("data-item-home")));
  const chat = () => u.page.locator(CHAT);
  const campo = () => chat().getByRole("textbox", { name: "O que você quer ver na Home" });
  const pedir = async (texto) => {
    const n = await chat().locator('[data-ajuste="resposta"]').count();
    await campo().fill(texto);
    await chat().getByRole("button", { name: "Enviar pedido" }).click();
    await u.page.waitForFunction((k) => document.querySelectorAll('[data-ajuste="resposta"]').length > k, n, { timeout: 20000 });
    return (await chat().locator('[data-ajuste="resposta"]').last().innerText()).replace(/\s+/g, " ");
  };
  const abrir = async () => {
    await u.page.getByRole("button", { name: "Ajustar prioridades" }).click();
    await chat().waitFor({ timeout: 8000 });
  };
  const verHome = async () => {
    await chat().locator('[data-ajuste="resposta"]').last().getByRole("button", { name: "Ver a Home" }).click();
    await chat().waitFor({ state: "detached", timeout: 8000 });
  };

  await u.ir("/");
  // primeiro acesso: a pergunta das prioridades fica na Home; responder libera o ajuste
  await u.page.getByRole("group", { name: "Prioridades do dia a dia" }).locator("xpath=..").getByRole("button", { name: "Agora não" }).click();
  await u.page.getByRole("button", { name: "Ajustar prioridades" }).waitFor({ timeout: 8000 });
  await u.page.locator("[data-item-home]").first().waitFor({ timeout: 15000 });
  const padrao = await ordem();
  v.ok(padrao[0] === "caixa" && padrao.length === 9, "a Home abre no arranjo padrão, com os nove itens", padrao.join(","));

  // 1) o chat abre com a pergunta, sem o histórico de conversas
  await abrir();
  const saudacao = (await chat().locator('[data-ajuste="saudacao"]').innerText()).replace(/\s+/g, " ");
  v.ok(/O que você gostaria de ver primeiro quando abre o Quattro\?/.test(saudacao), "o chat começa perguntando o que a pessoa quer ver primeiro", saudacao.slice(0, 120));
  v.ok((await chat().getByRole("button", { name: "Conversas" }).count()) === 0, "o ajuste não mistura o histórico de conversas da IA");
  v.ok((await chat().locator('[data-ajuste="exemplo"]').count()) >= 3, "o chat oferece exemplos de pedido");

  // 2) pedir → a Home muda de verdade
  const r1 = await pedir("Quero ver primeiro o que tenho a pagar e a receber");
  v.ok(/Pronto/.test(r1) && /Contas a pagar/.test(r1), "o chat diz o que mudou", r1.slice(0, 140));
  await verHome();
  const o1 = await ordem();
  v.ok(o1[0] === "pagar" && o1[1] === "receber", "a Home mostra primeiro a pagar e a receber", o1.join(","));

  // 3) esconder e desfazer
  await abrir();
  const r2 = await pedir("tira o burn");
  v.ok(/Escondidos: Burn mensal/.test(r2), "o chat diz o que escondeu", r2.slice(0, 140));
  v.ok(!(await ordem()).includes("burn"), "o burn sai da Home");
  await chat().locator('[data-ajuste="resposta"]').last().getByRole("button", { name: "Desfazer" }).click();
  await u.page.waitForTimeout(300);
  v.ok(/Desfeito/.test(await chat().locator('[data-ajuste="resposta"]').last().innerText()), "desfazer diz que a Home voltou");
  v.ok((await ordem()).includes("burn") && (await ordem())[0] === "pagar", "desfazer volta o burn e mantém o ajuste anterior", (await ordem()).join(","));

  // 4) pedido sem item da Home não mexe em nada, e diz o que existe
  const antes = (await ordem()).join(",");
  const r3 = await pedir("bom dia");
  v.ok(/Não encontrei/.test(r3) && /Caixa consolidado/.test(r3), "pedido sem item da Home diz quais itens existem", r3.slice(0, 160));
  v.ok((await ordem()).join(",") === antes, "e não mexe na Home");

  // 5) blocos primeiro
  await pedir("o que precisa de ação primeiro");
  await verHome();
  v.ok((await ordem())[0] === "acao", "\"o que precisa de ação primeiro\" sobe os blocos", (await ordem()).join(","));

  // 6) o arranjo sobrevive ao recarregar
  await u.ir("/");
  await u.page.locator("[data-item-home]").first().waitFor({ timeout: 15000 });
  const recarregada = await ordem();
  v.ok(recarregada[0] === "acao" && recarregada.indexOf("pagar") < recarregada.indexOf("caixa"), "recarregar mantém o arranjo", recarregada.join(","));

  // 7) escondido tem caminho de volta pela própria Home
  await abrir();
  await pedir("não preciso do ARR nem do runway");
  await verHome();
  const aviso = u.page.locator('[data-home="escondidos"]');
  v.ok(/2 itens escondidos/.test(await aviso.innerText()), "a Home diz quantos itens estão escondidos");
  await aviso.getByRole("button", { name: "Mostrar de novo" }).click();
  await u.page.waitForTimeout(300);
  v.ok((await ordem()).length === 9 && (await aviso.count()) === 0, "\"Mostrar de novo\" traz todos de volta");

  // 8) "volta ao padrão"
  await abrir();
  await pedir("volta ao padrão");
  await verHome();
  v.ok((await ordem()).join(",") === padrao.join(","), "\"volta ao padrão\" restaura o arranjo", (await ordem()).join(","));

  v.ok(u.erros.length === 0, "nenhum erro de página ou de console", u.erros.slice(0, 2).join(" | "));
  await u.ctx.close();
  return v.falhas();
}
