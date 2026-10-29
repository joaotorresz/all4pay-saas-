"use client";

import * as React from "react";
import { Button, Card, Input } from "@/components/ui";
import { sairDaConta } from "@/lib/entrada";
import { CONFIRMACAO_EXCLUSAO } from "@/core/conta/exclusao";

/**
 * Excluir a própria conta (exigência das lojas). A regra mora em
 * `core/conta/exclusao`; quem decide é a rota `/api/conta/excluir`.
 *
 * ⚠️ Não é `AcaoDestrutiva`: ela oferece DESFAZER, e uma conta excluída não
 * volta. A trava é digitar a palavra, e o que acontece com os dados da
 * empresa está escrito ANTES do botão.
 */
export function ExcluirConta() {
  const [aberto, setAberto] = React.useState(false);
  const [confirmacao, setConfirmacao] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const pronto = confirmacao.trim().toUpperCase() === CONFIRMACAO_EXCLUSAO;

  async function excluir() {
    setBusy(true);
    setErro(null);
    try {
      const r = await fetch("/api/conta/excluir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmacao }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; motivo?: string };
      if (!r.ok || !j.ok) {
        setErro(j.motivo ?? "A conta não foi excluída. Tente de novo.");
        return;
      }
      await sairDaConta();
      window.location.assign("/login");
    } catch {
      setErro("Sem conexão. A conta não foi excluída.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <span className="text-h3 font-medium text-ink">Excluir minha conta</span>
      <p className="m-0 text-label text-muted max-w-[72ch]">
        Apaga o seu acesso: e-mail, senha, aplicativo autenticador e o vínculo com as empresas. Os
        lançamentos pertencem à empresa e continuam guardados pelo prazo que a lei fiscal exige. Se você
        for a única pessoa de uma empresa, ela fica guardada sem acesso de ninguém; para apagá-la antes,
        fale com o suporte.
      </p>
      {!aberto ? (
        <div>
          <Button variant="secondary" onClick={() => setAberto(true)}>Excluir minha conta</Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 max-w-[420px]">
          <Input
            label={`Digite ${CONFIRMACAO_EXCLUSAO} para confirmar`}
            value={confirmacao}
            onChange={(e) => setConfirmacao(e.target.value)}
            autoComplete="off"
          />
          {erro && <p role="alert" className="m-0 text-caption text-negative">{erro}</p>}
          <div className="flex items-center gap-2">
            <Button disabled={!pronto || busy} aria-busy={busy} onClick={excluir}>
              {busy ? "Excluindo…" : "Excluir de vez"}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => { setAberto(false); setConfirmacao(""); setErro(null); }}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
