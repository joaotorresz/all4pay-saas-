import { AppShell } from "@/components/app/AppShell";
import { DimensoesView } from "@/components/dimensoes/DimensoesView";
import { RelatoriosRazaoView } from "@/components/relatorios/RelatoriosRazaoView";

/** Dimensões e o pivot do razão — era aba do Razão contábil (27/10/2026). */
export default function DimensoesPage() {
  return (
    <AppShell title="Dimensões" crumb="Contabilidade">
      <div className="flex flex-col gap-5">
        <DimensoesView />
        <RelatoriosRazaoView soPivot />
      </div>
    </AppShell>
  );
}
