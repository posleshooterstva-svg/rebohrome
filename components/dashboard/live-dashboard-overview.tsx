"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { AddToCartButton } from "@/components/cart/add-to-cart-button";
import { CardArtwork } from "@/components/rebohrome/card-artwork";
import { LiveRefreshControl } from "@/components/rebohrome/live-refresh-control";
import { OrderStatusChip } from "@/components/rebohrome/order-status-chip";
import { RarityBadge } from "@/components/rebohrome/rarity-badge";
import {
  formatDisplayDate,
  formatUsd,
  type DashboardStat,
  type OrderRecord,
  type ProductRecord,
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
  latestProducts: ProductRecord[];
};

export function LiveDashboardOverview({
  userId,
  dashboardStats,
  initialOrders,
  initialInventory,
  latestProducts,
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

  const featuredCard = inventory[0]?.product ?? latestProducts[0] ?? null;
  const newDropCards = latestProducts.slice(0, 4);
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

      if (normalizedLabel === "cards owned") {
        return {
          ...stat,
          value: `${inventory.reduce((sum, entry) => sum + entry.quantity, 0)}`,
        };
      }

      if (normalizedLabel === "purchases") {
        return { ...stat, value: `${orders.length}` };
      }

      return stat;
    });
  }, [dashboardStats, inventory, liveAccount, orders.length]);

  const optimisticAcquisition = inventory.length > initialInventory.length;

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm leading-7 text-muted">
          Balance, activity, and order surfaces stay in sync while you work inside the archive.
        </div>
        <LiveRefreshControl label="Live archive updates" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.04fr_0.96fr]">
        <section>
          <div className="text-[11px] uppercase tracking-[0.28em] text-muted">
            Private Vault
          </div>
          <h2 className="mt-4 display-font max-w-[620px] text-5xl font-semibold leading-[0.96] tracking-[-0.06em] text-foreground">
            Manage rare digital artifacts from one archive canvas.
          </h2>
          <p className="mt-5 max-w-[520px] text-base leading-8 text-muted">
            Fund your balance, preserve purchased cards, and follow every order from one clean collector workspace.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              className="inline-flex items-center justify-center rounded-[10px] bg-foreground px-5 py-3 text-sm font-medium text-white transition hover:opacity-92"
              href="/marketplace"
            >
              Explore Marketplace
            </Link>
            <Link
              className="inline-flex items-center justify-center rounded-[10px] border border-line bg-white px-5 py-3 text-sm font-medium text-foreground transition hover:bg-[var(--background-strong)]"
              href="/dashboard/collection"
            >
              View Collection
            </Link>
          </div>
        </section>

        <section className="rounded-[14px] border border-line bg-[linear-gradient(180deg,#ffffff_0%,#f7f8fb_100%)] p-6">
          {featuredCard ? (
            <motion.div
              className="ambient-float relative mx-auto flex min-h-[340px] max-w-[420px] items-center justify-center"
              layout
            >
              <div className="absolute inset-x-10 bottom-6 h-10 rounded-full bg-[radial-gradient(circle_at_center,rgba(153,167,212,0.32),transparent_72%)] blur-xl" />
              <div className="relative w-full max-w-[320px]">
                <motion.div
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  className="rounded-[8px] border border-[rgba(15,23,42,0.16)] bg-[rgba(255,255,255,0.48)] p-3 shadow-[0_18px_38px_rgba(15,23,42,0.07)] backdrop-blur"
                  initial={{ opacity: 0, y: 18, scale: 0.98 }}
                  layout
                  transition={{ duration: 0.4, ease: "easeOut" }}
                >
                  <div className="rounded-[6px] border border-[rgba(255,255,255,0.84)] bg-[rgba(255,255,255,0.58)] p-3">
                    <CardArtwork card={featuredCard} className="aspect-[4/5] w-full" />
                  </div>
                </motion.div>
                <div className="mx-auto h-8 w-[88%] rounded-b-[6px] border border-line bg-[linear-gradient(180deg,#ffffff_0%,#eceef3_100%)]" />
                {optimisticAcquisition ? (
                  <motion.div
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute -bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-emerald-200 bg-white/92 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-700 shadow-[0_10px_30px_rgba(16,185,129,0.12)]"
                    initial={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.35, ease: "easeOut" }}
                  >
                    Recently archived
                  </motion.div>
                ) : null}
              </div>
            </motion.div>
          ) : (
            <div className="flex min-h-[340px] items-center justify-center text-sm text-muted">
              Your featured archive object will appear here after the first acquisition.
            </div>
          )}
        </section>
      </div>

      <motion.div className="mt-6 grid gap-3 border-y border-line py-5 md:grid-cols-5" layout>
        {displayStats.map((stat) => (
          <motion.div key={stat.label} layout>
            <div className="text-[11px] uppercase tracking-[0.22em] text-muted">
              {stat.label}
            </div>
            <div className="mt-2 text-[28px] font-semibold tracking-[-0.04em] text-foreground">
              {stat.value}
            </div>
          </motion.div>
        ))}
      </motion.div>

      <section className="mt-6 rounded-[14px] border border-line bg-white p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted">
            New Drop
          </div>
          <Link
            className="text-sm font-medium text-muted transition hover:text-foreground"
            href="/marketplace"
          >
            View all
          </Link>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
          {newDropCards.map((card, index) => (
            <article
              key={card.id}
              className="rounded-[14px] border border-line bg-[var(--background-soft)] p-3"
            >
              <Link className="block" href={`/product/${card.id}`}>
                <div className="relative">
                  <div className="absolute left-3 top-3 z-10 text-[30px] font-light tracking-[-0.06em] text-muted">
                    {String(index + 1).padStart(2, "0")}
                  </div>
                  <CardArtwork card={card} className="aspect-[1.05/1] w-full" compact />
                </div>
                <div className="mt-3">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-foreground">
                    {card.title}
                  </h3>
                  <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-muted">
                    Series {card.edition}
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-foreground">
                    {formatUsd(card.price)}
                  </div>
                  <RarityBadge rarity={card.rarity} />
                </div>
              </Link>
              <div className="mt-3">
                <AddToCartButton
                  disabled={card.stock <= 0}
                  fullWidth
                  productId={card.id}
                />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-[14px] border border-line bg-white p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted">
            Recent Orders
          </div>
          <Link
            className="text-sm font-medium text-muted transition hover:text-foreground"
            href="/dashboard/orders"
          >
            View all
          </Link>
        </div>
        <motion.div className="mt-5 space-y-3" layout>
          {orders.slice(0, 4).map((order) => (
            <motion.div
              key={order.id}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-[12px] border border-line bg-[var(--background-soft)] px-4 py-3"
              initial={{ opacity: 0, y: 10 }}
              layout
              transition={{ duration: 0.28, ease: "easeOut" }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-foreground">{order.id}</div>
                  <div className="mt-1 text-xs leading-5 text-muted">
                    {formatDisplayDate(order.createdAt)} / {order.itemCount ?? 0} items
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium text-foreground">
                    {formatUsd(order.total)}
                  </div>
                  <div className="mt-2 flex justify-end">
                    <OrderStatusChip status={order.status} />
                  </div>
                </div>
              </div>
            </motion.div>
          ))}

          {orders.length === 0 ? (
            <div className="rounded-[12px] border border-dashed border-line bg-[var(--background-soft)] px-4 py-6 text-sm leading-6 text-muted">
              No orders yet. Explore the marketplace to begin your collection.
            </div>
          ) : null}
        </motion.div>
      </section>
    </>
  );
}
