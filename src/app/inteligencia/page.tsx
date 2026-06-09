import type { Metadata } from "next";
import { AppShell } from "@/components/app/AppShell";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { QuantView } from "@/components/quant/QuantView";

export const metadata: Metadata = {
  title: "all4pay — Inteligência financeira",
  description:
    "Camada quantitativa: KPIs institucionais, score de saúde financeira, radar executivo, score preditivo e benchmark — o CFO digital.",
};

export default function InteligenciaPage() {
  return (
    <AppShell
      title="Inteligência financeira"
      crumb="Camada quantitativa"
      actions={isDemo ? <DemoBadge /> : null}
    >
      <QuantView />
    </AppShell>
  );
}
