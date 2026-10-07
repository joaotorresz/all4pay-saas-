"use client";

import * as React from "react";
import { Button, CampoCodigo } from "@/components/ui";
import { MolduraPublica } from "@/components/app/MolduraPublica";
import { useTipoConta } from "@/components/app/useTipoConta";
import { ArtPanel, Spinner } from "@/components/entrada/ArtePublica";
import { entrarComCodigo, sairDaConta } from "@/lib/entrada";
import { DIGITOS_CODIGO, codigoCompleto } from "@/core/segundo-fator";
import { MARCA } from "@/core/marca";

const configured = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

/**
 * O passo do código na entrada.
 *
 * ⚠️ **Nada fala com o servidor na montagem** (como a tela da senha nova): no
 * build de demonstração não há Supabase, e criar o cliente sem endereço lança.
 * A rede só entra no clique, e só com Supabase.
 *
 * ⚠️ **O destino depois do código vem da SESSÃO** (`entrarComCodigo`), nunca
 * da URL — quem chegou pelo "esqueci a senha" volta à tela da senha nova; o
 * resto, ao início.
 *
 * ⚠️ **"Sair" é a saída de quem está sem o celular**: sem ela, a pessoa ficaria
 * presa num passo que não consegue cumprir, sem nem poder trocar de conta.
 */
export function SegundoFatorEntradaView() {
  const { pessoal } = useTipoConta();
  const [codigo, setCodigo] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<{ tone: "error" | "ok"; text: string } | null>(null);

  async function confirmar() {
    if (busy) return;
    if (!configured) {
      setMsg({ tone: "error", text: "O código de verificação não existe no modo demonstração." });
      return;
    }
    if (!codigoCompleto(codigo)) {
      setMsg({ tone: "error", text: `Digite os ${DIGITOS_CODIGO} números que aparecem no aplicativo.` });
      return;
    }
    setBusy(true); setMsg(null);
    const r = await entrarComCodigo(codigo);
    if (!r.ok) {
      setBusy(false);
      setCodigo("");
      setMsg({ tone: "error", text: r.comoResolver ? `${r.motivo} ${r.comoResolver}` : r.motivo });
      return;
    }
    setMsg({ tone: "ok", text: "Código confirmado. Entrando…" });
    // Página inteira, como o login: o servidor lê a sessão nova uma vez.
    window.location.assign(r.destino);
  }

  async function sair() {
    if (configured) await sairDaConta();
    window.location.assign("/login");
  }

  return (
    <MolduraPublica cartaoClassName="grid lg:grid-cols-2">
      <div className="flex flex-col items-center justify-center px-6 py-12 overflow-y-auto">
        <div className="w-[380px] max-w-full flex flex-col gap-6">
          <div>
            <h1 className="m-0 text-h2 font-medium text-ink leading-none">Código de verificação</h1>
            <p className="m-0 text-label text-muted mt-2">
              Abra o aplicativo autenticador do seu celular e digite o código de {DIGITOS_CODIGO} dígitos
              da {MARCA}. Ele muda a cada 30 segundos.
            </p>
          </div>

          {!configured && (
            <p className="m-0 text-caption text-warning">
              Supabase não configurado neste ambiente — modo demonstração, sem conta para verificar.
            </p>
          )}

          <div className="flex flex-col gap-4">
            <CampoCodigo valor={codigo} onMudar={setCodigo} onConfirmar={confirmar} autoFocus disabled={busy} invalido={msg?.tone === "error"} />

            {msg && (
              <p role={msg.tone === "error" ? "alert" : "status"} className={`m-0 text-caption ${msg.tone === "error" ? "text-negative" : "text-positive"}`}>
                {msg.text}
              </p>
            )}

            <Button variant="primary" fullWidth disabled={busy} aria-busy={busy} onClick={confirmar}>
              {busy ? <Spinner /> : "Confirmar"}
            </Button>
            <button type="button" className="text-label text-muted hover:text-ink text-center" onClick={sair}>
              Sair e entrar com outra conta
            </button>
          </div>

          <p className="m-0 text-caption text-faint">
            Sem acesso ao celular? Fale com o suporte da {MARCA}: retirar o segundo fator de uma conta exige
            conferir que é você, e não se faz pela tela.
          </p>
        </div>
      </div>

      <ArtPanel pessoal={pessoal} />
    </MolduraPublica>
  );
}
