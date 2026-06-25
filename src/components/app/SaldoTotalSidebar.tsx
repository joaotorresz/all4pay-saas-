"use client";

/**
 * Saldo total na Sidebar — substitui a barra de busca. Mostra o saldo
 * consolidado (soma das contas) com um olho clicável para ocultar/mostrar,
 * estilo app de banco. Preferência persistida (a4p_saldo_oculto). A busca ⌘K
 * segue disponível pelo atalho de teclado.
 */
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { BRL, Icon } from "@/components/ui";
import { getAccountsList } from "@/lib/data";

const KEY = "a4p_saldo_oculto";

export function SaldoTotalSidebar({ collapsed }: { collapsed: boolean }) {
  const { data, isLoading } = useQuery({ queryKey: ["accounts-list"], queryFn: getAccountsList });
  const total = (data ?? []).reduce((s, a) => s + Number(a.balance ?? 0), 0);

  const [oculto, setOculto] = React.useState(false);
  React.useEffect(() => { try { setOculto(localStorage.getItem(KEY) === "1"); } catch { /* ignore */ } }, []);
  const alternar = () => setOculto((o) => { const n = !o; try { localStorage.setItem(KEY, n ? "1" : "0"); } catch { /* ignore */ } return n; });

  if (collapsed) {
    return (
      <button
        onClick={alternar}
        title={oculto ? "Mostrar saldo" : "Ocultar saldo"}
        aria-label={oculto ? "Mostrar saldo" : "Ocultar saldo"}
        className="flex items-center justify-center rounded-md py-[9px] mb-[14px] hover:bg-surface-1"
      >
        <Icon name={oculto ? "eye-off" : "eye"} size={16} color="var(--color-text-secondary)" />
      </button>
    );
  }

  // Box sutil que segue o tema da sidebar (clara/escura) — sem inversão.
  return (
    <div className="flex items-center gap-2 rounded-md bg-surface-2 px-[11px] py-[9px] mb-[14px]">
      <div className="min-w-0 flex-1">
        <div className="text-[12px] text-faint leading-none mb-[5px]">Saldo total</div>
        {isLoading ? (
          <div className="h-[23px] w-24 rounded bg-surface-3 animate-pulse" />
        ) : oculto ? (
          <div className="text-[23px] font-semibold text-ink leading-none tabular-nums tracking-widest">••••••</div>
        ) : (
          <div className="text-[23px] font-semibold text-ink leading-none tabular-nums"><BRL value={total} /></div>
        )}
      </div>
      <button
        onClick={alternar}
        title={oculto ? "Mostrar saldo" : "Ocultar saldo"}
        aria-label={oculto ? "Mostrar saldo" : "Ocultar saldo"}
        aria-pressed={oculto}
        className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-md hover:bg-surface-3"
      >
        <Icon name={oculto ? "eye-off" : "eye"} size={16} color="var(--color-text-secondary)" />
      </button>
    </div>
  );
}
