import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Quattro DS — Button (guia da marca Quattro, 30/09/2026)
 *
 *   · PÍLULA sempre (999px), padding 15px 30px, peso 500 — nunca bold;
 *   · PRIMÁRIO = lime com texto em verde-base (lime nunca leva texto branco),
 *     hover escurece levemente;
 *   · SECUNDÁRIO = transparente com borda rgba(59,67,50,0.28), texto verde-base;
 *   · GHOST = só texto, para ação terciária dentro de linha/popover.
 * O texto do botão é TEXTO (Roobert 500) — nunca caixa alta forçada.
 * As doutrinas anteriores ("nada parece botão", "cantos retos", "raio do
 * card") são histórico.
 */
type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "accent";
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
  sm: "text-caption gap-2 px-4 py-2",
  md: "text-body gap-2 px-botao-x py-botao-y",
  lg: "text-body gap-2 px-botao-x py-4",
};

/**
 * ⚠️ QUATTRO (30/09/2026): o PRIMÁRIO é o LIME com texto em verde-base — o
 * lime é a cor de ação da marca e NUNCA leva texto branco. Secundário é
 * contorno (borda rgba(59,67,50,0.28)) sobre fundo transparente. `accent`
 * deixou de ser o degradê (a marca não usa degradê colorido) e é o mesmo lime.
 */
const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-lime text-on-lime hover:bg-lime-hover",
  secondary: "bg-transparent text-ink border border-[color:var(--a4p-borda-controle)] hover:bg-surface-2",
  outline: "bg-transparent text-ink border border-[color:var(--a4p-borda-controle)] hover:bg-surface-2",
  ghost: "bg-transparent text-ink hover:bg-surface-2",
  accent: "bg-lime text-on-lime hover:bg-lime-hover",
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
          /**
           * ⚠️ O RAIO É O DO CARD DA HOME — `rounded-card`, que no escopo
           * `.ds-visor` resolve para `--a4p-box-radius` (22px).
           *
           * Estava `rounded-none`, herdado da doutrina "cantos retos" de uma
           * identidade anterior: no produto de hoje, um botão de canto vivo ao
           * lado de um card de 22px lê como peça de outro sistema. Vai pelo
           * TOKEN e não por um valor: mudar o raio dos cards passa a mudar o
           * dos botões junto, que é o comportamento que se quer de um sistema.
           *
           * Aplicado ao PRIMITIVO, não a todo `<button>` da tela: um seletor
           * `.ds-visor button` também arredondaria os chips de período, os
           * toggles e os FABs, que já têm forma própria. `pill` sobrevive para
           * os controles em que a forma redonda É a função.
           */
          // Guia Quattro: botão é PÍLULA, sem exceção. `pill` fica aceito por
          // compatibilidade com quem já o passa.
          "rounded-pill",
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
