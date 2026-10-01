import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { TituloForm } from "@/components/movimentacoes/TituloForm";

export default function NovaContaReceberPage() {
  return (
    <AppShell title="Nova conta a receber" crumb="Financeiro">
      <Suspense fallback={null}><TituloForm direcao="receber" /></Suspense>
    </AppShell>
  );
}
