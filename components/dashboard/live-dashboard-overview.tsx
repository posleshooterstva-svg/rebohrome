"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Bell,
  CreditCard,
  Package,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { LiveRefreshControl } from "@/components/rebohrome/live-refresh-control";
import { OrderStatusChip } from "@/components/rebohrome/order-status-chip";
import {
  formatDisplayDate,
  formatUsd,
  type DashboardStat,
  type OrderRecord,
} from "@/lib/rebohrome-data";
import {
  useAccountExperienceStore,
  type LiveInventoryItem,
} from "@/lib/stores/account-experience-store";

type LiveDashboardOverviewProps = {
  userId: string;
  dashboardStats: DashboardStat[];
  initialOrders: OrderRecord[];
  initialInventory: LiveInventoryItem[];
};

const quickActions = [
  {
    href: "/dashboard/deposit",
    label: "Deposit",
    text: "Add archive balance through the secure provider flow.",
    icon: CreditCard,
  },
  {
    href: "/dashboard/marketplace",
    label: "Marketplace",
    text: "Browse collectible releases.",
    icon: WalletCards,
  },
  {
    href: "/dashboard/collection",
    label: "Collection",
    text: "Review owned cards and collection state.",
    icon: Package,
  },
  {
    href: "/notifications",
    label: "Notifications",
    text: "Read account notices and broadcast updates.",
    icon: Bell,
  },
];

export function LiveDashboardOverview({
  userId,
  dashboardStats,
  initialOrders,
  initialInventory,
}: LiveDashboardOverviewProps) {
  const primeInventory = useAccountExperienceStore((state) => state.primeInventory);
  const primeOrders = useAccountExperienceStore((state) => state.primeOrders);
  const liveAccount = useAccountExperienceStore((state) => state.accounts[userId]);

  useEffect(() => {
    primeInventory(userId, initialInventory);
  }, [initialInventory, primeInventory, userId]);

  useEffect(() => {
    primeOrders(userId, initialOrders);
  }, [initialOrders, primeOrders, userId]);

  const inventory = liveAccount?.inventory?.length ? liveAccount.inventory : initialInventory;
  const orders = liveAccount?.orders?.length ? liveAccount.orders : initialOrders;

  const displayStats = useMemo(() => {
    return dashboardStats.map((stat) => {
      const normalizedLabel = stat.label.toLowerCase();

      if (!liveAccount) {
        return stat;
      }

      if (normalizedLabel === "current balance") {
        return { ...stat, value: formatUsd(liveAccount.balance.available) };
      }

      if (normalizedLabel === "total deposited") {
        return { ...stat, value: formatUsd(liveAccount.balance.totalDeposited) };
      }

      if (normalizedLabel === "total spent") {
        return { ...stat, value: formatUsd(liveAccount.balance.totalSpent) };
      }

      return stat;
    });
  }, [dashboardStats, liveAccount]);

  const ownedCount = inventory.reduce((sum, entry) => sum + entry.quantity, 0);
  const latestOrder = orders[0] ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.42em] text-[var(--accent)]">
            Dashboard
          </p>
          <h2 className="mt-4 display-font text-4xl font-semibold tracking-[-0.06em] text-foreground sm:text-5xl">
            Archive command center
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-muted">
            Monitor balance, collection activity, payment sessions, and account readiness from one clean workspace.
          </p>
        </div>
        <LiveRefreshControl label="Refresh dashboard" />
      </div>

      <motion.div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5" layout>
        {displayStats.map((stat) => (
          <motion.div
            className="rounded-[14px] border border-white/10 bg-white/[0.035] p-4"
            key={stat.label}
            layout
          >
            <div className="text-[11px] uppercase tracking-[0.2em] text-muted">
              {stat.label}
            </div>
            <div className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-foreground">
              {stat.value}
            </div>
          </motion.div>
        ))}
      </motion.div>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-[16px] border border-white/10 bg-[linear-gradient(145deg,rgba(20,28,53,0.94),rgba(8,13,29,0.94))] p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-foreground">
                Quick actions
              </div>
              <p className="mt-1 text-sm leading-6 text-muted">
                Move through your archive from one clean workspace.
              </p>
            </div>
            <ShieldCheck className="size-5 text-[var(--accent)]" />
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {quickActions.map((action) => (
              <Link
                className="group rounded-[14px] border border-white/10 bg-black/18 p-4 transition hover:border-violet-300/30 hover:bg-white/[0.055]"
                href={action.href}
                key={action.href}
              >
                <div className="flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-violet-300/20 bg-violet-400/10 text-violet-200">
                    <action.icon className="size-4" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground">
                      {action.label}
                    </div>
                    <div className="mt-1 text-sm leading-6 text-muted">
                      {action.text}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <aside className="rounded-[16px] border border-white/10 bg-[linear-gradient(145deg,rgba(20,28,53,0.94),rgba(8,13,29,0.94))] p-5">
          <div className="text-sm font-semibold text-foreground">Collection summary</div>
          <div className="mt-5 rounded-[14px] border border-white/10 bg-white/[0.035] p-4">
            <div className="text-[11px] uppercase tracking-[0.22em] text-muted">
              Owned cards
            </div>
            <div className="mt-3 text-4xl font-semibold tracking-[-0.06em] text-foreground">
              {ownedCount}
            </div>
            <p className="mt-3 text-sm leading-6 text-muted">
              Owned inventory updates from completed orders and successful archive assignment.
            </p>
          </div>
          <Link
            className="mt-4 inline-flex w-full items-center justify-center rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3 text-sm font-semibold text-foreground transition hover:border-violet-300/30"
            href="/dashboard/collection"
          >
            Open collection
          </Link>
        </aside>
      </section>

      <section className="rounded-[16px] border border-white/10 bg-[linear-gradient(145deg,rgba(20,28,53,0.94),rgba(8,13,29,0.94))] p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-foreground">Recent orders</div>
            <p className="mt-1 text-sm leading-6 text-muted">
              Latest purchase activity from the authenticated dashboard.
            </p>
          </div>
          <Link className="text-sm font-semibold text-[var(--accent)]" href="/dashboard/transactions">
            View all
          </Link>
        </div>

        <motion.div className="mt-5 grid gap-3" layout>
          {orders.slice(0, 4).map((order) => (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="rounded-[12px] border border-white/10 bg-black/18 px-4 py-3"
              initial={{ opacity: 0, y: 10 }}
              key={order.id}
              layout
              transition={{ duration: 0.28, ease: "easeOut" }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">{order.id}</div>
                  <div className="mt-1 text-xs leading-5 text-muted">
                    {formatDisplayDate(order.createdAt)} / {order.itemCount ?? 0} items
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-foreground">
                    {formatUsd(order.total)}
                  </div>
                  <div className="mt-2 flex justify-end">
                    <OrderStatusChip status={order.status} />
                  </div>
                </div>
              </div>
            </motion.div>
          ))}

          {!latestOrder ? (
            <div className="rounded-[12px] border border-dashed border-white/10 bg-black/18 px-4 py-6 text-sm leading-6 text-muted">
              No orders yet. Start from the dashboard marketplace to begin collecting.
            </div>
          ) : null}
        </motion.div>
      </section>
    </div>
  );
}
