import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * all4pay DS — Button (paleta quente)
 *
 * ⚠️ ISTO INVERTE A DOUTRINA ANTERIOR ("nada parece botão", pill sem fill).
 * O guia vigente define o botão por forma e contraste:
 *   · padding 16px/20px (o raio, ver abaixo, passou a ser o do card);
 *   · PRIMÁRIO = Black quente com texto em White quente — um por tela;
 *   · SECUNDÁRIO = Beige com texto em Black quente (ou só contorno em Border);
 *   · TERCIÁRIO = texto com sublinhado;
 *   · ACCENT = o degradê da marca com texto em Black quente, reservado ao CTA
 *     final de um fluxo.
 * O texto do botão é TEXTO (Roobert 500) — nunca a classe de rótulo, nunca
 * caixa alta forçada.
 *
 * ⚠️ O RAIO acompanha o CARD: `rounded-card` (22px no escopo `.ds-visor`), o
 * mesmo token dos boxes da Home. A doutrina de "cantos retos" citada acima é
 * histórica — um botão de canto vivo encostado num card de 22px lia como peça
 * de outro sistema. `pill` sobrevive para os controles em que a forma redonda
 * É a função (chips de período, FABs).
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
  sm: "text-caption gap-2 px-3 py-2",
  md: "text-body gap-2 px-5 py-4",
  lg: "text-body gap-2 px-6 py-4",
};

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-ink text-white hover:bg-ink-soft",
  secondary: "bg-surface-2 text-ink hover:bg-surface-3",
  /**
   * A forma de CONTORNO do secundário — a que o guia já previa ("Beige com
   * texto em Black quente **ou só contorno em Border**") e que nunca tinha sido
   * escrita como variante.
   *
   * ⚠️ **O defeito que ela conserta:** as ações secundárias de cabeçalho
   * (Exportar XLSX, Exportar PDF, Importar) usavam `ghost` — fundo transparente
   * e nenhuma borda. Sobre o branco do card elas ficavam indistinguíveis de
   * texto até alguém passar o mouse por cima, e um controle que só existe no
   * hover é um controle que metade das pessoas nunca acha (a mesma lição do
   * botão de recolher da barra lateral).
   *
   * Fica no PRIMITIVO, e não em CSS por tela: a borda escrita à mão em vinte
   * cabeçalhos diverge no primeiro ajuste de token — que é exatamente como um
   * sistema ganha três cinzas de borda diferentes.
   *
   * `ghost` continua existindo e continua certo onde o botão é terciário de
   * verdade (dentro de uma linha de tabela, num popover, ao lado de um
   * primário): contornar TUDO devolve o ruído que o contorno existe para
   * organizar.
   */
  outline: "bg-transparent text-ink border border-border hover:bg-surface-2",
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
          pill ? "rounded-pill" : "rounded-card",
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
