import Link from "next/link";
import { Bell, Plus, Search, ShoppingBag, UserRound } from "lucide-react";
import { CartBadge } from "@/components/cart/cart-badge";
import { publicNavItems, type HeaderAccount } from "@/lib/rebohrome-data";
import { ProfileMenu } from "./profile-menu";
import { RebohromeLogo } from "./logo";

type WorkspaceTopbarProps = {
  account: HeaderAccount | null;
  notificationHref?: string;
  cartHref?: string;
  quickActionHref?: string;
  showCart?: boolean;
  showQuickAction?: boolean;
  showLogo?: boolean;
  logoClassName?: string;
  logoHref?: string;
  showNavigation?: boolean;
  searchPlaceholder?: string;
};

export function WorkspaceTopbar({
  account,
  notificationHref = "/dashboard/transactions",
  cartHref = "/cart",
  quickActionHref = "/dashboard/marketplace",
  showCart = true,
  showQuickAction = false,
  showLogo = false,
  logoClassName,
  logoHref,
  showNavigation = true,
  searchPlaceholder = "Search collectibles, collections...",
}: WorkspaceTopbarProps) {
  return (
    <div className="w-full px-0 py-0">
      <div className="flex min-w-0 items-center gap-3 sm:gap-6">
        {showLogo ? (
          <RebohromeLogo className={logoClassName} href={logoHref} />
        ) : null}

        {showNavigation ? (
          <nav className="hidden items-center gap-7 lg:flex">
            {publicNavItems.map((item) => (
              <Link
                key={item.href}
                className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted transition hover:text-foreground"
                href={
                  item.href.startsWith("/dashboard")
                    ? account
                      ? item.href
                      : `/login?next=${encodeURIComponent(item.href)}`
                    : item.href
                }
              >
                {item.label}
              </Link>
            ))}
          </nav>
        ) : null}

        <div className="ml-auto flex min-w-0 items-center justify-end gap-2 sm:gap-3">
          <form
            action="/dashboard/marketplace"
            className="hidden min-w-[300px] items-center gap-2 rounded-[14px] border border-white/[0.08] bg-[rgba(12,13,28,0.58)] px-4 py-2.5 shadow-[0_12px_32px_rgba(0,0,0,0.18)] backdrop-blur-2xl xl:flex"
          >
            <Search className="size-4 text-muted" />
            <input
              className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
              name="search"
              placeholder={searchPlaceholder}
            />
          </form>

          {showQuickAction ? (
            <Link
              className="flex size-10 shrink-0 items-center justify-center rounded-[14px] border border-white/[0.08] bg-[rgba(12,13,28,0.58)] text-muted shadow-[0_12px_32px_rgba(0,0,0,0.16)] backdrop-blur-2xl transition hover:-translate-y-0.5 hover:border-violet-200/25 hover:text-foreground"
              href={quickActionHref}
            >
              <Plus className="size-4" />
            </Link>
          ) : null}

          <Link
            className="flex size-10 shrink-0 items-center justify-center rounded-[14px] border border-white/[0.08] bg-[rgba(12,13,28,0.58)] text-muted shadow-[0_12px_32px_rgba(0,0,0,0.16)] backdrop-blur-2xl transition hover:-translate-y-0.5 hover:border-violet-200/25 hover:text-foreground"
            href={notificationHref}
          >
            <Bell className="size-4" />
          </Link>
          {showCart ? (
            <Link
              className="relative flex size-10 shrink-0 items-center justify-center rounded-[14px] border border-white/[0.08] bg-[rgba(12,13,28,0.58)] text-muted shadow-[0_12px_32px_rgba(0,0,0,0.16)] backdrop-blur-2xl transition hover:-translate-y-0.5 hover:border-violet-200/25 hover:text-foreground"
              href={cartHref}
            >
              <ShoppingBag className="size-4" />
              <CartBadge />
            </Link>
          ) : null}

          {account ? (
            <ProfileMenu account={account} />
          ) : (
            <div className="flex items-center gap-2">
              <Link
                className="hidden rounded-[10px] border border-line bg-white px-4 py-2.5 text-sm text-foreground transition hover:bg-[var(--background-strong)] sm:inline-flex"
                href="/login"
              >
                Sign in
              </Link>
              <Link
                className="inline-flex items-center justify-center rounded-[10px] bg-foreground px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-92"
                href="/register"
              >
                Register
              </Link>
              <Link
                className="flex size-10 items-center justify-center rounded-[10px] border border-line bg-white text-muted transition hover:text-foreground sm:hidden"
                href="/login"
              >
                <UserRound className="size-4" />
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
