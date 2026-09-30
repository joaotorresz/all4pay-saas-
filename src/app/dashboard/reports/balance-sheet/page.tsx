import { AppShell } from "@/components/app/AppShell";
import { BalancoPatrimonialView } from "@/components/relatorios/BalancoPatrimonialView";

export default function BalancoPatrimonialPage() {
  return (
    <AppShell title="Balanço patrimonial" crumb="Relatórios">
      <BalancoPatrimonialView />
    </AppShell>
  );
}
