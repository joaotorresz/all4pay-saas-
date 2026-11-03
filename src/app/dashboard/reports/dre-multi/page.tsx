import Link from "next/link";
import { Icon, classesDoBotao } from "@/components/ui";
import { AppShell } from "@/components/app/AppShell";
import { MultiempresaView } from "@/components/relatorios/MultiempresaView";

/**
 * O DRE do grupo. "Multiempresas" tinha três abas (27/10/2026, fim das abas
 * internas): o DFC voltou a `/dashboard/reports/dfc-multi` e a posição
 * consolidada a `/consolidado` (Pro pelo prefixo em `ROTAS_PRO`).
 *
 * ⚠️ 03/11/2026 (menu enxuto): o DFC multiempresas saiu do menu e a porta é aqui, nos botões
 * do topo. A guarda `menu-portas` cobra o link.
 */
export default function DreMultiPage() {
  return (
    <AppShell title="DRE multiempresas" crumb="Relatórios" actions={
          <Link href="/dashboard/reports/dfc-multi" className={classesDoBotao("secondary")}>
            <Icon name="activity" size={15} color="currentColor" />
            DFC multiempresas
          </Link>
      }>
      <MultiempresaView tipo="dre" />
    </AppShell>
  );
}
