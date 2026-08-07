import { AppShell } from "@/components/app/AppShell";
import { PartesView } from "@/components/registros/PartesView";

export default function FornecedoresPage() {
  return (
    <AppShell title="Fornecedores" crumb="Cadastros">
      <PartesView lado="fornecedor" />
    </AppShell>
  );
}
