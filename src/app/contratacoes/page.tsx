import { AppShell } from "@/components/app/AppShell";
import { HeadcountView } from "@/components/contratacoes/HeadcountView";

/** Plano de contratações — Pro (`ROTAS_PRO` tranca `/contratacoes` no servidor). */
export default function ContratacoesPage() {
  return (
    <AppShell title="Plano de contratações" crumb="Inteligência">
      <HeadcountView />
    </AppShell>
  );
}
