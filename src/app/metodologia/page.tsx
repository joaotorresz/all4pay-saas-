import type { Metadata } from "next";
import { MetodologiaView } from "@/components/metodologia/MetodologiaView";

export const metadata: Metadata = {
  title: "Metodologia · all4pay",
  description:
    "Como a demonstração de resultado e o fluxo de caixa são montados, o que entra em cada linha, como os indicadores são formados e o que o sistema não faz.",
};

/**
 * ⚠️ Rota PÚBLICA (liberada em `src/middleware.ts`). Uma metodologia atrás de
 * login só é lida por quem já comprou — e é justamente antes de comprar que
 * alguém precisa saber o que o número significa e onde ele para.
 */
export default function MetodologiaPage() {
  return (
    <div className="ds-visor min-h-screen bg-surface-1 text-ink">
      <MetodologiaView />
    </div>
  );
}
