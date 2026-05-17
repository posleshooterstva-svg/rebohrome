import { AdminShell } from "@/components/rebohrome/shells/admin-shell";
import { getAdminTransactions } from "@/lib/db/repository";
import {
  formatCurrency,
  formatDisplayDateTime,
  formatUsd,
} from "@/lib/rebohrome-data";

export const dynamic = "force-dynamic";

function renderAmount(entry: Awaited<ReturnType<typeof getAdminTransactions>>[number]) {
  const transaction = entry.transaction;

  if (transaction.kind === "deposit" && transaction.originalAmount !== null && transaction.originalCurrency) {
    const paid = formatCurrency(transaction.originalAmount, transaction.originalCurrency);

    if (transaction.originalCurrency === "EUR" && transaction.creditedAmountUsd !== null) {
      return `${paid} -> ${formatUsd(transaction.creditedAmountUsd)}`;
    }

    return paid;
  }

  const prefix = transaction.amount >= 0 ? "+" : "";
  return `${prefix}${formatCurrency(transaction.amount, transaction.displayCurrency ?? "USD")}`;
}

export default async function AdminAnalyticsPage() {
  const transactions = await getAdminTransactions(24);

  return (
    <AdminShell
      active="analytics"
      title="Transaction Logs"
      description="Audit deposits, purchases, and withdrawals with collector attribution, payment routing, and currency context."
    >
      <div className="space-y-3">
        {transactions.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-line bg-panel-strong px-6 py-10 text-center text-sm text-muted">
            No financial records yet.
          </div>
        ) : (
          transactions.map((entry) => (
            <div
              key={entry.transaction.id}
              className="grid gap-3 rounded-[24px] border border-line bg-panel-strong px-5 py-5 text-sm md:grid-cols-[0.9fr_0.8fr_0.9fr_0.9fr_1.1fr]"
            >
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted">
                  Transaction
                </div>
                <div className="mt-2 font-semibold text-foreground">
                  {entry.transaction.id}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted">
                  Collector
                </div>
                <div className="mt-2 text-foreground">{entry.username}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted">
                  Reference
                </div>
                <div className="mt-2 text-foreground">
                  {entry.transaction.referenceId}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted">
                  Amount
                </div>
                <div
                  className={`mt-2 font-semibold ${
                    entry.transaction.amount >= 0
                      ? "text-emerald-600 dark:text-emerald-300"
                      : "text-foreground"
                  }`}
                >
                  {renderAmount(entry)}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted">
                  Details
                </div>
                <div className="mt-2 text-muted">
                  {entry.transaction.kind} · {entry.transaction.status}
                </div>
                <div className="mt-1 text-xs text-muted">
                  {entry.transaction.paymentMethod
                    ? `${entry.transaction.paymentMethod} · `
                    : ""}
                  {entry.transaction.paymentProvider
                    ? `${entry.transaction.paymentProvider} · `
                    : ""}
                  {formatDisplayDateTime(entry.transaction.createdAt)}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </AdminShell>
  );
}
