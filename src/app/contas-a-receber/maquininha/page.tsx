import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { MaquininhaQuattro } from "@/components/maquininha/MaquininhaQuattro";

export default function MaquininhaQuattroPage() {
  return (
    <AppShell
      title="Maquininha Quattro"
      crumb="Contas a receber"
      actions={isDemo ? <DemoBadge /> : null}
    >
      <Suspense fallback={null}>
        <MaquininhaQuattro />
      </Suspense>
    </AppShell>
  );
}
