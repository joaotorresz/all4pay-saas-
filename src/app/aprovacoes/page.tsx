"use client";

import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { HubShell, type AbaHub } from "@/components/app/HubShell";
import { AprovacoesView } from "@/components/aprovacoes/AprovacoesView";
import { InstitutionalView } from "@/components/institucional/InstitutionalView";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";

/**
 * Aprovações — a fila E as regras que a governam, num endereço só.
 *
 * ⚠️ `/governanca` era uma segunda tela para a mesma pergunta ("quem pode
 * aprovar o quê, e quem aprovou"), com um item de menu próprio em
 * Configurações. A fila ficava num lugar e a alçada que decide a fila, noutro.
 * Agora a alçada, os papéis e a trilha assinada são o segundo painel daqui.
 * O parâmetro é `painel`, não `aba`: a fila já usa as próprias abas internas.
 */
const PAINEIS: AbaHub[] = [
  { id: "fila", label: "Solicitações", render: () => <AprovacoesView /> },
  { id: "governanca", label: "Alçadas, papéis e trilha", render: () => <InstitutionalView /> },
];

export default function AprovacoesPage() {
  return (
    <AppShell title="Aprovações" crumb="Pagar · gate de alçada" actions={isDemo ? <DemoBadge /> : undefined}>
      <Suspense fallback={null}>
        <HubShell abas={PAINEIS} param="painel" />
      </Suspense>
    </AppShell>
  );
}
