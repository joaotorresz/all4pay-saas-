import type { Metadata } from "next";
import { AppShell } from "@/components/app/AppShell";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { AutonomoView } from "@/components/autonomo/AutonomoView";

export const metadata: Metadata = {
  title: "all4pay — Autônomo",
  description:
    "Autonomous Decision Layer: decision engine, next best action, cobrança autônoma, roteamento de pagamento, políticas SE→ENTÃO e human-in-the-loop.",
};

export default function AutonomoPage() {
  return (
    <AppShell
      title="Autônomo"
      crumb="Autonomous Financial Ops"
      actions={isDemo ? <DemoBadge /> : null}
    >
      <AutonomoView />
    </AppShell>
  );
}
