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
  Printer,
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
  {
    href: "/admin/providers",
    label: "Providers",
    icon: Settings2,
    id: "providers",
  },
  { href: "/admin/print-engine", label: "Print Engine", icon: Printer, id: "print-engine" },
  { href: "/admin/receipts", label: "Receipts", icon: ReceiptText, id: "receipts" },
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
              Product controls, payment review, and user operations stay isolated from the public archive surface.
            </div>
          </section>
        </div>
      }
      showCart={false}
      showQuickAction={false}
      sidebar={
        <div className="flex h-full flex-col pb-4">
          <div className="overflow-hidden whitespace-nowrap px-5 text-[11px] uppercase tracking-[0.24em] text-muted opacity-0 transition-all duration-200 -translate-x-2 group-hover/sidebar:translate-x-0 group-hover/sidebar:opacity-100">
            Operations
          </div>
          <nav className="mt-4 space-y-1">
            {adminNav.map((item) => (
              <Link
                key={item.href}
                className={cn(
                  "group/item relative flex h-11 w-[72px] items-center justify-center gap-3 overflow-visible text-sm text-muted transition before:absolute before:left-0 before:top-1/2 before:h-5 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-[var(--accent)] before:opacity-0 before:transition-opacity hover:text-foreground group-hover/sidebar:w-full group-hover/sidebar:justify-start group-hover/sidebar:px-5",
                  active === item.id && "text-foreground before:opacity-100",
                )}
                href={item.href}
              >
                <item.icon className="size-4 shrink-0" />
                <span className="pointer-events-none absolute left-[52px] whitespace-nowrap opacity-0 transition-all duration-200 -translate-x-2 group-hover/sidebar:pointer-events-auto group-hover/sidebar:static group-hover/sidebar:translate-x-0 group-hover/sidebar:opacity-100">
                  {item.label}
                </span>
                <span className="pointer-events-none absolute left-[54px] z-[190] rounded-lg border border-white/10 bg-[#111827] px-2 py-1 text-xs text-foreground opacity-0 shadow-xl transition group-hover/item:opacity-100 group-hover/sidebar:hidden">
                  {item.label}
                </span>
              </Link>
            ))}
          </nav>

          <div className="mt-auto">
            <div className="flex h-11 w-[72px] items-center justify-center text-muted group-hover/sidebar:hidden">
              <ShieldCheck className="size-4" />
            </div>
            <div className="hidden rounded-[14px] border border-white/10 bg-white/[0.03] px-3 py-3 group-hover/sidebar:block">
              <div className="text-sm font-semibold text-foreground">Admin Access</div>
              <div className="mt-1 text-xs text-muted">Protected workspace</div>
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
