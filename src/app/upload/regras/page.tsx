"use client";

import { AppShell } from "@/components/app/AppShell";
import { RegrasView } from "@/components/ingestao/RegrasView";

/** Regras de categoria — escreva uma vez, vale para toda importação. */
export default function RegrasCategoriaPage() {
  return (
    <AppShell title="Regras de categoria" crumb="Caixa e bancos">
      <RegrasView />
    </AppShell>
  );
}
