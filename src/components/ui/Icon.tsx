import * as React from "react";
import { SOLAR_ICONS } from "./solar-icons";

/**
 * all4pay DS — Icon
 * Conjunto **Solar Bold Duotone** (svgrepo / Iconify) — ícones cheios em duotone
 * (camada secundária em opacity .5). Monocromáticos via `currentColor`: a prop
 * `color` carrega a identidade visual da all4pay (ink · muted · faint · lime ·
 * on-lime). Renderiza o SVG inline (sem fetch em runtime). `strokeWidth` é
 * mantido por compatibilidade da API, mas ignorado (os glifos são preenchidos).
 *
 * Para trocar/estender o set: edite `solar-icons.ts` (gerado do Iconify).
 */
export type IconName = keyof typeof SOLAR_ICONS;

export interface IconProps {
  name: IconName | string;
  size?: number;
  color?: string;
  /** Compat: ignorado (ícones duotone são preenchidos, não traçados). */
  strokeWidth?: number;
  className?: string;
}

export function Icon({ name, size = 18, color = "currentColor", className }: IconProps) {
  const ic = SOLAR_ICONS[name as string];
  if (!ic) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${ic.w} ${ic.h}`}
      className={className}
      style={{ color, display: "inline-block", flexShrink: 0, verticalAlign: "middle" }}
      aria-hidden="true"
      focusable="false"
      dangerouslySetInnerHTML={{ __html: ic.b }}
    />
  );
}
