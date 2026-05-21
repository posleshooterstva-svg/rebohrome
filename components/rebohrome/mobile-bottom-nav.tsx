"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Archive,
  Boxes,
  LayoutGrid,
  Package,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";

type MobileBottomNavProps = {
  active:
    | "dashboard"
    | "marketplace"
    | "collection"
    | "orders"
    | "transactions"
    | "deposit"
    | "withdraw"
    | "settings";
};

const items = [
  { id: "dashboard", label: "Home", href: "/dashboard", icon: LayoutGrid },
  { id: "marketplace", label: "Vault", href: "/marketplace", icon: Boxes },
  { id: "collection", label: "Collection", href: "/dashboard/collection", icon: Archive },
  { id: "orders", label: "Orders", href: "/dashboard/orders", icon: Package },
  { id: "profile", label: "Profile", href: "/dashboard/settings", icon: UserRound },
] as const;

function resolveActiveId(active: MobileBottomNavProps["active"]) {
  if (active === "dashboard") {
    return "dashboard";
  }

  if (active === "marketplace") {
    return "marketplace";
  }

  if (active === "collection") {
    return "collection";
  }

  if (active === "orders") {
    return "orders";
  }

  return "profile";
}

export function MobileBottomNav({ active }: MobileBottomNavProps) {
  const activeId = resolveActiveId(active);

  return (
    <div className="fixed inset-x-0 bottom-4 z-[160] px-4 xl:hidden">
      <div className="mx-auto max-w-[720px] rounded-[22px] border border-[rgba(255,255,255,0.7)] bg-[rgba(255,255,255,0.78)] px-2 py-2 shadow-[0_22px_44px_rgba(15,23,42,0.12)] backdrop-blur-xl">
        <nav className="grid grid-cols-5 gap-1">
          {items.map((item) => {
            const activeItem = item.id === activeId;

            return (
              <Link
                key={item.id}
                className={cn(
                  "relative flex min-h-[62px] flex-col items-center justify-center gap-1 rounded-[16px] px-2 py-2 text-[11px] font-medium tracking-[0.02em] text-muted transition",
                  activeItem && "text-[var(--accent)]",
                )}
                href={item.href}
              >
                {activeItem ? (
                  <motion.div
                    className="absolute inset-0 rounded-[16px] bg-[linear-gradient(180deg,rgba(120,112,241,0.14)_0%,rgba(120,112,241,0.06)_100%)]"
                    layoutId="mobile-bottom-nav-active"
                    transition={{ duration: 0.22, ease: "easeOut" }}
                  />
                ) : null}
                <item.icon className="relative z-[1] size-4" />
                <span className="relative z-[1]">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
