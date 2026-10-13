/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ENTRADA — criar conta e entrar. UMA implementação, dois caminhos.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **Por que isto existe como arquivo próprio.** A criação de conta estava
 * escrita DUAS vezes — no wizard de empresa e no de pessoa física — e o mesmo
 * defeito vivia nas duas: quando o Supabase recusava, o botão ficava em
 * "Entrando…" e nada explicava o quê. Medido em produção: a chamada sem e-mail
 * e senha devolve `anonymous_provider_disabled` (o acesso anônimo está
 * desligado no projeto) e a tela não dizia uma palavra.
 *
 * Enquanto forem duas implementações, consertar uma deixa a outra. Agora é uma.
 *
 * ⚠️ **E ela NUNCA fica pendurada.** Toda chamada tem prazo: sem isso, uma rede
 * ruim deixa o botão girando para sempre, que é indistinguível de um sistema
 * quebrado. Estourou o prazo, a pessoa recebe uma frase e o botão volta.
 */
import { createClient } from "@/lib/supabase/client";
import { reportar } from "@/lib/erros";
import { MIN_SENHA, ROTA_RETORNO } from "@/core/recuperacao";
import { MARCA } from "@/core/marca";
import {
  codigoCompleto, destinoDepoisDoCodigo, fatoresParaTela, nomeDoNovoAparelho, normalizarCodigo,
  type FatorDaConta,
} from "@/core/segundo-fator";

/** Prazo de qualquer chamada de autenticação. Acima disto, a pessoa desiste. */
const PRAZO_MS = 15_000;

export type ResultadoEntrada =
  | { ok: true }
  /** A conta existe, mas o projeto exige confirmação de e-mail antes de entrar. */
  | { ok: false; confirmarEmail: true; motivo: string }
  | { ok: false; confirmarEmail?: false; motivo: string; comoResolver?: string };

/** Roda a promessa com prazo — nada pode ficar pendurado numa tela de entrada. */
async function comPrazo<T>(p: Promise<T>, oQue: string): Promise<T> {
  let t: ReturnType<typeof setTimeout>;
  const prazo = new Promise<never>((_, rej) => {
    t = setTimeout(() => rej(new Error(`__prazo__${oQue}`)), PRAZO_MS);
  });
  try { return await Promise.race([p, prazo]); } finally { clearTimeout(t!); }
}

/**
 * ⚠️ **A mensagem do Supabase é em inglês e fala de configuração de projeto.**
 * Quem está criando conta não pode agir sobre "anonymous provider disabled" —
 * e a regra da casa é que texto de tela não fala de implementação. Cada caso
 * conhecido vira uma frase que diz o que a PESSOA faz agora.
 */
