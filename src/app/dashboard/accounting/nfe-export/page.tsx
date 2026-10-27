import { AppShell } from "@/components/app/AppShell";
import { EnvioNFsView } from "@/components/contabilidade-export/EnvioNFsView";

/** O pacote mensal das NFs para o contador — era aba de "Enviar ao contador" (27/10/2026). */
export default function NfeExportPage() {
  return (
    <AppShell title="Envio das NFs" crumb="Contabilidade">
      <EnvioNFsView />
    </AppShell>
  );
}
