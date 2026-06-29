import * as React from "react";
import { SOLAR_ICONS } from "./solar-icons";

/**
 * all4pay DS — Icon
 * Conjunto **Solar Bold** (svgrepo / Iconify) — ícones cheios, arredondados e
 * clean, casando com a coleção do Visor (norte do design system). Monocromáticos
 * via `currentColor`: a prop `color` carrega a identidade visual da all4pay
 * (ink · muted · faint · lime · on-lime). Renderiza o SVG inline (sem fetch em
 * runtime). `strokeWidth` é mantido por compatibilidade da API, mas ignorado
 * (os glifos são preenchidos).
 *
 * Ids internos (alguns glifos usam <defs>/<mask>/<use>) são renomeados por
 * instância (useId) para nunca colidirem quando o mesmo ícone aparece N vezes.
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
  const rawId = React.useId();
  const html = React.useMemo(() => {
    const b = ic?.b ?? "";
    if (!b.includes("id=")) return b; // fast path: glifo sem ids internos
    const uid = "a4p" + rawId.replace(/[^a-zA-Z0-9]/g, "");
    return b
      .replace(/id="([^"]+)"/g, (_m, id) => `id="${uid}-${id}"`)
      .replace(/href="#([^"]+)"/g, (_m, id) => `href="#${uid}-${id}"`)
      .replace(/url\(#([^)]+)\)/g, (_m, id) => `url(#${uid}-${id})`);
  }, [ic, rawId]);
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