function traduzir(bruto: string): { motivo: string; comoResolver?: string } {
  const m = bruto.toLowerCase();
  if (m.includes("anonymous")) {
    return {
      motivo: "Não é possível entrar sem cadastro.",
      comoResolver: "Informe um e-mail e uma senha para criar a sua conta.",
    };
  }
  if (m.includes("already registered") || m.includes("already exists") || m.includes("user_already_exists")) {
    return { motivo: "Já existe uma conta com este e-mail.", comoResolver: "Entre com a sua senha ou use outro e-mail." };
  }
  if (m.includes("invalid login") || m.includes("invalid_credentials")) {
    return { motivo: "E-mail ou senha não conferem.", comoResolver: "Confira os dois e tente de novo." };
  }
  // ⚠️ As recusas do SEGUNDO FATOR vêm antes do ramo de sessão logo abaixo:
  // uma delas com sessão vencida mostraria "o link de redefinição expirou" a
  // quem só digitou o código do aplicativo. Medidas no Auth local (v2.197).
  if (m.includes("mfa_verification_failed") || m.includes("invalid totp")) {
    return { motivo: "Código incorreto ou vencido.", comoResolver: "Digite o código que aparece agora no aplicativo autenticador." };
  }
  if (m.includes("mfa_challenge_expired")) {
    return { motivo: "O código demorou demais para ser confirmado.", comoResolver: "Digite o código que aparece agora no aplicativo autenticador." };
  }
  if (m.includes("insufficient_aal")) {
    return { motivo: "Esta ação pede o código do aplicativo autenticador.", comoResolver: "Saia, entre de novo com o código e repita." };
  }
  if (m.includes("mfa_factor_name_conflict")) {
    return { motivo: "Já existe um aparelho com este nome.", comoResolver: "Recarregue a tela e tente de novo." };
  }
  if (m.includes("mfa_factor_not_found")) {
    return { motivo: "Este aparelho não está mais cadastrado.", comoResolver: "Recarregue a tela." };
  }
  if (m.includes("enroll_not_enabled") || m.includes("verify_not_enabled") || (m.includes("mfa") && m.includes("disabled"))) {
    return { motivo: "O segundo fator não está disponível agora.", comoResolver: `Fale com o suporte da ${MARCA}.` };
  }
  // ⚠️ A troca de senha tem três recusas próprias, e as três vêm ANTES da
  // regra de "curta demais": senão a senha repetida ou a sessão vencida
  // virariam "use pelo menos 6 caracteres", o conselho que não resolve.
  if (m.includes("same_password") || m.includes("different from the old")) {
    return { motivo: "A nova senha é igual à anterior.", comoResolver: "Escolha uma senha diferente." };
  }
  if (
    m.includes("session missing") || m.includes("session_not_found") || m.includes("session_expired")
    || m.includes("reauthentication_needed") || m.includes("reauth_nonce_missing")
  ) {
    return { motivo: "O link de redefinição expirou.", comoResolver: "Peça um novo link na tela de entrar." };
  }
  if (m.includes("password") && m.includes("should contain")) {
    return { motivo: "A senha não atende às regras de segurança.", comoResolver: "Misture letras e números." };
  }
  if (m.includes("password") && (m.includes("short") || m.includes("weak") || m.includes(`${MIN_SENHA} characters`))) {
    return { motivo: "A senha é curta demais.", comoResolver: `Use pelo menos ${MIN_SENHA} caracteres.` };
  }
  if (m.includes("invalid") && m.includes("email")) {
    return { motivo: "Este e-mail não parece válido.", comoResolver: "Confira se não falta o @ ou o domínio." };
  }
  if (m.includes("rate limit") || m.includes("too many")) {
    return { motivo: "Muitas tentativas seguidas.", comoResolver: "Espere um minuto e tente de novo." };
  }
  if (m.startsWith("__prazo__")) {
    return { motivo: "A conexão demorou demais.", comoResolver: "Confira a sua internet e tente de novo." };
  }
  return { motivo: "Não foi possível concluir agora.", comoResolver: "Tente de novo em alguns segundos." };
}

/**
 * Cria a conta e ENTRA. Devolve `ok` só quando existe sessão de verdade —
 * "usuário criado" sem sessão não serve de nada, porque a próxima tela o
 * rejeita.
 *
 * ⚠️ Quando o projeto exige confirmação de e-mail, `signUp` devolve usuário e
 * NENHUMA sessão. Isso não é erro: é um estado, e a tela precisa distingui-lo
 * de uma falha para dizer "abra o link que te mandamos" em vez de "tente de
 * novo" — o único conselho que não pode funcionar.
 */
