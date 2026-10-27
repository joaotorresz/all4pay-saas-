import { AppShell } from "@/components/app/AppShell";
import { BoletosView } from "@/components/boletos/BoletosView";

/**
 * Boletos e PIX. Era aba da tela Vendas, desativada a pedido do dono
 * (27/10/2026); voltou ao endereço próprio — sem ele a geração de boleto
 * sairia do produto e ninguém notaria até procurá-la.
 */
export default function Page() {
  return (
    <AppShell title="Boletos e PIX" crumb="Central de vendas">
      <BoletosView />
    </AppShell>
  );
}
