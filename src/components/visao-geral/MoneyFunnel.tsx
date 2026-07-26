"use client";

/**
 * Funil de dinheiro unificado (Receber / Pagar) — junta num só lugar, em abas,
 * a EXECUÇÃO (Central de recebimentos/pagamentos) e a LISTA de TÍTULOS
 * (MovementsScreen: aberto/realizado/recorrente + filtro por conta). Acaba com
 * os dois menus que levavam ao mesmo ponto. Deep-link por `?aba=`; as rotas
 * antigas (`/recebiveis`, `/pagaveis`) redirecionam para a aba Títulos.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { MovementsScreen } from "./MovementsScreen";
import { CentralRecebimentosView } from "@/components/recebimentos/CentralRecebimentosView";
import { CentralPagamentosView } from "@/components/pagamentos/CentralPagamentosView";

type Aba = "executar" | "titulos";
const isAba = (s: string | null): s is Aba => s === "executar" || s === "titulos";

export function MoneyFunnel({ direction }: { direction: "entrada" | "saida" }) {
  const router = useRouter();
  const base = direction === "saida" ? "/pagamentos" : "/recebimentos";
  const [aba, setAba] = React.useState<Aba>("executar");

  React.useEffect(() => {
    const a = new URLSearchParams(window.location.search).get("aba");
    if (isAba(a)) setAba(a);
  }, []);

  const trocar = (id: Aba) => { setAba(id); router.replace(`${base}?aba=${id}`, { scroll: false }); };

  const ABAS: { id: Aba; label: string }[] = [
    { id: "executar", label: direction === "saida" ? "Pagar" : "Receber" },
    { id: "titulos", label: direction === "saida" ? "Títulos a pagar" : "Títulos a receber" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-1 p-1 rounded-pill bg-surface-2 w-max">
        {ABAS.map((a) => (
          <button
            key={a.id}
            onClick={() => trocar(a.id)}
            className={`px-4 py-[7px] rounded-pill text-label font-medium transition-colors ${aba === a.id ? "bg-surface-3 text-ink font-semibold" : "text-muted hover:text-ink"}`}
            aria-pressed={aba === a.id}
          >
            {a.label}
          </button>
        ))}
      </div>

      {aba === "executar"
        ? (direction === "saida" ? <CentralPagamentosView /> : <CentralRecebimentosView />)
        : <MovementsScreen direction={direction} />}
    </div>
  );
}