export async function criarContaEEntrar(
  email: string,
  senha: string,
  empresa: string,
): Promise<ResultadoEntrada> {
  const s = createClient();
  /*
   * ⚠️ **O NOME DA EMPRESA VIAJA NO `signUp`, e é a única forma de ele chegar.**
   * Quem escreve `organizations.name` é o gatilho `handle_new_user` em
   * `auth.users` — nem a app nem uma RPC. Ele lê
   * `raw_user_meta_data->>'company'`, e `options.data` é o que preenche esse
   * campo. Sem isto o gatilho não tem de onde tirar o nome.
   *
   * ⚠️ **Medido em produção (24/08/2026, A4P-085):** duas contas criadas com
   * "Teste Isolamento A" e "Teste Isolamento B" no campo nasceram com
   * `organizations.name` = `joao+teste1` e `joao+teste2` — o local-part do
   * e-mail, caractere por caractere. O campo era digitado, guardado no
   * navegador e descartado; o gatilho caía no fallback do e-mail.
   *
   * ⚠️ **O parâmetro é OBRIGATÓRIO, não opcional.** Opcional é como o defeito
   * volta: a próxima porta de cadastro esquece de passá-lo, o TypeScript não
   * reclama, e o nome some outra vez. Com ele obrigatório, uma porta nova não
   * compila sem responder "que nome vai para a organização?".
   */
  try {
    const { data, error } = await comPrazo(
      s.auth.signUp({
        email: email.trim(),
        password: senha,
        options: { data: { company: empresa.trim() } },
      }),
      "signup",
    );
    if (error) {
      // A conta já existe? Então a pessoa quis dizer "entrar".
      if (/already/i.test(error.message)) return entrarComSenha(email, senha);
      const t = traduzir(error.message);
      return { ok: false, ...t };
    }
    if (data.session) return { ok: true };
    // Sem sessão: o projeto pede confirmação. Tenta entrar mesmo assim — se o
    // e-mail for autoconfirmado, isto resolve; se não, a frase certa aparece.
    const tentativa = await entrarComSenha(email, senha);
    if (tentativa.ok) return tentativa;
    return {
      ok: false, confirmarEmail: true,
      motivo: "Enviamos um link de confirmação para o seu e-mail. Abra-o para entrar.",
    };
  } catch (e) {
    return { ok: false, ...traduzir(e instanceof Error ? e.message : String(e)) };
  }
}

/** Entra com uma conta que já existe. */
export async function entrarComSenha(email: string, senha: string): Promise<ResultadoEntrada> {
  const s = createClient();
  try {
    const { data, error } = await comPrazo(
      s.auth.signInWithPassword({ email: email.trim(), password: senha }), "login",
    );
    if (error) return { ok: false, ...traduzir(error.message) };
    return data.session ? { ok: true } : { ok: false, motivo: "Entrada recusada.", comoResolver: "Tente de novo." };
  } catch (e) {
    return { ok: false, ...traduzir(e instanceof Error ? e.message : String(e)) };
  }
}

/**
 * Pede o e-mail de redefinição.
 *
 * ⚠️ **NUNCA diz se a conta existe.** A tela mostra a mesma frase com ou sem
 * envio — senão o formulário vira um verificador de quais e-mails são
 * clientes. A falha não some: vai para o canal de falhas, onde alguém olha.
 *
 * ⚠️ **O link volta para a rota que troca o código NO SERVIDOR**
 * (`ROTA_RETORNO`), não para `/login`: no login nada trocava o código, e o
 * e-mail chegava para levar a lugar nenhum. A origem é a da página, porque a
 * prova de que foi esta pessoa que pediu fica num cookie DESTE domínio.
 */
