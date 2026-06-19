"use client";

import * as React from "react";
import Link from "next/link";
import { Card, Money, StatusBadge, Skeleton } from "@/components/ui";
import { brlParts, formatBRL } from "@/lib/format";
import { useAccounts, useDailyCashflow } from "./hooks";
import { WidgetHeader, EmptyState, bankColor } from "./shared";
import { HeroValue } from "./HeroValue";

/** Consolidated balance + per-account list with reconciliation badges. */
export function AccountsCard() {
  const { data, isLoading, isError } = useAccounts();
  const { data: flow } = useDailyCashflow(14);

  const total = data && brlParts(data.total);
  // Net cash flow over the window — feeds the "Saldo total"-style trend.
  const net = flow && flow.length ? flow[flow.length - 1].balance : 0;
  const series = flow?.map((p) => p.balance);

  return (
    <Card className="flex flex-col">
      <WidgetHeader
        title="Contas Financeiras"
        subtitle={data ? `${data.accounts.length} contas` : undefined}
      />

      {isLoading && (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-9 w-56" rounded="md" />
          <div className="flex flex-col gap-3 pt-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12 w-full" rounded="md" />
            ))}
          </div>
        </div>
      )}

      {isError && (
        <EmptyState title="Não foi possível carregar" hint="Tente novamente." />
      )}

      {!isLoading && !isError && data && data.accounts.length === 0 && (
        <EmptyState
          title="Nenhuma conta cadastrada"
          hint="Conecte uma conta bancária para consolidar seus saldos."
        />
      )}

      {!isLoading && !isError && data && data.accounts.length > 0 && (
        <>
          <HeroValue
            label="Saldo consolidado"
            integer={total!.integer}
            decimals={total!.decimals}
            sparkline={series}
            delta={{
              dir: net >= 0 ? "up" : "down",
              tone: net >= 0 ? "positive" : "negative",
              value: `${net >= 0 ? "+" : "−"}${formatBRL(Math.abs(net))}`,
              context: "fluxo · últimos 14 dias",
            }}
            srValue={`Saldo total consolidado de ${formatBRL(data.total)}`}
          />

          <ul className="mt-4 pt-1 flex flex-col">
            {data.accounts.map((acc, i) => {
              const parts = brlParts(acc.balance);
              return (
                <li
                  key={acc.id}
                  className={`flex items-center gap-3 py-3 ${i ? "border-t border-border-soft" : ""}`}
                >
                  <span
                    className="w-7 h-7 rounded-pill shrink-0 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]"
                    style={{ background: bankColor(acc.bank) }}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[17px] font-medium text-ink truncate">
                      {acc.name}
                    </div>
                    {acc.pendingReconciliations > 0 ? (
                      <Link
                        href="/upload?aba=conciliar"
                        className="inline-flex items-center mt-[2px] rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ink/10"
                        aria-label={`${acc.pendingReconciliations} conciliações pendentes em ${acc.name}`}
                      >
                        <StatusBadge tone="warning" className="!text-caption">
                          {acc.pendingReconciliations} conciliações pendentes
                        </StatusBadge>
                      </Link>
                    ) : (
                      <div className="text-caption text-faint mt-[2px]">
                        Conciliado
                      </div>
                    )}
                  </div>
                  <div className="shrink-0">
                    <Money
                      integer={parts.integer}
                      decimals={parts.decimals}
                      size="sm"
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Card>
  );
}
