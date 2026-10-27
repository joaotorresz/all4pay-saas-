import { AppShell } from "@/components/app/AppShell";
import { CronogramasView } from "@/components/cronogramas/CronogramasView";

/** Cronogramas de amortização e depreciação — era aba do Razão contábil (27/10/2026). */
export default function CronogramasPage() {
  return (
    <AppShell title="Cronogramas" crumb="Contabilidade">
      <CronogramasView />
    </AppShell>
  );
}
