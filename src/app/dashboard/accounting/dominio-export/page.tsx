import { AppShell } from "@/components/app/AppShell";
import { DominioExportView } from "@/components/contabilidade-export/DominioExportView";

/** O TXT contábil no layout Domínio — era aba de "Enviar ao contador" (27/10/2026). */
export default function DominioExportPage() {
  return (
    <AppShell title="TXT Domínio" crumb="Contabilidade">
      <DominioExportView />
    </AppShell>
  );
}
