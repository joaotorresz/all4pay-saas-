"use client";

/**
 * Aprovações e baixas — o portão do dinheiro numa tela (reorganização dos
 * menus, 19/10/2026): o que falta confirmar e baixar (a Central), as
 * solicitações acima da alçada e as alçadas e papéis. Eram duas telas
 * (`/central` e `/aprovacoes`) respondendo "o que espera a minha decisão".
 *
 * ⚠️ As abas de solicitações e de alçadas continuam Pro (`ABAS_PRO`), como a
 * rota `/aprovacoes` era: juntar as telas não muda quem pode abrir o quê.
 */
import { HubShell, type AbaHub } from "@/components/app/HubShell";
import { CentralView } from "./CentralView";
import { AprovacoesView } from "@/components/aprovacoes/AprovacoesView";
import { InstitutionalView } from "@/components/institucional/InstitutionalView";

export function AprovacoesBaixasHub({ whatsappLigado }: { whatsappLigado: boolean }) {
  const abas: AbaHub[] = [
    { id: "confirmar", label: "A confirmar", render: () => <CentralView whatsappLigado={whatsappLigado} /> },
    { id: "solicitacoes", label: "Solicitações", render: () => <AprovacoesView /> },
    { id: "alcadas", label: "Alçadas e papéis", render: () => <InstitutionalView semTrilha /> },
  ];
  return <HubShell abas={abas} />;
}
