import { AppShell } from "@/components/app/AppShell";
import { ArmazenamentoView } from "@/components/administracao/ArmazenamentoView";

export default function Page() {
  return (
    <AppShell title="Armazenamento e backup" crumb="Administração">
      <ArmazenamentoView />
    </AppShell>
  );
}
