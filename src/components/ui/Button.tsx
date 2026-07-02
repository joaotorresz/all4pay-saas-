import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * all4pay DS — Button (identidade corporativa: FLAT, sem chrome)
 * Regra da marca: nada "parece botão" — SEM borda, SEM sombra, bem arredondado
 * (pill). Preenchimentos sutis no tom da marca: primary = pill ink discreto ·
 * secondary = pill neutro (surface-2) · ghost = só texto (muted→ink) · accent =
 * lime. Peso 500. Toque com scale(0.98). 3 tamanhos.
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

const sizeClasses: Record<ButtonSize, string> = {
  sm: "text-label gap-2 px-[14px] h-8",
  md: "text-[17px] gap-2 px-[18px] h-10",
  lg: "text-body gap-2 px-[22px] h-12",
};

// "NADA PARECE BOTÃO": sem borda, sem sombra, sem fill sólido/escuro. Primary e
// accent = chip neutro sutil (surface-2); secondary/ghost = só texto muted→ink.
const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-surface-2 text-ink hover:bg-surface-3",
  secondary: "bg-transparent text-muted hover:text-ink",
  ghost: "bg-transparent text-muted hover:text-ink",
  accent: "bg-surface-2 text-ink hover:bg-surface-3",
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
          // marca é bem arredondada: pill por padrão (o prop `pill` fica p/ compat)
          pill ? "rounded-pill" : "rounded-pill",
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
