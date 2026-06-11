"use client";

import * as React from "react";
import { Icon } from "@/components/ui";
import type { GuideItem } from "./guides";

const DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(DIACRITICS, "");

/** Resolve cada passo a um elemento [data-card] pela legenda (match). */
function resolverAlvos(steps: GuideItem[]): (HTMLElement | null)[] {
  const root = (document.querySelector("main") ?? document.body) as HTMLElement;
  const cards = Array.from(root.querySelectorAll<HTMLElement>("[data-card]"));
  const usados = new Set<HTMLElement>();
  return steps.map((s) => {
    if (!s.match) return null;
    const m = norm(s.match);
    const achado =
      cards.find((c) => !usados.has(c) && norm(c.textContent ?? "").includes(m)) ??
      cards.find((c) => norm(c.textContent ?? "").includes(m)) ??
      null;
    if (achado) usados.add(achado);
    return achado;
  });
}

interface Rect { top: number; left: number; width: number; height: number }

export function Tour({ steps, onClose }: { steps: GuideItem[]; onClose: () => void }) {
  const [i, setI] = React.useState(0);
  const alvosRef = React.useRef<(HTMLElement | null)[]>([]);
  const [rect, setRect] = React.useState<Rect | null>(null);

  // Resolve os alvos uma vez (na ordem dos passos).
  React.useEffect(() => {
    alvosRef.current = resolverAlvos(steps);
  }, [steps]);

  const medir = React.useCallback(() => {
    const el = alvosRef.current[i];
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [i]);

  // Ao mudar de passo: rola o alvo para o centro e mede.
  React.useEffect(() => {
    const el = alvosRef.current[i];
    if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
    const t1 = setTimeout(medir, 60);
    const t2 = setTimeout(medir, 380); // após a rolagem suave
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [i, medir]);

  // Recalcula em scroll/resize.
  React.useEffect(() => {
    window.addEventListener("scroll", medir, true);
    window.addEventListener("resize", medir);
    return () => {
      window.removeEventListener("scroll", medir, true);
      window.removeEventListener("resize", medir);
    };
  }, [medir]);

  // Teclado: setas / esc.
  React.useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") setI((v) => Math.min(steps.length - 1, v + 1));
      else if (e.key === "ArrowLeft") setI((v) => Math.max(0, v - 1));
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, steps.length]);

  if (steps.length === 0) return null;
  const step = steps[i];
  const last = i === steps.length - 1;
  const pad = 8;

  // Posição do tooltip.
  const TIPW = 320;
  let tipStyle: React.CSSProperties;
  if (rect) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const abaixo = rect.top + rect.height + 12 + 150 < vh;
    const left = Math.max(12, Math.min(vw - TIPW - 12, rect.left));
    const top = abaixo ? rect.top + rect.height + 12 : Math.max(12, rect.top - 12 - 150);
    tipStyle = { position: "fixed", left, top, width: TIPW };
  } else {
    tipStyle = { position: "fixed", left: "50%", top: "50%", width: TIPW, transform: "translate(-50%,-50%)" };
  }

  return (
    <div className="fixed inset-0 z-[60]">
      {/* captura cliques (avança) e bloqueia interação por baixo */}
      <button
        aria-label="Avançar"
        onClick={() => (last ? onClose() : setI((v) => v + 1))}
        className="absolute inset-0"
        style={{ background: rect ? "transparent" : "rgba(23,23,23,0.45)" }}
      />

      {/* spotlight (apenas visual) */}
      {rect && (
        <div
          className="pointer-events-none transition-all duration-200 rounded-card"
          style={{
            position: "fixed",
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            boxShadow: "0 0 0 9999px rgba(23,23,23,0.55)",
            outline: "2px solid var(--color-lime)",
            outlineOffset: "0px",
            borderRadius: 16,
          }}
        />
      )}

      {/* tooltip */}
      <div
        style={tipStyle}
        className="z-[61] bg-white rounded-card border border-border shadow-popover p-4 flex flex-col gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className="text-caption font-medium text-faint">
            Passo {i + 1} de {steps.length}
            {!step.match && " · visão geral"}
          </span>
          <button onClick={onClose} aria-label="Encerrar tour" className="inline-flex p-1 rounded-md hover:bg-surface-2">
            <Icon name="x" size={16} color="var(--color-text-secondary)" />
          </button>
        </div>
        <div className="text-[18px] font-medium text-ink">{step.nome}</div>
        <p className="m-0 text-caption text-muted leading-snug">{step.desc}</p>
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={() => setI((v) => Math.max(0, v - 1))}
            disabled={i === 0}
            className="text-label font-medium text-muted disabled:opacity-40 rounded-md px-3 py-[7px] hover:bg-surface-2"
          >
            Voltar
          </button>
          <div className="flex-1 flex items-center justify-center gap-1">
            {steps.map((_, k) => (
              <span key={k} className="w-[5px] h-[5px] rounded-pill" style={{ background: k === i ? "var(--color-ink)" : "var(--color-border)" }} />
            ))}
          </div>
          <button
            onClick={() => (last ? onClose() : setI((v) => v + 1))}
            className="text-label font-medium text-white bg-ink rounded-md px-4 py-[7px] hover:opacity-90"
          >
            {last ? "Concluir" : "Próximo"}
          </button>
        </div>
      </div>
    </div>
  );
}
