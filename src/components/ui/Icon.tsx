import * as React from "react";
import { LUCIDE_ICONS, iconeExiste, type LucideIconKey } from "./lucide-icons";

/**
 * Espessura do traço do sistema: **1,75px** (decisão do dono, 15/10/2026).
 * O Lucide nasce com 2; o padrão do DS é este, e ele vale para TODO ícone
 * porque mora aqui, no único componente que desenha ícone.
 */
export const STROKE_ICONE = 1.75;

/**
 * Quattro DS — Icon
 * Conjunto **Lucide** (`lucide-react`) — glifos traçados, monocromáticos via
 * `currentColor`: a prop `color` carrega a identidade (ink · muted · faint ·
 * lime · on-lime) e `strokeWidth` só muda a espessura na exceção.
 *
 * ⚠️ `absoluteStrokeWidth`: o traço fica em 1,75px NA TELA em qualquer
 * tamanho. Sem ele o Lucide escala o traço junto com o ícone (um ícone de
 * 12px sairia com 0,9px e um de 32px com 2,3px) e "1,75" deixaria de ser
 * uma medida.
 *
 * As chaves (`house`, `trash-2`…) moram em `lucide-icons.ts`.
 */
export type IconName = LucideIconKey;

export interface IconProps {
  name: IconName | string;
  size?: number;
  color?: string;
  /** Espessura do traço em px. Padrão: 1,75 (o do sistema). */
  strokeWidth?: number;
  className?: string;
}

export function Icon({ name, size = 18, color = "currentColor", strokeWidth = STROKE_ICONE, className }: IconProps) {
  if (!iconeExiste(name)) return null;
  const Glifo = LUCIDE_ICONS[name];
  return (
    <Glifo
      size={size}
      strokeWidth={strokeWidth}
      absoluteStrokeWidth
      className={["a4p-icon", className].filter(Boolean).join(" ")}
      style={{ color, display: "inline-block", flexShrink: 0, verticalAlign: "middle" }}
      aria-hidden="true"
      focusable="false"
    />
  );
}
