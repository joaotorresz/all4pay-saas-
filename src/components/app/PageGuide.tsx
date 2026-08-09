"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui";
import { guideForPath, tourSteps } from "./guides";
import { Tour } from "./Tour";
import { rotasVistas } from "@/lib/adoption";
import { autoTourLigado, toursDisparados, marcarDisparado, salvarProgressoTour } from "@/lib/ajuda-store";

/**
 * Guia embutido por página. Abre automaticamente na primeira visita de cada
 * rota (memorizado em localStorage) e fica disponível num botão flutuante
 * "Guia" para reabrir. Explica o que dá para fazer, as variáveis e o que é
 * cada bloco da tela. Montado uma vez no AppShell — cobre todas as páginas.
 */
export function PageGuide() {
  const pathname = usePathname();
  const sp = useSearchParams();
  // Com hubs, o guia é POR ABA (?aba=…) — ver `guideForPath`.
  const guide = guideForPath(pathname, sp.get("aba"));
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
  React.useEffect(() => { setOpen(false); }, [pathname, sp]);

  // A Central de Ajuda abre o tour pela rota: `?tour=1`.
  React.useEffect(() => {
    if (sp.get("tour") === "1" && temTour) setTour(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, sp]);

  /**
   * Convite automático ao entrar numa tela nova.
   *
   * ⚠️ É um CONVITE, não um modal. A decisão anterior deste arquivo — não abrir
   * o guia sozinho para não interceptar o clique da primeira visita — continua
   * valendo; o que o produto pede (tour disparado ao entrar numa tela nova)
   * cabe numa barra discreta que a pessoa aceita ou ignora.
   *
   * Duas travas: uma vez por tela (a rota já disparada nunca repete) e no
   * máximo uma por sessão — quatro telas atravessadas não podem render quatro
   * convites, porque o quarto já é irritação.
   */
  const [conviteTour, setConviteTour] = React.useState(false);
  const disparouNestaSessao = React.useRef(false);
  React.useEffect(() => {
    setConviteTour(false);
    if (!temTour || sp.get("tour") === "1") return;
    if (disparouNestaSessao.current) return;
    try {
      if (!autoTourLigado()) return;
      if (rotasVistas().has(pathname)) return;
      if (toursDisparados().includes(pathname)) return;
      disparouNestaSessao.current = true;
      marcarDisparado(pathname);
      setConviteTour(true);
    } catch { /* localStorage bloqueado — sem convite, o botão Guia continua */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, temTour]);

  // Boas-vindas de primeira visita (só na Home): um convite discreto, não
  // bloqueante, apontando o tour — some para sempre ao dispensar ou aceitar.
  const [convite, setConvite] = React.useState(false);
  React.useEffect(() => {
    try {
      setConvite(pathname === "/" && !localStorage.getItem("a4p_guide_welcome"));
    } catch { setConvite(false); }
  }, [pathname]);
  const fecharConvite = React.useCallback(() => {
    try { localStorage.setItem("a4p_guide_welcome", "1"); } catch { /* ignore */ }
    setConvite(false);
  }, []);

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
        className="fixed bottom-[84px] right-5 z-40 inline-flex items-center gap-2 rounded-pill bg-white text-ink px-4 py-[10px] hover:bg-surface-2 transition"
      >
        <Icon name="help-circle" size={16} color="var(--color-ink)" />
        <span className="text-label font-medium">Guia</span>
      </button>

      {conviteTour && !convite && (
        <div className="a4p-glass fixed bottom-[136px] right-5 z-40 w-[300px] rounded-card bg-white shadow-popover border border-border p-4 flex flex-col gap-3">
          <div className="flex items-start gap-2">
            <span className="w-[26px] h-[26px] rounded-sm bg-lime inline-flex items-center justify-center shrink-0">
              <Icon name="help-circle" size={14} color="var(--color-on-lime)" />
            </span>
            <p className="m-0 text-caption leading-snug text-ink">
              <b className="font-semibold">Tela nova.</b> Quer um tour de {passos.filter((x) => x.match).length} passos
              apontando cada bloco?
            </p>
            <button onClick={() => setConviteTour(false)} aria-label="Dispensar" className="ml-auto inline-flex p-[2px] rounded-md hover:bg-surface-2 shrink-0">
              <Icon name="x" size={14} color="var(--color-text-tertiary)" />
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setConviteTour(false);
                try { salvarProgressoTour(pathname, { passo: 1, concluido: false }); } catch { /* ignore */ }
                setTour(true);
              }}
              className="flex-1 rounded-md bg-surface-3 text-ink text-caption font-semibold py-2 hover:bg-surface-2"
            >
              Fazer o tour
            </button>
            <button onClick={() => setConviteTour(false)} className="rounded-md text-caption text-muted px-3 py-2 hover:text-ink hover:bg-surface-2">
              Agora não
            </button>
          </div>
        </div>
      )}

      {convite && (
        <div className="a4p-glass fixed bottom-[136px] right-5 z-40 w-[300px] rounded-card bg-white shadow-popover border border-border p-4 flex flex-col gap-3">
          <div className="flex items-start gap-2">
            <span className="w-[26px] h-[26px] rounded-sm bg-lime inline-flex items-center justify-center shrink-0">
              <Icon name="help-circle" size={14} color="var(--color-on-lime)" />
            </span>
            <p className="m-0 text-caption leading-snug text-ink">
              <b className="font-semibold">Primeira vez aqui?</b> Cada tela tem um guia:
              o que é, como usar e um tour apontando os blocos na própria tela.
            </p>
            <button onClick={fecharConvite} aria-label="Dispensar" className="ml-auto inline-flex p-[2px] rounded-md hover:bg-surface-2 shrink-0">
              <Icon name="x" size={14} color="var(--color-text-tertiary)" />
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { fecharConvite(); setOpen(true); }}
              className="flex-1 rounded-md bg-surface-3 text-ink text-caption font-semibold py-2 hover:bg-surface-2"
            >
              Conhecer a Home
            </button>
            <button onClick={fecharConvite} className="rounded-md text-caption text-muted px-3 py-2 hover:text-ink hover:bg-surface-2">
              Agora não
            </button>
          </div>
        </div>
      )}

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
                <div className="rounded-md bg-lime-tint border border-[color:var(--color-lime-tint)] px-4 py-3">
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
                  className="flex-1 rounded-md bg-surface-3 text-ink text-label font-semibold py-[10px] hover:bg-surface-2 inline-flex items-center justify-center gap-2"
                >
                  Tour na tela
                  <Icon name="arrow-up-right" size={15} color="var(--color-lime)" />
                </button>
              )}
            </div>
          </aside>
        </div>
      )}

      {tour && (
        <Tour
          steps={passos}
          onClose={() => {
            setTour(false);
            // Concluir o tour é o que move o progresso na Central de Ajuda.
            try { salvarProgressoTour(pathname, { passo: passos.length, concluido: true }); } catch { /* ignore */ }
          }}
        />
      )}
    </>
  );
}
