import type { Metadata } from "next";
import { SegundoFatorEntradaView } from "@/components/entrada/SegundoFatorEntradaView";
import { MARCA } from "@/core/marca";

export const metadata: Metadata = {
  title: `Código de verificação · ${MARCA}`,
  description: "Digite o código do aplicativo autenticador para entrar.",
};

/**
 * O PASSO DO CÓDIGO — a segunda metade da entrada de quem cadastrou o
 * aplicativo autenticador.
 *
 * ⚠️ **Quem decide quem chega aqui é o middleware**, nos dois sentidos: a
 * sessão que precisa do código só abre esta rota, e a que não precisa é
 * devolvida ao início — esta página nunca pede um código que não existe.
 * Sem Supabase (demonstração), não há conta e a tela só explica.
 */
export default function SegundoFatorPage() {
  return <SegundoFatorEntradaView />;
}
