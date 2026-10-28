"use client";

import { AppShell } from "@/components/app/AppShell";
import { LimpezaDuplicatas } from "@/components/upload/LimpezaDuplicatas";

/** Duplicatas — encontra e remove as cópias já gravadas na base. */
export default function DuplicatasPage() {
  return (
    <AppShell title="Duplicatas" crumb="Caixa e bancos">
      <LimpezaDuplicatas />
    </AppShell>
  );
}
