"use client";

import * as React from "react";
import { Card, Button, SplitButton, Icon } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * Shared modal scaffold for the "Novo registro" forms.
 * Overlay + Card with header, scrollable body and a standard footer
 * (Voltar + a "Salvar / Salvar e criar outro" split-button). `size`
 * controls the width: compact (cadastros) · medium · large (lançamentos).
 */
const WIDTHS = { compact: 440, medium: 520, large: 600 } as const;

export function FormModal({
  title,
  size = "large",
  onClose,
  onSave,
  onSaveAgain,
  saving = false,
  extraAction,
  children,
}: {
  title: string;
  size?: keyof typeof WIDTHS;
  onClose: () => void;
  onSave: () => void;
  onSaveAgain?: () => void;
  saving?: boolean;
  extraAction?: React.ReactNode;
  children: React.ReactNode;
}) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-ink/30 backdrop-blur-[2px] flex items-start justify-center z-50 p-6 overflow-y-auto"
      onClick={onClose}
    >
      <div
        style={{ width: WIDTHS[size] }}
        className="max-w-full my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <Card padded={false} className="flex flex-col max-h-[88vh]">
          <div className="flex items-center justify-between px-6 py-5 border-b border-border-soft">
            <span className="text-h3 font-medium">{title}</span>
            <button
              className="inline-flex bg-transparent cursor-pointer p-[2px]"
              onClick={onClose}
              aria-label="Fechar"
            >
              <Icon name="x" size={18} color="var(--color-text-secondary)" />
            </button>
          </div>

          <div className={cn("flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-4")}>
            {children}
          </div>

          <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-border-soft">
            <Button variant="ghost" onClick={onClose}>
              Voltar
            </Button>
            <div className="flex items-center gap-2">
              {extraAction}
              {onSaveAgain ? (
                <SplitButton
                  label={saving ? "Salvando…" : "Salvar"}
                  disabled={saving}
                  onClick={onSave}
                  items={[{ id: "again", label: "Salvar e criar outro" }]}
                  onSelect={onSaveAgain}
                />
              ) : (
                <Button variant="primary" disabled={saving} onClick={onSave}>
                  {saving ? "Salvando…" : "Salvar"}
                </Button>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

/** Small uppercase section label used inside the forms. */
export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-caption font-medium tracking-[0.04em] uppercase text-faint pt-2">
      {children}
    </div>
  );
}
