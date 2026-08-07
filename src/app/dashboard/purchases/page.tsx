import { AppShell } from "@/components/app/AppShell";
import { ComprasView } from "@/components/compras/ComprasView";

export default function ComprasPage() {
  return (
    <AppShell title="Compras" crumb="Compras">
      <ComprasView />
    </AppShell>
  );
}
