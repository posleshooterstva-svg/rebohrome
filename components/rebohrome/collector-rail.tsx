import Link from "next/link";
import { cn } from "@/lib/utils";

type RailActivityItem = {
  id: string;
  title: string;
  meta: string;
  amount: string;
  tone?: "positive" | "negative" | "neutral";
};

type RailSecurityItem = {
  id: string;
  label: string;
  status: string;
  tone?: "positive" | "neutral" | "warning";
};

type CollectorRailProps = {
  balanceValue: string;
  balanceCurrency?: string;
  balanceNote: string;
  primaryActionHref: string;
  primaryActionLabel: string;
  secondaryActionHref: string;
  secondaryActionLabel: string;
  activityItems: RailActivityItem[];
  emptyActivity: string;
  securityItems: RailSecurityItem[];
};

export function CollectorRail({
  balanceValue,
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
  return (
    <div className="flex h-full flex-col gap-5 p-5">
      <section className="rounded-[14px] border border-line bg-white p-5">
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

      <section className="rounded-[14px] border border-line bg-white p-5">
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
              <div
                key={item.id}
                className="rounded-[12px] border border-line bg-[var(--background-soft)] px-4 py-3"
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
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-[14px] border border-line bg-white p-5">
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
    </div>
  );
}
