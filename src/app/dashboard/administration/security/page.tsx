import { AppShell } from "@/components/app/AppShell";
import { SegurancaView } from "@/components/administracao/SegurancaView";

export default function Page() {
  return (
    <AppShell title="Segurança e isolamento" crumb="Administração">
      <SegurancaView />
    </AppShell>
  );
}
