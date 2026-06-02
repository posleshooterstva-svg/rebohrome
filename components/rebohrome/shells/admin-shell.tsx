import Link from "next/link";
import {
  BarChart3,
  Boxes,
  History,
  LayoutDashboard,
  Megaphone,
  ReceiptText,
  Settings2,
  ShieldCheck,
  Signal,
  Upload,
  Users,
} from "lucide-react";
import {
  getAdminOrders,
  getAdminStats,
  getHeaderAccount,
} from "@/lib/db/repository";
import { getSessionState } from "@/lib/session";
import { cn } from "@/lib/utils";
import { AppShell } from "./app-shell";

const adminNav = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, id: "overview" },
  { href: "/admin/products", label: "Products", icon: Boxes, id: "products" },
  { href: "/admin/orders", label: "Orders", icon: ReceiptText, id: "orders" },
  { href: "/admin/users", label: "Users", icon: Users, id: "users" },
  { href: "/admin/ledger", label: "Ledger", icon: History, id: "ledger" },
  {
    href: "/admin/provider-intelligence",
    label: "Provider Intel",
    icon: Signal,
    id: "provider-intelligence",
  },
  { href: "/admin/broadcasts", label: "Broadcasts", icon: Megaphone, id: "broadcasts" },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3, id: "analytics" },
  { href: "/admin/upload", label: "Upload", icon: Upload, id: "upload" },
  { href: "/admin/settings", label: "System", icon: Settings2, id: "settings" },
] as const;

type AdminShellProps = {
  active: (typeof adminNav)[number]["id"];
  title: string;
  description: string;
  children: React.ReactNode;
};

export async function AdminShell({
  active,
  title,
  description,
  children,
}: AdminShellProps) {
  const session = await getSessionState();
  const [account, adminStats, adminOrders] = await Promise.all([
    session.userId ? getHeaderAccount(session.userId) : Promise.resolve(null),
    getAdminStats(),
    getAdminOrders(),
  ]);

  return (
    <AppShell
      account={account}
      description={description}
      eyebrow="Admin Workspace"
      notificationHref="/admin/orders"
      rightRail={
        <div className="flex h-full flex-col gap-5 p-5">
          <section className="rounded-[14px] border border-line bg-white p-5">
            <div className="text-[11px] uppercase tracking-[0.24em] text-muted">
              Operations Snapshot
            </div>
            <div className="mt-4 space-y-3">
              {adminStats.map((stat) => (
                <div
                  key={stat.label}
                  className="flex items-center justify-between gap-3 rounded-[12px] border border-line bg-[var(--background-soft)] px-4 py-3"
                >
                  <div className="text-sm text-foreground">{stat.label}</div>
                  <div className="text-sm font-medium text-foreground">{stat.value}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[14px] border border-line bg-white p-5">
            <div className="text-[11px] uppercase tracking-[0.24em] text-muted">
              Order Review
            </div>
            <div className="mt-4 space-y-3">
              {adminOrders.slice(0, 4).map((order) => (
                <div
                  key={order.id}
                  className="rounded-[12px] border border-line bg-[var(--background-soft)] px-4 py-3"
                >
                  <div className="text-sm font-medium text-foreground">{order.id}</div>
                  <div className="mt-1 text-xs leading-5 text-muted">
                    {order.customer} / {order.status}
                  </div>
                </div>
              ))}
              {adminOrders.length === 0 ? (
                <div className="rounded-[12px] border border-dashed border-line bg-[var(--background-soft)] px-4 py-4 text-sm leading-6 text-muted">
                  Live order review appears here as transactions are created.
                </div>
              ) : null}
            </div>
          </section>

          <section className="rounded-[14px] border border-line bg-white p-5">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <ShieldCheck className="size-4 text-[var(--accent)]" />
              Protected Admin Layer
            </div>
            <div className="mt-3 text-sm leading-7 text-muted">
              Product controls, withdrawal review, and user operations stay isolated from the public archive surface.
            </div>
          </section>
        </div>
      }
      showCart={false}
      showQuickAction={false}
      sidebar={
        <div className="flex h-full flex-col p-5">
          <div className="text-[11px] uppercase tracking-[0.24em] text-muted">
            Operations
          </div>
          <nav className="mt-4 space-y-1.5">
            {adminNav.map((item) => (
              <Link
                key={item.href}
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

          <div className="mt-auto rounded-[14px] border border-line bg-[var(--background-soft)] p-4">
            <div className="text-sm font-semibold text-foreground">Admin Access</div>
            <div className="mt-2 text-sm leading-6 text-muted">
              Moderation, financial review, and inventory control are restricted to protected sessions.
            </div>
          </div>
        </div>
      }
      title={title}
    >
      {children}
    </AppShell>
  );
}
