import { AppShell } from "@/components/app/AppShell";
import { ProdutosRegistroView } from "@/components/registros/ProdutosRegistroView";
import { estoqueLigado } from "@/core/estoque/ligado";

// O interruptor é lido no SERVIDOR, quando a página é gerada no build. Ligar
// `ESTOQUE` na Vercel pede redeploy, como todo interruptor da plataforma.
// ⚠️ Sem `force-dynamic`: renderizada a cada pedido, a moldura (a lista de
// conversas do menu) diverge da hidratação no navegador e o React reprova.

export default function ProdutosRegistroPage() {
  return (
    <AppShell title="Produtos e serviços" crumb="Estrutura e cadastros">
      <ProdutosRegistroView estoque={estoqueLigado()} />
    </AppShell>
  );
}
