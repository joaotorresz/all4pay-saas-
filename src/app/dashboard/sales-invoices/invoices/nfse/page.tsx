import { AppShell } from "@/components/app/AppShell";
import { NfseView } from "@/components/nfse/NfseView";

/**
 * Emitir NFS-e — o emissor de nota de serviço avulsa. Era a aba "Emitir NFS-e"
 * de Notas fiscais; desde 27/10/2026 abre pelo botão do topo de lá.
 */
export default function EmitirNfsePage() {
  return (
    <AppShell title="Emitir NFS-e" crumb="Notas fiscais">
      <NfseView />
    </AppShell>
  );
}
