import { AppShell } from "@/components/app/AppShell";
import { ArmazenamentoView } from "@/components/administracao/ArmazenamentoView";

export default function Page() {
  return (
    <AppShell title="Armazenamento" crumb="Administração">
      <ArmazenamentoView />
    </AppShell>
  );
}
