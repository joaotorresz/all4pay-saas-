import { AppShell } from "@/components/app/AppShell";
import { ProdutosRegistroView } from "@/components/registros/ProdutosRegistroView";

export default function ProdutosRegistroPage() {
  return (
    <AppShell title="Produtos e serviços" crumb="Cadastros">
      <ProdutosRegistroView />
    </AppShell>
  );
}
