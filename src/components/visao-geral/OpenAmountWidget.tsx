"use client";

import * as React from "react";
import Link from "next/link";
import { Card, Money, Skeleton, Icon } from "@/components/ui";
import { brlParts, formatBRL } from "@/lib/format";
import type { ReceivablesSummary } from "@/lib/types";
import { WidgetHeader, EmptyState } from "./shared";
import { HeroValue } from "./HeroValue";

/**
 * Mirrored "A Receber" / "A Pagar" widget.
 * Hero = total VENCIDO (red). Secondary = VENCE HOJE (green) + restante
 * do mês (muted). The whole card drills down to the item list.
 */
export function OpenAmountWidget({
  title,
  href,
  summary,
  isLoading,
  isError,
  emptyHint,
}: {
  title: string;
  href: string;
  summary?: ReceivablesSummary;
  isLoading: boolean;
  isError: boolean;
  emptyHint: string;
}) {
  const overdue = summary && brlParts(summary.overdue);
  const dueToday = summary && brlParts(summary.dueToday);
  const rest = summary && brlParts(summary.restOfMonth);
  const isEmpty =
    !!summary &&
    summary.count === 0 &&
    summary.overdue === 0 &&
    summary.dueToday === 0 &&
    summary.restOfMonth === 0;

  const body = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-9 w-48" rounded="md" />
          <div className="flex gap-3 pt-1">
            <Skeleton className="h-12 flex-1" rounded="md" />
            <Skeleton className="h-12 flex-1" rounded="md" />
          </div>
        </div>
      );
    }
    if (isError) {
      return (
        <EmptyState
          icon="file-text"
          title="Não foi possível carregar"
          hint="Tente novamente em instantes."
        />
      );
    }
    if (isEmpty || !summary) {
      return <EmptyState icon="file-text" title="Nada em aberto" hint={emptyHint} />;
    }
    return (
      <div className="flex flex-col gap-4">
        {/* Hero: vencido — "Saldo total" treatment */}
        <HeroValue
          label="Vencido"
          integer={overdue!.integer}
          decimals={overdue!.decimals}
          color="var(--color-negative)"
          srValue={`${formatBRL(summary.overdue)} vencido`}
        />
        {/* Secondary stats */}
        <div className="flex gap-3 pt-1 border-t border-border-soft">
          <div className="flex-1 pt-3">
            <div className="text-caption font-medium text-positive">
              Vence hoje
            </div>
            <div className="mt-1">
              <Money
                integer={dueToday!.integer}
                decimals={dueToday!.decimals}
                size="sm"
                color="var(--color-positive)"
              />
            </div>
          </div>
          <div className="flex-1 pt-3">
            <div className="text-caption font-medium text-muted">
              Restante do mês
            </div>
            <div className="mt-1">
              <Money
                integer={rest!.integer}
                decimals={rest!.decimals}
                size="sm"
              />
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Link
      href={href}
      className="block rounded-card outline-none focus-visible:ring-2 focus-visible:ring-ink/15 transition-shadow hover:shadow-popover"
      aria-label={`${title}: abrir lista detalhada`}
    >
      <Card className="h-full">
        <WidgetHeader
          title={title}
          action={
            <span className="inline-flex items-center gap-1 text-caption font-medium text-faint">
              Ver tudo
              <Icon name="arrow-up-right" size={13} />
            </span>
          }
        />
        {body()}
      </Card>
    </Link>
  );
}
