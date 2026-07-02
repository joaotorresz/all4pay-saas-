"use client";

import * as React from "react";
import { Icon, InfoHint } from "@/components/ui";
import type { IconName, InfoConteudo } from "@/components/ui";

/** Bank brand dot colors (stand-ins for real logos). */
const BANK_COLORS: Record<string, string> = {
  itau: "#EC7000",
  bradesco: "#CC092F",
  nubank: "#820AD1",
  inter: "#FF7A00",
  santander: "#EC0000",
};
export const bankColor = (bank: string) => BANK_COLORS[bank] ?? "var(--color-text-secondary)";

/** Glifo flat num tile discreto — o marcador de identidade dos cabeçalhos de card. */
export function IconTile({ name, size = 38 }: { name: IconName | string; size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center shrink-0 rounded-md bg-surface-2 text-ink"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <Icon name={name} size={Math.round(size * 0.5)} color="currentColor" />
    </span>
  );
}

/** Section title for a widget, with an optional right-aligned slot. */
export function WidgetHeader({
  title,
  subtitle,
  action,
  info,
  icon,
}: {
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  info?: InfoConteudo;
  icon?: IconName | string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 mb-4">
      <div className="flex items-center gap-3 min-w-0">
        {icon && <IconTile name={icon} />}
        <div className="flex items-baseline gap-[10px] min-w-0">
          <h2 className="text-h3 font-medium text-ink truncate">{title}</h2>
          {info && <span className="self-center"><InfoHint align="left" {...info} /></span>}
          {subtitle && <span className="text-caption text-faint">{subtitle}</span>}
        </div>
      </div>
      {action}
    </div>
  );
}

/** Quiet empty state — icon, line, optional hint. Never alarming. */
export function EmptyState({
  icon = "file-text",
  title,
  hint,
}: {
  icon?: IconName;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-8 px-4 gap-2">
      <span className="w-9 h-9 rounded-pill bg-surface-2 inline-flex items-center justify-center">
        <Icon name={icon} size={18} color="var(--color-text-tertiary)" />
      </span>
      <p className="m-0 text-label font-medium text-muted">{title}</p>
      {hint && <p className="m-0 text-caption text-faint max-w-[28ch]">{hint}</p>}
    </div>
  );
}

/** sr-only text so screen readers get the meaning of a visual figure. */
export function VisuallyHidden({ children }: { children: React.ReactNode }) {
  return <span className="sr-only">{children}</span>;
}
