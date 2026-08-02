import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[8px] text-sm font-medium transition-[background,color,border-color,transform,filter] duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-[linear-gradient(180deg,#33d4ff_0%,#00c8ff_100%)] text-[#041018] font-semibold shadow-[0_0_20px_rgba(0,200,255,0.22)] hover:brightness-105 hover:scale-[1.02] active:scale-[0.98]",
        secondary:
          "bg-white/[0.04] text-[var(--text-primary)] border border-[var(--border)] hover:bg-white/[0.07] hover:scale-[1.02]",
        ghost:
          "text-[var(--text-secondary)] hover:bg-white/[0.05] hover:text-[var(--text-primary)]",
        danger:
          "bg-[rgba(255,69,58,0.12)] text-[var(--danger)] border border-[rgba(255,69,58,0.25)] hover:bg-[rgba(255,69,58,0.18)]",
      },
      size: {
        default: "h-9 px-4",
        sm: "h-8 px-3 text-xs",
        lg: "h-10 px-5",
        icon: "h-8 w-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";
