"use client";

import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { HubShell, type AbaHub } from "@/components/app/HubShell";
import { SimuladorView } from "@/components/orcamento/SimuladorView";
import { HeadcountView } from "@/components/contratacoes/HeadcountView";

/**
 * Simuladores — "e se eu fizer isso, o que acontece com o caixa?"
 * (reorganização dos menus, 19/10/2026). "Posso comprar?" morava como aba do
 * Orçamento e o plano de contratações como rota própria; as duas respondem a
 * mesma pergunta antes de assumir um compromisso.
 *
 * ⚠️ O plano de contratações continua Pro (`ABAS_PRO`), como a rota era.
 */
const ABAS: AbaHub[] = [
  { id: "posso-comprar", label: "Posso comprar?", render: () => <SimuladorView /> },
  { id: "contratacoes", label: "Plano de contratações", render: () => <HeadcountView /> },
];

export default function SimuladoresPage() {
  return (
    <AppShell title="Simuladores" crumb="Inteligência">
      <Suspense fallback={null}>
        <HubShell abas={ABAS} />
      </Suspense>
    </AppShell>
  );
}
