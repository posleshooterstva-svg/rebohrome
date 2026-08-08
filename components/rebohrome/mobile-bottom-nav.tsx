"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  Archive,
  Home,
  LayoutGrid,
  LogIn,
  Menu,
  ShoppingBag,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";

type MobileBottomNavProps = {
  active?:
    | "dashboard"
    | "marketplace"
    | "collections"
    | "drops"
    | "collection"
    | "vault"
    | "watchlist"
    | "orders"
    | "transactions"
    | "deposit"
    | "settings";
  isAuthenticated?: boolean;
};

type MobileBottomNavItem = {
  id: string;
  label: string;
  href: string;
  icon: typeof LayoutGrid;
};

const dashboardItems = [
  { id: "dashboard", label: "Dashboard", href: "/dashboard", icon: LayoutGrid },
  { id: "marketplace", label: "Market", href: "/dashboard/marketplace", icon: ShoppingBag },
  { id: "collection", label: "Collection", href: "/dashboard/collection", icon: Archive },
  { id: "deposit", label: "Deposit", href: "/dashboard/deposit", icon: Upload },
  { id: "more", label: "More", href: "/dashboard/settings", icon: Menu },
] satisfies MobileBottomNavItem[];

function getPublicItems(isAuthenticated: boolean) {
  return [
    { id: "home", label: "Home", href: "/", icon: Home },
    { id: "marketplace", label: "Market", href: "/dashboard/marketplace", icon: ShoppingBag },
    { id: "collection", label: "Collection", href: "/dashboard/collection", icon: Archive },
    { id: "deposit", label: "Deposit", href: "/dashboard/deposit", icon: Upload },
    {
      id: "more",
      label: isAuthenticated ? "More" : "Sign in",
      href: isAuthenticated ? "/dashboard/settings" : "/login?next=/dashboard/settings",
      icon: isAuthenticated ? Menu : LogIn,
    },
  ] satisfies MobileBottomNavItem[];
}

const hiddenPathPrefixes = [
  "/login",
  "/register",
  "/cart",
  "/checkout",
  "/payment",
  "/success",
  "/admin",
];

function resolveActiveId(active: MobileBottomNavProps["active"]) {
  if (active === "dashboard") {
    return "dashboard";
  }

  if (active === "marketplace") {
    return "marketplace";
  }

  if (active === "collection" || active === "collections" || active === "drops" || active === "vault" || active === "watchlist") {
    return "collection";
  }

  if (active === "orders") {
    return "more";
  }

  if (active === "deposit") {
    return active;
  }

  if (active === "transactions" || active === "settings") {
    return "more";
  }

  return "more";
}

function resolveActiveFromPath(pathname: string, isDashboardMode: boolean) {
  if (isDashboardMode) {
    if (pathname.startsWith("/dashboard/deposit")) return "deposit";
    if (pathname.startsWith("/dashboard/marketplace")) return "marketplace";
    if (
      pathname.startsWith("/dashboard/collections") ||
      pathname.startsWith("/dashboard/drops") ||
      pathname.startsWith("/dashboard/collection") ||
      pathname.startsWith("/dashboard/vault") ||
      pathname.startsWith("/dashboard/watchlist")
    ) {
      return "collection";
    }
    if (
      pathname.startsWith("/dashboard/transactions") ||
      pathname.startsWith("/dashboard/settings") ||
      pathname.startsWith("/dashboard/orders")
    ) {
      return "more";
    }
    return "dashboard";
  }

  return "home";
}

export function MobileBottomNav({ active, isAuthenticated = false }: MobileBottomNavProps) {
  const pathname = usePathname() || "/";
  const isDashboardMode = pathname.startsWith("/dashboard");
  const shouldHide = hiddenPathPrefixes.some((prefix) => pathname.startsWith(prefix));
  const items = isDashboardMode ? dashboardItems : getPublicItems(isAuthenticated);
  const activeId = active
    ? resolveActiveId(active)
    : resolveActiveFromPath(pathname, isDashboardMode);

  if (shouldHide) {
    return null;
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-[220] px-3 pb-[calc(10px+env(safe-area-inset-bottom))] md:hidden">
      <div className="mx-auto max-w-[720px] rounded-[24px] border border-white/10 bg-[rgba(8,12,24,0.82)] px-2 py-2 shadow-[0_18px_50px_rgba(0,0,0,0.38)] backdrop-blur-2xl">
        <nav className="grid grid-cols-5 gap-1">
          {items.map((item) => {
            const activeItem = item.id === activeId;

            return (
              <Link
                key={item.id}
                className={cn(
                  "relative flex min-h-[62px] flex-col items-center justify-center gap-1 rounded-[16px] px-2 py-2 text-[11px] font-medium tracking-[0.02em] text-muted transition",
                  activeItem && "text-white",
                )}
                href={item.href}
              >
                {activeItem ? (
                  <motion.div
                    className="absolute inset-0 rounded-[16px] border border-violet-300/20 bg-[linear-gradient(180deg,rgba(139,92,246,0.34)_0%,rgba(109,77,242,0.18)_100%)] shadow-[0_10px_26px_rgba(109,77,242,0.24)]"
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
