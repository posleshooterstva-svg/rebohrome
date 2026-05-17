"use client";

import { useEffect, useState } from "react";
import { useCartStore } from "@/lib/stores/cart-store";

export function CartBadge() {
  const totalItems = useCartStore((state) => state.totalItems());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || totalItems === 0) {
    return null;
  }

  return (
    <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--foreground)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--background)]">
      {totalItems}
    </span>
  );
}
