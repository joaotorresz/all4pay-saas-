"use client";

import * as React from "react";

/**
 * A ENTRADA NO APP (03/11/2026, vídeo de referência do dono).
 *
 * Uma cortina no verde do menu cobre a tela, o logo aparece no centro, e a
 * cortina ENCOLHE até o lugar exato do menu lateral — ela "vira" o menu. Ao
 * terminar, avisa (`a4p:entrada-fim`) e os itens do menu surgem um a um.
 *
 * ⚠️ Só na CARGA da página. Cada tela monta o seu `AppShell`, e a cortina a
 * cada navegação seria um pedágio de dois segundos por clique: a marca fica
 * no módulo, que sobrevive à navegação e zera num recarregamento.
 * ⚠️ Com `prefers-reduced-motion`, nada acontece (a cortina nem aparece).
 */
let jaEntrou = false;

const LOGO_MS = 520;
const PAUSA_MS = 520;
const ENCOLHE_MS = 780;

export function EntradaApp() {
  const [ativa, setAtiva] = React.useState(() => !jaEntrou);
  const cortina = React.useRef<HTMLDivElement>(null);
  const logo = React.useRef<HTMLSpanElement>(null);

  React.useEffect(() => {
    if (!ativa) return;
    jaEntrou = true;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setAtiva(false);
      return;
    }
    const el = cortina.current;
    if (!el) return;
    let vivo = true;
    const t = window.setTimeout(() => {
      if (!vivo) return;
      const menu = document.querySelector<HTMLElement>(".a4p-sidebar");
      const r = menu?.getBoundingClientRect();
      // No telefone o menu é gaveta (fora da tela): a cortina sobe e some.
      const visivel = !!r && r.width > 0 && r.right > 0 && r.left < window.innerWidth;
      const raio = menu ? getComputedStyle(menu).borderTopLeftRadius : "28px";
      const fim: Keyframe = visivel && r
        ? { top: `${r.top}px`, left: `${r.left}px`, width: `${r.width}px`, height: `${r.height}px`, borderRadius: raio }
        : { top: "0px", left: "0px", width: "100vw", height: "0px", borderRadius: "0 0 28px 28px" };
      logo.current?.animate(
        [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(-24px) scale(.94)" }],
        { duration: ENCOLHE_MS * 0.55, easing: "cubic-bezier(.4,0,.2,1)", fill: "forwards" },
      );
      const anim = el.animate(
        [{ top: "0px", left: "0px", width: "100vw", height: "100vh", borderRadius: "0px" }, fim],
        { duration: ENCOLHE_MS, easing: "cubic-bezier(.76,0,.24,1)", fill: "forwards" },
      );
      anim.onfinish = () => {
        if (!vivo) return;
        window.dispatchEvent(new Event("a4p:entrada-fim"));
        setAtiva(false);
      };
    }, LOGO_MS + PAUSA_MS);
    return () => { vivo = false; window.clearTimeout(t); };
  }, [ativa]);

  if (!ativa) return null;
  return (
    <div ref={cortina} className="a4p-cortina" aria-hidden>
      <span ref={logo} className="a4p-cortina-logo" />
    </div>
  );
}
