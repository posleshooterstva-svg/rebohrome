"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { LiveRefreshControl } from "@/components/rebohrome/live-refresh-control";
import { OrderStatusChip } from "@/components/rebohrome/order-status-chip";
import { formatDisplayDate, formatUsd, type OrderRecord } from "@/lib/rebohrome-data";
import { useAccountExperienceStore } from "@/lib/stores/account-experience-store";

type LiveOrdersViewProps = {
  userId: string;
  initialOrders: OrderRecord[];
};

export function LiveOrdersView({ userId, initialOrders }: LiveOrdersViewProps) {
  const primeOrders = useAccountExperienceStore((state) => state.primeOrders);
  const liveOrders = useAccountExperienceStore((state) => state.accounts[userId]?.orders) ?? [];

  useEffect(() => {
    primeOrders(userId, initialOrders);
  }, [initialOrders, primeOrders, userId]);

  const orders = liveOrders.length > 0 ? liveOrders : initialOrders;

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm leading-7 text-muted">
          Order states refresh automatically while processing and delivery updates arrive.
        </div>
        <LiveRefreshControl label="Live order updates" />
      </div>

      {orders.length === 0 ? (
        <div className="rounded-[24px] border border-dashed border-line bg-panel-strong px-6 py-10 text-center">
          <div className="text-lg font-semibold text-foreground">
            No orders yet.
          </div>
          <p className="mt-2 text-sm leading-7 text-muted">
            No orders yet. Explore the marketplace to begin your collection.
          </p>
        </div>
      ) : (
        <motion.div className="space-y-4" layout>
          {orders.map((order) => (
            <motion.div
              key={order.id}
              animate={{ opacity: 1, y: 0 }}
              className="glass-panel grid gap-3 rounded-[20px] border border-line bg-panel-strong px-5 py-5 text-sm text-muted shadow-[0_18px_40px_rgba(15,23,42,0.05)] md:grid-cols-[1fr_0.9fr_0.6fr_0.6fr_0.85fr]"
              initial={{ opacity: 0, y: 10 }}
              layout
              transition={{ duration: 0.28, ease: "easeOut" }}
            >
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted">
                  Order ID
                </div>
                <div className="mt-2 text-base font-semibold text-foreground">
                  {order.id}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted">
                  Placed
                </div>
                <div className="mt-2 text-base text-foreground">
                  {formatDisplayDate(order.createdAt)}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted">
                  Items
                </div>
                <div className="mt-2 text-base text-foreground">{order.itemCount ?? 0}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted">
                  Total
                </div>
                <div className="mt-2 text-base font-semibold text-foreground">
                  {formatUsd(order.total)}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted">
                  Status
                </div>
                <div className="mt-2">
                  <OrderStatusChip status={order.status} />
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}
    </>
  );
}
