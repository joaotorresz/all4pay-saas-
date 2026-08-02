import { AppShell } from "@/components/app/AppShell";
import { ProjetosRegistroView } from "@/components/registros/ProjetosCentrosView";

export default function ProjetosRegistroPage() {
  return (
    <AppShell title="Projetos" crumb="Cadastros">
      <ProjetosRegistroView />
    </AppShell>
  );
}
