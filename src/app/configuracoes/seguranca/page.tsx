import { AppShell } from "@/components/app/AppShell";
import { SegurancaContaView } from "@/components/configuracoes/SegurancaContaView";
import { NumeroWhatsappCard } from "@/components/configuracoes/NumeroWhatsappCard";

/**
 * Segurança da conta — o aplicativo autenticador da PESSOA (não da empresa).
 *
 * ⚠️ Mora sob `/configuracoes` (a porta "Meu perfil", de conta, no PJ e no PF)
 * e não sob a administração: o segundo fator é de quem entra, e a área da
 * plataforma recusa justamente quem ainda não o cadastrou — o administrador
 * travado precisa de uma porta que abra para ele.
 *
 * O celular da Quattro AI no WhatsApp mora aqui também (é da pessoa, e só
 * aparece com `WHATSAPP_IA=ligado`).
 */
export default function SegurancaContaPage() {
  return (
    <AppShell title="Segurança da conta" crumb="Meu perfil">
      <div className="flex flex-col gap-4">
        <SegurancaContaView />
        <NumeroWhatsappCard />
      </div>
    </AppShell>
  );
}
