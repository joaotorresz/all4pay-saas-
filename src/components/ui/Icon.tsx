import * as React from "react";
import { SOLAR_ICONS, type SolarIcon } from "./solar-icons";

/** Espessura de traço padrão do set Hugeicons Rounded. */
const STROKE_PADRAO = 1.5;

/**
 * Ícones custom (fora do set gerado) — sobrepõem o SOLAR_ICONS por nome.
 * `inicio`: pentágono arredondado (silhueta do "Visão Geral" do Visor), agora
 * TRAÇADO para casar com o Hugeicons. Usado no item Início/Resumo da Sidebar.
 */
const CUSTOM_ICONS: Record<string, SolarIcon> = {
  inicio: { b: '<path fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" d="M12 3.5 20.6 9.7 17.3 19.8 6.7 19.8 3.4 9.7Z"/>', w: 24, h: 24 },
};

/**
 * all4pay DS — Icon
 * Conjunto **Hugeicons (Stroke Rounded)** (Iconify) — glifos TRAÇADOS, leves e
 * com cantos arredondados. Monocromáticos via `currentColor`: a prop `color`
 * carrega a identidade visual da all4pay (ink · muted · faint · lime · on-lime)
 * e `strokeWidth` ajusta a espessura (padrão 1.5 do próprio set). Renderiza o
 * SVG inline (sem fetch em runtime; viewBox 24).
 *
 * Ids internos (alguns glifos usam <defs>/<mask>/<use>) são renomeados por
 * instância (useId) para nunca colidirem quando o mesmo ícone aparece N vezes.
 *
 * Para trocar/estender o set: rode `scratchpad/gen-hugeicons.mjs`.
 */
export type IconName = keyof typeof SOLAR_ICONS;

export interface IconProps {
  name: IconName | string;
  size?: number;
  color?: string;
  /** Espessura do traço (Hugeicons é traçado). Padrão: 1.5, do próprio set. */
  strokeWidth?: number;
  className?: string;
}

export function Icon({ name, size = 18, color = "currentColor", strokeWidth, className }: IconProps) {
  const ic = CUSTOM_ICONS[name as string] ?? SOLAR_ICONS[name as string];
  const rawId = React.useId();
  const html = React.useMemo(() => {
    let b = ic?.b ?? "";
    // Espessura customizada: o set traz stroke-width fixo em cada glifo.
    if (strokeWidth && strokeWidth !== STROKE_PADRAO) {
      b = b.replace(/stroke-width="[^"]*"/g, `stroke-width="${strokeWidth}"`);
    }
    if (!b.includes("id=")) return b; // fast path: glifo sem ids internos
    const uid = "a4p" + rawId.replace(/[^a-zA-Z0-9]/g, "");
    return b
      .replace(/id="([^"]+)"/g, (_m, id) => `id="${uid}-${id}"`)
      .replace(/href="#([^"]+)"/g, (_m, id) => `href="#${uid}-${id}"`)
      .replace(/url\(#([^)]+)\)/g, (_m, id) => `url(#${uid}-${id})`);
  }, [ic, rawId, strokeWidth]);
  if (!ic) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${ic.w} ${ic.h}`}
      className={["a4p-icon", className].filter(Boolean).join(" ")}
      style={{ color, display: "inline-block", flexShrink: 0, verticalAlign: "middle" }}
      aria-hidden="true"
      focusable="false"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
