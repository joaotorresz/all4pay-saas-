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
  if (m.includes("password") && (m.includes("short") || m.includes("weak") || m.includes("6 characters"))) {
    return { motivo: "A senha é curta demais.", comoResolver: "Use pelo menos 6 caracteres." };
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
export async function criarContaEEntrar(email: string, senha: string): Promise<ResultadoEntrada> {
  const s = createClient();
  try {
    const { data, error } = await comPrazo(s.auth.signUp({ email: email.trim(), password: senha }), "signup");
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
