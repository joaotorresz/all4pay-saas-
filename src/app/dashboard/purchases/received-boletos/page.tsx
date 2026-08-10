import { AppShell } from "@/components/app/AppShell";
import { BoletosView } from "@/components/compras/RecebidosViews";

export default function BoletosRecebidosPage() {
  return (
    <AppShell title="Boletos recebidos (DDA)" crumb="Compras">
      <BoletosView />
    </AppShell>
  );
}
