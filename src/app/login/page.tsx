"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button, Input, Icon } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { useTipoConta } from "@/components/app/useTipoConta";
import { MolduraPublica } from "@/components/app/MolduraPublica";
import { MARCA } from "@/core/marca";
import { ArtPanel, Spinner } from "@/components/entrada/ArtePublica";
import { pedirRedefinicao, precisaDoCodigoAgora } from "@/lib/entrada";
import { ROTA_CODIGO } from "@/core/segundo-fator";
import { lerMotivo, MENSAGEM_RECUPERACAO, ROTA_RETORNO } from "@/core/recuperacao";

const configured = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

type View = "signin" | "reset";

export default function LoginPage() {
  const router = useRouter();
  const { pessoal, set: setTipo } = useTipoConta();
  const [view, setView] = React.useState<View>("signin");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPw, setShowPw] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [touched, setTouched] = React.useState(false);
  const [msg, setMsg] = React.useState<{ tone: "error" | "ok"; text: string } | null>(null);

  /*
   * ⚠️ **Navegação COMPLETA, não `router.push` + `router.refresh`.** Medido em
   * 07/10/2026: o refresh disparado logo depois do push ainda pedia `/login`;
   * o middleware (sessão já aberta) respondia com o conteúdo da Home, e o
   * endereço ficava parado em `/login` com a Home na tela. Recarregar a página
   * inteira faz o servidor ler os cookies novos uma vez, e o endereço bate.
   */
  const go = () => { window.location.assign("/"); };

  async function entrar() {
    setTouched(true);
    if (!emailOk(email) || !password) return;
    setBusy(true); setMsg(null);
    try {
      const { error } = await createClient().auth.signInWithPassword({ email: email.trim(), password });
      // Anti-enumeração: mensagem genérica, nunca revela se o e-mail existe.
      if (error) { setMsg({ tone: "error", text: "E-mail ou senha inválidos." }); return; }
      // ⚠️ Quem cadastrou o aplicativo autenticador ainda não entrou: a senha
      // abriu uma sessão de primeiro nível, e o passo do código vem agora.
      // Na dúvida a função diz "não" e o middleware decide na próxima página.
      if (await precisaDoCodigoAgora()) { window.location.assign(ROTA_CODIGO); return; }
      go();
    } catch {
      setMsg({ tone: "error", text: "Não foi possível entrar agora. Tente novamente." });
    } finally { setBusy(false); }
  }

  async function resetar() {
    setTouched(true);
    if (!emailOk(email)) return;
    if (!configured) {
      setMsg({ tone: "error", text: "A redefinição de senha não existe no modo demonstração." });
      return;
    }
    setBusy(true); setMsg(null);
    // A falha vai para o canal de falhas dentro de `pedirRedefinicao`; a tela
    // não a mostra, de propósito (ver a mensagem neutra abaixo).
    await pedirRedefinicao(email);
    setBusy(false);
    // Mensagem neutra SEMPRE (exista ou não o e-mail) — anti-enumeração.
    setMsg({ tone: "ok", text: "Se houver uma conta com esse e-mail, enviamos um link de redefinição. Abra-o neste mesmo navegador." });
  }

  /*
   * ⚠️ **O login recebe a volta de um link que não abriu.** A rota de retorno
   * (`ROTA_RETORNO`) manda para cá `?recuperacao=<motivo>` quando o link
   * venceu, já foi usado ou foi aberto noutro navegador — e a tela abre direto
   * no pedido de um link novo, dizendo o porquê.
   *
   * ⚠️ **E um `?code=` que chegue aqui é encaminhado à rota de retorno.** É o
   * link enviado antes deste conserto (que voltava para `/login`) e o caso em
   * que o Auth, sem o endereço na lista dele, devolve para o endereço padrão.
   * Deixado aqui, o código ficava parado na URL, e era esse o defeito.
   *
   * Lido de `window.location`, e não de `useSearchParams`, para a página não
   * precisar de Suspense — e uma vez só, na montagem.
   */
  React.useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const code = q.get("code");
    if (code && configured) {
      window.location.replace(`${ROTA_RETORNO}?code=${encodeURIComponent(code)}`);
      return;
    }
    const motivo = lerMotivo(q.get("recuperacao"));
    if (motivo) {
      const m = MENSAGEM_RECUPERACAO[motivo];
      setView("reset");
      setMsg({ tone: "error", text: `${m.motivo} ${m.comoResolver}` });
    }
  }, []);

  // TODO pré-BACEN: rate-limit / lockout de tentativas de login (anti brute-force).

  const erroEmail = touched && !emailOk(email);
  const erroSenha = touched && view === "signin" && !password;

  return (
    // `grid lg:grid-cols-2` no cartão: quem rola aqui é a coluna do
    // formulário, não o cartão inteiro (a arte é fixa).
    <MolduraPublica cartaoClassName="grid lg:grid-cols-2">
      {/* Coluna esquerda — formulário */}
      <div className="flex flex-col items-center justify-center px-6 py-12 overflow-y-auto">
        <div className="w-[380px] max-w-full flex flex-col gap-6">
          <div>
            <h1 className="m-0 text-h2 font-medium text-ink leading-none">
              {view === "signin" ? "Entrar" : "Redefinir senha"}
            </h1>
            <p className="m-0 text-label text-muted mt-2">
              {view === "reset"
                ? "Informe seu e-mail e enviaremos um link de redefinição."
                : pessoal
                  ? `Controle seus gastos do dia a dia com a ${MARCA}.`
                  : `Acesse o painel financeiro ${MARCA}.`}
            </p>
          </div>

          {view === "signin" && (
            <div className="flex p-1 gap-1 rounded-pill bg-surface-2" role="tablist" aria-label="Tipo de conta">
              {([["empresa", "Empresa"], ["pessoal", "Pessoal"]] as const).map(([val, label]) => {
                const on = (val === "pessoal") === pessoal;
                return (
                  <button
                    key={val}
                    role="tab"
                    aria-selected={on}
                    onClick={() => setTipo(val)}
                    className={`flex-1 text-label font-medium rounded-pill py-[7px] transition-colors ${on ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink"}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          {!configured && (
            <p className="m-0 text-caption text-warning">
              Supabase não configurado neste ambiente — modo demonstração, sem exigir login.
            </p>
          )}

          <div className="flex flex-col gap-4">
            <Input
              label="E-mail"
              type="email"
              autoComplete="email"
              value={email}
              invalid={erroEmail}
              aria-invalid={erroEmail}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@empresa.com"
              onKeyDown={(e) => e.key === "Enter" && (view === "signin" ? entrar() : resetar())}
            />

            {view === "signin" && (
              <Input
                label="Senha"
                type={showPw ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                invalid={erroSenha}
                aria-invalid={erroSenha}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                onKeyDown={(e) => e.key === "Enter" && entrar()}
                suffix={
                  <button
                    type="button"
                    onClick={() => setShowPw((s) => !s)}
                    aria-label={showPw ? "Ocultar senha" : "Mostrar senha"}
                    className="inline-flex p-1 -mr-1 rounded hover:bg-surface-2"
                  >
                    <Icon name={showPw ? "eye-off" : "eye"} size={16} color="var(--color-text-tertiary)" />
                  </button>
                }
              />
            )}

            {msg && (
              <p role={msg.tone === "error" ? "alert" : "status"} className={`m-0 text-caption ${msg.tone === "error" ? "text-negative" : "text-positive"}`}>
                {msg.text}
              </p>
            )}

            {view === "signin" ? (
              <Button variant="primary" fullWidth disabled={busy} aria-busy={busy} onClick={entrar}>
                {busy ? <Spinner /> : "Entrar"}
              </Button>
            ) : (
              <div className="flex flex-col gap-2">
                <Button variant="primary" fullWidth disabled={busy} aria-busy={busy} onClick={resetar}>
                  {busy ? <Spinner /> : "Enviar link de redefinição"}
                </Button>
                <button className="text-label text-muted hover:text-ink text-center" onClick={() => { setView("signin"); setMsg(null); }}>
                  Voltar ao login
                </button>
              </div>
            )}
          </div>

          {view === "signin" && (
            <div className="flex flex-col gap-3">
              <button className="text-label text-muted hover:text-ink text-left" onClick={() => { setView("reset"); setMsg(null); setTouched(false); }}>
                Esqueci minha senha
              </button>
              <div className="flex items-center gap-2 text-caption text-faint">
                <span className="flex-1 h-px bg-border-soft" /> ou <span className="flex-1 h-px bg-border-soft" />
              </div>
              {/* ⚠️ Aponta para o cadastro de TRÊS CAMPOS, não para o wizard de
                  sete etapas. Quem chega ao login sem conta quer entrar, não
                  preencher inscrição municipal — o cadastro completo continua a
                  um clique dentro da própria tela de criar conta. */}
              <Button variant="secondary" fullWidth onClick={() => router.push(pessoal ? "/comecar" : "/criar-conta")} leftIcon={<Icon name="arrow-up-right" size={15} />}>
                {pessoal ? "Criar conta pessoal" : "Criar conta"}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Coluna direita — arte (camadas de fluxo financeiro), some no mobile */}
      <ArtPanel pessoal={pessoal} />
    </MolduraPublica>
  );
}
