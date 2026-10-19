import { AppShell } from "@/components/app/AppShell";
import { ComprasView } from "@/components/compras/ComprasView";

/* As NFs recebidas e os boletos do DDA moram na caixa de entrada de Títulos a
   pagar desde a reorganização dos menus (19/10/2026): são a mesma pergunta,
   "o que chegou para eu pagar". */
export default function ComprasPage() {
  return (
    <AppShell title="Compras" crumb="Comprar e pagar">
      <ComprasView />
    </AppShell>
  );
}
