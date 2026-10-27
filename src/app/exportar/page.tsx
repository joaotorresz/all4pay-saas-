import { AppShell } from "@/components/app/AppShell";
import { isDemo } from "@/lib/demo";
import { DemoBadge } from "@/components/visao-geral/DemoBadge";
import { ExportarView } from "@/components/exportar/ExportarView";

/**
 * Razão e DRE em planilha para o contador. "Enviar ao contador" tinha três
 * abas (27/10/2026, fim das abas internas): o TXT do Domínio e o envio das NFs
 * viraram telas próprias, de volta aos seus endereços.
 */
export default function ExportarPage() {
  return (
    <AppShell title="Razão e DRE para o contador" crumb="Contabilidade" actions={isDemo ? <DemoBadge /> : null}>
      <ExportarView />
    </AppShell>
  );
}
