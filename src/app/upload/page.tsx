"use client";

import { Suspense } from "react";
import Link from "next/link";
import { Icon, classesDoBotao } from "@/components/ui";
import { AppShell } from "@/components/app/AppShell";
import { IngestaoView } from "@/components/ingestao/IngestaoView";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";

/**
 * Entrada de dados — conectar o banco e enviar o extrato.
 *
 * ⚠️ Regras de categoria e Duplicatas saíram do menu em 03/11/2026 (Fase 2 do
 * plano: Caixa e bancos enxuto). As duas telas seguem nos endereços delas e a
 * porta é aqui, nos botões do topo, porque é na importação que elas servem.
 * A guarda `menu-portas` cobra que a porta exista.
 */
export default function UploadPage() {
  return (
    <AppShell
      title="Entrada de dados"
      crumb="Caixa e bancos"
      actions={
        <>
          {isDemo ? <DemoBadge /> : null}
          <Link href="/upload/regras" className={classesDoBotao("secondary")}>
            <Icon name="workflow" size={15} color="currentColor" />
            Regras de categoria
          </Link>
          <Link href="/upload/duplicatas" className={classesDoBotao("secondary")}>
            <Icon name="scan-line" size={15} color="currentColor" />
            Duplicatas
          </Link>
        </>
      }
    >
      <Suspense fallback={null}>
        <IngestaoView />
      </Suspense>
    </AppShell>
  );
}
