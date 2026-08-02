import { AppShell } from "@/components/app/AppShell";
import { DominioExportView } from "@/components/contabilidade-export/DominioExportView";

export default function DominioExportPage() {
  return (
    <AppShell title="Gerar TXT contábil — Domínio" crumb="Contabilidade">
      <DominioExportView />
    </AppShell>
  );
}