export async function pedirRedefinicao(email: string): Promise<void> {
  try {
    const s = createClient();
    const { error } = await comPrazo(
      s.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}${ROTA_RETORNO}` }),
      "recuperar",
    );
    if (error) reportar("acesso.pedir_redefinicao", error, "O e-mail de redefinição de senha pode não ter saído.", true);
  } catch (e) {
    reportar("acesso.pedir_redefinicao", e, "O e-mail de redefinição de senha pode não ter saído.", true);
  }
}

/**
 * Grava a senha nova com a sessão de recuperação aberta pelo link.
 *
 * ⚠️ **Depois de trocar, encerra as OUTRAS sessões da conta.** Quem pede
 * redefinição às vezes pede porque alguém entrou no lugar dela; trocar a senha
 * e deixar a sessão do outro aberta não resolve o motivo do pedido. É o melhor
 * esforço: se falhar, a senha já mudou e a falha vai para o canal.
 *
 * ⚠️ **É a SEGUNDA trava, e isso foi medido.** Na jornada `npm run senha`, com
 * esta chamada removida, a sessão do outro aparelho caiu do mesmo jeito: o
 * próprio Auth (local, v2.197) encerra as outras sessões quando a senha muda.
 * Ela fica para não depender da versão do servidor — e quem cobra a presença
 * dela é o `engine-audit` (bloco `senha:`), não a jornada, que mede o resultado.
 */
export async function redefinirSenha(nova: string): Promise<ResultadoEntrada> {
  const s = createClient();
  try {
    const { error } = await comPrazo(s.auth.updateUser({ password: nova }), "senha");
    if (error) return { ok: false, ...traduzir(`${error.code ?? ""} ${error.message}`) };
  } catch (e) {
    return { ok: false, ...traduzir(e instanceof Error ? e.message : String(e)) };
  }
  try {
    const { error } = await comPrazo(s.auth.signOut({ scope: "others" }), "sessoes");
    if (error) reportar("acesso.encerrar_outras_sessoes", error, "As outras sessões da conta seguem abertas depois da troca de senha.", true);
  } catch (e) {
    reportar("acesso.encerrar_outras_sessoes", e, "As outras sessões da conta seguem abertas depois da troca de senha.", true);
  }
  return { ok: true };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * SEGUNDO FATOR — o aplicativo autenticador. A MESMA porta da senha.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **Toda chamada `auth.mfa.*` mora aqui** (o middleware só LÊ o nível da
 * sessão). Teto ZERO no `engine-audit`, bloco `segundo-fator:` — uma tela que
 * cadastrasse ou conferisse o código por conta própria seria a segunda regra
 * para a mesma coisa, e a primeira a esquecer de limpar o cadastro abandonado.
 *
 * ⚠️ **A chave do aplicativo se mostra UMA vez.** Ela volta só para a tela do
 * cadastro e nunca vai para log, `reportar`, armazenamento do navegador ou URL.
 */

type Recusa = { ok: false; motivo: string; comoResolver?: string };
/**
 * A recusa de uma chamada do segundo fator, na língua de quem opera.
 *
 * ⚠️ **Sessão encerrada é dita como sessão encerrada**, antes de `traduzir`:
 * lá, "session missing" é o ramo do LINK de redefinição, e quem só digitou o
 * código leria "o link de redefinição expirou" sem ter pedido link nenhum
 * (medido: com a sessão derrubada noutro aparelho, o Auth responde
 * `session_not_found` e o cliente devolve "Auth session missing!").
 *
 * ⚠️ **Código e mensagem se juntam SEM separador vazio**: com `code`
 * ausente, um espaço na frente de `__prazo__` escondia a frase do prazo.
 */
const recusa = (e: unknown): Recusa => {
  const err = e as { code?: string; message?: string; name?: string } | null;
  const bruto = err && typeof err === "object" && "message" in err
    ? [err.code, err.message].filter(Boolean).join(" ")
    : e instanceof Error ? e.message : String(e);
  if (err?.name === "AuthSessionMissingError" || /session[_ ](missing|not_found)/i.test(bruto)) {
    return { ok: false, motivo: "A sua sessão terminou.", comoResolver: "Saia e entre de novo." };
  }
  return { ok: false, ...traduzir(bruto) };
};

/** Os aplicativos autenticadores da conta — verificados e cadastros abandonados. */
export async function fatoresDaConta(): Promise<{ ok: true; fatores: FatorDaConta[] } | Recusa> {
  try {
    const { data, error } = await comPrazo(createClient().auth.mfa.listFactors(), "fatores");
    if (error) return recusa(error);
    return { ok: true, fatores: fatoresParaTela(data?.all ?? []) };
  } catch (e) {
    return recusa(e);
  }
}

/**
 * Começa o cadastro: devolve o endereço do QR e a chave manual.
 *
 * ⚠️ **Apaga ANTES os cadastros abandonados.** Quem fechou o QR no meio deixa
 * um aplicativo "não verificado"; sem limpá-lo, o próximo cadastro esbarra no
 * nome repetido (medido: `mfa_factor_name_conflict`) e a tela trava quem só
 * queria recomeçar.
 *
 * ⚠️ **`issuer: MARCA`**: sem ele o aplicativo da pessoa mostra o endereço do
 * site no lugar do nome da empresa, e ela não acha a conta na lista.
 */
export async function iniciarCadastroDoFator(): Promise<
  { ok: true; factorId: string; uri: string; chave: string } | Recusa
> {
  const s = createClient();
  try {
    const { data: lista, error: erroLista } = await comPrazo(s.auth.mfa.listFactors(), "fatores");
    if (erroLista) return recusa(erroLista);
    const todos = (lista?.all ?? []).filter((f) => f.factor_type === "totp");
    for (const f of todos.filter((x) => x.status !== "verified")) {
      const { error } = await comPrazo(s.auth.mfa.unenroll({ factorId: f.id }), "fatores");
      if (error) return recusa(error);
    }
    const nome = nomeDoNovoAparelho(todos.filter((x) => x.status === "verified").map((x) => x.friendly_name ?? ""));
    const { data, error } = await comPrazo(
      s.auth.mfa.enroll({ factorType: "totp", issuer: MARCA, friendlyName: nome }),
      "fatores",
    );
    if (error || !data) return recusa(error ?? new Error("sem resposta"));
    return { ok: true, factorId: data.id, uri: data.totp.uri, chave: data.totp.secret };
  } catch (e) {
    return recusa(e);
  }
}

/**
 * Confirma o cadastro com o primeiro código do aplicativo.
 *
 * Confirmar sobe ESTA sessão para `aal2` e encerra as OUTRAS sessões da conta
 * (comportamento do Auth) — a tela avisa antes.
 */
export async function confirmarCadastroDoFator(factorId: string, digitado: string): Promise<ResultadoEntrada> {
  if (!codigoCompleto(digitado)) return { ok: false, motivo: "O código tem 6 dígitos.", comoResolver: "Digite os 6 números que aparecem no aplicativo." };
  try {
    const { error } = await comPrazo(
      createClient().auth.mfa.challengeAndVerify({ factorId, code: normalizarCodigo(digitado) }),
      "codigo",
    );
    return error ? recusa(error) : { ok: true };
  } catch (e) {
    return recusa(e);
  }
}

/**
 * Desiste do cadastro em andamento (o aplicativo ainda não verificado).
 * Melhor esforço: o que sobrar é apagado no próximo cadastro.
 */
export async function cancelarCadastroDoFator(factorId: string): Promise<void> {
  try {
    const { error } = await comPrazo(createClient().auth.mfa.unenroll({ factorId }), "fatores");
    if (error) reportar("acesso.cancelar_cadastro_fator", error, "Um cadastro de aplicativo autenticador não confirmado ficou na conta até o próximo cadastro.", true);
  } catch (e) {
    reportar("acesso.cancelar_cadastro_fator", e, "Um cadastro de aplicativo autenticador não confirmado ficou na conta até o próximo cadastro.", true);
  }
}

/**
 * Remove um aplicativo. O Auth só aceita com a sessão em `aal2` (medido:
 * `insufficient_aal` em `aal1`) — é o que impede quem só tem a senha de
 * desligar a proteção.
 *
 * ⚠️ **Remover o aparelho com que ESTA sessão entrou a rebaixa para `aal1`**
 * (medido: o próximo refresh volta sem o código), e o token no cookie ainda
 * diria `aal2` por até uma hora — "adicionar outro" seria recusado e a pessoa
 * cairia no passo do código no meio do trabalho. Por isso a sessão é
 * renovada aqui e `pedeCodigo` diz à tela, na hora, que falta o código de
 * outro aparelho.
 */
export async function removerFator(factorId: string): Promise<{ ok: true; pedeCodigo: boolean } | Recusa> {
  const s = createClient();
  try {
    const { error } = await comPrazo(s.auth.mfa.unenroll({ factorId }), "fatores");
    if (error) return recusa(error);
  } catch (e) {
    return recusa(e);
  }
  try {
    const { error } = await comPrazo(s.auth.refreshSession(), "sessao");
    if (error) reportar("acesso.renovar_depois_de_remover", error, "Depois de remover um aplicativo, a sessão não foi renovada; o pedido do código pode chegar só na próxima renovação.", true);
  } catch (e) {
    reportar("acesso.renovar_depois_de_remover", e, "Depois de remover um aplicativo, a sessão não foi renovada; o pedido do código pode chegar só na próxima renovação.", true);
  }
  return { ok: true, pedeCodigo: await precisaDoCodigoAgora() };
}

/**
 * Depois da senha: esta sessão ainda precisa do código?
 *
 * Lê o nível da sessão recém-aberta (sem rede: o token acabou de chegar).
 * Na dúvida, devolve `false` e deixa o MIDDLEWARE decidir na próxima página —
 * ele é quem falha fechado, com a lista de aplicativos fresca do servidor.
 */
export async function precisaDoCodigoAgora(): Promise<boolean> {
  try {
    const { data, error } = await createClient().auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || !data) return false;
    return data.currentLevel === "aal1" && data.nextLevel === "aal2";
  } catch {
    return false;
  }
}

/**
 * Entra com o código do aplicativo e devolve o destino FIXO.
 *
 * ⚠️ **Tenta cada aplicativo verificado da conta**: quem cadastrou dois
 * aparelhos digita o código de qualquer um deles, e conferir só o primeiro
 * recusaria o código certo do segundo.
 */
export async function entrarComCodigo(digitado: string): Promise<{ ok: true; destino: string } | Recusa> {
  if (!codigoCompleto(digitado)) return { ok: false, motivo: "O código tem 6 dígitos.", comoResolver: "Digite os 6 números que aparecem no aplicativo." };
  const s = createClient();
  try {
    const { data: lista, error: erroLista } = await comPrazo(s.auth.mfa.listFactors(), "fatores");
    if (erroLista) return recusa(erroLista);
    const verificados = lista?.totp ?? [];
    if (verificados.length === 0) {
      return { ok: false, motivo: "Esta conta não tem aplicativo autenticador cadastrado.", comoResolver: "Saia e entre de novo." };
    }
    let ultima: unknown = null;
    for (const f of verificados) {
      const { error } = await comPrazo(
        s.auth.mfa.challengeAndVerify({ factorId: f.id, code: normalizarCodigo(digitado) }),
        "codigo",
      );
      if (!error) {
        const { data } = await s.auth.mfa.getAuthenticatorAssuranceLevel();
        return { ok: true, destino: destinoDepoisDoCodigo(data?.currentAuthenticationMethods, Math.floor(Date.now() / 1000)) };
      }
      ultima = error;
      if (error.code !== "mfa_verification_failed") break;
    }
    return recusa(ultima);
  } catch (e) {
    return recusa(e);
  }
}

/**
 * Sai da conta NESTE navegador — a saída de quem está no passo do código sem
 * o celular.
 *
 * ⚠️ **`scope: "local"`, nunca o padrão.** O padrão do cliente é `global`:
 * medido, a sessão só com a senha derrubava a sessão JÁ VERIFICADA do outro
 * aparelho, e quem está sem o celular perdia também o escritório.
 *
 * ⚠️ **A falha é DITA.** Em erro de rede o cliente devolve `{ error }` e
 * MANTÉM a sessão local; navegar como se tivesse saído mandaria a pessoa de
 * volta ao código, sem explicação.
 */
export async function sairDaConta(): Promise<{ ok: true } | Recusa> {
  try {
    const { error } = await comPrazo(createClient().auth.signOut({ scope: "local" }), "sair");
    if (!error) return { ok: true };
    reportar("acesso.sair", error, "A saída da conta não encerrou a sessão neste navegador.", false);
    return recusa(error);
  } catch (e) {
    reportar("acesso.sair", e, "A saída da conta não encerrou a sessão neste navegador.", false);
    return recusa(e);
  }
}
