import { AppShell } from "@/components/app/AppShell";
import { SegurancaContaView } from "@/components/configuracoes/SegurancaContaView";

/**
 * Segurança da conta — o aplicativo autenticador da PESSOA (não da empresa).
 *
 * ⚠️ Mora sob `/configuracoes` (a porta "Meu perfil", de conta, no PJ e no PF)
 * e não sob a administração: o segundo fator é de quem entra, e a área da
 * plataforma recusa justamente quem ainda não o cadastrou — o administrador
 * travado precisa de uma porta que abra para ele.
 */
export default function SegurancaContaPage() {
  return (
    <AppShell title="Segurança da conta" crumb="Meu perfil">
      <SegurancaContaView />
    </AppShell>
  );
}
