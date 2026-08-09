"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button, Input, Icon } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { useTipoConta } from "@/components/app/useTipoConta";
import { MolduraPublica } from "@/components/app/MolduraPublica";

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

  const go = () => { router.push("/"); router.refresh(); };

  async function entrar() {
    setTouched(true);
    if (!emailOk(email) || !password) return;
    setBusy(true); setMsg(null);
    try {
      const { error } = await createClient().auth.signInWithPassword({ email: email.trim(), password });
      // Anti-enumeração: mensagem genérica, nunca revela se o e-mail existe.
      if (error) { setMsg({ tone: "error", text: "E-mail ou senha inválidos." }); return; }
      go();
    } catch {
      setMsg({ tone: "error", text: "Não foi possível entrar agora. Tente novamente." });
    } finally { setBusy(false); }
  }

  async function resetar() {
    setTouched(true);
    if (!emailOk(email)) return;
    setBusy(true); setMsg(null);
    try {
      await createClient().auth.resetPasswordForEmail(email.trim(), {
        redirectTo: typeof window !== "undefined" ? `${window.location.origin}/login` : undefined,
      });
    } catch { /* silencioso de propósito */ }
    finally {
      setBusy(false);
      // Mensagem neutra SEMPRE (exista ou não o e-mail) — anti-enumeração.
      setMsg({ tone: "ok", text: "Se houver uma conta com esse e-mail, enviamos um link de redefinição." });
    }
  }

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
                  ? "Controle seus gastos do dia a dia com a all4pay."
                  : "Acesse o painel financeiro all4pay."}
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
              <Button variant="secondary" fullWidth onClick={() => router.push("/comecar")} leftIcon={<Icon name="arrow-up-right" size={15} />}>
                {pessoal ? "Criar conta pessoal" : "Criar conta empresarial"}
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

function Spinner() {
  return <span className="inline-block w-4 h-4 rounded-full border-2 border-on-lime/30 border-t-on-lime animate-spin" aria-hidden />;
}

/** Composição geométrica lime → dark (tokens), inspirada na Payfy. */
function ArtPanel({ pessoal }: { pessoal: boolean }) {
  return (
    <div
      className="hidden lg:block relative overflow-hidden"
      style={{ background: "linear-gradient(135deg, var(--color-lime) 0%, var(--color-ink) 78%)" }}
      aria-hidden
    >
      {/* camadas/quadrados arredondados sobrepostos */}
      <div className="absolute rounded-card" style={{ width: 360, height: 360, top: "12%", left: "18%", background: "rgba(255,255,255,0.10)", transform: "rotate(14deg)" }} />
      <div className="absolute rounded-card" style={{ width: 280, height: 280, top: "34%", left: "40%", background: "var(--color-lime-tint)", opacity: 0.18, transform: "rotate(-10deg)" }} />
      <div className="absolute rounded-card" style={{ width: 220, height: 220, top: "52%", left: "20%", background: "rgba(0,0,0,0.18)", transform: "rotate(8deg)" }} />
      <div className="absolute rounded-pill" style={{ width: 520, height: 520, top: "-10%", right: "-12%", background: "rgba(200,217,48,0.18)", filter: "blur(2px)" }} />
      <div className="absolute inset-0 flex items-end p-12">
        <div className="max-w-[420px]">
          <p className="m-0 text-h3 font-medium leading-tight" style={{ color: "var(--color-white)" }}>
            {pessoal
              ? "Seu dinheiro do dia a dia, organizado e sob controle."
              : "O sistema operacional financeiro que também guarda e move o seu dinheiro."}
          </p>
          <p className="m-0 mt-3 text-label" style={{ color: "var(--color-white)", opacity: 0.75 }}>
            {pessoal
              ? "Gastos, contas e orçamento — tudo num lugar só, sem planilha."
              : "Caixa, risco, cobrança e pagamento — em camadas, num lugar só."}
          </p>
        </div>
      </div>
    </div>
  );
}
