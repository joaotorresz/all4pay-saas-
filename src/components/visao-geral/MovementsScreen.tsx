"use client";

/**
 * Tela unificada de Entradas (entrada) / Saídas (saida): um filtro segmentado
 * — Em aberto · Realizado · Recorrente — sobre o MESMO hub de movements.
 * Substitui a navegação por sub-telas: tudo de uma direção num lugar só.
 */
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { MovementsTable } from "./MovementsTable";
import { useMovementsByFilter } from "./hooks";
import { useAccountsList } from "@/components/lancamentos/hooks";
import { Select } from "@/components/ui";
import type { MovementType } from "@/lib/types";
import type { MovementFilter } from "@/lib/data";
import { cn } from "@/lib/utils";

const FILTROS: { id: MovementFilter; label: string }[] = [
  { id: "aberto", label: "Em aberto" },
  { id: "realizado", label: "Realizado" },
  { id: "recorrente", label: "Recorrente" },
];

export function MovementsScreen({ direction }: { direction: MovementType }) {
  const qc = useQueryClient();
  const [filtro, setFiltro] = React.useState<MovementFilter>("aberto");
  const [conta, setConta] = React.useState<string>("todas");
  const { data: accounts } = useAccountsList();
  const isOut = direction === "saida";

  // Os três filtros carregam em paralelo (cache do React Query) p/ alimentar as
  // contagens das abas; só o ativo é renderizado na tabela.
  const aberto = useMovementsByFilter(direction, "aberto");
  const realizado = useMovementsByFilter(direction, "realizado");
  const recorrente = useMovementsByFilter(direction, "recorrente");
  const queries: Record<MovementFilter, typeof aberto> = { aberto, realizado, recorrente };
  const ativo = queries[filtro];
  const movsFiltrados = React.useMemo(
    () => (conta === "todas" ? ativo.data : (ativo.data ?? []).filter((m) => m.account_id === conta)),
    [ativo.data, conta],
  );

  const vazios: Record<MovementFilter, string> = {
    aberto: isOut ? "Nenhuma conta a pagar em aberto" : "Nenhum recebível em aberto",
    realizado: isOut ? "Nenhum pagamento realizado" : "Nenhum recebimento realizado",
    recorrente: "Nenhuma recorrência projetada",
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1 p-1 rounded-pill bg-surface-2 w-max">
          {FILTROS.map((f) => {
            const on = f.id === filtro;
            const n = queries[f.id].data?.length;
            return (
              <button
                key={f.id}
                onClick={() => setFiltro(f.id)}
                className={cn(
                  "inline-flex items-center gap-2 px-4 py-[7px] rounded-pill text-label font-medium transition-colors",
                  on ? "bg-ink text-white" : "text-muted hover:text-ink",
                )}
                aria-pressed={on}
              >
                {f.label}
                {n != null && (
                  <span className={cn("text-caption tabular-nums", on ? "text-white/70" : "text-faint")}>{n}</span>
                )}
              </button>
            );
          })}
        </div>
        {(accounts?.length ?? 0) > 1 && (
          <Select
            value={conta}
            onChange={setConta}
            options={[{ value: "todas", label: "Todas as contas" }, ...(accounts ?? []).map((a) => ({ value: a.id, label: a.name }))]}
            containerClassName="min-w-[190px]"
          />
        )}
      </div>

      <MovementsTable
        movements={movsFiltrados}
        isLoading={ativo.isLoading}
        isError={ativo.isError}
        emptyTitle={vazios[filtro]}
        emptyHint={filtro === "aberto" ? "Tudo em dia por aqui." : undefined}
        variant={filtro === "realizado" ? "paid" : "open"}
        editable={filtro === "aberto"}
        onChanged={() => qc.invalidateQueries()}
      />
    </div>
  );
}
