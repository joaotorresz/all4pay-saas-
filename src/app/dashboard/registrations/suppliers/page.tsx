import { AppShell } from "@/components/app/AppShell";
import { PartesView } from "@/components/registros/PartesView";

export default function FornecedoresPage() {
  return (
    <AppShell title="Fornecedores" crumb="Estrutura e cadastros">
      <PartesView lado="fornecedor" />
    </AppShell>
  );
}
