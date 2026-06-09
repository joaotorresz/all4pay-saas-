"use client";

import * as React from "react";
import { Button, Pill, Icon } from "@/components/ui";

/** Page header: breadcrumb + title and the primary actions. */
export function TopBar({
  title,
  onDeposit,
}: {
  title: string;
  onDeposit?: () => void;
}) {
  return (
    <header className="flex items-end justify-between gap-4 px-8 pt-[26px] pb-[18px]">
      <div>
        <div className="text-caption font-medium text-faint mb-1">Contas</div>
        <h1 className="m-0 text-[29px] leading-[1.15] font-medium tracking-[-0.01em] text-ink">
          {title}
        </h1>
      </div>
      <div className="flex items-center gap-[10px]">
        <Pill
          variant="yield"
          rightIcon={<Icon name="arrow-up-right" size={14} />}
        >
          Render mais
        </Pill>
        <Button
          variant="secondary"
          leftIcon={<Icon name="arrow-down-to-line" size={15} />}
        >
          Sacar
        </Button>
        <Button
          variant="primary"
          leftIcon={<Icon name="plus" size={15} />}
          onClick={onDeposit}
        >
          Depositar
        </Button>
      </div>
    </header>
  );
}
