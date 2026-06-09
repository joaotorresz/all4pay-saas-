"use client";

import * as React from "react";
import { Button } from "./Button";
import { DropdownMenu, type DropdownItem } from "./DropdownMenu";
import { Icon } from "./Icon";

/**
 * all4pay DS — SplitButton
 * A primary action joined to a caret that opens secondary actions
 * (e.g. "Salvar" + "Salvar e criar outro").
 */
export interface SplitButtonProps {
  label: string;
  onClick: () => void;
  items: DropdownItem[];
  onSelect: (id: string) => void;
  disabled?: boolean;
}

export function SplitButton({
  label,
  onClick,
  items,
  onSelect,
  disabled,
}: SplitButtonProps) {
  return (
    <div className="inline-flex">
      <Button
        variant="primary"
        onClick={onClick}
        disabled={disabled}
        className="rounded-r-none"
      >
        {label}
      </Button>
      <DropdownMenu
        align="right"
        groups={[{ items }]}
        onSelect={onSelect}
        width={220}
        trigger={({ open, toggle }) => (
          <Button
            variant="primary"
            onClick={toggle}
            disabled={disabled}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label="Mais opções de salvar"
            className="rounded-l-none border-l border-white/20 px-[10px]"
          >
            <Icon name="chevron-down" size={15} />
          </Button>
        )}
      />
    </div>
  );
}
