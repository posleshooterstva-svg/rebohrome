import Link from "next/link";
import {
  Archive,
  ArrowRight,
  ArrowUpRight,
  CreditCard,
  Headphones,
  LayoutGrid,
  Package,
  Settings,
  WalletCards,
} from "lucide-react";
import { type HeaderAccount } from "@/lib/rebohrome-data";
import { cn } from "@/lib/utils";

const publicSidebarItems = [
  { id: "dashboard", href: "/", label: "Dashboard", icon: LayoutGrid },
  { id: "marketplace", href: "/marketplace", label: "Marketplace", icon: WalletCards },
  { id: "collection", href: "/dashboard/collection", label: "Collection", icon: Archive },
  { id: "orders", href: "/dashboard/orders", label: "Orders", icon: Package },
  { id: "deposit", href: "/dashboard/deposit", label: "Deposit", icon: CreditCard },
  { id: "withdraw", href: "/withdraw", label: "Withdraw", icon: ArrowUpRight },
  { id: "settings", href: "/dashboard/settings", label: "Settings", icon: Settings },
];

const dashboardSidebarItems = [
  { id: "dashboard", href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { id: "marketplace", href: "/marketplace", label: "Marketplace", icon: WalletCards },
  { id: "collection", href: "/dashboard/collection", label: "Collection", icon: Archive },
  { id: "orders", href: "/dashboard/orders", label: "Orders", icon: Package },
  { id: "transactions", href: "/dashboard/transactions", label: "Transactions", icon: WalletCards },
  { id: "deposit", href: "/dashboard/deposit", label: "Deposit", icon: CreditCard },
  { id: "withdraw", href: "/withdraw", label: "Withdraw", icon: ArrowUpRight },
  { id: "settings", href: "/dashboard/settings", label: "Settings", icon: Settings },
];

type ArchiveSidebarProps = {
  active:
    | "dashboard"
    | "marketplace"
    | "collection"
    | "orders"
    | "transactions"
    | "deposit"
    | "withdraw"
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
    <div className="flex h-full flex-col p-5">
      <div className="text-[11px] uppercase tracking-[0.24em] text-muted">
        Archive
      </div>
      <nav className="mt-4 space-y-1.5">
        {navItems.map((item) => (
          <Link
            key={item.id}
            className={cn(
              "flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-sm text-muted transition hover:bg-[var(--background-strong)] hover:text-foreground",
              active === item.id && "bg-[var(--accent-soft)] text-[var(--accent)]",
            )}
            href={item.href}
          >
            <item.icon className="size-4" />
            {item.label}
          </Link>
        ))}
      </nav>

      <Link
        className="mt-auto block rounded-[16px] border border-line bg-white p-4 transition hover:border-[rgba(139,124,255,0.2)] hover:shadow-[0_18px_36px_rgba(139,124,255,0.08)]"
        href="/contact"
      >
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
            <Headphones className="size-5" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground">Need help?</div>
            <div className="mt-1 text-sm text-muted">
              Our support team is available 24/7
            </div>
          </div>
        </div>
        <div className="mt-5 flex items-center justify-between text-sm font-medium text-[var(--accent)]">
          <span>Contact support</span>
          <ArrowRight className="size-4" />
        </div>
      </Link>
    </div>
  );
}
