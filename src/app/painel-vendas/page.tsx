"use client";
import { VendasDashboardView } from "@/components/dashboards/VendasDashboardView";
import { PeriodProvider } from "@/components/visao-geral/PeriodContext";
export default function PainelVendasPage() {
  return (
    <PeriodProvider>
      <VendasDashboardView />
    </PeriodProvider>
  );
}
