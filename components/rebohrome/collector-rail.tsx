"use client";

import Link from "next/link";
import { useEffect } from "react";
import { motion } from "framer-motion";
import { formatUsd } from "@/lib/rebohrome-data";
import { useAccountExperienceStore, type LiveActivityItem } from "@/lib/stores/account-experience-store";
import { cn } from "@/lib/utils";

type RailSecurityItem = {
  id: string;
  label: string;
  status: string;
  tone?: "positive" | "neutral" | "warning";
};

type CollectorRailProps = {
  userId?: string | null;
  initialBalance: {
    available: number;
    pendingWithdrawal: number;
    totalDeposited: number;
    totalSpent: number;
    totalWithdrawn: number;
  };
  balanceCurrency?: string;
  balanceNote: string;
  primaryActionHref: string;
  primaryActionLabel: string;
  secondaryActionHref: string;
  secondaryActionLabel: string;
  activityItems: LiveActivityItem[];
  emptyActivity: string;
  securityItems: RailSecurityItem[];
};

export function CollectorRail({
  userId,
  initialBalance,
  balanceCurrency = "USD",
  balanceNote,
  primaryActionHref,
  primaryActionLabel,
  secondaryActionHref,
  secondaryActionLabel,
  activityItems,
  emptyActivity,
  securityItems,
}: CollectorRailProps) {
  const primeAccount = useAccountExperienceStore((state) => state.primeAccount);
  const liveAccount = useAccountExperienceStore((state) =>
    userId ? state.accounts[userId] : undefined,
  );

  useEffect(() => {
    if (!userId) {
      return;
    }

    primeAccount(userId, initialBalance, activityItems);
  }, [activityItems, initialBalance, primeAccount, userId]);

  const balanceValue = formatUsd(liveAccount?.balance.available ?? initialBalance.available);
  const renderedActivityItems = liveAccount?.activity ?? activityItems;

  return (
    <div className="flex h-full flex-col gap-5 p-5">
      <div className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1 xl:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <RailWalletCard
          balanceCurrency={balanceCurrency}
          balanceNote={balanceNote}
          balanceValue={balanceValue}
          primaryActionHref={primaryActionHref}
          primaryActionLabel={primaryActionLabel}
          secondaryActionHref={secondaryActionHref}
          secondaryActionLabel={secondaryActionLabel}
        />
        <RailActivityCard activityItems={renderedActivityItems} emptyActivity={emptyActivity} />
        <RailSecurityCard securityItems={securityItems} />
      </div>

      <div className="hidden xl:flex xl:h-full xl:flex-col xl:gap-5">
        <RailWalletCard
          balanceCurrency={balanceCurrency}
          balanceNote={balanceNote}
          balanceValue={balanceValue}
          primaryActionHref={primaryActionHref}
          primaryActionLabel={primaryActionLabel}
          secondaryActionHref={secondaryActionHref}
          secondaryActionLabel={secondaryActionLabel}
        />
        <RailActivityCard activityItems={renderedActivityItems} emptyActivity={emptyActivity} />
        <RailSecurityCard securityItems={securityItems} />
      </div>
    </div>
  );
}

function RailWalletCard({
  balanceValue,
  balanceCurrency,
  balanceNote,
  primaryActionHref,
  primaryActionLabel,
  secondaryActionHref,
  secondaryActionLabel,
}: Omit<CollectorRailProps, "activityItems" | "emptyActivity" | "initialBalance" | "securityItems" | "userId"> & {
  balanceValue: string;
}) {
  return (
    <section className="glass-panel min-w-[84%] snap-center rounded-[16px] border border-line bg-white/90 p-5 xl:min-w-0">
      <div className="text-[11px] uppercase tracking-[0.24em] text-muted">
        Wallet Overview
      </div>
      <div className="mt-4 flex items-end gap-2">
        <div className="text-[44px] font-semibold tracking-[-0.06em] text-foreground">
          {balanceValue}
        </div>
        <div className="pb-2 text-xs uppercase tracking-[0.18em] text-muted">
          {balanceCurrency}
        </div>
      </div>
      <div className="mt-2 text-sm leading-6 text-muted">{balanceNote}</div>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <Link
          className="inline-flex items-center justify-center rounded-[10px] bg-foreground px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-92"
          href={primaryActionHref}
        >
          {primaryActionLabel}
        </Link>
        <Link
          className="inline-flex items-center justify-center rounded-[10px] border border-line bg-white px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-[var(--background-strong)]"
          href={secondaryActionHref}
        >
          {secondaryActionLabel}
        </Link>
      </div>
    </section>
  );
}

function RailActivityCard({
  activityItems,
  emptyActivity,
}: Pick<CollectorRailProps, "activityItems" | "emptyActivity">) {
  return (
    <section className="glass-panel min-w-[84%] snap-center rounded-[16px] border border-line bg-white/90 p-5 xl:min-w-0">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] uppercase tracking-[0.24em] text-muted">
          Recent Activity
        </div>
        <span className="text-xs text-muted">Live</span>
      </div>
      <div className="mt-4 space-y-3">
        {activityItems.length === 0 ? (
          <div className="rounded-[12px] border border-dashed border-line bg-[var(--background-soft)] px-4 py-4 text-sm leading-6 text-muted">
            {emptyActivity}
          </div>
        ) : (
          activityItems.map((item) => (
            <motion.div
              key={item.id}
              animate={{ opacity: [0.92, 1, 0.92] }}
              className="rounded-[12px] border border-line bg-[var(--background-soft)] px-4 py-3 transition active:scale-[0.99]"
              transition={{ duration: 2.6 }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-foreground">{item.title}</div>
                  <div className="mt-1 text-xs leading-5 text-muted">{item.meta}</div>
                </div>
                <div
                  className={cn(
                    "text-sm font-medium",
                    item.tone === "positive" && "text-emerald-600",
                    item.tone === "negative" && "text-foreground",
                    (!item.tone || item.tone === "neutral") && "text-muted",
                  )}
                >
                  {item.amount}
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </section>
  );
}

function RailSecurityCard({
  securityItems,
}: Pick<CollectorRailProps, "securityItems">) {
  return (
    <section className="glass-panel min-w-[84%] snap-center rounded-[16px] border border-line bg-white/90 p-5 xl:min-w-0">
      <div className="text-[11px] uppercase tracking-[0.24em] text-muted">
        Security Status
      </div>
      <div className="mt-4 space-y-3">
        {securityItems.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between gap-3 rounded-[12px] border border-line bg-[var(--background-soft)] px-4 py-3"
          >
            <div className="text-sm text-foreground">{item.label}</div>
            <div
              className={cn(
                "text-xs font-medium uppercase tracking-[0.16em]",
                item.tone === "positive" && "text-emerald-600",
                item.tone === "warning" && "text-amber-600",
                (!item.tone || item.tone === "neutral") && "text-muted",
              )}
            >
              {item.status}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
