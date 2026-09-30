import { AppShell } from "@/components/app/AppShell";
import { AtalhosTela } from "@/components/app/AtalhosTela";
import { ComprasView } from "@/components/compras/ComprasView";

export default function ComprasPage() {
  return (
    <AppShell title="Compras" crumb="Compras">
      <div className="flex flex-col gap-5">
        {/* As caixas de entrada fiscais da compra saíram do menu e moram aqui. */}
        <AtalhosTela
          rotulo="Caixas de entrada"
          atalhos={[
            { label: "NFs recebidas", href: "/dashboard/purchases/received-invoices", icon: "receipt" },
            { label: "Boletos recebidos (DDA)", href: "/dashboard/purchases/received-boletos", icon: "file-text" },
          ]}
        />
        <ComprasView />
      </div>
    </AppShell>
  );
}
