"use client";

import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { Secoes, type Secao } from "@/components/app/Secoes";
import { InadimplenciaView } from "@/components/inadimplencia/InadimplenciaView";
import { ReguaCobrancaView } from "@/components/inadimplencia/ReguaCobrancaView";

/**
 * Inadimplência e cobrança — O QUE FAZER com cada atraso hoje (a régua) e
 * QUEM está atrasado (risco por cliente), numa página só.
 *
 * ⚠️ Eram duas abas até 27/10/2026. A régua é o passo seguinte da mesma
 * pergunta: saber que o cliente atrasou e não ter onde agir obriga a
 * atravessar o produto no meio da tarefa — e a aba escondia uma das metades.
 * `?painel=regua` e `?painel=risco` rolam até a seção.
 */
const SECOES: Secao[] = [
  { id: "regua", titulo: "Régua de cobrança", desc: "Quem cobrar hoje, e em que etapa", conteudo: <ReguaCobrancaView /> },
  { id: "risco", titulo: "Risco por cliente", desc: "Score, fatores e a chance de recuperar", conteudo: <InadimplenciaView /> },
];

export default function Page() {
  return (
    <AppShell title="Cobrança e inadimplência" crumb="Central de vendas">
      <Suspense fallback={null}>
        <Secoes secoes={SECOES} param="painel" />
      </Suspense>
    </AppShell>
  );
}
