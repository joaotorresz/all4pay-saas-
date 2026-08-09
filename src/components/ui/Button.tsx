import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * all4pay DS — Button (paleta quente)
 *
 * ⚠️ ISTO INVERTE A DOUTRINA ANTERIOR ("nada parece botão", pill sem fill).
 * O guia vigente define o botão por forma e contraste:
 *   · CANTOS RETOS (`border-radius: 0`) e padding 16px/20px;
 *   · PRIMÁRIO = Black quente com texto em White quente — um por tela;
 *   · SECUNDÁRIO = Beige com texto em Black quente (ou só contorno em Border);
 *   · TERCIÁRIO = texto com sublinhado;
 *   · ACCENT = o degradê da marca com texto em Black quente, reservado ao CTA
 *     final de um fluxo.
 * O texto do botão é TEXTO (Roobert 500) — nunca a classe de rótulo, nunca
 * caixa alta forçada.
 *
 * O raio pertence ao CARD, não ao controle: é o card que carrega a curva da
 * marca, e o botão que fica reto. `pill` sobrevive só para os controles que
 * são chips por definição (seletor de período), onde a forma É a função.
 */
type ButtonVariant = "primary" | "secondary" | "ghost" | "accent";
type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  pill?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

// Padding de referência do guia: 16px vertical / 20px horizontal (o `md`).
// `sm` e `lg` mantêm a proporção descendo e subindo um passo da escala base-8.
const sizeClasses: Record<ButtonSize, string> = {
  sm: "text-caption gap-2 px-3 py-2",
  md: "text-body gap-2 px-5 py-4",
  lg: "text-body gap-2 px-6 py-4",
};

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-ink text-white hover:bg-ink-soft",
  secondary: "bg-surface-2 text-ink hover:bg-surface-3",
  ghost: "bg-transparent text-ink hover:bg-surface-2",
  // O degradê só no CTA final. `text-on-lime` porque o fim do degradê é o
  // lima claro: texto branco ali some.
  accent: "a4p-gradiente-marca text-on-lime hover:opacity-90",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      children,
      variant = "primary",
      size = "md",
      pill = false,
      leftIcon = null,
      rightIcon = null,
      fullWidth = false,
      disabled = false,
      className,
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={cn(
          "inline-flex items-center justify-center font-medium leading-none whitespace-nowrap",
          "transition-[background-color,border-color,transform,opacity] duration-120 ease-out",
          "active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45",
          // ⚠️ CANTOS RETOS. Aplicado ao PRIMITIVO, não a todo `<button>` da
          // tela: um seletor `.ds-visor button` também quadraria os chips de
          // período, os toggles e os FABs, que são redondos por definição.
          pill ? "rounded-pill" : "rounded-none",
          fullWidth && "w-full",
          sizeClasses[size],
          variantClasses[variant],
          className,
        )}
        {...rest}
      >
        {leftIcon}
        {children}
        {rightIcon}
      </button>
    );
  },
);
