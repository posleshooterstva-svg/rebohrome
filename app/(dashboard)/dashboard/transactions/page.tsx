import { DashboardShell } from "@/components/rebohrome/shells/dashboard-shell";
import {
  formatCurrency,
  formatDisplayDateTime,
  formatUsd,
} from "@/lib/rebohrome-data";
import {
  getUserDeposits,
  getUserTransactions,
  getUserWithdrawals,
} from "@/lib/db/repository";
import { requireUserSession } from "@/lib/session";

export const dynamic = "force-dynamic";

function renderTransactionAmount(transaction: Awaited<ReturnType<typeof getUserTransactions>>[number]) {
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

function renderDepositAmount(deposit: Awaited<ReturnType<typeof getUserDeposits>>[number]) {
  if (deposit.originalAmount !== null && deposit.originalCurrency) {
    const paid = formatCurrency(deposit.originalAmount, deposit.originalCurrency);

    if (deposit.originalCurrency === "EUR" && deposit.creditedAmountUsd !== null) {
      return `${paid} -> ${formatUsd(deposit.creditedAmountUsd)}`;
    }

    return paid;
  }

  return formatUsd(deposit.amount);
}

export default async function DashboardTransactionsPage() {
  const session = await requireUserSession("/login");
  const [transactions, deposits, withdrawals] = await Promise.all([
    getUserTransactions(session.userId, 16),
    getUserDeposits(session.userId, 6),
    getUserWithdrawals(session.userId, 6),
  ]);

  return (
    <DashboardShell
      active="transactions"
      title="Transaction History"
      description="Review every deposit, purchase, and withdrawal with linked payment details and archive records."
    >
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-[28px] border border-line bg-panel-strong p-5">
          <div className="text-lg font-semibold text-foreground">All Transactions</div>
          <div className="mt-5 space-y-3">
            {transactions.length === 0 ? (
              <div className="rounded-[22px] border border-dashed border-line bg-panel px-4 py-6 text-sm text-muted">
                No transactions yet. Deposits, purchases, and withdrawals will appear here.
              </div>
            ) : (
              transactions.map((transaction) => (
                <div
                  key={transaction.id}
                  className="grid gap-3 rounded-[22px] border border-line bg-panel px-4 py-4 text-sm md:grid-cols-[0.9fr_0.8fr_0.8fr_0.9fr]"
                >
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-muted">
                      Reference
                    </div>
                    <div className="mt-2 font-semibold text-foreground">
                      {transaction.referenceId}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-muted">
                      Type
                    </div>
                    <div className="mt-2 capitalize text-foreground">
                      {transaction.kind}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-muted">
                      Status
                    </div>
                    <div className="mt-2 capitalize text-foreground">
                      {transaction.status}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-muted">
                      Amount
                    </div>
                    <div
                      className={`mt-2 font-semibold ${
                        transaction.amount >= 0 ? "text-emerald-600" : "text-foreground"
                      }`}
                    >
                      {renderTransactionAmount(transaction)}
                    </div>
                  </div>
                  <div className="md:col-span-4 text-xs text-muted">
                    {formatDisplayDateTime(transaction.createdAt)} · {transaction.summary}
                    {transaction.paymentMethod ? ` · ${transaction.paymentMethod}` : ""}
                    {transaction.paymentProvider ? ` · ${transaction.paymentProvider}` : ""}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <div className="space-y-6">
          <section className="rounded-[28px] border border-line bg-panel-strong p-5">
            <div className="text-lg font-semibold text-foreground">Recent Deposits</div>
            <div className="mt-5 space-y-3">
              {deposits.length === 0 ? (
                <div className="rounded-[22px] border border-dashed border-line bg-panel px-4 py-6 text-sm text-muted">
                  No transactions yet. Deposits, purchases, and withdrawals will appear here.
                </div>
              ) : (
                deposits.map((deposit) => (
                  <div
                    key={deposit.id}
                    className="rounded-[22px] border border-line bg-panel px-4 py-4 text-sm"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="font-semibold text-foreground">{deposit.id}</div>
                      <div
                        className={`capitalize ${
                          deposit.status === "completed" ? "text-emerald-600" : "text-rose-600"
                        }`}
                      >
                        {deposit.status}
                      </div>
                    </div>
                    <div className="mt-2 text-muted">
                      {deposit.paymentMethod}
                      {deposit.paymentProvider ? ` · ${deposit.paymentProvider}` : ""}
                    </div>
                    <div className="mt-2 font-medium text-foreground">
                      {renderDepositAmount(deposit)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rounded-[28px] border border-line bg-panel-strong p-5">
            <div className="text-lg font-semibold text-foreground">Recent Withdrawals</div>
            <div className="mt-5 space-y-3">
              {withdrawals.length === 0 ? (
                <div className="rounded-[22px] border border-dashed border-line bg-panel px-4 py-6 text-sm text-muted">
                  No transactions yet. Deposits, purchases, and withdrawals will appear here.
                </div>
              ) : (
                withdrawals.map((withdrawal) => (
                  <div
                    key={withdrawal.id}
                    className="rounded-[22px] border border-line bg-panel px-4 py-4 text-sm"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="font-semibold text-foreground">{withdrawal.id}</div>
                      <div className="capitalize text-foreground">{withdrawal.status}</div>
                    </div>
                    <div className="mt-2 text-muted">{withdrawal.walletAddress}</div>
                    <div className="mt-2 font-medium text-foreground">
                      {formatUsd(withdrawal.amount)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </DashboardShell>
  );
}
