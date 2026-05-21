"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { MobileVaultCarousel } from "@/components/dashboard/mobile-vault-carousel";
import { CardArtwork } from "@/components/rebohrome/card-artwork";
import { LiveRefreshControl } from "@/components/rebohrome/live-refresh-control";
import { RarityBadge } from "@/components/rebohrome/rarity-badge";
import type { DashboardStat } from "@/lib/rebohrome-data";
import { formatDisplayDate, formatUsd } from "@/lib/rebohrome-data";
import {
  useAccountExperienceStore,
  type LiveInventoryItem,
} from "@/lib/stores/account-experience-store";

type LiveCollectionViewProps = {
  userId: string;
  dashboardStats: DashboardStat[];
  initialInventory: LiveInventoryItem[];
};

export function LiveCollectionView({
  userId,
  dashboardStats,
  initialInventory,
}: LiveCollectionViewProps) {
  const primeInventory = useAccountExperienceStore((state) => state.primeInventory);
  const liveAccount = useAccountExperienceStore((state) => state.accounts[userId]);
  const liveInventory =
    liveAccount?.inventory ?? [];

  useEffect(() => {
    primeInventory(userId, initialInventory);
  }, [initialInventory, primeInventory, userId]);

  const inventory = liveInventory.length > 0 ? liveInventory : initialInventory;
  const displayStats = dashboardStats.map((stat) => {
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

    if (normalizedLabel === "purchases" && liveAccount.orders.length > 0) {
      return { ...stat, value: `${liveAccount.orders.length}` };
    }

    return stat;
  });

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm leading-7 text-muted">
          Vault entries refresh automatically while you stay inside your archive.
        </div>
        <LiveRefreshControl label="Live vault updates" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {displayStats.map((stat) => (
          <div
            key={stat.label}
            className="glass-panel rounded-[18px] border border-line bg-panel-strong px-5 py-5"
          >
            <div className="text-xs uppercase tracking-[0.24em] text-muted">
              {stat.label}
            </div>
            <div className="mt-2 text-3xl font-semibold text-foreground">
              {stat.value}
            </div>
          </div>
        ))}
      </div>
      {inventory.length === 0 ? (
        <div className="mt-6 rounded-[24px] border border-dashed border-line bg-panel-strong px-6 py-10 text-center">
          <div className="text-lg font-semibold text-foreground">
            Your archive is waiting for its first collectible.
          </div>
          <p className="mt-2 text-sm leading-7 text-muted">
            Purchased cards move here automatically after a successful checkout.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-6">
            <MobileVaultCarousel inventory={inventory} />
          </div>
          <motion.div
            className="mt-6 hidden gap-4 md:grid md:grid-cols-2 xl:grid-cols-3"
            layout
          >
            {inventory.map((entry) => (
              <motion.article
                key={`${entry.orderId}:${entry.product.id}`}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className="glass-panel rounded-[22px] border border-line bg-panel-strong p-4 shadow-[0_20px_48px_rgba(15,23,42,0.06)]"
                initial={{ opacity: 0, y: 16, scale: 0.985 }}
                layout
                transition={{ duration: 0.35, ease: "easeOut" }}
              >
                <CardArtwork
                  card={entry.product}
                  className="aspect-[4/5] w-full"
                  compact
                />
                <div className="mt-4 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">
                      {entry.product.title}
                    </h2>
                    <p className="mt-1 text-sm text-muted">
                      {entry.product.collection}
                    </p>
                  </div>
                  <RarityBadge rarity={entry.product.rarity} />
                </div>
                <div className="mt-4 grid gap-2 text-sm text-muted">
                  <div>Owned since {formatDisplayDate(entry.acquiredAt)}</div>
                  <div>Quantity {entry.quantity}</div>
                  <div>Edition {entry.product.edition}</div>
                  <div>{entry.product.category}</div>
                </div>
              </motion.article>
            ))}
          </motion.div>
        </>
      )}
    </>
  );
}
