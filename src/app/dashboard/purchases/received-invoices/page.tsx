import { AppShell } from "@/components/app/AppShell";
import { NFsRecebidasView } from "@/components/compras/RecebidosViews";

export default function NFsRecebidasPage() {
  return (
    <AppShell title="NFs recebidas" crumb="Compras">
      <NFsRecebidasView />
    </AppShell>
  );
}
