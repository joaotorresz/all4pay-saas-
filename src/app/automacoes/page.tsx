"use client";

import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { Secoes } from "@/components/app/Secoes";
import { AutomacoesFluxosView } from "@/components/automacoes/AutomacoesFluxosView";
import { AutomacoesView } from "@/components/configuracoes/AutomacoesView";

/**
 * Automações — as mensagens que a empresa agenda e os alertas que o sistema
 * dispara, num lugar só (reorganização dos menus, 19/10/2026). Os alertas
 * eram uma aba de "Meu perfil", onde ninguém os procurava.
 *
 * As duas partes ficam EMPILHADAS (27/10/2026): eram abas, e a segunda era
 * conteúdo que metade das pessoas não via. `?aba=alertas` rola até ela.
 */
export default function AutomacoesPage() {
  return (
    <AppShell title="Automações" crumb="Inteligência">
      <Suspense fallback={null}>
        <Secoes
          secoes={[
            { id: "mensagens", titulo: "Mensagens no WhatsApp", desc: "O que a empresa agenda para clientes e equipe.", conteudo: <AutomacoesFluxosView /> },
            { id: "alertas", titulo: "Alertas do sistema", desc: "O que o sistema avisa sozinho quando algo pede atenção.", conteudo: <AutomacoesView /> },
          ]}
        />
      </Suspense>
    </AppShell>
  );
}
