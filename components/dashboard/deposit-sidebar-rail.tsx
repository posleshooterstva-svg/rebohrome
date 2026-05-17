import Link from "next/link";
import {
  ArrowDownToLine,
  BadgeCheck,
  CreditCard,
  Lock,
  ShieldCheck,
} from "lucide-react";
import {
  formatDisplayDateTime,
  formatUsd,
  type BalanceRecord,
  type TransactionRecord,
} from "@/lib/rebohrome-data";
import { cn } from "@/lib/utils";

type DepositSidebarRailProps = {
  balance: BalanceRecord | null;
  recentTransactions: TransactionRecord[];
};

export function DepositSidebarRail({
  balance,
  recentTransactions,
}: DepositSidebarRailProps) {
  const securityItems = [
    {
      id: "encryption",
      icon: ShieldCheck,
      title: "Bank-level encryption",
      description: "Your data is protected",
    },
    {
      id: "providers",
      icon: BadgeCheck,
      title: "Verified providers",
      description: "Secure and trusted partners",
    },
    {
      id: "privacy",
      icon: Lock,
      title: "Private & confidential",
      description: "Your privacy is our priority",
    },
  ];

  return (
    <div className="flex h-full flex-col gap-5 p-5">
      <section className="rounded-[16px] border border-line bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="text-lg font-semibold text-foreground">Balance overview</div>
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
            Available
          </span>
        </div>
        <div className="mt-5 flex items-end gap-2">
          <div className="text-[44px] font-semibold tracking-[-0.06em] text-foreground">
            {formatUsd(balance?.available ?? 0)}
          </div>
          <div className="pb-2 text-xs uppercase tracking-[0.18em] text-muted">USD</div>
        </div>
        <div className="mt-6 space-y-3 border-t border-line pt-5 text-sm">
          <BalanceRow label="Total deposited" value={formatUsd(balance?.totalDeposited ?? 0)} />
          <BalanceRow label="Total spent" value={formatUsd(balance?.totalSpent ?? 0)} />
        </div>
        <Link
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-[12px] bg-[var(--accent-soft)] px-4 py-3 text-sm font-medium text-[var(--accent)] transition hover:opacity-92"
          href="/dashboard/transactions"
        >
          <CreditCard className="size-4" />
          View all transactions
        </Link>
      </section>

      <section className="rounded-[16px] border border-line bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="text-lg font-semibold text-foreground">Recent activity</div>
          <Link
            className="text-sm font-medium text-[var(--accent)] transition hover:opacity-92"
            href="/dashboard/transactions"
          >
            View all
          </Link>
        </div>
        <div className="mt-5 space-y-3">
          {recentTransactions.length === 0 ? (
            <div className="rounded-[14px] border border-dashed border-line bg-[var(--background-soft)] px-4 py-5 text-sm leading-6 text-muted">
              No transactions yet. Deposits and purchases will appear here.
            </div>
          ) : (
            recentTransactions.slice(0, 4).map((transaction) => (
              <div
                key={transaction.id}
                className="flex items-start gap-3 rounded-[14px] border border-line bg-[var(--background-soft)] px-4 py-4"
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-white text-[var(--accent)] shadow-[0_8px_18px_rgba(139,124,255,0.08)]">
                  <ArrowDownToLine className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-foreground">
                    {transaction.kind === "deposit"
                      ? "Deposit"
                      : transaction.kind === "purchase"
                        ? "Purchase"
                        : transaction.kind === "withdrawal"
                          ? "Withdrawal"
                          : "Refund"}
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    {formatDisplayDateTime(transaction.createdAt)}
                  </div>
                </div>
                <div
                  className={cn(
                    "text-sm font-semibold",
                    transaction.amount > 0 ? "text-emerald-600" : "text-foreground",
                  )}
                >
                  {transaction.amount > 0 ? "+" : ""}
                  {formatUsd(Math.abs(transaction.amount))}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-[16px] border border-line bg-white p-5">
        <div className="text-lg font-semibold text-foreground">Security & trust</div>
        <div className="mt-5 space-y-4">
          {securityItems.map((item) => (
            <div key={item.id} className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-line bg-[var(--background-soft)] text-foreground">
                <item.icon className="size-4" />
              </div>
              <div>
                <div className="text-sm font-semibold text-foreground">{item.title}</div>
                <div className="mt-1 text-sm text-muted">{item.description}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function BalanceRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
