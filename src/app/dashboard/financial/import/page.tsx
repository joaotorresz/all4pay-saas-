"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";
import { ImportacaoView } from "@/components/movimentacoes/ImportacaoView";

function Conteudo() {
  const sp = useSearchParams();
  const t = sp.get("tipo");
  const tipo = t === "pagar" || t === "transferencias" ? t : "receber";
  return (
    <AppShell title="Importação em lote" crumb="Financeiro">
      <ImportacaoView tipoInicial={tipo} />
    </AppShell>
  );
}

export default function ImportacaoPage() {
  return (
    <React.Suspense fallback={null}>
      <Conteudo />
    </React.Suspense>
  );
}
