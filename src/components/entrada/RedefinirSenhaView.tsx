"use client";

import * as React from "react";
import { Button, Input, Icon } from "@/components/ui";
import { MolduraPublica } from "@/components/app/MolduraPublica";
import { useTipoConta } from "@/components/app/useTipoConta";
import { ArtPanel, Spinner } from "@/components/entrada/ArtePublica";
import { redefinirSenha } from "@/lib/entrada";
import { MIN_SENHA, problemaDaSenha } from "@/core/recuperacao";

const configured = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

/**
 * A TELA DA SENHA NOVA — o fim do "esqueci a senha".
 *
 * Chega-se aqui só pelo link do e-mail: a rota de retorno troca o código pela
 * sessão de recuperação e manda para cá. Sem sessão, o middleware devolve ao
 * login antes de esta tela abrir.
 *
 * ⚠️ **Nada fala com o servidor na montagem.** No build de demonstração não há
 * Supabase, e criar o cliente sem endereço lança — a tela tem de abrir e
 * explicar, não quebrar. A rede só entra no clique, e só com Supabase.
 *
 * ⚠️ **As duas senhas são conferidas ANTES da rede** (`problemaDaSenha`): a
 * diferença entre elas não é coisa que o servidor possa dizer, e o mínimo é o
 * mesmo do cadastro (`MIN_SENHA`) — uma regra só, nas duas portas.
 */
export function RedefinirSenhaView() {
  const { pessoal } = useTipoConta();
  const [nova, setNova] = React.useState("");
  const [repetida, setRepetida] = React.useState("");
  const [mostrar, setMostrar] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<{ tone: "error" | "ok"; text: string } | null>(null);

  async function salvar() {
    if (busy) return;
    if (!configured) {
      setMsg({ tone: "error", text: "A redefinição de senha não existe no modo demonstração." });
      return;
    }
    const problema = problemaDaSenha(nova, repetida);
    if (problema) { setMsg({ tone: "error", text: problema }); return; }
    setBusy(true); setMsg(null);
    const r = await redefinirSenha(nova);
    if (!r.ok) {
      setBusy(false);
      const comoResolver = "comoResolver" in r ? r.comoResolver : undefined;
      setMsg({ tone: "error", text: comoResolver ? `${r.motivo} ${comoResolver}` : r.motivo });
      return;
    }
    setMsg({ tone: "ok", text: "Senha alterada. Entrando…" });
    // A mesma entrada do login: página inteira, para o servidor ler a sessão
    // nova uma vez (ver o comentário de `go` em app/login/page.tsx).
    window.location.assign("/");
  }

  const olho = (
    <button
      type="button"
      onClick={() => setMostrar((s) => !s)}
      aria-label={mostrar ? "Ocultar senha" : "Mostrar senha"}
      className="inline-flex p-1 -mr-1 rounded hover:bg-surface-2"
    >
      <Icon name={mostrar ? "eye-off" : "eye"} size={16} color="var(--color-text-tertiary)" />
    </button>
  );

  return (
    <MolduraPublica cartaoClassName="grid lg:grid-cols-2">
      <div className="flex flex-col items-center justify-center px-6 py-12 overflow-y-auto">
        <div className="w-[380px] max-w-full flex flex-col gap-6">
          <div>
            <h1 className="m-0 text-h2 font-medium text-ink leading-none">Criar nova senha</h1>
            <p className="m-0 text-label text-muted mt-2">
              Escolha a nova senha da sua conta. Ela passa a valer assim que for salva, e as outras sessões abertas são encerradas.
            </p>
          </div>

          {!configured && (
            <p className="m-0 text-caption text-warning">
              Supabase não configurado neste ambiente — modo demonstração, sem conta para redefinir.
            </p>
          )}

          <div className="flex flex-col gap-4">
            <Input
              label="Nova senha"
              type={mostrar ? "text" : "password"}
              autoComplete="new-password"
              value={nova}
              onChange={(e) => setNova(e.target.value)}
              placeholder={`pelo menos ${MIN_SENHA} caracteres`}
              suffix={olho}
            />
            <Input
              label="Repita a nova senha"
              type={mostrar ? "text" : "password"}
              autoComplete="new-password"
              value={repetida}
              onChange={(e) => setRepetida(e.target.value)}
              placeholder="a mesma senha de novo"
              onKeyDown={(e) => e.key === "Enter" && salvar()}
            />

            {msg && (
              <p role={msg.tone === "error" ? "alert" : "status"} className={`m-0 text-caption ${msg.tone === "error" ? "text-negative" : "text-positive"}`}>
                {msg.text}
              </p>
            )}

            <Button variant="primary" fullWidth disabled={busy} aria-busy={busy} onClick={salvar}>
              {busy ? <Spinner /> : "Salvar nova senha"}
            </Button>
          </div>
        </div>
      </div>

      <ArtPanel pessoal={pessoal} />
    </MolduraPublica>
  );
}
