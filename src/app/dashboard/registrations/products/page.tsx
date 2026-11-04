import { AppShell } from "@/components/app/AppShell";
import { ProdutosRegistroView } from "@/components/registros/ProdutosRegistroView";
import { estoqueLigado } from "@/core/estoque/ligado";

// O interruptor é lido a cada pedido (no servidor): ligar `ESTOQUE` na Vercel
// não pode depender de uma página gerada no build.
export const dynamic = "force-dynamic";

export default function ProdutosRegistroPage() {
  return (
    <AppShell title="Produtos e serviços" crumb="Estrutura e cadastros">
      <ProdutosRegistroView estoque={estoqueLigado()} />
    </AppShell>
  );
}
