"use client";

/**
 * Contas a Receber · Contas a Pagar · Transferências — as três abas do dia a
 * dia do dinheiro num destino só, como no print (`?tab=`).
 */
import * as React from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";
import { TitulosView } from "@/components/movimentacoes/TitulosView";
import { TransferenciasView } from "@/components/movimentacoes/TransferenciasView";

const ABAS = [
  { id: "receivables", label: "Contas a Receber", titulo: "Contas a Receber" },
  { id: "payables", label: "Contas a Pagar", titulo: "Contas a Pagar" },
  { id: "transfers", label: "Transferências", titulo: "Transferências" },
] as const;

function Conteudo() {
  const sp = useSearchParams();
  const router = useRouter();
  const aba = ABAS.find((a) => a.id === sp.get("tab")) ?? ABAS[0];

  return (
    <AppShell title={aba.titulo} crumb="Financeiro">
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-1 border-b border-border-soft -mt-1 overflow-x-auto">
          {ABAS.map((a) => {
            const on = a.id === aba.id;
            return (
              <button
                key={a.id}
                onClick={() => router.replace(`/dashboard/financial/accounts-and-transfers?tab=${a.id}`)}
                aria-current={on ? "page" : undefined}
                className={`relative px-3 py-2 text-label whitespace-nowrap transition-colors ${on ? "text-ink font-medium" : "text-muted hover:text-ink"}`}
              >
                {a.label}
                {on && <span className="absolute left-0 -bottom-px w-full h-[2px] bg-ink rounded-pill" />}
              </button>
            );
          })}
        </div>
        {aba.id === "transfers"
          ? <TransferenciasView />
          : <TitulosView direcao={aba.id === "receivables" ? "receber" : "pagar"} />}
      </div>
    </AppShell>
  );
}

export default function ContasETransferenciasPage() {
  return (
    <React.Suspense fallback={null}>
      <Conteudo />
    </React.Suspense>
  );
}
