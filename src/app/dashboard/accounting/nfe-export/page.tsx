import { AppShell } from "@/components/app/AppShell";
import { EnvioNFsView } from "@/components/contabilidade-export/EnvioNFsView";

export default function EnvioNFsPage() {
  return (
    <AppShell title="Envio das NFs ao contador" crumb="Contabilidade">
      <EnvioNFsView />
    </AppShell>
  );
}
