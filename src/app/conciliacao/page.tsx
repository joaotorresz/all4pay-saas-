import { AppShell } from "@/components/app/AppShell";
import { ConciliacaoView } from "@/components/visao-geral/ConciliacaoView";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";

export default function ConciliacaoPage({
  searchParams,
}: {
  searchParams: { conta?: string };
}) {
  const conta = searchParams?.conta;
  return (
    <AppShell
      title="Conciliação"
      crumb="Contas Financeiras"
      actions={isDemo ? <DemoBadge /> : null}
    >
      <ConciliacaoView accountId={conta} />
    </AppShell>
  );
}
