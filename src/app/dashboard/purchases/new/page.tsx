import { AppShell } from "@/components/app/AppShell";
import { CompraForm } from "@/components/compras/CompraForm";

export default function NovaCompraPage() {
  return (
    <AppShell title="Nova compra" crumb="Compras">
      <CompraForm />
    </AppShell>
  );
}
