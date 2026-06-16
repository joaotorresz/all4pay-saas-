"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Icon } from "@/components/ui";
import { isDemo } from "@/lib/demo";
import { getPluggyConnectToken, syncPluggyItem } from "@/lib/openfinance";
import { getPendingMovements, type PendingMovement } from "@/lib/confirmacao";
import { ConfirmacaoModal } from "@/components/confirmacao/ConfirmacaoModal";

// Widget só no cliente (acessa window) — import dinâmico, sem SSR.
const PluggyConnect = dynamic(
  () => import("react-pluggy-connect").then((m) => m.PluggyConnect),
  { ssr: false },
);

/**
 * Botão "Conectar banco" (Open Finance via Pluggy) na tela /contas.
 * Pede o connect token à Edge Function e abre o widget em sandbox. No onSuccess,
 * dispara o sync ATIVO ({ itemId }) — o webhook não dispara em sandbox — que
 * popula contas/transações + movements e invalida o React Query.
 */
type ItemData = { item?: { id?: string } } | undefined;

export function ConectarBanco() {
  const qc = useQueryClient();
  const [token, setToken] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [sincronizando, setSincronizando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState<string | null>(null);
  const [revisao, setRevisao] = React.useState<PendingMovement[] | null>(null);

  const abrir = async () => {
    setErro(null); setOk(null);
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

  const concluir = async (itemData: ItemData) => {
    setToken(null);
    const itemId = itemData?.item?.id;
    if (!itemId) { await qc.invalidateQueries(); return; }
    setSincronizando(true); setErro(null);
    try {
      const r = await syncPluggyItem(itemId);
      setOk(`Sincronizado: ${r.accounts} conta(s), ${r.transactions} transação(ões).`);
      await qc.invalidateQueries();
      // Abre o box de confirmação (uma a uma) se houver transações a revisar.
      const pend = await getPendingMovements();
      if (pend.length) setRevisao(pend);
    } catch (e) {
      setErro(`Falha ao sincronizar: ${(e as Error).message}`);
    } finally {
      setSincronizando(false);
    }
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
        <Button variant="secondary" onClick={abrir} disabled={loading || sincronizando} leftIcon={<Icon name="building" size={15} />}>
          {sincronizando ? "Sincronizando…" : loading ? "Conectando…" : "Conectar banco"}
        </Button>
        {erro && <span className="text-caption text-negative">{erro}</span>}
        {ok && <span className="text-caption text-positive">{ok}</span>}
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
      {revisao && <ConfirmacaoModal itens={revisao} onClose={() => setRevisao(null)} />}
    </>
  );
}
