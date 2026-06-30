import * as React from "react";
import { SOLAR_ICONS, type SolarIcon } from "./solar-icons";

/**
 * Ícones custom (fora do set Solar gerado) — sobrepõem o SOLAR_ICONS por nome.
 * `inicio`: pentágono sólido e arredondado, igual ao "Visão Geral" do Visor
 * (silhueta limpa, sem porta/janela). Usado no item Início/Resumo da Sidebar.
 */
const CUSTOM_ICONS: Record<string, SolarIcon> = {
  inicio: { b: '<path fill="currentColor" stroke="currentColor" stroke-width="2.8" stroke-linejoin="round" stroke-linecap="round" d="M12 3.5 20.6 9.7 17.3 19.8 6.7 19.8 3.4 9.7Z"/>', w: 24, h: 24 },
};

/**
 * all4pay DS — Icon
 * Conjunto **Phosphor (Fill)** (Iconify) — ícones cheios, geométricos, modernos
 * e com cantos bem arredondados (refresh do design system; menos genérico).
 * Monocromáticos via `currentColor`: a prop `color` carrega a identidade visual
 * da all4pay (ink · muted · faint · lime · on-lime). Renderiza o SVG inline (sem
 * fetch em runtime; viewBox 256). `strokeWidth` é mantido por compat, mas
 * ignorado (os glifos são preenchidos).
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
  const ic = CUSTOM_ICONS[name as string] ?? SOLAR_ICONS[name as string];
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
