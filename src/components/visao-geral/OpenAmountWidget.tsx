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
 * Hero = realizado HOJE (neutro, sem vermelho). Secundários = essa semana +
 * esse mês (pendentes). O card inteiro abre a lista detalhada.
 */
export function OpenAmountWidget({
  title,
  href,
  summary,
  isLoading,
  isError,
  emptyHint,
  heroLabel,
  weekLabel,
  monthLabel,
}: {
  title: string;
  href: string;
  summary?: ReceivablesSummary;
  isLoading: boolean;
  isError: boolean;
  emptyHint: string;
  heroLabel: string;
  weekLabel: string;
  monthLabel: string;
}) {
  const today = summary && brlParts(summary.today);
  const week = summary && brlParts(summary.week);
  const month = summary && brlParts(summary.month);
  const isEmpty =
    !!summary &&
    summary.count === 0 &&
    summary.today === 0 &&
    summary.week === 0 &&
    summary.month === 0;

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
        {/* Hero: realizado hoje — "Saldo total" treatment, neutro (sem vermelho) */}
        <HeroValue
          label={heroLabel}
          integer={today!.integer}
          decimals={today!.decimals}
          srValue={`${formatBRL(summary.today)} · ${heroLabel.toLowerCase()}`}
        />
        {/* Secondary stats */}
        <div className="flex gap-3 pt-1 border-t border-border-soft">
          <div className="flex-1 pt-3">
            <div className="text-caption font-medium text-muted">
              {weekLabel}
            </div>
            <div className="mt-1">
              <Money
                integer={week!.integer}
                decimals={week!.decimals}
                size="sm"
              />
            </div>
          </div>
          <div className="flex-1 pt-3">
            <div className="text-caption font-medium text-muted">
              {monthLabel}
            </div>
            <div className="mt-1">
              <Money
                integer={month!.integer}
                decimals={month!.decimals}
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
      className="block rounded-card outline-none focus-visible:ring-2 focus-visible:ring-ink/10 transition-shadow hover:shadow-popover"
      aria-label={`${title}: abrir lista detalhada`}
    >
      <Card>
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
