import { Suspense } from "react";
import Link from "next/link";
import { Icon, classesDoBotao } from "@/components/ui";
import { AppShell } from "@/components/app/AppShell";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { MaquininhaQuattro } from "@/components/maquininha/MaquininhaQuattro";

/**
 * Maquininha Quattro — vendas, taxas e recebíveis da maquininha Pinbank.
 *
 * ⚠️ 03/11/2026: o simulador de venda (`/pos/venda`) e as taxas (`/pos/taxas`)
 * só abriam pela busca (⌘K). A porta delas é aqui, nos botões do topo; a
 * guarda `menu-portas` cobra o link.
 */
export default function MaquininhaQuattroPage() {
  return (
    <AppShell
      title="Maquininha Quattro"
      crumb="Contas a receber"
      actions={
        <>
          {isDemo ? <DemoBadge /> : null}
          <Link href="/pos/venda" className={classesDoBotao("secondary")}>
            <Icon name="credit-card" size={15} color="currentColor" />
            Simulador de venda
          </Link>
          <Link href="/pos/taxas" className={classesDoBotao("secondary")}>
            <Icon name="receipt" size={15} color="currentColor" />
            Taxas da maquininha
          </Link>
        </>
      }
    >
      <Suspense fallback={null}>
        <MaquininhaQuattro />
      </Suspense>
    </AppShell>
  );
}
