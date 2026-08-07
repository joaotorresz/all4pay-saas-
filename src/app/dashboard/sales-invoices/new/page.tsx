"use client";

import * as React from "react";
import { AppShell } from "@/components/app/AppShell";
import { VendaForm } from "@/components/vendas-nf/VendaForm";

export default function NovaVendaPage() {
  return (
    <AppShell title="Nova venda" crumb="Vendas e NFs">
      <React.Suspense fallback={null}>
        <VendaForm />
      </React.Suspense>
    </AppShell>
  );
}
