import Link from "next/link";
import { Icon, classesDoBotao } from "@/components/ui";
import { AppShell } from "@/components/app/AppShell";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { ExportarView } from "@/components/exportar/ExportarView";

/**
 * Razão e DRE em planilha para o contador. "Enviar ao contador" tinha três
 * abas (27/10/2026, fim das abas internas): o TXT do Domínio e o envio das NFs
 * viraram telas próprias, de volta aos seus endereços.
 *
 * ⚠️ 03/11/2026 (menu enxuto): cada uma delas saiu do menu e a porta é aqui, nos botões
 * do topo. A guarda `menu-portas` cobra o link.
 */
export default function ExportarPage() {
  return (
    <AppShell title="Enviar ao contador" crumb="Contabilidade" actions={
        <>
          {isDemo ? <DemoBadge /> : null}
          <Link href="/dashboard/accounting/dominio-export" className={classesDoBotao("secondary")}>
            <Icon name="file-text" size={15} color="currentColor" />
            TXT Domínio
          </Link>
          <Link href="/dashboard/accounting/nfe-export" className={classesDoBotao("secondary")}>
            <Icon name="download" size={15} color="currentColor" />
            Envio das NFs
          </Link>
        </>
      }>
      <ExportarView />
    </AppShell>
  );
}
