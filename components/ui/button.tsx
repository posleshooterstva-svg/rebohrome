import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-[10px] text-sm font-medium transition-all duration-200 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-[linear-gradient(135deg,var(--accent-primary),#6d4df2)] px-5 py-3 text-white shadow-[0_14px_32px_rgba(139,92,246,0.28)] hover:-translate-y-0.5 hover:shadow-[0_18px_42px_rgba(139,92,246,0.36)]",
        secondary:
          "border border-line-strong bg-panel-strong px-5 py-3 text-[var(--foreground)] shadow-[0_1px_0_rgba(255,255,255,0.06)_inset] hover:-translate-y-0.5 hover:border-[rgba(167,139,250,0.34)] hover:bg-[rgba(255,255,255,0.075)]",
        destructive:
          "border border-red-400/30 bg-red-500/12 px-5 py-3 text-red-200 shadow-[0_12px_28px_rgba(239,68,68,0.14)] hover:-translate-y-0.5 hover:bg-red-500/18",
        ghost:
          "px-4 py-3 text-muted hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--foreground)]",
      },
      size: {
        default: "h-11",
        sm: "h-10 px-4 text-sm",
        lg: "h-12 px-6 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />
  );
}
