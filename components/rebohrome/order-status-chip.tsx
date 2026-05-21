"use client";

import { motion } from "framer-motion";
import type { OrderStatus } from "@/lib/rebohrome-data";
import { cn } from "@/lib/utils";

const statusStyles: Record<
  OrderStatus,
  {
    chip: string;
    dot: string;
  }
> = {
  Pending: {
    chip: "border-sky-200 bg-sky-50 text-sky-700",
    dot: "bg-sky-500",
  },
  Processing: {
    chip: "border-amber-200 bg-amber-50 text-amber-700",
    dot: "bg-amber-500",
  },
  Completed: {
    chip: "border-emerald-200 bg-emerald-50 text-emerald-700",
    dot: "bg-emerald-500",
  },
  Declined: {
    chip: "border-rose-200 bg-rose-50 text-rose-700",
    dot: "bg-rose-500",
  },
};

export function OrderStatusChip({ status }: { status: OrderStatus }) {
  const palette = statusStyles[status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium uppercase tracking-[0.16em]",
        palette.chip,
      )}
    >
      <motion.span
        animate={{ opacity: [0.55, 1, 0.55], scale: [0.92, 1.04, 0.92] }}
        className={cn("size-2 rounded-full", palette.dot)}
        transition={{ duration: 2.4, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
      />
      {status}
    </span>
  );
}
