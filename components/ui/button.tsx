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
          "bg-[var(--foreground)] px-5 py-3 text-[var(--background)] shadow-[0_8px_20px_rgba(15,23,42,0.08)] hover:opacity-92",
        secondary:
          "border border-line-strong bg-panel-strong px-5 py-3 text-[var(--foreground)] hover:bg-[var(--background-strong)]",
        ghost:
          "px-4 py-3 text-muted hover:bg-[var(--background-strong)] hover:text-[var(--foreground)]",
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
