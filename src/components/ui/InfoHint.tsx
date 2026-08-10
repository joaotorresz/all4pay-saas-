"use client";

/**
 * all4pay DS — InfoHint
 * O botão "i" universal dos boxes: explica EM LINGUAGEM SIMPLES "para que serve"
 * o box e "como é calculado". Abre um popover ancorado (clique), fecha no clique
 * fora / Esc. Discreto (faint → ink no hover). Usado direto (inline no header) ou
 * via a prop `info` do <Card> (canto superior direito). Tira o ar burocrático:
 * todo número do sistema fica auto-explicável.
 */
import * as React from "react";
import { Icon } from "./Icon";

export interface InfoConteudo {
  titulo?: string;
  /** Para que serve este box (1-2 frases simples). */
  oQue: string;
  /** Como é calculado / de onde vêm os números (opcional). */
  comoCalcula?: string;
}

export function InfoHint({ titulo, oQue, comoCalcula, className, align = "right" }: InfoConteudo & { className?: string; align?: "right" | "left" }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onEsc); };
  }, [open]);

  return (
    <div ref={ref} className={`relative inline-flex ${className || ""}`}>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o); }}
        aria-label="Como funciona este box"
        aria-expanded={open}
        className={`w-[22px] h-[22px] rounded-pill inline-flex items-center justify-center transition-colors ${open ? "text-ink bg-surface-2" : "text-faint hover:text-ink hover:bg-surface-2"}`}
      >
        <Icon name="info" size={15} color="currentColor" />
      </button>
      {open && (
        <div
          role="dialog"
          className={`absolute top-[28px] z-50 w-[280px] rounded-card bg-white border border-border p-4 text-left cursor-default ${align === "right" ? "right-0" : "left-0"}`}
          style={{ boxShadow: "0 10px 30px rgba(14,19,30,0.16)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {titulo && <div className="text-[14px] font-semibold text-ink mb-2">{titulo}</div>}
          <div className="text-[11px] font-semibold tracking-wide text-faint">Para que serve</div>
          <p className="m-0 mt-1 text-[13px] leading-[1.5] text-muted">{oQue}</p>
          {comoCalcula && (
            <>
              <div className="text-[11px] font-semibold tracking-wide text-faint mt-3">Como é calculado</div>
              <p className="m-0 mt-1 text-[13px] leading-[1.5] text-muted">{comoCalcula}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
