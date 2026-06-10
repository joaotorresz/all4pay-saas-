"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Card, Button, Input, Icon } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

const configured = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = React.useState<"signin" | "signup">("signin");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<{ tone: "error" | "ok"; text: string } | null>(null);

  const go = () => {
    router.push("/");
    router.refresh();
  };

  async function submit() {
    setBusy(true);
    setMsg(null);
    try {
      const supabase = createClient();
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data.session) go();
        else setMsg({ tone: "ok", text: "Conta criada. Verifique seu e-mail para confirmar o acesso." });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        go();
      }
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof Error ? e.message : "Falha na autenticação." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-1 px-4">
      <div className="w-[400px] max-w-full">
        <div className="flex justify-center mb-6">
          <Image src="/all4pay-dark.png" alt="all4pay" width={130} height={26} className="h-[26px] w-auto" priority />
        </div>
        <Card className="flex flex-col gap-4">
          <div>
            <h1 className="m-0 text-h3 font-medium text-ink">
              {mode === "signin" ? "Entrar" : "Criar conta"}
            </h1>
            <p className="m-0 text-label text-muted mt-1">
              Acesse o painel financeiro all4pay.
            </p>
          </div>

          {!configured && (
            <p className="m-0 text-caption text-warning">
              Supabase não configurado neste ambiente — o app está em modo demonstração e não exige login.
            </p>
          )}

          <Input
            label="E-mail"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@empresa.com"
          />
          <Input
            label="Senha"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />

          {msg && (
            <p className={`m-0 text-caption ${msg.tone === "error" ? "text-negative" : "text-positive"}`}>
              {msg.text}
            </p>
          )}

          <Button variant="primary" fullWidth disabled={busy || !email || !password} onClick={submit}>
            {busy ? "Aguarde…" : mode === "signin" ? "Entrar" : "Criar conta"}
          </Button>

          <button
            className="text-label text-muted hover:text-ink text-center"
            onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMsg(null); }}
          >
            {mode === "signin" ? "Não tem conta? Criar agora" : "Já tem conta? Entrar"}
          </button>

          <div className="flex items-center gap-2 text-caption text-faint">
            <span className="flex-1 h-px bg-border-soft" /> ou <span className="flex-1 h-px bg-border-soft" />
          </div>

          <Button
            variant="secondary"
            fullWidth
            onClick={() => { router.push("/comecar"); }}
            leftIcon={<Icon name="arrow-up-right" size={15} />}
          >
            Criar empresa (onboarding guiado)
          </Button>
        </Card>
      </div>
    </div>
  );
}
