/**
 * JORNADA: a Central de Ajuda como uma pessoa a usa — colar um segredo sem
 * querer, perguntar o que as sugestões oferecem, registrar um chamado, voltar
 * outro dia, abrir um tour e marcar um anúncio como lido.
 *
 * ⚠️ O que ela prende:
 *   · o CPF digitado SEM pontuação e o cartão colado junto com a validade
 *     passavam pelo detector e eram gravados inteiros;
 *   · a tela prometia que o chamado "chega ao suporte" — não existe esse canal;
 *   · o chamado precisa continuar lá depois de navegar (e gravado sem o segredo).
 */
import { novoUsuario, verificador } from "./kit.mjs";

const CPF = "52998224725";
const CARTAO = "4111 1111 1111 1111";

export default async function ajudaCentral(navegador) {
  const v = verificador("ajuda-central");
  const u = await novoUsuario(navegador);
  await u.ir("/dashboard/help");

  // 1) as sugestões respondem (nenhuma cai em "não encontrei")
  const sugestoes = await u.page.locator("main button.text-left").allInnerTexts();
  v.ok(sugestoes.length >= 4, "o chat oferece perguntas sugeridas", String(sugestoes.length));
  await u.page.locator("main button.text-left").first().click();
  await u.page.waitForTimeout(400);
  let t = (await u.texto()).replace(/\s+/g, " ");
  v.ok(!/Não encontrei isso na base de ajuda/.test(t) && /Abrir tela ↗/.test(t), "a primeira sugestão responde com o caminho na tela", sugestoes[0]);

  // 2) o segredo colado sem querer: avisado ANTES e removido antes de gravar
  const campo = u.page.getByPlaceholder("Escreva sua dúvida…");
  await campo.fill(`meu cpf é ${CPF} e o cartão ${CARTAO} 12/28, como emitir nota fiscal?`);
  await u.page.waitForTimeout(200);
  t = await u.texto();
  v.ok(/Detectamos 2 dados sensíveis/.test(t), "o aviso aparece enquanto se digita (CPF sem pontuação + cartão com validade)", t.match(/Detectamos[^\n]*/)?.[0] ?? "sem aviso");
  await u.page.getByRole("button", { name: "Enviar" }).click();
  await u.page.waitForTimeout(500);
  t = await u.texto();
  v.ok(!t.includes(CPF) && !t.includes(CARTAO), "a mensagem aparece na conversa sem o CPF e sem o cartão");
  v.ok(/2 dado sensível removido antes de gravar/.test(t), "a conversa diz quantos dados foram removidos");
  const gravado = await u.page.evaluate(() => JSON.stringify(Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)]))));
  v.ok(!gravado.includes(CPF) && !gravado.includes("4111 1111"), "nada do segredo foi gravado no armazenamento da empresa");

  // 3) o chamado: registrado, sem promessa de envio, e ainda lá depois de navegar
  v.ok(!/alguém do suporte|chega ao suporte|o suporte recebe|chamado para o suporte/i.test(t), "a tela não promete entrega ao suporte que não existe");
  await u.page.getByRole("button", { name: "Novo chamado" }).click();
  await u.page.getByPlaceholder("Ex.: o extrato importado ficou sem categoria").fill("Extrato de setembro sem categoria");
  await u.page.getByPlaceholder("Descreva o passo a passo, o que você esperava e o que apareceu.")
    .fill(`Importei o extrato e as linhas vieram sem categoria. Meu CPF ${CPF} está no cadastro.`);
  await u.page.getByRole("button", { name: "Abrir chamado" }).click();
  await u.page.waitForTimeout(500);
  t = await u.texto();
  v.ok(/Extrato de setembro sem categoria/.test(t) && /registrado em/.test(t) && /1 dado sensível removido/.test(t), "o chamado aparece registrado, com o dado sensível removido");
  await u.ir("/");
  await u.ir("/dashboard/help");
  t = await u.texto();
  v.ok(/Extrato de setembro sem categoria/.test(t), "o chamado continua lá depois de navegar");
  const gravado2 = await u.page.evaluate(() => Object.keys(localStorage).map((k) => localStorage.getItem(k)).join("\n"));
  v.ok(gravado2.includes("Extrato de setembro sem categoria") && !gravado2.includes(CPF), "o chamado gravado não carrega o CPF");

  // 4) tours: iniciar leva à tela com o tour ligado
  await u.page.getByRole("button", { name: "Tours guiados" }).click();
  await u.page.waitForTimeout(400);
  await u.page.getByRole("button", { name: /Iniciar|Continuar|Rever/ }).first().click();
  await u.page.waitForURL(/tour=1/, { timeout: 15000 }).catch(() => {});
  v.ok(/[?&]tour=1/.test(u.page.url()), "iniciar um tour abre a tela com o tour", u.page.url());

  // 5) anúncios: marcar como lido fica marcado
  await u.ir("/dashboard/help?aba=anuncios");
  const marcar = u.page.getByRole("button", { name: "Marcar como lida" });
  const antes = await marcar.count();
  v.ok(antes > 0, "há anúncios não lidos", String(antes));
  await marcar.first().click();
  await u.page.waitForTimeout(300);
  await u.ir("/dashboard/help?aba=anuncios");
  v.ok(await u.page.getByRole("button", { name: "Marcar como lida" }).count() === antes - 1, "o anúncio lido continua lido depois de voltar");

  v.ok(u.erros.length === 0, "nenhum erro de página ou de console", u.erros.slice(0, 2).join(" | "));
  await u.ctx.close();
  return v.falhas();
}
