import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * all4pay DS — Button
 * Solid ink primary, bordered secondary, ghost tertiary, plus a lime
 * accent. Text weight 500. Presses with a tiny scale(0.98). 3 sizes.
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

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-ink text-white border border-ink",
  secondary: "bg-white text-ink border border-border",
  ghost: "bg-transparent text-ink border border-transparent",
  accent: "bg-lime text-on-lime border border-lime",
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
          pill ? "rounded-pill" : "rounded-md",
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
