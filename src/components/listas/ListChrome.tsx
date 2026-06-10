"use client";

import * as React from "react";
import { Card, Button, Skeleton, Icon } from "@/components/ui";
import { cn } from "@/lib/utils";

/* ---------- Generic table ---------- */

export interface Column<T> {
  key: string;
  label: string;
  align?: "left" | "right";
  width?: number;
  render: (row: T) => React.ReactNode;
}

export function EntityTable<T extends { id: string }>({
  columns,
  rows,
  isLoading,
  isError,
  emptyTitle,
  emptyHint,
  onRowClick,
}: {
  columns: Column<T>[];
  rows?: T[];
  isLoading: boolean;
  isError: boolean;
  emptyTitle: string;
  emptyHint?: string;
  onRowClick?: (row: T) => void;
}) {
  if (isLoading) {
    return (
      <Card padded={false}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={cn(
              "flex items-center gap-3 px-5 py-3",
              i && "border-t border-border-soft",
            )}
          >
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <Empty title="Não foi possível carregar a lista" />
      </Card>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <Card>
        <Empty title={emptyTitle} hint={emptyHint} />
      </Card>
    );
  }

  return (
    <Card padded={false}>
      <div className="flex items-center gap-3 px-5 py-2 text-caption font-medium text-muted border-b border-border-soft">
        {columns.map((c) => (
          <span
            key={c.key}
            className={cn(c.align === "right" && "text-right")}
            style={{ width: c.width, flex: c.width ? undefined : 1 }}
          >
            {c.label}
          </span>
        ))}
      </div>
      {rows.map((row, i) => (
        <div
          key={row.id}
          onClick={onRowClick ? () => onRowClick(row) : undefined}
          className={cn(
            "flex items-center gap-3 px-5 py-3",
            i && "border-t border-border-soft",
            onRowClick && "cursor-pointer hover:bg-surface-2 transition-colors",
          )}
        >
          {columns.map((c) => (
            <span
              key={c.key}
              className={cn(
                "min-w-0",
                c.align === "right" && "flex justify-end text-right",
              )}
              style={{ width: c.width, flex: c.width ? undefined : 1 }}
            >
              {c.render(row)}
            </span>
          ))}
        </div>
      ))}
    </Card>
  );
}

function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-8 px-4 gap-2">
      <span className="w-9 h-9 rounded-pill bg-surface-2 inline-flex items-center justify-center">
        <Icon name="file-text" size={18} color="var(--color-text-tertiary)" />
      </span>
      <p className="m-0 text-label font-medium text-muted">{title}</p>
      {hint && <p className="m-0 text-caption text-faint max-w-[34ch]">{hint}</p>}
    </div>
  );
}

/* ---------- "Novo X" button that opens a form ---------- */

export function NewButton({
  label,
  onToast,
  form,
  variant = "primary",
}: {
  label: string;
  onToast: (m: string) => void;
  form: (props: { onClose: () => void; onToast: (m: string) => void }) => React.ReactNode;
  variant?: "primary" | "secondary";
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button
        variant={variant}
        leftIcon={<Icon name="plus" size={15} />}
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
      {open && form({ onClose: () => setOpen(false), onToast })}
    </>
  );
}

/* ---------- Toast ---------- */

export function useToast() {
  const [toast, setToast] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);
  const node = toast ? (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-ink text-white text-[14px] font-medium px-4 py-[11px] rounded-md shadow-popover z-[70]">
      <Icon name="check" size={15} color="var(--color-lime)" />
      <span>{toast}</span>
    </div>
  ) : null;
  return { show: setToast, node };
}
