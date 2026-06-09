"use client";

import * as React from "react";
import {
  Card,
  Checkbox,
  StatusBadge,
  Avatar,
  Button,
  Money,
  Icon,
} from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * Invoices table — clean, no vertical grid (horizontal dividers only).
 * Row selection drives the full-width "Agendar N Pagamentos" CTA.
 */
type Tone = "warning" | "neutral" | "positive";

export const INVOICES: {
  id: string;
  name: string;
  int: string;
  dec: string;
  tone: Tone;
  status: string;
  due: string;
}[] = [
  { id: "FT-2041", name: "Northwind Logística", int: "48.200", dec: "00", tone: "warning", status: "2 problemas encontrados", due: "Vence em 3 dias" },
  { id: "FT-2038", name: "Atlas Cloud Ltda", int: "12.640", dec: "50", tone: "neutral", status: "Precisa de revisão", due: "Vence em 6 dias" },
  { id: "FT-2035", name: "Meridian Design", int: "7.900", dec: "00", tone: "positive", status: "Aprovado", due: "Vence em 9 dias" },
  { id: "FT-2031", name: "Brightwell Suprimentos", int: "21.050", dec: "00", tone: "positive", status: "Aprovado", due: "Vence em 12 dias" },
];

export function InvoiceTable({
  selected,
  onToggle,
  onToggleAll,
  onSchedule,
}: {
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onSchedule: () => void;
}) {
  const [hover, setHover] = React.useState<string | null>(null);
  const allOn = selected.size === INVOICES.length;
  const count = selected.size;

  return (
    <Card padded={false}>
      <div className="flex items-baseline gap-[10px] px-5 pt-[18px] pb-[6px]">
        <span className="text-body font-medium text-ink">Faturas</span>
        <span className="text-caption text-faint">
          {INVOICES.length} aguardando aprovação
        </span>
      </div>

      {/* Column headers */}
      <div className="flex items-center gap-3 px-5 py-2 text-caption font-medium text-muted border-b border-border-soft">
        <span className="w-[18px]">
          <Checkbox checked={allOn} onChange={onToggleAll} />
        </span>
        <span className="flex-1">Destinatário</span>
        <span className="w-[140px]">Status</span>
        <span className="w-[128px] text-right">Valor</span>
      </div>

      {INVOICES.map((r) => {
        const on = selected.has(r.id);
        const hov = hover === r.id;
        return (
          <div
            key={r.id}
            className={cn(
              "flex items-center gap-3 px-5 py-3 transition-[background-color] duration-100 ease-out",
              on || hov ? "bg-surface-2" : "bg-transparent",
            )}
            onMouseEnter={() => setHover(r.id)}
            onMouseLeave={() => setHover(null)}
          >
            <span className="w-[18px]">
              <Checkbox checked={on} onChange={() => onToggle(r.id)} />
            </span>
            <span className="flex-1 flex items-center gap-[11px] min-w-0">
              <Avatar name={r.name} size={32} />
              <span className="min-w-0">
                <span className="block text-[14px] font-medium text-ink truncate">
                  {r.name}
                </span>
                <span className="block text-caption text-faint tabular-nums">
                  {r.id} · {r.due}
                </span>
              </span>
            </span>
            <span className="w-[140px]">
              <StatusBadge tone={r.tone}>{r.status}</StatusBadge>
            </span>
            <span className="w-[128px] flex justify-end items-center gap-[10px]">
              {hov && (
                <button
                  className="inline-flex bg-transparent cursor-pointer p-[2px] rounded-[6px]"
                  title="Remover"
                >
                  <Icon name="x" size={15} color="var(--color-text-tertiary)" />
                </button>
              )}
              <Money integer={r.int} decimals={r.dec} size="sm" />
            </span>
          </div>
        );
      })}

      <div className="px-5 pt-[14px] pb-[18px] border-t border-border-soft">
        <Button
          variant="primary"
          fullWidth
          disabled={count === 0}
          onClick={onSchedule}
        >
          {count === 0
            ? "Selecione faturas para agendar"
            : `Agendar ${count} Pagamento${count > 1 ? "s" : ""}`}
        </Button>
      </div>
    </Card>
  );
}
