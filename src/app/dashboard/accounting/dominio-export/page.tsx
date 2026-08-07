import { AppShell } from "@/components/app/AppShell";
import { DominioExportView } from "@/components/contabilidade-export/DominioExportView";

export default function DominioExportPage() {
  return (
    <AppShell title="Gerar TXT contábil" crumb="Contabilidade">
      <DominioExportView />
    </AppShell>
  );
}
