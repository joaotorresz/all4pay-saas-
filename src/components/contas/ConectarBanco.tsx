"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Icon } from "@/components/ui";
import { isDemo } from "@/lib/demo";
import { getPluggyConnectToken } from "@/lib/openfinance";

// Widget só no cliente (acessa window) — import dinâmico, sem SSR.
const PluggyConnect = dynamic(
  () => import("react-pluggy-connect").then((m) => m.PluggyConnect),
  { ssr: false },
);

/**
 * Botão "Conectar banco" (Open Finance via Pluggy) na tela /contas.
 * Pede o connect token à Edge Function e abre o widget em sandbox. As contas/
 * transações são populadas pelo webhook; o onSuccess dá o feedback rápido +
 * invalida o React Query para a UI refletir.
 */
export function ConectarBanco() {
  const qc = useQueryClient();
  const [token, setToken] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  const abrir = async () => {
    setErro(null);
    setLoading(true);
    try {
      setToken(await getPluggyConnectToken());
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const fechar = () => setToken(null);
  const concluir = async () => {
    setToken(null);
    // o webhook popula as tabelas; recarrega contas para feedback imediato
    await qc.invalidateQueries();
  };

  if (isDemo) {
    return (
      <Button variant="secondary" disabled leftIcon={<Icon name="building" size={15} />} title="Indisponível em demonstração">
        Conectar banco
      </Button>
    );
  }

  return (
    <>
      <div className="flex flex-col items-end gap-1">
        <Button variant="secondary" onClick={abrir} disabled={loading} leftIcon={<Icon name="building" size={15} />}>
          {loading ? "Conectando…" : "Conectar banco"}
        </Button>
        {erro && <span className="text-caption text-negative">{erro}</span>}
      </div>
      {token && (
        <PluggyConnect
          connectToken={token}
          includeSandbox
          onSuccess={concluir}
          onClose={fechar}
          onError={() => setErro("Falha ao conectar")}
        />
      )}
    </>
  );
}
