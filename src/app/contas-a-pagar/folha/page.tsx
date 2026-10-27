import { Suspense } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app/AppShell";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { FolhaSalarial } from "@/components/contas-pagar/FolhaSalarial";
import { Icon, classesDoBotao } from "@/components/ui";

/**
 * Folha salarial — o canal PRÓPRIO da despesa, como a Maquininha é o da venda.
 * A ação da tela mora no topo (o molde da Central de vendas: "Emitir NFS-e" em
 * Notas fiscais): cadastrar abre o MESMO formulário de conta a pagar, já no
 * modo Colaborador.
 */

export default function FolhaSalarialPage() {
  return (
    <AppShell
      title="Folha salarial"
      crumb="Central de despesas"
      actions={
        <>
          {isDemo ? <DemoBadge /> : null}
          <Link href="/dashboard/financial/payables/new?modo=folha" className={classesDoBotao("primary")}>
            <Icon name="plus" size={15} color="currentColor" />
            Cadastrar colaborador
          </Link>
        </>
      }
    >
      <Suspense fallback={null}>
        <FolhaSalarial />
      </Suspense>
    </AppShell>
  );
}
