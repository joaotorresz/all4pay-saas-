"use client";

import { Suspense } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app/AppShell";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { Secoes, type Secao } from "@/components/app/Secoes";
import { ContasRecorrentes } from "@/components/contas-pagar/ContasRecorrentes";
import { ContratosView } from "@/components/registros/ContratosView";
import { Icon, classesDoBotao } from "@/components/ui";

/**
 * Contas recorrentes + os contratos de FORNECEDOR, numa página só (27/10/2026:
 * eram duas abas). O contrato é a regra que a conta recorrente repete; morar
 * logo abaixo dela evita a terceira porta. Os de cliente moram em Assinaturas
 * e contratos.
 */
const SECOES: Secao[] = [
  { id: "recorrentes", titulo: "Recorrentes", desc: "O que se repete todo mês, e o custo fixo", conteudo: <ContasRecorrentes /> },
  { id: "contratos-fornecedor", titulo: "Contratos de fornecedor", desc: "As regras que geram as contas recorrentes", conteudo: <ContratosView lado="fornecedor" /> },
];

export default function ContasRecorrentesPage() {
  return (
    <AppShell
      title="Contas recorrentes"
      crumb="Central de despesas"
      actions={
        <>
          {isDemo ? <DemoBadge /> : null}
          {/* A ação no topo, como "Emitir NFS-e" em Notas fiscais: o MESMO
              formulário de conta a pagar, já no modo recorrente. */}
          <Link href="/dashboard/financial/payables/new?modo=recorrente" className={classesDoBotao("primary")}>
            <Icon name="plus" size={15} color="currentColor" />
            Nova conta recorrente
          </Link>
        </>
      }
    >
      <Suspense fallback={null}>
        <Secoes secoes={SECOES} />
      </Suspense>
    </AppShell>
  );
}
