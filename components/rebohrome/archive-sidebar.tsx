import Link from "next/link";
import {
  Archive,
  ArrowRight,
  CreditCard,
  Headphones,
  LayoutGrid,
  Settings,
  WalletCards,
} from "lucide-react";
import { type HeaderAccount } from "@/lib/rebohrome-data";
import { cn } from "@/lib/utils";

const publicSidebarItems = [
  { id: "dashboard", href: "/", label: "Dashboard", icon: LayoutGrid },
  { id: "marketplace", href: "/dashboard/marketplace", label: "Marketplace", icon: WalletCards },
  { id: "collection", href: "/dashboard/collection", label: "Collection", icon: Archive },
  { id: "transactions", href: "/dashboard/transactions", label: "Transactions", icon: WalletCards },
  { id: "deposit", href: "/dashboard/deposit", label: "Deposit", icon: CreditCard },
  { id: "settings", href: "/dashboard/settings", label: "Settings", icon: Settings },
];

const dashboardSidebarItems = [
  { id: "dashboard", href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { id: "marketplace", href: "/dashboard/marketplace", label: "Marketplace", icon: WalletCards },
  { id: "collection", href: "/dashboard/collection", label: "Collection", icon: Archive },
  { id: "transactions", href: "/dashboard/transactions", label: "Transactions", icon: WalletCards },
  { id: "deposit", href: "/dashboard/deposit", label: "Deposit", icon: CreditCard },
  { id: "settings", href: "/dashboard/settings", label: "Settings", icon: Settings },
];

type ArchiveSidebarProps = {
  active:
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
  account: HeaderAccount | null;
  mode: "public" | "dashboard";
};

export function ArchiveSidebar({
  active,
  mode,
}: ArchiveSidebarProps) {
  const navItems = mode === "public" ? publicSidebarItems : dashboardSidebarItems;

  return (
    <div className="flex h-full flex-col pb-4">
      <div className="overflow-hidden whitespace-nowrap px-5 text-[11px] uppercase tracking-[0.24em] text-muted opacity-0 transition-all duration-200 -translate-x-2 group-hover/sidebar:translate-x-0 group-hover/sidebar:opacity-100">
        Archive
      </div>
      <nav className="mt-4 space-y-1">
        {navItems.map((item) => {
          const content = (
            <>
              <item.icon className="size-4 shrink-0" />
              <span className="pointer-events-none absolute left-[52px] whitespace-nowrap opacity-0 transition-all duration-200 -translate-x-2 group-hover/sidebar:pointer-events-auto group-hover/sidebar:static group-hover/sidebar:translate-x-0 group-hover/sidebar:opacity-100">
                {item.label}
              </span>
              <span className="pointer-events-none absolute left-[54px] z-[190] rounded-lg border border-white/10 bg-[#111827] px-2 py-1 text-xs text-foreground opacity-0 shadow-xl transition group-hover/item:opacity-100 group-hover/sidebar:hidden">
                {item.label}
              </span>
            </>
          );

          const className = cn(
            "group/item relative flex h-11 w-[72px] items-center justify-center gap-3 overflow-visible text-sm text-muted transition before:absolute before:left-0 before:top-1/2 before:h-5 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-[var(--accent)] before:opacity-0 before:transition-opacity group-hover/sidebar:w-full group-hover/sidebar:justify-start group-hover/sidebar:px-5",
            active === item.id && "text-foreground before:opacity-100",
            "hover:text-foreground",
          );

          return (
          <Link className={className} href={item.href} key={item.id}>
            {content}
          </Link>
          );
        })}
      </nav>

      <div className="mt-auto">
        <Link
          aria-label="Support"
          className="flex h-11 w-[72px] items-center justify-center text-muted transition hover:text-foreground group-hover/sidebar:hidden"
          href="/faq"
        >
          <Headphones className="size-4" />
        </Link>

        <div className="hidden rounded-[14px] border border-white/10 bg-white/[0.03] px-3 py-3 group-hover/sidebar:block">
          <div className="text-sm font-semibold text-foreground">Need help?</div>
          <Link
            className="mt-1 flex items-center justify-between text-sm font-medium text-[var(--accent)]"
            href="/contact"
          >
            <span>Contact support</span>
            <ArrowRight className="size-4" />
          </Link>
          <div className="mt-3 flex items-center gap-4 border-t border-white/10 pt-3 text-xs text-muted">
            <Link className="hover:text-foreground" href="/faq">
              FAQ
            </Link>
            <Link className="hover:text-foreground" href="/terms">
              Policies
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
