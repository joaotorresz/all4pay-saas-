"use client";

import * as React from "react";
import { Card, Money, Icon } from "@/components/ui";
import { cn } from "@/lib/utils";

/** Accounts / balances across banks. Bank brand dots stand in for logos. */
const ROWS = [
  { bank: "Itaú", sub: "R$ · ••4021", int: "1.284.900", dec: "00", dot: "#EC7000" },
  { bank: "Bradesco", sub: "R$ · ••8830", int: "612.300", dec: "50", dot: "#CC092F" },
  { bank: "Nubank", sub: "R$ · ••1175", int: "262.250", dec: "00", dot: "#820AD1" },
];

export function AccountsList() {
  return (
    <Card padded={false}>
      <div className="flex items-center justify-between px-5 pt-[18px] pb-[14px]">
        <span className="text-body font-medium text-ink">Contas</span>
        <button className="inline-flex items-center gap-[5px] bg-transparent text-label font-medium text-muted cursor-pointer">
          <Icon name="plus" size={14} color="var(--color-text-secondary)" />
          Adicionar conta
        </button>
      </div>
      {ROWS.map((r, i) => (
        <div
          key={r.bank}
          className={cn(
            "flex items-center gap-3 px-5 py-[13px]",
            i && "border-t border-border-soft",
          )}
        >
          <span
            className="w-7 h-7 rounded-pill shrink-0 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]"
            style={{ background: r.dot }}
          />
          <div className="min-w-0">
            <div className="text-[14px] font-medium text-ink">{r.bank}</div>
            <div className="text-caption text-faint tabular-nums">{r.sub}</div>
          </div>
          <div className="ml-auto">
            <Money integer={r.int} decimals={r.dec} size="sm" showDecimals={false} />
          </div>
        </div>
      ))}
    </Card>
  );
}
