import { refreshTransVoucherStatusAction } from "@/app/actions/marketplace";
import { AdminShell } from "@/components/rebohrome/shells/admin-shell";
import { getAdminTransactions } from "@/lib/db/repository";
import {
  formatCurrency,
  formatDisplayDateTime,
  formatUsd,
} from "@/lib/rebohrome-data";

export const dynamic = "force-dynamic";

type AdminAnalyticsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function renderAmount(entry: Awaited<ReturnType<typeof getAdminTransactions>>[number]) {
  const transaction = entry.transaction;

  if (
    transaction.kind === "deposit" &&
    transaction.originalAmount !== null &&
    transaction.originalCurrency
  ) {
    const paid = formatCurrency(
      transaction.originalAmount,
      transaction.originalCurrency,
    );

    if (
      transaction.originalCurrency === "EUR" &&
      transaction.creditedAmountUsd !== null
    ) {
      return `${paid} -> ${formatUsd(transaction.creditedAmountUsd)}`;
    }

    return paid;
  }

  const prefix = transaction.amount >= 0 ? "+" : "";
  return `${prefix}${formatCurrency(
    transaction.amount,
    transaction.displayCurrency ?? "USD",
  )}`;
}

export default async function AdminAnalyticsPage({
  searchParams,
}: AdminAnalyticsPageProps) {
  const params = await searchParams;
  const transactions = await getAdminTransactions(24);

  return (
    <AdminShell
      active="analytics"
      title="Transaction Logs"
      description="Audit deposits, purchases, and withdrawals with collector attribution, payment routing, and currency context."
    >
      {params.refreshed === "1" ? (
        <div className="mb-6 rounded-[20px] border border-emerald-300/50 bg-emerald-100/70 px-4 py-3 text-sm text-emerald-700">
          TransVoucher status refreshed successfully.
        </div>
      ) : null}
      {typeof params.error === "string" ? (
        <div className="mb-6 rounded-[20px] border border-rose-300/50 bg-rose-100/70 px-4 py-3 text-sm text-rose-700">
          {params.error}
        </div>
      ) : null}
      <div className="space-y-3">
        {transactions.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-line bg-panel-strong px-6 py-10 text-center text-sm text-muted">
            No financial records yet.
          </div>
        ) : (
          transactions.map((entry) => (
            <div
              key={entry.transaction.id}
              className="grid gap-4 rounded-[24px] border border-line bg-panel-strong px-5 py-5 text-sm md:grid-cols-[0.9fr_0.8fr_0.9fr_0.9fr_1.25fr_auto]"
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
                      ? "text-emerald-600"
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
                {entry.transaction.transvoucherTransactionId ? (
                  <div className="mt-2 text-xs text-muted">
                    TX:{" "}
                    <span className="font-medium text-foreground">
                      {entry.transaction.transvoucherTransactionId}
                    </span>
                  </div>
                ) : null}
                {entry.transaction.transvoucherReferenceId ? (
                  <div className="mt-1 text-xs text-muted">
                    REF:{" "}
                    <span className="font-medium text-foreground">
                      {entry.transaction.transvoucherReferenceId}
                    </span>
                  </div>
                ) : null}
                {entry.transaction.providerStatus ? (
                  <div className="mt-1 text-xs text-muted">
                    Provider status:{" "}
                    <span className="font-medium text-foreground">
                      {entry.transaction.providerStatus}
                    </span>
                  </div>
                ) : null}
                {entry.transaction.paidAt ? (
                  <div className="mt-1 text-xs text-muted">
                    Paid at:{" "}
                    <span className="font-medium text-foreground">
                      {formatDisplayDateTime(entry.transaction.paidAt)}
                    </span>
                  </div>
                ) : null}
              </div>
              <div className="flex items-start justify-end">
                {entry.transaction.paymentProvider === "TransVoucher" ? (
                  <form action={refreshTransVoucherStatusAction}>
                    <input
                      name="transactionId"
                      type="hidden"
                      value={entry.transaction.id}
                    />
                    <button
                      className="rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-foreground transition hover:bg-[var(--foreground-soft)]"
                      type="submit"
                    >
                      Refresh TransVoucher Status
                    </button>
                  </form>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
    </AdminShell>
  );
}
