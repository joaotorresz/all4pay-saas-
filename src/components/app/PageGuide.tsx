"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui";
import { guideForPath, tourSteps } from "./guides";
import { Tour } from "./Tour";

/**
 * Guia embutido por página. Abre automaticamente na primeira visita de cada
 * rota (memorizado em localStorage) e fica disponível num botão flutuante
 * "Guia" para reabrir. Explica o que dá para fazer, as variáveis e o que é
 * cada bloco da tela. Montado uma vez no AppShell — cobre todas as páginas.
 */
export function PageGuide() {
  const pathname = usePathname();
  const guide = guideForPath(pathname);
  const [open, setOpen] = React.useState(false);
  const [tour, setTour] = React.useState(false);

  const passos = guide ? tourSteps(guide) : [];
  const temTour = passos.some((p) => p.match);
  const iniciarTour = () => {
    setOpen(false);
    setTour(true);
  };

  // Opt-in: o guia NÃO abre sozinho (evita interceptar cliques na 1ª visita).
  // Fica disponível no botão flutuante "Guia". Fecha-se ao trocar de rota.
  React.useEffect(() => { setOpen(false); }, [pathname]);

  // ESC fecha.
  React.useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open]);

  if (!guide) return null;

  return (
    <>
      {/* Botão flutuante */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Abrir guia da página"
        className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-pill bg-ink text-white shadow-popover px-4 py-[10px] hover:opacity-90"
      >
        <Icon name="help-circle" size={16} color="var(--color-lime)" />
        <span className="text-label font-medium">Guia</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <button
            aria-label="Fechar guia"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/30"
          />
          {/* Painel */}
          <aside className="relative h-full w-[420px] max-w-full bg-white shadow-popover flex flex-col">
            <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-border-soft">
              <div className="flex items-start gap-3 min-w-0">
                <span className="w-[28px] h-[28px] rounded-sm bg-lime inline-flex items-center justify-center shrink-0 mt-[2px]">
                  <Icon name="help-circle" size={15} color="var(--color-on-lime)" />
                </span>
                <div className="min-w-0">
                  <div className="text-caption font-medium text-faint">Guia da página</div>
                  <h2 className="m-0 text-h3 font-medium text-ink leading-tight">{guide.titulo}</h2>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Fechar"
                className="inline-flex p-1 rounded-md hover:bg-surface-2 shrink-0"
              >
                <Icon name="x" size={18} color="var(--color-text-secondary)" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">
              <div className="flex flex-col gap-1">
                <span className="text-caption font-medium text-faint tracking-wide">O que é</span>
                <p className="m-0 text-body leading-[1.5] text-muted">{guide.intro}</p>
              </div>

              {guide.comoUsar && (
                <div className="flex flex-col gap-1">
                  <span className="text-caption font-medium text-faint tracking-wide">Como usar</span>
                  <p className="m-0 text-caption leading-[1.5] text-muted">{guide.comoUsar}</p>
                </div>
              )}

              {guide.exemplo && (
                <div className="rounded-md bg-lime-tint border border-[#ECF6B8] px-4 py-3">
                  <span className="text-caption font-medium text-faint tracking-wide">Exemplo</span>
                  <p className="m-0 text-caption leading-[1.5] text-ink mt-1">{guide.exemplo}</p>
                </div>
              )}

              {guide.secoes.map((s, i) => (
                <div key={i} className="flex flex-col gap-2">
                  <span className="text-caption font-medium text-faint tracking-wide">{s.titulo}</span>
                  <div className="flex flex-col gap-[10px]">
                    {s.itens.map((it, j) => (
                      <div key={j} className="flex gap-3">
                        <span className="w-[6px] h-[6px] rounded-pill bg-lime mt-[7px] shrink-0" />
                        <div>
                          <div className="text-[17px] font-medium text-ink">{it.nome}</div>
                          <div className="text-caption text-muted leading-snug">{it.desc}</div>
                          {it.exemplo && <div className="text-caption text-faint leading-snug mt-[2px]">Ex.: {it.exemplo}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="px-6 py-4 border-t border-border-soft flex gap-2">
              <button
                onClick={() => setOpen(false)}
                className="flex-1 rounded-md border border-border text-ink text-label font-medium py-[10px] hover:bg-surface-2"
              >
                Entendi
              </button>
              {temTour && (
                <button
                  onClick={iniciarTour}
                  className="flex-1 rounded-md bg-ink text-white text-label font-medium py-[10px] hover:opacity-90 inline-flex items-center justify-center gap-2"
                >
                  Tour na tela
                  <Icon name="arrow-up-right" size={15} color="var(--color-lime)" />
                </button>
              )}
            </div>
          </aside>
        </div>
      )}

      {tour && <Tour steps={passos} onClose={() => setTour(false)} />}
    </>
  );
}
